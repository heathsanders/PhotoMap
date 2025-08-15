import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { databaseService } from '../../src/services/database';
import { Cluster } from '../../src/types';

// Conditional import for MapView
let MapView: any = null;
let Marker: any = null;
let Callout: any = null;

try {
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  Callout = maps.Callout;
} catch (error) {
  // Maps not available in Expo Go
}

interface MapCluster extends Cluster {
  markerIdentifier: string;
  assetCount: number;
}

export default function MapScreen() {
  const router = useRouter();
  const [clusters, setClusters] = useState<MapCluster[]>([]);
  const [visibleClusters, setVisibleClusters] = useState<MapCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapRegion, setMapRegion] = useState({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });

  useEffect(() => {
    loadClusters();
  }, []);

  const loadClusters = async () => {
    try {
      setLoading(true);
      
      // Get clusters optimized for map (without loading all assets)
      const mapClusters = await databaseService.getAllClustersForMap();
      const allClusters: MapCluster[] = mapClusters.map(cluster => ({
        ...cluster,
        markerIdentifier: `cluster_${cluster.id}`
      }));
      
      console.log(`Loaded ${allClusters.length} clusters for map`);
      setClusters(allClusters);
      
      // Initially show top clusters for performance
      setVisibleClusters(allClusters.slice(0, 100)); // Limit to 100 largest clusters initially
      
      // Calculate optimal map region if we have clusters
      if (allClusters.length > 0) {
        const lats = allClusters.map(c => c.centroidLat);
        const lons = allClusters.map(c => c.centroidLon);
        
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        
        const centerLat = (minLat + maxLat) / 2;
        const centerLon = (minLon + maxLon) / 2;
        const deltaLat = (maxLat - minLat) * 1.2; // Add 20% padding
        const deltaLon = (maxLon - minLon) * 1.2;
        
        const newRegion = {
          latitude: centerLat,
          longitude: centerLon,
          latitudeDelta: Math.max(deltaLat, 0.01), // Minimum zoom level
          longitudeDelta: Math.max(deltaLon, 0.01),
        };
        
        setMapRegion(newRegion);
        updateVisibleClusters(newRegion);
      }
    } catch (error) {
      console.error('Failed to load clusters:', error);
      Alert.alert('Error', 'Failed to load photo clusters');
    } finally {
      setLoading(false);
    }
  };

  const updateVisibleClusters = (region: typeof mapRegion) => {
    // Filter clusters that are within the visible region
    const padding = 0.1; // Add some padding around the visible area
    const minLat = region.latitude - region.latitudeDelta / 2 - padding;
    const maxLat = region.latitude + region.latitudeDelta / 2 + padding;
    const minLon = region.longitude - region.longitudeDelta / 2 - padding;
    const maxLon = region.longitude + region.longitudeDelta / 2 + padding;

    const clustersInView = clusters.filter(cluster => 
      cluster.centroidLat >= minLat && cluster.centroidLat <= maxLat &&
      cluster.centroidLon >= minLon && cluster.centroidLon <= maxLon
    );

    // Limit based on zoom level (more clusters when zoomed in)
    const zoomLevel = Math.log2(360 / region.latitudeDelta);
    let maxClusters = Math.min(200, Math.floor(zoomLevel * 20 + 50)); // Dynamic limit based on zoom
    
    // Sort by asset count and take the top ones
    const topClusters = clustersInView
      .sort((a, b) => b.assetCount - a.assetCount)
      .slice(0, maxClusters);

    setVisibleClusters(topClusters);
  };

  const handleRegionChangeComplete = (region: typeof mapRegion) => {
    setMapRegion(region);
    updateVisibleClusters(region);
  };

  const handleClusterPress = async (cluster: MapCluster) => {
    try {
      console.log(`Loading assets for cluster ${cluster.id} (expected: ${cluster.assetCount})`);
      
      // Load assets for this cluster on-demand
      let assets = await databaseService.getAssetsByClusterId(cluster.id);
      let assetCount = assets.length;
      
      console.log(`Found ${assetCount} assets for cluster ${cluster.id}`);
      
      // If no assets found by cluster_id, try to find assets by location and date
      if (assetCount === 0 && cluster.assetCount > 0) {
        console.log(`Attempting fallback query for cluster ${cluster.id}:`);
        console.log(`  - Location: ${cluster.centroidLat}, ${cluster.centroidLon}`);
        console.log(`  - Date: ${cluster.dayDate}`);
        console.log(`  - Radius: ${cluster.radius}m`);
        
        // Also try to debug what assets exist around this area
        const radiusDegrees = cluster.radius / 111320;
        console.log(`  - Search radius in degrees: ${radiusDegrees}`);
        console.log(`  - Lat range: ${cluster.centroidLat - radiusDegrees} to ${cluster.centroidLat + radiusDegrees}`);
        console.log(`  - Lon range: ${cluster.centroidLon - radiusDegrees} to ${cluster.centroidLon + radiusDegrees}`);
        
        // Use a larger radius for fallback to account for clustering precision issues
        const fallbackRadius = Math.max(cluster.radius * 2, 1000); // At least 1km or 2x cluster radius
        console.log(`  - Using fallback radius: ${fallbackRadius}m`);
        
        assets = await databaseService.getAssetsByLocationAndDate(
          cluster.centroidLat, 
          cluster.centroidLon, 
          cluster.dayDate, 
          fallbackRadius
        );
        assetCount = assets.length;
        console.log(`Fallback query found ${assetCount} assets for cluster ${cluster.id}`);
        
        // If fallback found assets, navigate directly without going through error flow
        if (assetCount > 0) {
          console.log(`Fallback successful! Navigating to album with ${assetCount} assets`);
          
          const clusterWithAssets: Cluster = {
            ...cluster,
            assets
          };
          
          const dayGroup = {
            date: cluster.dayDate,
            city: undefined,
            clusters: [clusterWithAssets],
            totalAssets: assetCount
          };
          
          router.push({
            pathname: '/album',
            params: {
              cluster: JSON.stringify(clusterWithAssets),
              dayGroup: JSON.stringify(dayGroup)
            }
          });
          return; // Exit early - navigation successful
        }
        
        // If no assets found but we know there are assets the next day, try timezone fix
        const nextDay = new Date(cluster.dayDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];
        
        const assetsOnNextDay = await databaseService.getMediaAssetsByDateRange(nextDayStr, nextDayStr);
        if (assetsOnNextDay.length > 0) {
          console.log(`Trying timezone fix: searching ${nextDayStr} instead of ${cluster.dayDate}`);
          const timezoneFixAssets = await databaseService.getAssetsByLocationAndDate(
            cluster.centroidLat, 
            cluster.centroidLon, 
            nextDayStr, 
            fallbackRadius
          );
          
          if (timezoneFixAssets.length > 0) {
            console.log(`Timezone fix successful! Found ${timezoneFixAssets.length} assets`);
            
            const clusterWithAssets: Cluster = {
              ...cluster,
              assets: timezoneFixAssets
            };
            
            const dayGroup = {
              date: cluster.dayDate,
              city: undefined,
              clusters: [clusterWithAssets],
              totalAssets: timezoneFixAssets.length
            };
            
            router.push({
              pathname: '/album',
              params: {
                cluster: JSON.stringify(clusterWithAssets),
                dayGroup: JSON.stringify(dayGroup)
              }
            });
            return; // Exit early - timezone fix navigation successful
          }
        }
        
        // If still no assets, let's try a broader search to see what's in the database
        console.log(`Trying broader diagnostic queries...`);
        const assetsOnDate = await databaseService.getMediaAssetsByDateRange(cluster.dayDate, cluster.dayDate);
        console.log(`  - Assets on ${cluster.dayDate}: ${assetsOnDate.length}`);
        
        // Also check nearby dates in case there's a date conversion issue
        const dayBefore = new Date(cluster.dayDate);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const dayAfter = new Date(cluster.dayDate);
        dayAfter.setDate(dayAfter.getDate() + 1);
        
        const dayBeforeStr = dayBefore.toISOString().split('T')[0];
        const dayAfterStr = dayAfter.toISOString().split('T')[0];
        
        const assetsDayBefore = await databaseService.getMediaAssetsByDateRange(dayBeforeStr, dayBeforeStr);
        const assetsDayAfter = await databaseService.getMediaAssetsByDateRange(dayAfterStr, dayAfterStr);
        
        console.log(`  - Assets on ${dayBeforeStr}: ${assetsDayBefore.length}`);
        console.log(`  - Assets on ${dayAfterStr}: ${assetsDayAfter.length}`);
        
        // Check if there are any assets around those coordinates on any date
        const allNearbyAssets = await databaseService.getAssetsByLocation(
          cluster.centroidLat, 
          cluster.centroidLon, 
          1000 // 1km radius instead of 300m
        );
        console.log(`  - Assets within 1km (any date): ${allNearbyAssets.length}`);
        
        // If we find assets at this location, show their actual dates for comparison
        if (allNearbyAssets.length > 0) {
          const nearbyDates = [...new Set(allNearbyAssets.map(asset => {
            // Use the same timezone conversion as the database queries
            const date = new Date(asset.takenAt);
            const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
            return localDate.toISOString().split('T')[0];
          }))].sort();
          console.log(`  - Dates of nearby assets (local timezone): ${nearbyDates.slice(0, 5).join(', ')}${nearbyDates.length > 5 ? '...' : ''}`);
          
          // Also show UTC dates for comparison
          const utcDates = [...new Set(allNearbyAssets.map(asset => {
            const date = new Date(asset.takenAt);
            return date.toISOString().split('T')[0];
          }))].sort();
          console.log(`  - Dates of nearby assets (UTC): ${utcDates.slice(0, 5).join(', ')}${utcDates.length > 5 ? '...' : ''}`);
        }
        
        if (assetsOnDate.length > 0) {
          const nearbyAssets = assetsOnDate.filter(asset => 
            asset.lat !== null && asset.lon !== null &&
            Math.abs(asset.lat - cluster.centroidLat) < 0.01 &&  // ~1km
            Math.abs(asset.lon - cluster.centroidLon) < 0.01
          );
          console.log(`  - Assets within 1km on ${cluster.dayDate}: ${nearbyAssets.length}`);
        }
      }
      
      if (assetCount === 0) {
        console.warn(`Cluster ${cluster.id} shows ${cluster.assetCount} in database but loaded 0 assets even with fallback`);
        Alert.alert(
          'No Photos', 
          'This cluster has no associated photos in the database. Would you like to try repairing the cluster relationships?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Repair Data',
              onPress: async () => {
                try {
                  console.log('Starting database repair...');
                  await databaseService.repairClusterAssetRelationships();
                  
                  // Retry loading assets after repair
                  console.log(`Retrying asset loading for cluster ${cluster.id} after repair...`);
                  const repairedAssets = await databaseService.getAssetsByClusterId(cluster.id);
                  
                  if (repairedAssets.length > 0) {
                    console.log(`Repair successful! Found ${repairedAssets.length} assets for cluster ${cluster.id}`);
                    
                    // Navigate directly with the repaired assets
                    const clusterWithAssets: Cluster = {
                      ...cluster,
                      assets: repairedAssets
                    };
                    
                    const dayGroup = {
                      date: cluster.dayDate,
                      city: undefined,
                      clusters: [clusterWithAssets],
                      totalAssets: repairedAssets.length
                    };
                    
                    router.push({
                      pathname: '/album',
                      params: {
                        cluster: JSON.stringify(clusterWithAssets),
                        dayGroup: JSON.stringify(dayGroup)
                      }
                    });
                  } else {
                    Alert.alert('Still No Photos', 'Repair completed but no photos were found for this cluster.');
                  }
                } catch (error) {
                  console.error('Repair failed:', error);
                  Alert.alert('Repair Failed', 'An error occurred during repair. Please try again.');
                }
              }
            }
          ]
        );
        return;
      }
      
      // Create cluster with loaded assets and navigate to album
      const clusterWithAssets: Cluster = {
        ...cluster,
        assets
      };
      
      // Create a dayGroup for navigation (we only have the date)
      const dayGroup = {
        date: cluster.dayDate,
        city: undefined,
        clusters: [clusterWithAssets],
        totalAssets: assetCount
      };
      
      // Navigate to album screen
      router.push({
        pathname: '/album',
        params: {
          cluster: JSON.stringify(clusterWithAssets),
          dayGroup: JSON.stringify(dayGroup)
        }
      });
    } catch (error) {
      console.error('Failed to load cluster assets:', error);
      Alert.alert('Error', 'Failed to load cluster details');
    }
  };

  if (loading) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <StatusBar style="light" />
          <View style={styles.centerContainer}>
            <Text style={styles.loadingText}>Loading map...</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Map</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={loadClusters}>
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {!MapView ? (
          <View style={styles.fallbackContainer}>
            <Text style={styles.fallbackTitle}>Map Not Available</Text>
            <Text style={styles.fallbackSubtitle}>
              Maps require a development build. Use "npx expo run:ios" to enable map functionality.
            </Text>
            <Text style={styles.fallbackSubtitle}>
              In Expo Go, maps are not supported due to native module requirements.
            </Text>
            {clusters.length > 0 && (
              <View style={styles.clusterList}>
                <Text style={styles.clusterListTitle}>Photo Locations:</Text>
                {clusters.slice(0, 5).map((cluster) => (
                  <TouchableOpacity 
                    key={cluster.markerIdentifier}
                    style={styles.clusterItem}
                    onPress={() => handleClusterPress(cluster)}
                  >
                    <Text style={styles.clusterItemTitle}>
                      {cluster.label || 'Unknown Location'}
                    </Text>
                    <Text style={styles.clusterItemSubtitle}>
                      {cluster.assetCount} photos • {cluster.dayDate}
                    </Text>
                  </TouchableOpacity>
                ))}
                {clusters.length > 5 && (
                  <Text style={styles.moreItemsText}>
                    +{clusters.length - 5} more locations
                  </Text>
                )}
              </View>
            )}
          </View>
        ) : clusters.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Photo Locations</Text>
            <Text style={styles.emptySubtitle}>
              Scan your photo library to see clusters on the map
            </Text>
          </View>
        ) : (
          <MapView
            style={styles.map}
            region={mapRegion}
            onRegionChangeComplete={handleRegionChangeComplete}
            mapType="standard"
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={true}
            showsScale={true}
          >
            {visibleClusters.map((cluster) => (
              <Marker
                key={cluster.markerIdentifier}
                coordinate={{
                  latitude: cluster.centroidLat,
                  longitude: cluster.centroidLon,
                }}
                onPress={() => handleClusterPress(cluster)}
              >
                <View style={styles.markerContainer}>
                  <View style={styles.marker}>
                    <Text style={styles.markerText}>
                      {cluster.assetCount}
                    </Text>
                  </View>
                </View>
                
                <Callout tooltip>
                  <View style={styles.callout}>
                    <Text style={styles.calloutTitle}>
                      {cluster.label || 'Unknown Location'}
                    </Text>
                    <Text style={styles.calloutSubtitle}>
                      {cluster.assetCount} photos • {cluster.dayDate}
                    </Text>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
  },
  refreshButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#888888',
    fontSize: 16,
    textAlign: 'center',
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    alignItems: 'center',
  },
  marker: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  markerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  callout: {
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    padding: 12,
    minWidth: 150,
    borderWidth: 1,
    borderColor: '#333333',
  },
  calloutTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  calloutSubtitle: {
    color: '#888888',
    fontSize: 12,
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  fallbackTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  fallbackSubtitle: {
    color: '#888888',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  clusterList: {
    marginTop: 32,
    width: '100%',
  },
  clusterListTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  clusterItem: {
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333333',
  },
  clusterItemTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  clusterItemSubtitle: {
    color: '#888888',
    fontSize: 14,
  },
  moreItemsText: {
    color: '#007AFF',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
});