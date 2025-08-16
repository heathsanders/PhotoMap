import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserSettings } from '../types';
import { settingsService } from '../services/settings';

export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
  error: string;
  success: string;
  warning: string;
}

const darkTheme: ThemeColors = {
  primary: '#007AFF',
  secondary: '#FF9500',
  background: '#000000',
  surface: '#1C1C1E',
  text: '#FFFFFF',
  textSecondary: '#888888',
  border: '#333333',
  accent: '#007AFF',
  error: '#FF3B30',
  success: '#30D158',
  warning: '#FF9500',
};

const lightTheme: ThemeColors = {
  primary: '#007AFF',
  secondary: '#FF9500',
  background: '#FFFFFF',
  surface: '#F2F2F7',
  text: '#000000',
  textSecondary: '#666666',
  border: '#C7C7CC',
  accent: '#007AFF',
  error: '#FF3B30',
  success: '#30D158',
  warning: '#FF9500',
};

interface ThemeContextValue {
  theme: ThemeColors;
  settings: UserSettings;
  isDark: boolean;
  updateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [settings, setSettings] = useState<UserSettings>({
    isPro: false,
    theme: 'dark',
    clusterRadius: 300,
    minPhotosPerCluster: 2,
    reverseGeocodingEnabled: true,
    tripViewEnabled: false,
  });

  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const userSettings = await settingsService.getUserSettings();
        setSettings(userSettings);
      } catch (error) {
        console.error('Failed to load user settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    try {
      await settingsService.updateSettings(newSettings);
      setSettings(prev => ({ ...prev, ...newSettings }));
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  };

  const updateSetting = async <K extends keyof UserSettings>(
    key: K, 
    value: UserSettings[K]
  ) => {
    try {
      await settingsService.updateSetting(key, value);
      setSettings(prev => ({ ...prev, [key]: value }));
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error);
      throw error;
    }
  };

  // Calculate theme colors
  const isDark = settings.theme === 'dark';
  const baseTheme = isDark ? darkTheme : lightTheme;
  
  // Apply accent color if set and user is Pro
  const theme: ThemeColors = {
    ...baseTheme,
    accent: (settings.isPro && settings.accentColor) ? settings.accentColor : baseTheme.accent,
  };

  // Don't render children until settings are loaded
  if (isLoading) {
    return null;
  }

  const value: ThemeContextValue = {
    theme,
    settings,
    isDark,
    updateSettings,
    updateSetting,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function useSettings(): UserSettings {
  const { settings } = useTheme();
  return settings;
}

export function useIsPro(): boolean {
  const { settings } = useTheme();
  return settings.isPro;
}