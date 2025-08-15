import * as MediaLibrary from 'expo-media-library';
import { MediaAsset } from '../types';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

class MediaLibraryService {
  private hasPermission = false;

  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      this.hasPermission = status === 'granted';
      return this.hasPermission;
    } catch (error) {
      console.error('Error requesting media permissions:', error);
      return false;
    }
  }

  async checkPermissions(): Promise<boolean> {
    try {
      const { status } = await MediaLibrary.getPermissionsAsync();
      this.hasPermission = status === 'granted';
      return this.hasPermission;
    } catch (error) {
      console.error('Error checking media permissions:', error);
      return false;
    }
  }

  async scanMediaLibrary(
    limit = 1000, 
    after?: string, 
    onProgress?: (processed: number, total: number) => void
  ): Promise<MediaAsset[]> {
    if (!this.hasPermission) {
      throw new Error('Media library permission not granted');
    }

    try {
      console.log(`Starting scan with limit: ${limit}`);
      
      // First, let's check permissions more thoroughly
      const permissions = await MediaLibrary.getPermissionsAsync();
      console.log('Media permissions status:', permissions);
      
      const options: MediaLibrary.AssetsOptions = {
        first: limit,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: MediaLibrary.SortBy.creationTime,
        after: after,
      };

      console.log('Scan options:', options);
      const result = await MediaLibrary.getAssetsAsync(options);
      console.log(`Found ${result.assets.length} assets to process out of ${result.totalCount} total assets`);
      console.log('Has next page:', result.hasNextPage);
      console.log('End cursor:', result.endCursor);
      
      // Check if we're in Expo Go with limited access
      if (result.totalCount > 0 && result.assets.length < Math.min(50, result.totalCount)) {
        console.warn('⚠️  LIMITED MEDIA ACCESS: Expo Go can only access a subset of your photos.');
        console.warn('⚠️  To test full functionality, create a development build with: npx expo run:ios');
      }
      
      const mediaAssets: MediaAsset[] = [];
      const total = result.assets.length;
      let gpsFoundCount = 0;

      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        
        if (i % 100 === 0) {
          console.log(`Processing asset ${i + 1}/${total}`);
        }
        
        onProgress?.(i + 1, total);
        
        const mediaAsset = await this.convertToMediaAsset(asset);
        if (mediaAsset) {
          mediaAssets.push(mediaAsset);
          if (mediaAsset.lat && mediaAsset.lon) {
            gpsFoundCount++;
          }
        }
      }

      console.log(`Completed processing ${mediaAssets.length} valid assets`);
      console.log(`GPS data found in ${gpsFoundCount} out of ${mediaAssets.length} assets (${Math.round(gpsFoundCount/mediaAssets.length*100)}%)`);
      return mediaAssets;
    } catch (error) {
      console.error('Error scanning media library:', error);
      throw error;
    }
  }

  async getAssetInfo(assetId: string): Promise<MediaLibrary.AssetInfo | null> {
    try {
      return await MediaLibrary.getAssetInfoAsync(assetId);
    } catch (error) {
      console.error('Error getting asset info:', error);
      return null;
    }
  }

  async deleteAssets(assetIds: string[]): Promise<{ success: boolean; deletedIds: string[]; failedIds: string[] }> {
    if (!this.hasPermission) {
      throw new Error('Media library permission not granted');
    }

    const deletedIds: string[] = [];
    const failedIds: string[] = [];

    // Process in batches of 200 to avoid system limits
    const batchSize = 200;
    for (let i = 0; i < assetIds.length; i += batchSize) {
      const batch = assetIds.slice(i, i + batchSize);
      
      try {
        const success = await MediaLibrary.deleteAssetsAsync(batch);
        if (success) {
          deletedIds.push(...batch);
        } else {
          failedIds.push(...batch);
        }
      } catch (error) {
        console.error(`Error deleting batch ${i / batchSize + 1}:`, error);
        failedIds.push(...batch);
      }
    }

    return {
      success: failedIds.length === 0,
      deletedIds,
      failedIds
    };
  }

  private async convertToMediaAsset(asset: MediaLibrary.Asset): Promise<MediaAsset | null> {
    try {
      const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
      
      // Extract EXIF data if available
      const exif = assetInfo.exif;
      let lat: number | undefined;
      let lon: number | undefined;
      let takenAt = asset.creationTime;

      // Try to get GPS coordinates from EXIF
      if (exif) {
        // Check for both GPS and {GPS} key structures
        const gpsData = exif.GPS || exif['{GPS}'];
        if (gpsData) {
          lat = this.parseGPSCoordinate(gpsData.GPSLatitude, gpsData.GPSLatitudeRef);
          lon = this.parseGPSCoordinate(gpsData.GPSLongitude, gpsData.GPSLongitudeRef);
        }
      }

      // FALLBACK: Try assetInfo.location (iOS provides this)
      if (!lat && !lon && assetInfo.location) {
        // Handle both string and number formats
        lat = typeof assetInfo.location.latitude === 'string' 
          ? parseFloat(assetInfo.location.latitude) 
          : assetInfo.location.latitude;
        lon = typeof assetInfo.location.longitude === 'string' 
          ? parseFloat(assetInfo.location.longitude) 
          : assetInfo.location.longitude;
      }

      // DEBUG: Log GPS extraction results occasionally
      if (Math.random() < 0.005) { // Log 0.5% of assets to reduce spam
        console.log(`GPS Debug - ${asset.filename}:`);
        console.log('  EXIF GPS:', !!exif && !!(exif.GPS || exif['{GPS}']));
        console.log('  iOS location:', !!assetInfo.location);
        console.log('  Final coords:', lat && lon ? `${lat}, ${lon}` : 'None');
      }

      // Try to get more accurate timestamp from EXIF
      if (exif && exif.DateTime) {
        const exifDate = dayjs(exif.DateTime, 'YYYY:MM:DD HH:mm:ss');
        if (exifDate.isValid()) {
          takenAt = exifDate.valueOf();
        }
      }

      // Calculate timezone offset if we have GPS coordinates
      let tzOffset: number | undefined;
      if (lat && lon) {
        // This is a simplified approach - in production you'd want a more robust timezone lookup
        tzOffset = dayjs().utcOffset();
      }

      return {
        id: asset.id,
        uri: asset.uri,
        type: asset.mediaType === MediaLibrary.MediaType.video ? 'video' : 'photo',
        width: asset.width,
        height: asset.height,
        duration: asset.duration,
        takenAt,
        lat,
        lon,
        tzOffset,
        filename: asset.filename,
        fileSize: assetInfo.fileSize
      };
    } catch (error) {
      console.error('Error converting asset:', error);
      return null;
    }
  }

  private parseGPSCoordinate(coordinate: any, direction: string): number | undefined {
    if (!coordinate || !Array.isArray(coordinate) || coordinate.length !== 3) {
      return undefined;
    }

    try {
      const [degrees, minutes, seconds] = coordinate;
      let decimal = degrees + (minutes / 60) + (seconds / 3600);
      
      // Apply direction (S and W are negative)
      if (direction === 'S' || direction === 'W') {
        decimal = -decimal;
      }

      return decimal;
    } catch (error) {
      console.error('Error parsing GPS coordinate:', error);
      return undefined;
    }
  }

  async getIncrementalAssets(lastScanTime: number): Promise<MediaAsset[]> {
    if (!this.hasPermission) {
      throw new Error('Media library permission not granted');
    }

    try {
      // Get assets modified after the last scan
      const options: MediaLibrary.AssetsOptions = {
        first: 1000,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: MediaLibrary.SortBy.modificationTime,
      };

      const result = await MediaLibrary.getAssetsAsync(options);
      const newAssets: MediaAsset[] = [];

      for (const asset of result.assets) {
        // Only process assets modified after the last scan
        if (asset.modificationTime > lastScanTime) {
          const mediaAsset = await this.convertToMediaAsset(asset);
          if (mediaAsset) {
            newAssets.push(mediaAsset);
          }
        }
      }

      return newAssets;
    } catch (error) {
      console.error('Error performing incremental scan:', error);
      throw error;
    }
  }

  async getAssetCount(): Promise<number> {
    try {
      const result = await MediaLibrary.getAssetsAsync({ first: 1 });
      return result.totalCount;
    } catch (error) {
      console.error('Error getting asset count:', error);
      return 0;
    }
  }

  async scanMediaLibraryPaginated(
    limit: number,
    skipCount: number,
    onProgress?: (processed: number, total: number) => void
  ): Promise<MediaAsset[]> {
    if (!this.hasPermission) {
      throw new Error('Media library permission not granted');
    }

    try {
      // Use MediaLibrary's after parameter for pagination
      // This is a simplified approach - we'll get all assets and skip to the right position
      const options: MediaLibrary.AssetsOptions = {
        first: limit + skipCount,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: MediaLibrary.SortBy.creationTime,
      };

      const result = await MediaLibrary.getAssetsAsync(options);
      
      // Skip the first 'skipCount' assets and take 'limit' assets
      const assetsToProcess = result.assets.slice(skipCount, skipCount + limit);
      console.log(`Paginated scan: processing ${assetsToProcess.length} assets (skipped ${skipCount})`);
      
      const mediaAssets: MediaAsset[] = [];
      let gpsFoundCount = 0;

      for (let i = 0; i < assetsToProcess.length; i++) {
        const asset = assetsToProcess[i];
        
        onProgress?.(i + 1, assetsToProcess.length);
        
        const mediaAsset = await this.convertToMediaAsset(asset);
        if (mediaAsset) {
          mediaAssets.push(mediaAsset);
          if (mediaAsset.lat && mediaAsset.lon) {
            gpsFoundCount++;
          }
        }
      }

      console.log(`Paginated batch complete: ${mediaAssets.length} valid assets, ${gpsFoundCount} with GPS`);
      return mediaAssets;
    } catch (error) {
      console.error('Error in paginated media library scan:', error);
      throw error;
    }
  }
}

export const mediaLibraryService = new MediaLibraryService();