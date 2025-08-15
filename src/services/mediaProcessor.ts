import { mediaLibraryService } from './mediaLibrary';
import { databaseService } from './database';
import { clusteringService } from './clustering';
import { MediaAsset, DayGroup, Cluster } from '../types';
import dayjs from 'dayjs';

class MediaProcessorService {
  private isProcessing = false;
  private lastScanTime = 0;
  private batchProcessing = false;
  private currentBatch = 0;
  private totalBatches = 0;

  async performFullScan(
    onProgress?: (progress: number, message: string) => void,
    batchSize: number = 500,
    onFirstBatchComplete?: () => void
  ): Promise<void> {
    if (this.isProcessing) {
      throw new Error('Media scanning already in progress');
    }

    try {
      this.isProcessing = true;
      
      onProgress?.(0, 'Starting batched scan...');
      
      // Clear all existing cluster assignments to avoid conflicts
      onProgress?.(2, 'Clearing previous organization...');
      await databaseService.clearAllClusterAssignments();
      
      // Get total count first
      onProgress?.(5, 'Counting photos...');
      const totalCount = await mediaLibraryService.getAssetCount();
      const totalBatches = Math.ceil(totalCount / batchSize);
      
      console.log(`Starting batched scan: ${totalBatches} batches of ${batchSize} photos each`);
      onProgress?.(10, `Found ${totalCount} photos. Processing in ${totalBatches} batches...`);
      
      let allAssets: MediaAsset[] = [];
      
      // Process batches sequentially but allow UI updates between batches
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchNum = batchIndex + 1;
        const batchStartProgress = 10 + (batchIndex / totalBatches) * 60; // 10% - 70%
        const batchEndProgress = 10 + (batchNum / totalBatches) * 60;
        
        onProgress?.(batchStartProgress, `Processing batch ${batchNum}/${totalBatches}...`);
        
        // Process this batch
        const batchAssets = await this.processBatch(
          batchIndex * batchSize,
          batchSize,
          (batchProgress, processed, total) => {
            const overallProgress = batchStartProgress + (batchProgress / 100) * (batchEndProgress - batchStartProgress);
            onProgress?.(overallProgress, `Batch ${batchNum}/${totalBatches}: ${processed}/${total} photos`);
          }
        );
        
        allAssets.push(...batchAssets);
        
        // Store batch results incrementally
        if (batchAssets.length > 0) {
          await this.storeAssetsInDatabase(batchAssets);
        }
        
        // Small delay to allow UI updates
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // After first batch, create initial organization so user can see something
        if (batchIndex === 0 && allAssets.length > 0) {
          onProgress?.(batchEndProgress, `First batch complete! Creating initial organization...`);
          const initialAssetsByDay = this.groupAssetsByDay(allAssets);
          const initialDayGroups = await this.createDayGroups(initialAssetsByDay);
          await this.storeDayGroups(initialDayGroups);
          
          // Notify that first batch is complete and user can start using app
          onFirstBatchComplete?.();
          
          // Continue processing remaining batches in background
          if (totalBatches > 1) {
            await this.continueBackgroundProcessing(
              allAssets, 
              batchIndex + 1, 
              totalBatches, 
              batchSize, 
              onProgress
            );
            return; // Exit here after background processing completes
          }
        }
      }
      
      if (allAssets.length === 0) {
        onProgress?.(100, 'No photos found');
        return;
      }

      // Final organization
      onProgress?.(75, 'Creating final organization...');
      const assetsByDay = this.groupAssetsByDay(allAssets);

      onProgress?.(85, 'Creating location clusters...');
      const dayGroups = await this.createDayGroups(assetsByDay);

      onProgress?.(95, 'Saving final organization...');
      await this.storeDayGroups(dayGroups);

      this.lastScanTime = Date.now();
      onProgress?.(100, `Scan complete! Organized ${allAssets.length} photos into ${dayGroups.length} days`);
      
    } catch (error) {
      console.error('Media processing failed:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  private async processBatch(
    skipCount: number,
    batchSize: number,
    onProgress?: (batchProgress: number, processed: number, total: number) => void
  ): Promise<MediaAsset[]> {
    console.log(`Processing batch: skip ${skipCount}, take ${batchSize}`);
    
    const batchAssets = await mediaLibraryService.scanMediaLibraryPaginated(
      batchSize,
      skipCount,
      (processed, total) => {
        const batchProgress = (processed / total) * 100;
        onProgress?.(batchProgress, processed, total);
      }
    );
    
    return batchAssets;
  }

  private async continueBackgroundProcessing(
    allAssets: MediaAsset[],
    startBatchIndex: number,
    totalBatches: number,
    batchSize: number,
    onProgress?: (progress: number, message: string) => void
  ): Promise<void> {
    try {
      this.batchProcessing = true;
      
      // Continue processing remaining batches
      for (let batchIndex = startBatchIndex; batchIndex < totalBatches; batchIndex++) {
        const batchNum = batchIndex + 1;
        const batchStartProgress = 10 + (batchIndex / totalBatches) * 60;
        
        onProgress?.(batchStartProgress, `Background: Processing batch ${batchNum}/${totalBatches}...`);
        
        const batchAssets = await this.processBatch(
          batchIndex * batchSize,
          batchSize,
          (batchProgress, processed, total) => {
            onProgress?.(batchStartProgress + 2, `Background: Batch ${batchNum}/${totalBatches} - ${processed}/${total} photos`);
          }
        );
        
        allAssets.push(...batchAssets);
        
        if (batchAssets.length > 0) {
          await this.storeAssetsInDatabase(batchAssets);
          
          // Update organization incrementally
          const currentAssetsByDay = this.groupAssetsByDay(allAssets);
          const currentDayGroups = await this.createDayGroups(currentAssetsByDay);
          await this.storeDayGroups(currentDayGroups);
        }
        
        // Longer delay for background processing to be less aggressive
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Final organization
      onProgress?.(75, 'Background: Creating final organization...');
      const assetsByDay = this.groupAssetsByDay(allAssets);
      const dayGroups = await this.createDayGroups(assetsByDay);
      await this.storeDayGroups(dayGroups);

      this.lastScanTime = Date.now();
      onProgress?.(100, `Background processing complete! Organized ${allAssets.length} photos total`);
      
    } catch (error) {
      console.error('Background processing failed:', error);
      onProgress?.(75, 'Background processing encountered an error. Partial results available.');
    } finally {
      this.batchProcessing = false;
      this.isProcessing = false;
    }
  }

  isBackgroundProcessing(): boolean {
    return this.batchProcessing;
  }

  async performIncrementalScan(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    try {
      this.isProcessing = true;
      
      const newAssets = await mediaLibraryService.getIncrementalAssets(this.lastScanTime);
      
      if (newAssets.length === 0) {
        return;
      }

      console.log(`Processing ${newAssets.length} new photos`);
      
      // Process new assets
      await this.storeAssetsInDatabase(newAssets);
      const assetsByDay = this.groupAssetsByDay(newAssets);
      const newDayGroups = await this.createDayGroups(assetsByDay);
      
      // Merge with existing day groups or create new ones
      for (const dayGroup of newDayGroups) {
        const existingDayGroup = await databaseService.getAllDayGroups();
        const existing = existingDayGroup.find(dg => dg.date === dayGroup.date);
        
        if (existing) {
          // Merge clusters and re-cluster the day
          const allAssetsForDay = [...existing.clusters.flatMap(c => c.assets), ...dayGroup.clusters.flatMap(c => c.assets)];
          const newClusters = clusteringService.clusterByLocation(allAssetsForDay);
          
          dayGroup.clusters = newClusters;
          dayGroup.totalAssets = allAssetsForDay.length;
        }
        
        await this.storeDayGroups([dayGroup]);
      }

      this.lastScanTime = Date.now();
      
    } catch (error) {
      console.error('Incremental scan failed:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async storeAssetsInDatabase(assets: MediaAsset[]): Promise<void> {
    for (const asset of assets) {
      await databaseService.insertMediaAsset(asset);
    }
  }

  private async storeAssetsWithClusters(clusters: Cluster[]): Promise<void> {
    console.log(`Storing ${clusters.length} clusters with asset assignments`);
    
    let totalAssetsStored = 0;
    for (const cluster of clusters) {
      if (cluster.assets.length === 0) {
        console.warn(`Cluster ${cluster.id} has no assets to store`);
        continue;
      }
      
      console.log(`Storing cluster ${cluster.id} with ${cluster.assets.length} assets`);
      
      // Assign cluster ID to each asset in the cluster
      const assetsWithClusterIds = cluster.assets.map(asset => ({
        ...asset,
        clusterId: cluster.id
      }));
      
      // Store the assets with their cluster IDs
      for (const asset of assetsWithClusterIds) {
        await databaseService.insertMediaAsset(asset);
        totalAssetsStored++;
      }
    }
    
    console.log(`Total assets stored with cluster IDs: ${totalAssetsStored}`);
  }

  private groupAssetsByDay(assets: MediaAsset[]): Map<string, MediaAsset[]> {
    const assetsByDay = new Map<string, MediaAsset[]>();
    
    for (const asset of assets) {
      const dateString = dayjs(asset.takenAt).format('YYYY-MM-DD');
      
      if (!assetsByDay.has(dateString)) {
        assetsByDay.set(dateString, []);
      }
      
      assetsByDay.get(dateString)!.push(asset);
    }
    
    return assetsByDay;
  }

  private async createDayGroups(assetsByDay: Map<string, MediaAsset[]>): Promise<DayGroup[]> {
    const dayGroups: DayGroup[] = [];
    
    for (const [date, assets] of assetsByDay) {
      // Cluster assets for this day
      const clusters = clusteringService.clusterByLocation(assets);
      
      // Determine the majority city for the day
      const cities = assets
        .map(asset => this.getCityFromCoordinates(asset.lat, asset.lon))
        .filter(city => city !== null);
      
      const cityCount = new Map<string, number>();
      cities.forEach(city => {
        cityCount.set(city, (cityCount.get(city) || 0) + 1);
      });
      
      let majorityCity: string | undefined;
      let maxCount = 0;
      for (const [city, count] of cityCount) {
        if (count > maxCount) {
          maxCount = count;
          majorityCity = city;
        }
      }
      
      const dayGroup: DayGroup = {
        date,
        city: majorityCity,
        clusters,
        totalAssets: assets.length
      };
      
      dayGroups.push(dayGroup);
    }
    
    return dayGroups.sort((a, b) => b.date.localeCompare(a.date));
  }

  private async storeDayGroups(dayGroups: DayGroup[]): Promise<void> {
    for (const dayGroup of dayGroups) {
      // Store the day group
      await databaseService.insertDayGroup(dayGroup);
      
      // Store assets with their cluster assignments
      await this.storeAssetsWithClusters(dayGroup.clusters);
      
      // Store each cluster metadata
      for (const cluster of dayGroup.clusters) {
        await databaseService.insertCluster(cluster);
      }
    }
  }

  private getCityFromCoordinates(lat?: number, lon?: number): string | null {
    // This is a simplified version - in production you'd use a geocoding service
    if (!lat || !lon) return null;
    
    // For now, just return a placeholder based on coordinates
    // In the real app, this would call a reverse geocoding service
    return `Location ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }

  async deleteAssets(assetIds: string[]): Promise<{ success: boolean; deletedIds: string[]; failedIds: string[] }> {
    try {
      // Delete from device
      const result = await mediaLibraryService.deleteAssets(assetIds);
      
      // Remove from database
      if (result.deletedIds.length > 0) {
        await databaseService.deleteMediaAssets(result.deletedIds);
        
        // TODO: Recalculate affected clusters and day groups
        // This would involve finding which clusters contained the deleted assets
        // and re-clustering the remaining assets for those days
      }
      
      return result;
    } catch (error) {
      console.error('Delete assets failed:', error);
      throw error;
    }
  }

  getProcessingStatus(): { isProcessing: boolean; lastScanTime: number } {
    return {
      isProcessing: this.isProcessing,
      lastScanTime: this.lastScanTime
    };
  }

  async getStatistics(): Promise<{
    totalAssets: number;
    totalDays: number;
    totalClusters: number;
    geotaggedAssets: number;
  }> {
    try {
      const dayGroups = await databaseService.getAllDayGroups();
      
      let totalAssets = 0;
      let totalClusters = 0;
      let geotaggedAssets = 0;
      
      for (const dayGroup of dayGroups) {
        totalAssets += dayGroup.totalAssets;
        totalClusters += dayGroup.clusters.length;
        
        for (const cluster of dayGroup.clusters) {
          geotaggedAssets += cluster.assets.filter(asset => asset.lat && asset.lon).length;
        }
      }
      
      return {
        totalAssets,
        totalDays: dayGroups.length,
        totalClusters,
        geotaggedAssets
      };
    } catch (error) {
      console.error('Failed to get statistics:', error);
      return {
        totalAssets: 0,
        totalDays: 0,
        totalClusters: 0,
        geotaggedAssets: 0
      };
    }
  }

  async performBatchedScan(
    onProgress?: (progress: number, message: string) => void,
    onBatchComplete?: (batchNum: number, totalBatches: number, canUseApp: boolean) => void
  ): Promise<void> {
    if (this.isProcessing || this.batchProcessing) {
      throw new Error('Media scanning already in progress');
    }

    try {
      this.batchProcessing = true;
      const BATCH_SIZE = 500;
      
      onProgress?.(0, 'Initializing batched scan...');
      
      // Get all assets first to know total count
      console.log('Getting total asset count...');
      const allResult = await mediaLibraryService.getAssetCount();
      const totalAssets = allResult;
      this.totalBatches = Math.ceil(totalAssets / BATCH_SIZE);
      
      console.log(`Starting batched scan: ${this.totalBatches} batches of ${BATCH_SIZE} photos each`);
      
      let allAssets: MediaAsset[] = [];
      let afterCursor: string | undefined;
      
      // Process first batch fully
      onProgress?.(5, `Processing first batch (${BATCH_SIZE} photos)...`);
      
      const firstBatch = await mediaLibraryService.scanMediaLibrary(
        BATCH_SIZE,
        undefined,
        (processed, total) => {
          const progress = 5 + (processed / total) * 20; // 5-25%
          onProgress?.(progress, `First batch: Processing ${processed}/${total} photos...`);
        }
      );
      
      allAssets.push(...firstBatch);
      
      // Store first batch results
      if (firstBatch.length > 0) {
        onProgress?.(25, 'Saving first batch results...');
        await this.storeAssetsInDatabase(firstBatch);
        
        // Create initial organization so user can see something
        const initialAssetsByDay = this.groupAssetsByDay(firstBatch);
        const initialDayGroups = await this.createDayGroups(initialAssetsByDay);
        await this.storeDayGroups(initialDayGroups);
      }
      
      onProgress?.(30, `First batch complete! You can now browse ${firstBatch.length} photos. Processing continues in background...`);
      onBatchComplete?.(1, this.totalBatches, true);
      
      // Continue with remaining batches in background
      if (this.totalBatches > 1) {
        this.processBatchesInBackground(1, allAssets, onProgress, onBatchComplete);
      } else {
        onProgress?.(100, `Scan complete! Organized ${firstBatch.length} photos.`);
        this.batchProcessing = false;
      }
      
    } catch (error) {
      console.error('Batched media processing failed:', error);
      this.batchProcessing = false;
      throw error;
    }
  }

  private async processBatchesInBackground(
    startBatch: number,
    allAssets: MediaAsset[],
    onProgress?: (progress: number, message: string) => void,
    onBatchComplete?: (batchNum: number, totalBatches: number, canUseApp: boolean) => void
  ): Promise<void> {
    try {
      const BATCH_SIZE = 500;
      
      for (let batchIndex = startBatch; batchIndex < this.totalBatches; batchIndex++) {
        this.currentBatch = batchIndex + 1;
        
        const batchProgress = 30 + ((batchIndex - startBatch) / (this.totalBatches - startBatch)) * 60; // 30-90%
        onProgress?.(batchProgress, `Background: Processing batch ${this.currentBatch}/${this.totalBatches}...`);
        
        // Calculate skip amount for this batch
        const skipCount = batchIndex * BATCH_SIZE;
        
        const batchAssets = await mediaLibraryService.scanMediaLibraryPaginated(
          BATCH_SIZE,
          skipCount,
          (processed, total) => {
            const withinBatchProgress = (processed / total) * (60 / (this.totalBatches - startBatch));
            const totalProgress = batchProgress + withinBatchProgress;
            onProgress?.(totalProgress, `Background: Batch ${this.currentBatch}/${this.totalBatches} - ${processed}/${total} photos...`);
          }
        );
        
        if (batchAssets.length > 0) {
          allAssets.push(...batchAssets);
          
          // Update organization incrementally with proper cluster assignments
          const currentAssetsByDay = this.groupAssetsByDay(allAssets);
          const currentDayGroups = await this.createDayGroups(currentAssetsByDay);
          await this.storeDayGroups(currentDayGroups);
        }
        
        onBatchComplete?.(this.currentBatch, this.totalBatches, true);
        
        // Small delay to prevent blocking UI
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      onProgress?.(90, 'Finalizing organization...');
      await this.finalizeBatchedScan(allAssets, onProgress);
      
    } catch (error) {
      console.error('Background batch processing failed:', error);
      onProgress?.(90, 'Background processing encountered an error. Partial results available.');
    } finally {
      this.batchProcessing = false;
    }
  }

  private async finalizeBatchedScan(allAssets: MediaAsset[], onProgress?: (progress: number, message: string) => void): Promise<void> {
    // Final organization
    onProgress?.(95, 'Creating final organization...');
    const assetsByDay = this.groupAssetsByDay(allAssets);
    const dayGroups = await this.createDayGroups(assetsByDay);
    await this.storeDayGroups(dayGroups);

    this.lastScanTime = Date.now();
    onProgress?.(100, `Scan complete! Organized ${allAssets.length} photos into ${dayGroups.length} days`);
  }

  getBatchProgress(): { currentBatch: number; totalBatches: number; isProcessing: boolean } {
    return {
      currentBatch: this.currentBatch,
      totalBatches: this.totalBatches,
      isProcessing: this.batchProcessing
    };
  }
}

export const mediaProcessorService = new MediaProcessorService();