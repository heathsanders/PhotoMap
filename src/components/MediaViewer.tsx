import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Animated,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { VideoView } from 'expo-video';
import { PanGestureHandler, PinchGestureHandler, GestureHandlerRootView } from 'react-native-gesture-handler';
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
  
  // FlatList ref for programmatic navigation
  const flatListRef = useRef<FlatList>(null);
  
  // Animation values for pan and zoom (per item)
  const scaleValues = useRef(assets.map(() => new Animated.Value(1))).current;
  const translateXValues = useRef(assets.map(() => new Animated.Value(0))).current;
  const translateYValues = useRef(assets.map(() => new Animated.Value(0))).current;
  
  const currentAsset = assets[currentIndex];

  useEffect(() => {
    // Scroll to initial index when component mounts
    if (flatListRef.current && initialIndex > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ 
          index: initialIndex, 
          animated: false 
        });
      }, 100);
    }
  }, [initialIndex]);

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
      const nextIndex = currentIndex + 1;
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      setCurrentIndex(nextIndex);
      resetZoom(nextIndex);
    }
  };

  const navigateToPrevious = () => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      flatListRef.current?.scrollToIndex({ index: prevIndex, animated: true });
      setCurrentIndex(prevIndex);
      resetZoom(prevIndex);
    }
  };

  const onViewableItemsChanged = ({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index;
      if (newIndex !== currentIndex) {
        setCurrentIndex(newIndex);
        setShowMetadata(false); // Hide metadata when changing items
      }
    }
  };

  const resetZoom = (index: number = currentIndex) => {
    Animated.parallel([
      Animated.timing(scaleValues[index], {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateXValues[index], {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateYValues[index], {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const createPinchGestureEvent = (index: number) => Animated.event(
    [{ nativeEvent: { scale: scaleValues[index] } }],
    { useNativeDriver: true }
  );

  const createPanGestureEvent = (index: number) => Animated.event(
    [{ 
      nativeEvent: { 
        translationX: translateXValues[index],
        translationY: translateYValues[index] 
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

  const formatAspectRatio = (width: number, height: number): string => {
    const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
    const divisor = gcd(width, height);
    return `${width / divisor}:${height / divisor}`;
  };

  const formatTimezone = (tzOffset?: number): string => {
    if (!tzOffset) return 'Unknown';
    const hours = Math.floor(Math.abs(tzOffset) / 60);
    const minutes = Math.abs(tzOffset) % 60;
    const sign = tzOffset >= 0 ? '+' : '-';
    return `UTC${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const renderMediaItem = ({ item, index }: { item: MediaAsset; index: number }) => {
    if (item.type === 'video') {
      return (
        <View style={styles.mediaContainer}>
          <VideoView
            style={styles.media}
            player={{ uri: item.uri }}
            allowsFullscreen
            allowsPictureInPicture={false}
            showsTimecodes
            contentFit="contain"
          />
          <TouchableOpacity 
            style={styles.tapOverlay} 
            onPress={toggleControls}
            activeOpacity={1}
          />
        </View>
      );
    }

    return (
      <View style={styles.mediaContainer}>
        <PinchGestureHandler onGestureEvent={createPinchGestureEvent(index)}>
          <Animated.View style={styles.zoomContainer}>
            <PanGestureHandler onGestureEvent={createPanGestureEvent(index)}>
              <Animated.View
                style={[
                  styles.panContainer,
                  {
                    transform: [
                      { scale: scaleValues[index] },
                      { translateX: translateXValues[index] },
                      { translateY: translateYValues[index] },
                    ],
                  },
                ]}
              >
                <Image
                  source={{ uri: item.uri }}
                  style={styles.media}
                  contentFit="contain"
                />
                <TouchableOpacity 
                  style={styles.tapOverlay} 
                  onPress={toggleControls}
                  activeOpacity={1}
                />
              </Animated.View>
            </PanGestureHandler>
          </Animated.View>
        </PinchGestureHandler>
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
        <FlatList
          ref={flatListRef}
          data={assets}
          renderItem={renderMediaItem}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          getItemLayout={(data, index) => ({
            length: screenWidth,
            offset: screenWidth * index,
            index,
          })}
        />
        
        {/* Navigation areas - still useful for tap navigation */}
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
                <>
                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataLabel}>Aspect Ratio:</Text>
                    <Text style={styles.metadataValue}>
                      {formatAspectRatio(currentAsset.width, currentAsset.height)}
                    </Text>
                  </View>
                  
                  {currentAsset.tzOffset && (
                    <View style={styles.metadataRow}>
                      <Text style={styles.metadataLabel}>Timezone:</Text>
                      <Text style={styles.metadataValue}>
                        {formatTimezone(currentAsset.tzOffset)}
                      </Text>
                    </View>
                  )}
                  
                  {currentAsset.duration && (
                    <View style={styles.metadataRow}>
                      <Text style={styles.metadataLabel}>Duration:</Text>
                      <Text style={styles.metadataValue}>
                        {Math.floor(currentAsset.duration / 60)}m {Math.floor(currentAsset.duration % 60)}s
                      </Text>
                    </View>
                  )}
                  
                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataLabel}>Location:</Text>
                    <Text style={styles.metadataValue}>
                      {formatCoordinates(currentAsset.lat, currentAsset.lon)}
                    </Text>
                  </View>
                  
                  {/* Map Preview for Pro users */}
                  {currentAsset.lat && currentAsset.lon && (
                    <View style={styles.mapPreviewContainer}>
                      <Text style={styles.mapPreviewTitle}>Location Preview</Text>
                      <View style={styles.mapPreview}>
                        <Text style={styles.mapPlaceholder}>
                          🗺️ Map preview would show here
                        </Text>
                        <Text style={styles.mapCoordinates}>
                          {currentAsset.lat.toFixed(4)}°, {currentAsset.lon.toFixed(4)}°
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.proFeature}>
                  <Text style={styles.proFeatureText}>
                    🔒 Full EXIF data, location details, and map preview available in Pro
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}
      </SafeAreaView>
    </GestureHandlerRootView>
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
    width: screenWidth,
    height: screenHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  panContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: screenWidth,
    height: screenHeight,
  },
  tapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  mapPreviewContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
  },
  mapPreviewTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  mapPreview: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  mapPlaceholder: {
    color: '#888888',
    fontSize: 16,
    marginBottom: 4,
  },
  mapCoordinates: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.8,
  },
});