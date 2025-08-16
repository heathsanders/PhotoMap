import * as Location from 'expo-location';
import { databaseService } from './database';

interface GeocodeResult {
  city?: string;
  district?: string;
  region?: string;
  country?: string;
  formattedAddress?: string;
}

class GeocodingService {
  private readonly CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  private readonly COORDINATE_PRECISION = 3; // Decimal places for cache key

  /**
   * Get a human-readable location name from coordinates
   */
  async getLocationName(lat: number, lon: number): Promise<string | null> {
    try {
      // Create cache key with reduced precision to allow for nearby location reuse
      const cacheKey = `${lat.toFixed(this.COORDINATE_PRECISION)},${lon.toFixed(this.COORDINATE_PRECISION)}`;
      
      // Check cache first
      const cached = await databaseService.getCachedGeocode(cacheKey);
      if (cached && this.isCacheValid(cached.timestamp)) {
        console.log('Using cached geocode:', cached.label);
        return cached.label;
      }

      // Perform reverse geocoding
      console.log(`Reverse geocoding coordinates: ${lat}, ${lon}`);
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      
      if (results && results.length > 0) {
        const result = results[0];
        const locationName = this.formatLocationName(result);
        
        // Cache the result
        await databaseService.cacheGeocode(cacheKey, locationName, result.city || result.district);
        
        console.log('Geocoded location:', locationName);
        return locationName;
      }

      // Fallback to coordinates if geocoding fails
      const fallback = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      console.log('Geocoding failed, using coordinates:', fallback);
      return fallback;

    } catch (error) {
      console.error('Geocoding error:', error);
      // Return coordinates as fallback
      return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
  }

  /**
   * Format location result into a readable string
   */
  private formatLocationName(result: Location.LocationGeocodedAddress): string {
    const parts: string[] = [];

    // Prioritize specific to general locations
    if (result.name && result.name !== result.street) {
      parts.push(result.name);
    }
    
    if (result.district && result.district !== result.city) {
      parts.push(result.district);
    }
    
    if (result.city) {
      parts.push(result.city);
    } else if (result.subregion) {
      parts.push(result.subregion);
    }
    
    if (result.region && result.region !== result.city && result.region !== result.subregion) {
      // Only add region if it's not redundant
      const hasRegionInParts = parts.some(part => 
        part.toLowerCase().includes(result.region!.toLowerCase()) ||
        result.region!.toLowerCase().includes(part.toLowerCase())
      );
      if (!hasRegionInParts) {
        parts.push(result.region);
      }
    }

    // If we have nothing useful, try the street
    if (parts.length === 0 && result.street) {
      parts.push(result.street);
    }

    // Final fallback to formatted address or district
    if (parts.length === 0) {
      if (result.formattedAddress) {
        return result.formattedAddress;
      }
      if (result.district) {
        return result.district;
      }
    }

    return parts.length > 0 ? parts.join(', ') : 'Unknown Location';
  }

  /**
   * Check if cached result is still valid
   */
  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_EXPIRY;
  }

  /**
   * Clear old cached geocoding results
   */
  async clearExpiredCache(): Promise<void> {
    try {
      const expiredTime = Date.now() - this.CACHE_EXPIRY;
      await databaseService.db.runAsync(
        'DELETE FROM geocode_cache WHERE timestamp < ?',
        [expiredTime]
      );
      console.log('Cleared expired geocoding cache');
    } catch (error) {
      console.error('Failed to clear expired geocoding cache:', error);
    }
  }

  /**
   * Get cache statistics for debugging
   */
  async getCacheStats(): Promise<{ count: number; oldestEntry: number; newestEntry: number }> {
    try {
      const countResult = await databaseService.db.getFirstAsync(
        'SELECT COUNT(*) as count FROM geocode_cache'
      ) as any;
      
      const rangeResult = await databaseService.db.getFirstAsync(
        'SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM geocode_cache'
      ) as any;

      return {
        count: countResult?.count || 0,
        oldestEntry: rangeResult?.oldest || 0,
        newestEntry: rangeResult?.newest || 0,
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return { count: 0, oldestEntry: 0, newestEntry: 0 };
    }
  }

  /**
   * Request location permissions if needed
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Failed to request location permissions:', error);
      return false;
    }
  }

  /**
   * Batch geocode multiple coordinates with rate limiting
   */
  async batchGeocode(
    coordinates: { lat: number; lon: number; id: string }[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const delay = 100; // 100ms delay between requests to avoid rate limiting

    for (let i = 0; i < coordinates.length; i++) {
      const { lat, lon, id } = coordinates[i];
      const locationName = await this.getLocationName(lat, lon);
      
      if (locationName) {
        results.set(id, locationName);
      }
      
      onProgress?.(i + 1, coordinates.length);
      
      // Rate limiting delay
      if (i < coordinates.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return results;
  }
}

export const geocodingService = new GeocodingService();