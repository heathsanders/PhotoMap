export interface MediaAsset {
  id: string;
  uri: string;
  type: 'photo' | 'video';
  width: number;
  height: number;
  duration?: number;
  takenAt: number; // Unix timestamp
  lat?: number;
  lon?: number;
  tzOffset?: number; // Timezone offset in minutes
  albumId?: string;
  clusterId?: string;
  filename: string;
  fileSize?: number;
}

export interface DayGroup {
  date: string; // YYYY-MM-DD format
  city?: string;
  clusters: Cluster[];
  totalAssets: number;
}

export interface Cluster {
  id: string;
  dayDate: string;
  centroidLat: number;
  centroidLon: number;
  label?: string;
  assets: MediaAsset[];
  radius: number;
}

export interface GeocodeCache {
  key: string; // lat,lon rounded to reasonable precision
  label: string;
  city?: string;
  timestamp: number;
}

export interface UserSettings {
  isPro: boolean;
  theme: 'dark' | 'light';
  accentColor?: string;
  clusterRadius: number;
  minPhotosPerCluster: number;
  reverseGeocodingEnabled: boolean;
  tripViewEnabled: boolean;
}

export interface ClusteringOptions {
  radius: number; // meters
  minPoints: number;
}

export type NavigationParamList = {
  Timeline: undefined;
  Map: undefined;
  Settings: undefined;
  Album: { cluster: Cluster; dayGroup: DayGroup };
  MediaViewer: { assets: MediaAsset[]; initialIndex: number };
  UpgradeModal: undefined;
};

export interface UpgradeFeature {
  title: string;
  description: string;
  icon: string;
  locked: boolean;
}

export interface ProAccessPoint {
  screen: string;
  feature: string;
  trigger: 'button' | 'slider' | 'toggle';
  upgradeMessage: string;
}