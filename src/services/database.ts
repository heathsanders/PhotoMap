import * as SQLite from 'expo-sqlite';
import { MediaAsset, DayGroup, Cluster, GeocodeCache } from '../types';

class DatabaseService {
  private db: SQLite.SQLiteDatabase;
  private isInitialized = false;

  constructor() {
    this.db = SQLite.openDatabaseSync('photomap.db');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Create MediaAssets table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS media_assets (
          id TEXT PRIMARY KEY,
          uri TEXT NOT NULL,
          type TEXT NOT NULL,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL,
          duration INTEGER,
          taken_at INTEGER NOT NULL,
          lat REAL,
          lon REAL,
          tz_offset INTEGER,
          album_id TEXT,
          cluster_id TEXT,
          filename TEXT NOT NULL,
          file_size INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
      `);

      // Create DayGroups table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS day_groups (
          date TEXT PRIMARY KEY,
          city TEXT,
          total_assets INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
      `);

      // Create Clusters table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS clusters (
          id TEXT PRIMARY KEY,
          day_date TEXT NOT NULL,
          centroid_lat REAL NOT NULL,
          centroid_lon REAL NOT NULL,
          label TEXT,
          radius REAL NOT NULL,
          asset_count INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (day_date) REFERENCES day_groups(date)
        );
      `);

      // Create GeocodeCache table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS geocode_cache (
          key TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          city TEXT,
          timestamp INTEGER NOT NULL
        );
      `);

      // Add cluster_id column if it doesn't exist (for existing databases)
      try {
        await this.db.execAsync(`ALTER TABLE media_assets ADD COLUMN cluster_id TEXT;`);
        console.log('Added cluster_id column to existing media_assets table');
      } catch (error) {
        // Column likely already exists, ignore error
        console.log('cluster_id column already exists or other ALTER error:', error);
      }
      
      // Create indexes for performance
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_media_taken_at ON media_assets(taken_at);
        CREATE INDEX IF NOT EXISTS idx_media_location ON media_assets(lat, lon);
        CREATE INDEX IF NOT EXISTS idx_clusters_day ON clusters(day_date);
      `);
      
      // Create cluster index only if column exists
      try {
        await this.db.execAsync(`CREATE INDEX IF NOT EXISTS idx_media_cluster ON media_assets(cluster_id);`);
      } catch (error) {
        console.log('Could not create cluster_id index:', error);
      }

      this.isInitialized = true;
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  async insertMediaAsset(asset: MediaAsset): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO media_assets 
      (id, uri, type, width, height, duration, taken_at, lat, lon, tz_offset, album_id, cluster_id, filename, file_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.db.runAsync(query, [
      asset.id,
      asset.uri,
      asset.type,
      asset.width,
      asset.height,
      asset.duration || null,
      asset.takenAt,
      asset.lat || null,
      asset.lon || null,
      asset.tzOffset || null,
      asset.albumId || null,
      asset.clusterId || null,
      asset.filename,
      asset.fileSize || null
    ]);
  }

  async getMediaAssetsByDateRange(startDate: string, endDate: string): Promise<MediaAsset[]> {
    const query = `
      SELECT * FROM media_assets 
      WHERE date(taken_at / 1000, 'unixepoch', 'localtime') BETWEEN ? AND ?
      ORDER BY taken_at ASC
    `;
    
    const result = await this.db.getAllAsync(query, [startDate, endDate]);
    return result.map(row => this.mapRowToMediaAsset(row));
  }

  async insertCluster(cluster: Cluster): Promise<void> {
    // Insert or update cluster record
    const clusterQuery = `
      INSERT OR REPLACE INTO clusters 
      (id, day_date, centroid_lat, centroid_lon, label, radius, asset_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.db.runAsync(clusterQuery, [
      cluster.id,
      cluster.dayDate,
      cluster.centroidLat,
      cluster.centroidLon,
      cluster.label || null,
      cluster.radius,
      cluster.assets.length
    ]);
    
    // Update cluster_id for all assets in this cluster
    if (cluster.assets.length > 0) {
      const updateAssetsQuery = `
        UPDATE media_assets 
        SET cluster_id = ? 
        WHERE id IN (${cluster.assets.map(() => '?').join(',')})
      `;
      
      const assetIds = cluster.assets.map(asset => asset.id);
      await this.db.runAsync(updateAssetsQuery, [cluster.id, ...assetIds]);
    }
  }

  async getClustersByDate(date: string): Promise<Cluster[]> {
    const query = `
      SELECT * FROM clusters 
      WHERE day_date = ?
      ORDER BY asset_count DESC
    `;
    
    const result = await this.db.getAllAsync(query, [date]);
    const clusters: Cluster[] = [];
    
    for (const row of result) {
      const cluster = await this.mapRowToClusterWithAssets(row);
      clusters.push(cluster);
    }
    
    return clusters;
  }

  async insertDayGroup(dayGroup: DayGroup): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO day_groups 
      (date, city, total_assets)
      VALUES (?, ?, ?)
    `;
    
    await this.db.runAsync(query, [
      dayGroup.date,
      dayGroup.city || null,
      dayGroup.totalAssets
    ]);
  }

  async getAllDayGroups(): Promise<DayGroup[]> {
    const query = `
      SELECT * FROM day_groups 
      ORDER BY date DESC
    `;
    
    const result = await this.db.getAllAsync(query);
    const dayGroups: DayGroup[] = [];
    
    for (const row of result) {
      const clusters = await this.getClustersByDate(row.date as string);
      dayGroups.push({
        date: row.date as string,
        city: row.city as string || undefined,
        totalAssets: row.total_assets as number,
        clusters
      });
    }
    
    return dayGroups;
  }

  async deleteMediaAssets(assetIds: string[]): Promise<void> {
    const placeholders = assetIds.map(() => '?').join(',');
    const query = `DELETE FROM media_assets WHERE id IN (${placeholders})`;
    await this.db.runAsync(query, assetIds);
  }

  async cacheGeocode(key: string, label: string, city?: string): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO geocode_cache 
      (key, label, city, timestamp)
      VALUES (?, ?, ?, ?)
    `;
    
    await this.db.runAsync(query, [key, label, city || null, Date.now()]);
  }

  async getCachedGeocode(key: string): Promise<GeocodeCache | null> {
    const query = `SELECT * FROM geocode_cache WHERE key = ?`;
    const result = await this.db.getFirstAsync(query, [key]);
    
    if (!result) return null;
    
    return {
      key: result.key as string,
      label: result.label as string,
      city: result.city as string || undefined,
      timestamp: result.timestamp as number
    };
  }

  private mapRowToMediaAsset(row: any): MediaAsset {
    return {
      id: row.id,
      uri: row.uri,
      type: row.type,
      width: row.width,
      height: row.height,
      duration: row.duration || undefined,
      takenAt: row.taken_at,
      lat: row.lat || undefined,
      lon: row.lon || undefined,
      tzOffset: row.tz_offset || undefined,
      albumId: row.album_id || undefined,
      clusterId: row.cluster_id || undefined,
      filename: row.filename,
      fileSize: row.file_size || undefined
    };
  }

  private async mapRowToClusterWithAssets(row: any): Promise<Cluster> {
    const assets = await this.getAssetsByClusterId(row.id);
    
    return {
      id: row.id,
      dayDate: row.day_date,
      centroidLat: row.centroid_lat,
      centroidLon: row.centroid_lon,
      label: row.label || undefined,
      radius: row.radius,
      assets
    };
  }

  private mapRowToCluster(row: any): Cluster & { assetCount: number } {
    return {
      id: row.id,
      dayDate: row.day_date,
      centroidLat: row.centroid_lat,
      centroidLon: row.centroid_lon,
      label: row.label || undefined,
      radius: row.radius,
      assets: [], // Assets will be populated separately
      assetCount: row.asset_count || 0
    };
  }

  async getAssetsByClusterId(clusterId: string): Promise<MediaAsset[]> {
    const query = `
      SELECT * FROM media_assets 
      WHERE cluster_id = ?
      ORDER BY taken_at ASC
    `;
    
    const result = await this.db.getAllAsync(query, [clusterId]);
    return result.map(row => this.mapRowToMediaAsset(row));
  }

  async getAssetsByLocationAndDate(
    centroidLat: number, 
    centroidLon: number, 
    dayDate: string, 
    radiusMeters: number
  ): Promise<MediaAsset[]> {
    // Convert radius from meters to approximate degrees (rough approximation)
    // 1 degree ≈ 111,320 meters at equator
    const radiusDegrees = radiusMeters / 111320;
    
    const query = `
      SELECT * FROM media_assets 
      WHERE lat IS NOT NULL AND lon IS NOT NULL
        AND date(taken_at / 1000, 'unixepoch', 'localtime') = ?
        AND lat BETWEEN ? AND ?
        AND lon BETWEEN ? AND ?
      ORDER BY taken_at ASC
    `;
    
    const result = await this.db.getAllAsync(query, [
      dayDate,
      centroidLat - radiusDegrees,
      centroidLat + radiusDegrees,
      centroidLon - radiusDegrees,
      centroidLon + radiusDegrees
    ]);
    
    return result.map(row => this.mapRowToMediaAsset(row));
  }

  async getAssetsByLocation(
    centroidLat: number, 
    centroidLon: number, 
    radiusMeters: number
  ): Promise<MediaAsset[]> {
    // Convert radius from meters to approximate degrees (rough approximation)
    // 1 degree ≈ 111,320 meters at equator
    const radiusDegrees = radiusMeters / 111320;
    
    const query = `
      SELECT * FROM media_assets 
      WHERE lat IS NOT NULL AND lon IS NOT NULL
        AND lat BETWEEN ? AND ?
        AND lon BETWEEN ? AND ?
      ORDER BY taken_at ASC
    `;
    
    const result = await this.db.getAllAsync(query, [
      centroidLat - radiusDegrees,
      centroidLat + radiusDegrees,
      centroidLon - radiusDegrees,
      centroidLon + radiusDegrees
    ]);
    
    return result.map(row => this.mapRowToMediaAsset(row));
  }

  async getAllClustersForMap(): Promise<Cluster[]> {
    const query = `
      SELECT * FROM clusters 
      WHERE centroid_lat != 0 AND centroid_lon != 0 AND asset_count > 0
      ORDER BY asset_count DESC
    `;
    
    const result = await this.db.getAllAsync(query);
    // Return clusters without loading assets for performance
    return result.map(row => this.mapRowToCluster(row));
  }

  async verifyClusterAssetsRelationship(): Promise<void> {
    try {
      // Count total assets with cluster_id
      const assetsWithClusters = await this.db.getFirstAsync(
        'SELECT COUNT(*) as count FROM media_assets WHERE cluster_id IS NOT NULL'
      );
      
      // Count assets without cluster_id  
      const assetsWithoutClusters = await this.db.getFirstAsync(
        'SELECT COUNT(*) as count FROM media_assets WHERE cluster_id IS NULL'
      );
      
      console.log(`Assets with cluster_id: ${(assetsWithClusters as any).count}`);
      console.log(`Assets without cluster_id: ${(assetsWithoutClusters as any).count}`);
      
      // Sample a few clusters to check their asset counts
      const sampleClusters = await this.db.getAllAsync(
        'SELECT id, asset_count FROM clusters LIMIT 5'
      );
      
      for (const cluster of sampleClusters) {
        const actualCount = await this.db.getFirstAsync(
          'SELECT COUNT(*) as count FROM media_assets WHERE cluster_id = ?',
          [cluster.id]
        );
        console.log(`Cluster ${cluster.id}: expected ${cluster.asset_count}, actual ${(actualCount as any).count}`);
      }
      
    } catch (error) {
      console.error('Error verifying cluster relationships:', error);
    }
  }

  async repairClusterAssetRelationships(): Promise<void> {
    try {
      console.log('Starting cluster-asset relationship repair...');
      
      // Get all clusters
      const clusters = await this.db.getAllAsync('SELECT * FROM clusters');
      let repairedCount = 0;
      
      for (const clusterRow of clusters) {
        // For each cluster, find assets by location and date
        const radiusDegrees = clusterRow.radius / 111320; // Convert meters to degrees
        
        const assets = await this.db.getAllAsync(`
          SELECT id FROM media_assets 
          WHERE lat IS NOT NULL AND lon IS NOT NULL
            AND date(taken_at / 1000, 'unixepoch', 'localtime') = ?
            AND lat BETWEEN ? AND ?
            AND lon BETWEEN ? AND ?
        `, [
          clusterRow.day_date,
          clusterRow.centroid_lat - radiusDegrees,
          clusterRow.centroid_lat + radiusDegrees,
          clusterRow.centroid_lon - radiusDegrees,
          clusterRow.centroid_lon + radiusDegrees
        ]);
        
        if (assets.length > 0) {
          // Update cluster_id for found assets
          const updateQuery = `
            UPDATE media_assets 
            SET cluster_id = ? 
            WHERE id IN (${assets.map(() => '?').join(',')})
          `;
          
          const assetIds = assets.map((asset: any) => asset.id);
          await this.db.runAsync(updateQuery, [clusterRow.id, ...assetIds]);
          
          // Update cluster asset_count
          await this.db.runAsync(
            'UPDATE clusters SET asset_count = ? WHERE id = ?',
            [assets.length, clusterRow.id]
          );
          
          repairedCount++;
          console.log(`Repaired cluster ${clusterRow.id}: ${assets.length} assets assigned`);
        }
      }
      
      console.log(`Repair complete: ${repairedCount} clusters repaired`);
    } catch (error) {
      console.error('Error repairing cluster relationships:', error);
    }
  }

  async clearAllClusterAssignments(): Promise<void> {
    try {
      await this.db.runAsync('UPDATE media_assets SET cluster_id = NULL');
      await this.db.runAsync('DELETE FROM clusters');
      console.log('Cleared all cluster assignments');
    } catch (error) {
      console.error('Error clearing cluster assignments:', error);
    }
  }
}

export const databaseService = new DatabaseService();