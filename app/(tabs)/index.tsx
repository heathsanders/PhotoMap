import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, Modal, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { mediaLibraryService } from '../../src/services/mediaLibrary';
import { databaseService } from '../../src/services/database';
import { mediaProcessorService } from '../../src/services/mediaProcessor';
import { DayGroup } from '../../src/types';

export default function TimelineScreen() {
  const router = useRouter();
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState('');
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [backgroundProcessing, setBackgroundProcessing] = useState(false);

  useEffect(() => {
    initializeApp();
    checkBackgroundProcessing();
    
    // Check background processing status periodically
    const interval = setInterval(async () => {
      if (!showProgressModal) { // Only check when not in active scan modal
        try {
          const { mediaProcessorService } = await import('../../src/services/mediaProcessor');
          const isBackgroundRunning = mediaProcessorService.isBackgroundProcessing();
          
          if (isBackgroundRunning !== backgroundProcessing) {
            console.log(`Background processing state changed: ${isBackgroundRunning}`);
            setBackgroundProcessing(isBackgroundRunning);
            
            if (!isBackgroundRunning && backgroundProcessing) {
              // Background processing just finished
              await loadDayGroups();
              setScanMessage('Background processing completed');
            }
          }
        } catch (error) {
          console.error('Error checking background processing status:', error);
        }
      }
    }, 2000); // Check every 2 seconds
    
    return () => clearInterval(interval);
  }, [backgroundProcessing, showProgressModal]);

  const checkBackgroundProcessing = async () => {
    try {
      const { mediaProcessorService } = await import('../../src/services/mediaProcessor');
      const isBackgroundRunning = mediaProcessorService.isBackgroundProcessing();
      if (isBackgroundRunning) {
        setBackgroundProcessing(true);
        setScanMessage('Resuming background processing...');
        console.log('Found existing background processing on app start');
      }
    } catch (error) {
      console.error('Error checking background processing:', error);
    }
  };

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
        await loadDayGroups();
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
    // Prevent multiple scans
    if (showProgressModal || backgroundProcessing) {
      Alert.alert(
        'Scan Already Running', 
        'A photo scan is already in progress. Please wait for it to complete.'
      );
      return;
    }

    try {
      setShowProgressModal(true);
      setScanProgress(0);
      setScanMessage('Starting batched scan...');
      
      // Use smaller batches (250 photos) for better responsiveness
      await mediaProcessorService.performFullScan(
        (progress, message) => {
          if (backgroundProcessing) {
            // We're in background mode, just update the message
            setScanMessage(message);
            
            // Update timeline with new batch results periodically
            if (message.includes('Background') || message.includes('batch')) {
              loadDayGroups();
            }
          } else {
            // We're in foreground mode, update progress normally
            setScanProgress(progress);
            setScanMessage(message);
          }
        },
        250, // Batch size of 250 photos
        () => {
          // First batch complete callback
          console.log('First batch complete - switching to background mode');
          setShowProgressModal(false);
          setBackgroundProcessing(true);
          loadDayGroups(); // Show first batch results
          
          Alert.alert(
            'First Batch Complete!',
            'You can now browse your first 250 organized photos. We\'re continuing to process the remaining photos in the background.',
            [{ text: 'Start Browsing' }]
          );
        }
      );
      
      // Final completion - this only runs when ALL batches are done
      console.log('All scanning completed - hiding background processing indicator');
      setBackgroundProcessing(false);
      await loadDayGroups(); // Final reload
      Alert.alert(
        'Scan Complete!', 
        'All photos have been scanned and organized by location and date.'
      );
    } catch (error) {
      console.error('Failed to scan media library:', error);
      setShowProgressModal(false);
      setBackgroundProcessing(false);
      Alert.alert('Error', 'Failed to scan media library. Please try again.');
    }
  };

  if (loading) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <StatusBar style="light" />
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Initializing PhotoMap...</Text>
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
          <TouchableOpacity 
            style={[styles.scanButton, (showProgressModal || backgroundProcessing) && styles.scanButtonDisabled]} 
            onPress={scanMediaLibrary}
            disabled={showProgressModal || backgroundProcessing}
          >
            <Text style={[
              styles.scanButtonText,
              (showProgressModal || backgroundProcessing) && styles.scanButtonDisabledText
            ]}>
              {showProgressModal ? 'Scanning...' : backgroundProcessing ? 'Processing...' : 'Scan Library'}
            </Text>
          </TouchableOpacity>
        </View>

        {backgroundProcessing && (
          <View style={styles.backgroundProcessingBar}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.backgroundProcessingText}>
              {scanMessage || 'Processing photos in background...'}
            </Text>
          </View>
        )}
        
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
              <DayGroupCard key={dayGroup.date} dayGroup={dayGroup} router={router} />
            ))
          )}
        </ScrollView>

        {/* Progress Modal */}
        <Modal
          visible={showProgressModal}
          transparent={true}
          animationType="fade"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.progressModal}>
              <Text style={styles.progressTitle}>Scanning Photo Library</Text>
              
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${scanProgress}%` }
                    ]} 
                  />
                </View>
                <Text style={styles.progressPercent}>{Math.round(scanProgress)}%</Text>
              </View>
              
              <Text style={styles.progressMessage}>{scanMessage}</Text>
              
              <ActivityIndicator 
                size="large" 
                color="#007AFF" 
                style={styles.activityIndicator}
              />
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

interface DayGroupCardProps {
  dayGroup: DayGroup;
  router: any;
}

function DayGroupCard({ dayGroup, router }: DayGroupCardProps) {
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
          {dayGroup.clusters
            .filter(cluster => cluster.assets.length > 0)
            .map((cluster) => (
            <TouchableOpacity 
              key={cluster.id} 
              style={styles.clusterCard}
              onPress={() => {
                // Navigate to album screen with cluster and dayGroup
                router.push({
                  pathname: '/album',
                  params: {
                    cluster: JSON.stringify(cluster),
                    dayGroup: JSON.stringify(dayGroup)
                  }
                });
              }}
            >
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
  scanButtonDisabled: {
    backgroundColor: '#555555',
    opacity: 0.6,
  },
  scanButtonDisabledText: {
    opacity: 0.7,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressModal: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 24,
    margin: 20,
    minWidth: 280,
    alignItems: 'center',
  },
  progressTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#333333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  progressPercent: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressMessage: {
    color: '#CCCCCC',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
    minHeight: 20,
  },
  detailedProgressText: {
    color: '#999999',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: 'monospace',
  },
  activityIndicator: {
    marginTop: 8,
  },
  backgroundProcessingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 122, 255, 0.2)',
  },
  backgroundProcessingText: {
    color: '#007AFF',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
});
