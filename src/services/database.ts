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

      // Create indexes for performance
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_media_taken_at ON media_assets(taken_at);
        CREATE INDEX IF NOT EXISTS idx_media_location ON media_assets(lat, lon);
        CREATE INDEX IF NOT EXISTS idx_clusters_day ON clusters(day_date);
      `);

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
      (id, uri, type, width, height, duration, taken_at, lat, lon, tz_offset, album_id, filename, file_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      asset.filename,
      asset.fileSize || null
    ]);
  }

  async getMediaAssetsByDateRange(startDate: string, endDate: string): Promise<MediaAsset[]> {
    const query = `
      SELECT * FROM media_assets 
      WHERE date(taken_at, 'unixepoch', 'localtime') BETWEEN ? AND ?
      ORDER BY taken_at ASC
    `;
    
    const result = await this.db.getAllAsync(query, [startDate, endDate]);
    return result.map(row => this.mapRowToMediaAsset(row));
  }

  async insertCluster(cluster: Cluster): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO clusters 
      (id, day_date, centroid_lat, centroid_lon, label, radius, asset_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.db.runAsync(query, [
      cluster.id,
      cluster.dayDate,
      cluster.centroidLat,
      cluster.centroidLon,
      cluster.label || null,
      cluster.radius,
      cluster.assets.length
    ]);
  }

  async getClustersByDate(date: string): Promise<Cluster[]> {
    const query = `
      SELECT * FROM clusters 
      WHERE day_date = ?
      ORDER BY asset_count DESC
    `;
    
    const result = await this.db.getAllAsync(query, [date]);
    return result.map(row => this.mapRowToCluster(row));
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
      filename: row.filename,
      fileSize: row.file_size || undefined
    };
  }

  private mapRowToCluster(row: any): Cluster {
    return {
      id: row.id,
      dayDate: row.day_date,
      centroidLat: row.centroid_lat,
      centroidLon: row.centroid_lon,
      label: row.label || undefined,
      radius: row.radius,
      assets: [] // Assets will be populated separately
    };
  }
}

export const databaseService = new DatabaseService();