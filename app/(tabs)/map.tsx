import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
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
      const assets = await databaseService.getAssetsByClusterId(cluster.id);
      const assetCount = assets.length;
      
      console.log(`Found ${assetCount} assets for cluster ${cluster.id}`);
      
      if (assetCount === 0) {
        console.warn(`Cluster ${cluster.id} shows ${cluster.assetCount} in database but loaded 0 assets`);
      }
      
      Alert.alert(
        cluster.label || 'Unknown Location',
        `${assetCount} photos/videos from ${cluster.dayDate}`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'View Album', onPress: () => {
            if (assetCount > 0) {
              console.log('Navigate to album with assets:', assets.map(a => a.filename));
            } else {
              Alert.alert('No Assets', 'This cluster has no associated photos in the database.');
            }
          }}
        ]
      );
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