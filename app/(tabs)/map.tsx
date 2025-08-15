import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Callout } from 'react-native-maps';
import { databaseService } from '../../src/services/database';
import { Cluster } from '../../src/types';

interface MapCluster extends Cluster {
  markerIdentifier: string;
}

export default function MapScreen() {
  const [clusters, setClusters] = useState<MapCluster[]>([]);
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
      
      // Get all day groups and extract clusters
      const dayGroups = await databaseService.getAllDayGroups();
      const allClusters: MapCluster[] = [];
      
      dayGroups.forEach(dayGroup => {
        dayGroup.clusters.forEach(cluster => {
          if (cluster.centroidLat !== 0 && cluster.centroidLon !== 0) {
            allClusters.push({
              ...cluster,
              markerIdentifier: `cluster_${cluster.id}`
            });
          }
        });
      });
      
      setClusters(allClusters);
      
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
        
        setMapRegion({
          latitude: centerLat,
          longitude: centerLon,
          latitudeDelta: Math.max(deltaLat, 0.01), // Minimum zoom level
          longitudeDelta: Math.max(deltaLon, 0.01),
        });
      }
    } catch (error) {
      console.error('Failed to load clusters:', error);
      Alert.alert('Error', 'Failed to load photo clusters');
    } finally {
      setLoading(false);
    }
  };

  const handleClusterPress = (cluster: MapCluster) => {
    // TODO: Navigate to album view for this cluster
    Alert.alert(
      cluster.label || 'Unknown Location',
      `${cluster.assets.length} photos/videos from ${cluster.dayDate}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'View Album', onPress: () => {/* Navigate to album */} }
      ]
    );
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

        {clusters.length === 0 ? (
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
            onRegionChangeComplete={setMapRegion}
            mapType="standard"
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={true}
            showsScale={true}
          >
            {clusters.map((cluster) => (
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
                      {cluster.assets.length}
                    </Text>
                  </View>
                </View>
                
                <Callout tooltip>
                  <View style={styles.callout}>
                    <Text style={styles.calloutTitle}>
                      {cluster.label || 'Unknown Location'}
                    </Text>
                    <Text style={styles.calloutSubtitle}>
                      {cluster.assets.length} photos • {cluster.dayDate}
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
});