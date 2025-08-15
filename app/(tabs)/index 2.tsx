import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { mediaLibraryService } from '../../src/services/mediaLibrary';
import { databaseService } from '../../src/services/database';
import { DayGroup } from '../../src/types';

export default function TimelineScreen() {
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize database
      await databaseService.initialize();
      
      // Check permissions
      const hasPermission = await mediaLibraryService.checkPermissions();
      setHasPermission(hasPermission);
      
      if (hasPermission) {
        await loadDayGroups();
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
      Alert.alert('Error', 'Failed to initialize the app. Please restart the application.');
    } finally {
      setLoading(false);
    }
  };

  const requestPermissions = async () => {
    try {
      const granted = await mediaLibraryService.requestPermissions();
      setHasPermission(granted);
      
      if (granted) {
        setLoading(true);
        await loadDayGroups();
        setLoading(false);
      } else {
        Alert.alert(
          'Permission Required',
          'PhotoMap needs access to your photo library to organize your media by location and time.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => {/* Open settings */ } }
          ]
        );
      }
    } catch (error) {
      console.error('Failed to request permissions:', error);
      Alert.alert('Error', 'Failed to request permissions. Please try again.');
    }
  };

  const loadDayGroups = async () => {
    try {
      // For now, just load existing day groups from database
      const groups = await databaseService.getAllDayGroups();
      setDayGroups(groups);
    } catch (error) {
      console.error('Failed to load day groups:', error);
    }
  };

  const scanMediaLibrary = async () => {
    try {
      setLoading(true);
      
      // Import media processor service
      const { mediaProcessorService } = await import('../../src/services/mediaProcessor');
      
      await mediaProcessorService.performFullScan((progress, message) => {
        console.log(`Progress: ${progress}% - ${message}`);
        // You could show a progress modal here
      });
      
      await loadDayGroups();
      Alert.alert('Success', 'Photo library scanned and organized successfully!');
    } catch (error) {
      console.error('Failed to scan media library:', error);
      Alert.alert('Error', 'Failed to scan media library. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <StatusBar style="light" />
          <View style={styles.centerContainer}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (!hasPermission) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <StatusBar style="light" />
          <View style={styles.centerContainer}>
            <Text style={styles.title}>Welcome to PhotoMap</Text>
            <Text style={styles.subtitle}>
              Organize your photos and videos by location and time
            </Text>
            <Text style={styles.description}>
              PhotoMap needs access to your photo library to create virtual albums organized by date and location. 
              Your photos remain on your device and are never uploaded to the cloud.
            </Text>
            <TouchableOpacity style={styles.button} onPress={requestPermissions}>
              <Text style={styles.buttonText}>Grant Photo Access</Text>
            </TouchableOpacity>
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
          <Text style={styles.headerTitle}>Timeline</Text>
          <TouchableOpacity style={styles.scanButton} onPress={scanMediaLibrary}>
            <Text style={styles.scanButtonText}>Scan Library</Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.scrollView}>
          {dayGroups.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No Photos Organized Yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap "Scan Library" to organize your photos by date and location
              </Text>
            </View>
          ) : (
            dayGroups.map((dayGroup) => (
              <DayGroupCard key={dayGroup.date} dayGroup={dayGroup} />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

interface DayGroupCardProps {
  dayGroup: DayGroup;
}

function DayGroupCard({ dayGroup }: DayGroupCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.dayCard}>
      <TouchableOpacity
        style={styles.dayHeader}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={styles.dayDate}>{dayGroup.date}</Text>
        <Text style={styles.dayInfo}>
          {dayGroup.totalAssets} photos • {dayGroup.city || 'Mixed Locations'}
        </Text>
      </TouchableOpacity>
      
      {expanded && (
        <View style={styles.clustersContainer}>
          {dayGroup.clusters.map((cluster) => (
            <TouchableOpacity key={cluster.id} style={styles.clusterCard}>
              <Text style={styles.clusterLabel}>
                {cluster.label || 'Unknown Location'}
              </Text>
              <Text style={styles.clusterInfo}>
                {cluster.assets.length} items
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
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
    padding: 20,
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
  scanButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    color: '#CCCCCC',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 24,
  },
  description: {
    color: '#999999',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
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
  dayCard: {
    margin: 16,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    overflow: 'hidden',
  },
  dayHeader: {
    padding: 16,
  },
  dayDate: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  dayInfo: {
    color: '#888888',
    fontSize: 14,
  },
  clustersContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  clusterCard: {
    backgroundColor: '#2C2C2E',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  clusterLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  clusterInfo: {
    color: '#888888',
    fontSize: 12,
  },
});
