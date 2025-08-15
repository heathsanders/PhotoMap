import { mediaLibraryService } from './mediaLibrary';
import { databaseService } from './database';
import { clusteringService } from './clustering';
import { MediaAsset, DayGroup, Cluster } from '../types';
import dayjs from 'dayjs';

class MediaProcessorService {
  private isProcessing = false;
  private lastScanTime = 0;

  async performFullScan(onProgress?: (progress: number, message: string) => void): Promise<void> {
    if (this.isProcessing) {
      throw new Error('Media scanning already in progress');
    }

    try {
      this.isProcessing = true;
      
      onProgress?.(0, 'Starting media scan...');
      
      // Step 1: Scan media library
      onProgress?.(10, 'Scanning photo library...');
      const assets = await mediaLibraryService.scanMediaLibrary(5000); // Limit for initial scan
      
      if (assets.length === 0) {
        onProgress?.(100, 'No photos found');
        return;
      }

      // Step 2: Store assets in database
      onProgress?.(30, `Processing ${assets.length} photos...`);
      await this.storeAssetsInDatabase(assets);

      // Step 3: Group by days
      onProgress?.(50, 'Organizing by date...');
      const assetsByDay = this.groupAssetsByDay(assets);

      // Step 4: Cluster each day
      onProgress?.(70, 'Creating location clusters...');
      const dayGroups = await this.createDayGroups(assetsByDay);

      // Step 5: Store day groups and clusters
      onProgress?.(90, 'Saving organization...');
      await this.storeDayGroups(dayGroups);

      this.lastScanTime = Date.now();
      onProgress?.(100, `Organized ${assets.length} photos into ${dayGroups.length} days`);
      
    } catch (error) {
      console.error('Media processing failed:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
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
      
      // Store each cluster
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
}

export const mediaProcessorService = new MediaProcessorService();