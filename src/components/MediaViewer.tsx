import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { Video } from 'expo-av';
import { PanGestureHandler, PinchGestureHandler, State } from 'react-native-gesture-handler';
import { MediaAsset } from '../types';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface MediaViewerProps {
  assets: MediaAsset[];
  initialIndex: number;
  onClose: () => void;
  isPro?: boolean;
}

export default function MediaViewer({ 
  assets, 
  initialIndex, 
  onClose, 
  isPro = false 
}: MediaViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showControls, setShowControls] = useState(true);
  const [showMetadata, setShowMetadata] = useState(false);
  
  // Animation values for pan and zoom
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  
  const currentAsset = assets[currentIndex];

  const toggleControls = () => {
    setShowControls(!showControls);
  };

  const toggleMetadata = () => {
    if (!isPro && showMetadata) {
      // Show upgrade prompt for Pro features
      return;
    }
    setShowMetadata(!showMetadata);
  };

  const navigateToNext = () => {
    if (currentIndex < assets.length - 1) {
      setCurrentIndex(currentIndex + 1);
      resetZoom();
    }
  };

  const navigateToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      resetZoom();
    }
  };

  const resetZoom = () => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const onPinchGestureEvent = Animated.event(
    [{ nativeEvent: { scale: scale } }],
    { useNativeDriver: true }
  );

  const onPanGestureEvent = Animated.event(
    [{ 
      nativeEvent: { 
        translationX: translateX,
        translationY: translateY 
      } 
    }],
    { useNativeDriver: true }
  );

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown size';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatCoordinates = (lat?: number, lon?: number): string => {
    if (!lat || !lon) return 'No location data';
    
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  };

  const renderMedia = () => {
    if (currentAsset.type === 'video') {
      return (
        <Video
          source={{ uri: currentAsset.uri }}
          style={styles.media}
          useNativeControls
          resizeMode="contain"
          shouldPlay={false}
        />
      );
    }

    return (
      <PinchGestureHandler onGestureEvent={onPinchGestureEvent}>
        <Animated.View style={styles.mediaContainer}>
          <PanGestureHandler onGestureEvent={onPanGestureEvent}>
            <Animated.View
              style={[
                styles.mediaContainer,
                {
                  transform: [
                    { scale: scale },
                    { translateX: translateX },
                    { translateY: translateY },
                  ],
                },
              ]}
            >
              <Image
                source={{ uri: currentAsset.uri }}
                style={styles.media}
                contentFit="contain"
                onTouchEnd={toggleControls}
              />
            </Animated.View>
          </PanGestureHandler>
        </Animated.View>
      </PinchGestureHandler>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" hidden={!showControls} />
      
      {showControls && (
        <View style={styles.topControls}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {currentIndex + 1} of {assets.length}
            </Text>
          </View>
          
          <TouchableOpacity 
            style={styles.infoButton} 
            onPress={toggleMetadata}
          >
            <Text style={styles.infoButtonText}>ⓘ</Text>
            {!isPro && (
              <View style={styles.lockIcon}>
                <Text style={styles.lockText}>🔒</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.mediaWrapper}>
        {renderMedia()}
        
        {/* Navigation areas */}
        <TouchableOpacity
          style={[styles.navArea, styles.leftNavArea]}
          onPress={navigateToPrevious}
          disabled={currentIndex === 0}
        />
        <TouchableOpacity
          style={[styles.navArea, styles.rightNavArea]}
          onPress={navigateToNext}
          disabled={currentIndex === assets.length - 1}
        />
      </View>

      {showControls && (
        <View style={styles.bottomControls}>
          <Text style={styles.filename} numberOfLines={1}>
            {currentAsset.filename}
          </Text>
          
          {showMetadata && (isPro || !showMetadata) && (
            <View style={styles.metadata}>
              <Text style={styles.metadataTitle}>Details</Text>
              
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Date:</Text>
                <Text style={styles.metadataValue}>
                  {formatDate(currentAsset.takenAt)}
                </Text>
              </View>
              
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Size:</Text>
                <Text style={styles.metadataValue}>
                  {currentAsset.width} × {currentAsset.height}
                </Text>
              </View>
              
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>File Size:</Text>
                <Text style={styles.metadataValue}>
                  {formatFileSize(currentAsset.fileSize)}
                </Text>
              </View>
              
              {isPro ? (
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>Location:</Text>
                  <Text style={styles.metadataValue}>
                    {formatCoordinates(currentAsset.lat, currentAsset.lon)}
                  </Text>
                </View>
              ) : (
                <View style={styles.proFeature}>
                  <Text style={styles.proFeatureText}>
                    🔒 Full EXIF data and location details available in Pro
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 22,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  counter: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  infoButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 22,
    position: 'relative',
  },
  infoButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  lockIcon: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF9500',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockText: {
    fontSize: 8,
  },
  mediaWrapper: {
    flex: 1,
    position: 'relative',
  },
  mediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: screenWidth,
    height: screenHeight,
  },
  navArea: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: screenWidth * 0.3,
  },
  leftNavArea: {
    left: 0,
  },
  rightNavArea: {
    right: 0,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 10,
  },
  filename: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  metadata: {
    backgroundColor: 'rgba(28, 28, 30, 0.9)',
    borderRadius: 12,
    padding: 16,
  },
  metadataTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metadataLabel: {
    color: '#888888',
    fontSize: 14,
    flex: 1,
  },
  metadataValue: {
    color: '#FFFFFF',
    fontSize: 14,
    flex: 2,
    textAlign: 'right',
  },
  proFeature: {
    backgroundColor: 'rgba(255, 149, 0, 0.2)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  proFeatureText: {
    color: '#FF9500',
    fontSize: 14,
    textAlign: 'center',
  },
});