import * as SQLite from 'expo-sqlite';
import { UserSettings } from '../types';

class SettingsService {
  private db: SQLite.SQLiteDatabase;
  private isInitialized = false;

  constructor() {
    this.db = SQLite.openDatabaseSync('photomap.db');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Create user_settings table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
      `);

      this.isInitialized = true;
      console.log('Settings service initialized successfully');
    } catch (error) {
      console.error('Settings initialization failed:', error);
      throw error;
    }
  }

  async getUserSettings(): Promise<UserSettings> {
    await this.initialize();
    
    const defaults: UserSettings = {
      isPro: false,
      theme: 'dark',
      clusterRadius: 300,
      minPhotosPerCluster: 2,
      reverseGeocodingEnabled: true,
      tripViewEnabled: false
    };

    try {
      const settings = { ...defaults };
      
      // Fetch all settings from database
      const result = await this.db.getAllAsync('SELECT key, value FROM user_settings');
      
      for (const row of result) {
        const key = row.key as keyof UserSettings;
        const value = row.value as string;
        
        // Parse values based on type
        switch (key) {
          case 'isPro':
          case 'reverseGeocodingEnabled':
          case 'tripViewEnabled':
            settings[key] = value === 'true';
            break;
          case 'clusterRadius':
          case 'minPhotosPerCluster':
            settings[key] = parseInt(value, 10);
            break;
          case 'theme':
            settings[key] = value as 'dark' | 'light';
            break;
          case 'accentColor':
            if (value) settings[key] = value;
            break;
        }
      }
      
      return settings;
    } catch (error) {
      console.error('Failed to load user settings:', error);
      return defaults;
    }
  }

  async updateSetting<K extends keyof UserSettings>(
    key: K, 
    value: UserSettings[K]
  ): Promise<void> {
    await this.initialize();
    
    try {
      const stringValue = String(value);
      const query = `
        INSERT OR REPLACE INTO user_settings (key, value, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
      `;
      
      await this.db.runAsync(query, [key, stringValue]);
      console.log(`Updated setting ${key} to ${value}`);
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error);
      throw error;
    }
  }

  async updateSettings(settings: Partial<UserSettings>): Promise<void> {
    await this.initialize();
    
    try {
      // Batch update multiple settings
      for (const [key, value] of Object.entries(settings)) {
        if (value !== undefined) {
          await this.updateSetting(key as keyof UserSettings, value);
        }
      }
      console.log('Updated multiple settings:', Object.keys(settings));
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  }

  async resetSettings(): Promise<void> {
    await this.initialize();
    
    try {
      await this.db.runAsync('DELETE FROM user_settings');
      console.log('Reset all settings to defaults');
    } catch (error) {
      console.error('Failed to reset settings:', error);
      throw error;
    }
  }

  // Subscribe to settings changes (for future real-time updates)
  private listeners: Array<(settings: UserSettings) => void> = [];

  subscribe(callback: (settings: UserSettings) => void): () => void {
    this.listeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(settings: UserSettings): void {
    this.listeners.forEach(callback => callback(settings));
  }

  // Convenience methods for specific settings
  async setProStatus(isPro: boolean): Promise<void> {
    await this.updateSetting('isPro', isPro);
  }

  async setTheme(theme: 'dark' | 'light'): Promise<void> {
    await this.updateSetting('theme', theme);
  }

  async setAccentColor(color?: string): Promise<void> {
    await this.updateSetting('accentColor', color);
  }

  async setClusterRadius(radius: number): Promise<void> {
    await this.updateSetting('clusterRadius', radius);
  }

  async setMinPhotosPerCluster(count: number): Promise<void> {
    await this.updateSetting('minPhotosPerCluster', count);
  }

  async setReverseGeocodingEnabled(enabled: boolean): Promise<void> {
    await this.updateSetting('reverseGeocodingEnabled', enabled);
  }

  async setTripViewEnabled(enabled: boolean): Promise<void> {
    await this.updateSetting('tripViewEnabled', enabled);
  }
}

export const settingsService = new SettingsService();