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

  async scanMediaLibrary(limit = 1000, after?: string): Promise<MediaAsset[]> {
    if (!this.hasPermission) {
      throw new Error('Media library permission not granted');
    }

    try {
      const options: MediaLibrary.AssetsOptions = {
        first: limit,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: MediaLibrary.SortBy.creationTime,
        after: after,
      };

      const result = await MediaLibrary.getAssetsAsync(options);
      const mediaAssets: MediaAsset[] = [];

      for (const asset of result.assets) {
        const mediaAsset = await this.convertToMediaAsset(asset);
        if (mediaAsset) {
          mediaAssets.push(mediaAsset);
        }
      }

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
        if (exif.GPS) {
          lat = this.parseGPSCoordinate(exif.GPS.GPSLatitude, exif.GPS.GPSLatitudeRef);
          lon = this.parseGPSCoordinate(exif.GPS.GPSLongitude, exif.GPS.GPSLongitudeRef);
        }

        // Try to get more accurate timestamp from EXIF
        if (exif.DateTime) {
          const exifDate = dayjs(exif.DateTime, 'YYYY:MM:DD HH:mm:ss');
          if (exifDate.isValid()) {
            takenAt = exifDate.valueOf();
          }
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
}

export const mediaLibraryService = new MediaLibraryService();