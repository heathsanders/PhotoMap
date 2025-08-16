import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Alert,
  Image,
  ActionSheetIOS,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Sharing from 'expo-sharing';
import { MediaAsset, Cluster, DayGroup } from '../types';
import { mediaLibraryService } from '../services/mediaLibrary';
import { databaseService } from '../services/database';

const { width: screenWidth } = Dimensions.get('window');
const GRID_COLUMNS = 3;
const GRID_SPACING = 2;
const GRID_ITEM_SIZE = (screenWidth - (GRID_COLUMNS + 1) * GRID_SPACING) / GRID_COLUMNS;

interface AlbumGridProps {
  cluster: Cluster;
  dayGroup: DayGroup;
  onBack: () => void;
  isPro?: boolean;
  onAssetsChanged?: () => void;
}

interface SelectableAsset extends MediaAsset {
  selected: boolean;
}

export default function AlbumGrid({ cluster, dayGroup, onBack, isPro = false, onAssetsChanged }: AlbumGridProps) {
  const [assets, setAssets] = useState<SelectableAsset[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAssets();
  }, [cluster.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const count = assets.filter(asset => asset.selected).length;
    setSelectedCount(count);
    
    // Exit multi-select mode if no items are selected
    if (count === 0 && multiSelectMode) {
      setMultiSelectMode(false);
    }
  }, [assets, multiSelectMode]);

  const loadAssets = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
        setError(null);
      } else {
        setLoading(true);
        setError(null);
      }
      
      // Convert cluster assets to selectable assets
      const selectableAssets: SelectableAsset[] = cluster.assets.map(asset => ({
        ...asset,
        selected: false
      }));
      
      if (selectableAssets.length === 0) {
        setError('No photos found in this album');
      }
      
      setAssets(selectableAssets);
    } catch (error) {
      console.error('Failed to load assets:', error);
      const errorMessage = 'Failed to load photos. Please try again.';
      setError(errorMessage);
      
      if (!isRefresh) {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    loadAssets(true);
  };

  const handleAssetPress = (asset: SelectableAsset, index: number) => {
    if (multiSelectMode) {
      toggleAssetSelection(index);
    } else {
      // TODO: Navigate to media viewer
      Alert.alert('Media Viewer', `View ${asset.filename} in fullscreen mode`);
    }
  };

  const handleAssetLongPress = (index: number) => {
    if (!multiSelectMode) {
      setMultiSelectMode(true);
      toggleAssetSelection(index);
    }
  };

  const toggleAssetSelection = (index: number) => {
    setAssets(prevAssets => {
      const newAssets = [...prevAssets];
      newAssets[index] = {
        ...newAssets[index],
        selected: !newAssets[index].selected
      };
      return newAssets;
    });
  };

  const selectAll = () => {
    setAssets(prevAssets =>
      prevAssets.map(asset => ({ ...asset, selected: true }))
    );
  };

  const deselectAll = () => {
    setAssets(prevAssets =>
      prevAssets.map(asset => ({ ...asset, selected: false }))
    );
    setMultiSelectMode(false);
  };

  const deleteSelectedAssets = async () => {
    const selectedAssets = assets.filter(asset => asset.selected);
    
    if (selectedAssets.length === 0) return;

    const isLargeBatch = selectedAssets.length > 100;
    const confirmTitle = isLargeBatch ? 'Delete Large Batch?' : 'Delete Photos?';
    const confirmMessage = `This will delete ${selectedAssets.length} ${selectedAssets.length === 1 ? 'item' : 'items'} from your device. This action cannot be undone.`;

    Alert.alert(
      confirmTitle,
      confirmMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: isLargeBatch ? showSecondConfirmation : performDeletion
        }
      ]
    );
  };

  const showSecondConfirmation = () => {
    const selectedAssets = assets.filter(asset => asset.selected);
    Alert.alert(
      'Are you sure?',
      `You're about to delete ${selectedAssets.length} items. This is a large number and the action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Delete All', style: 'destructive', onPress: performDeletion }
      ]
    );
  };

  const performDeletion = async () => {
    const selectedAssets = assets.filter(asset => asset.selected);
    const assetIds = selectedAssets.map(asset => asset.id);
    
    try {
      setLoading(true);
      
      // Delete from device
      const result = await mediaLibraryService.deleteAssets(assetIds);
      
      if (result.success) {
        // Remove from database
        await databaseService.deleteMediaAssets(assetIds);
        
        // Update local state
        setAssets(prevAssets => prevAssets.filter(asset => !asset.selected));
        setMultiSelectMode(false);
        
        // Notify parent component that assets have changed
        onAssetsChanged?.();
        
        Alert.alert('Success', `Deleted ${result.deletedIds.length} items`);
      } else if (result.deletedIds.length > 0) {
        // Partial success
        await databaseService.deleteMediaAssets(result.deletedIds);
        setAssets(prevAssets => 
          prevAssets.filter(asset => !result.deletedIds.includes(asset.id))
        );
        setMultiSelectMode(false);
        
        Alert.alert(
          'Partial Success',
          `Deleted ${result.deletedIds.length} of ${assetIds.length} items. ${result.failedIds.length} items could not be deleted.`,
          [
            { text: 'OK' },
            { text: 'Retry Failed', onPress: () => retryFailedDeletions(result.failedIds) }
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to delete any items. Please try again.');
      }
    } catch (error) {
      console.error('Failed to delete assets:', error);
      Alert.alert('Error', 'Failed to delete items. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const retryFailedDeletions = async (failedIds: string[]) => {
    try {
      setLoading(true);
      const result = await mediaLibraryService.deleteAssets(failedIds);
      
      if (result.deletedIds.length > 0) {
        await databaseService.deleteMediaAssets(result.deletedIds);
        setAssets(prevAssets => 
          prevAssets.filter(asset => !result.deletedIds.includes(asset.id))
        );
        
        Alert.alert('Success', `Deleted ${result.deletedIds.length} additional items`);
      }
    } catch (error) {
      console.error('Retry deletion failed:', error);
      Alert.alert('Error', 'Retry failed. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const shareSelectedAssets = async () => {
    const selectedAssets = assets.filter(asset => asset.selected);
    
    if (selectedAssets.length === 0) return;

    try {
      if (selectedAssets.length === 1) {
        // Share single asset
        const asset = selectedAssets[0];
        const isAvailable = await Sharing.isAvailableAsync();
        
        if (isAvailable) {
          await Sharing.shareAsync(asset.uri, {
            mimeType: asset.type === 'video' ? 'video/mp4' : 'image/jpeg'
          });
        } else {
          Alert.alert('Sharing not available', 'Sharing is not available on this device');
        }
      } else {
        // Multiple assets - show action sheet or share first asset with count
        Alert.alert(
          'Share Multiple Items',
          `Share ${selectedAssets.length} items? Note: Only the first item will be shared due to platform limitations.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Share First Item', onPress: () => shareSelectedAssets() }
          ]
        );
      }
    } catch (error) {
      console.error('Error sharing assets:', error);
      Alert.alert('Error', 'Failed to share items');
    }
  };

  const favoriteSelectedAssets = async () => {
    if (!isPro) {
      showUpgradePrompt('Batch Favorite');
      return;
    }

    const selectedAssets = assets.filter(asset => asset.selected);
    if (selectedAssets.length === 0) return;

    try {
      // TODO: Implement actual favorite functionality with MediaLibrary
      Alert.alert(
        'Feature Coming Soon',
        `Would favorite ${selectedAssets.length} items. This feature will be implemented with MediaLibrary.createAlbumAsync()`
      );
      
      // For now, just deselect
      deselectAll();
    } catch (error) {
      console.error('Error favoriting assets:', error);
      Alert.alert('Error', 'Failed to favorite items');
    }
  };

  const hideSelectedAssets = async () => {
    if (!isPro) {
      showUpgradePrompt('Batch Hide');
      return;
    }

    const selectedAssets = assets.filter(asset => asset.selected);
    if (selectedAssets.length === 0) return;

    Alert.alert(
      'Hide Items',
      `Hide ${selectedAssets.length} items from this view? They will remain in your photo library but won't appear in PhotoMap.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Hide', 
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              
              // Mark assets as hidden in database
              const assetIds = selectedAssets.map(asset => asset.id);
              await databaseService.hideMediaAssets(assetIds);
              
              // Remove from local state
              setAssets(prevAssets => prevAssets.filter(asset => !asset.selected));
              setMultiSelectMode(false);
              
              Alert.alert('Success', `Hidden ${selectedAssets.length} items`);
            } catch (error) {
              console.error('Error hiding assets:', error);
              Alert.alert('Error', 'Failed to hide items');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const showUpgradePrompt = (feature: string) => {
    Alert.alert(
      'Pro Feature',
      `${feature} is a Pro feature. Upgrade to access batch actions like favorite, hide, and smart filters.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upgrade to Pro', onPress: () => {
          // TODO: Navigate to upgrade modal or settings
          Alert.alert('Upgrade', 'This would navigate to the upgrade flow');
        }}
      ]
    );
  };

  const showBatchActionsMenu = () => {
    const selectedAssets = assets.filter(asset => asset.selected);
    if (selectedAssets.length === 0) return;

    if (Platform.OS === 'ios') {
      const options = [
        'Share',
        'Favorite' + (!isPro ? ' 🔒' : ''),
        'Hide' + (!isPro ? ' 🔒' : ''),
        'Delete',
        'Cancel'
      ];

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex: 3, // Delete
          cancelButtonIndex: 4, // Cancel
          title: `${selectedAssets.length} items selected`
        },
        (buttonIndex) => {
          switch (buttonIndex) {
            case 0: // Share
              shareSelectedAssets();
              break;
            case 1: // Favorite
              favoriteSelectedAssets();
              break;
            case 2: // Hide
              hideSelectedAssets();
              break;
            case 3: // Delete
              deleteSelectedAssets();
              break;
          }
        }
      );
    } else {
      // Android - use Alert for now (could implement custom modal)
      Alert.alert(
        'Batch Actions',
        `${selectedAssets.length} items selected`,
        [
          { text: 'Share', onPress: shareSelectedAssets },
          { text: 'Favorite' + (!isPro ? ' 🔒' : ''), onPress: favoriteSelectedAssets },
          { text: 'Hide' + (!isPro ? ' 🔒' : ''), onPress: hideSelectedAssets },
          { text: 'Delete', style: 'destructive', onPress: deleteSelectedAssets },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    }
  };

  const showSmartDeleteFilters = () => {
    if (!isPro) {
      showUpgradePrompt('Smart Delete Filters');
      return;
    }

    const screenshots = assets.filter(asset => 
      asset.filename.toLowerCase().includes('screenshot') ||
      asset.filename.toLowerCase().includes('screen shot') ||
      asset.filename.toLowerCase().includes('screen_shot')
    );

    const largeVideos = assets.filter(asset => 
      asset.type === 'video' && 
      asset.duration && asset.duration > 60 && // Videos longer than 1 minute
      asset.fileSize && asset.fileSize > 100 * 1024 * 1024 // Larger than 100MB
    );

    const lowQualityPhotos = assets.filter(asset => 
      asset.type === 'photo' && 
      (asset.width * asset.height) < (1920 * 1080) && // Less than 1080p
      asset.fileSize && asset.fileSize < 500 * 1024 // Smaller than 500KB
    );

    // Simple duplicate detection based on filename patterns
    const possibleDuplicates = assets.filter(asset => {
      const filename = asset.filename.toLowerCase();
      return filename.includes('copy') || 
             filename.includes('duplicate') || 
             filename.match(/\(\d+\)/) || // filename(1).jpg pattern
             filename.match(/-\d+\./) || // filename-1.jpg pattern
             filename.includes('edited');
    });

    const filterOptions = [
      `Screenshots (${screenshots.length})`,
      `Large Videos (${largeVideos.length})`,
      `Low Quality Photos (${lowQualityPhotos.length})`,
      `Possible Duplicates (${possibleDuplicates.length})`,
      'Cancel'
    ];

    const handleSmartSelection = (filterType: string, assetsToSelect: SelectableAsset[]) => {
      if (assetsToSelect.length === 0) {
        Alert.alert('No Items Found', `No ${filterType.toLowerCase()} found in this album.`);
        return;
      }

      Alert.alert(
        `Select ${filterType}?`,
        `This will select ${assetsToSelect.length} items that appear to be ${filterType.toLowerCase()}. You can then review and delete them.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Select', 
            onPress: () => {
              // First deselect all
              setAssets(prevAssets => 
                prevAssets.map(asset => ({ ...asset, selected: false }))
              );
              
              // Then select the filtered assets
              setAssets(prevAssets => 
                prevAssets.map(asset => ({
                  ...asset,
                  selected: assetsToSelect.some(filtered => filtered.id === asset.id)
                }))
              );
              
              setMultiSelectMode(true);
            }
          }
        ]
      );
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: filterOptions,
          cancelButtonIndex: 4,
          title: 'Smart Delete Filters'
        },
        (buttonIndex) => {
          switch (buttonIndex) {
            case 0:
              handleSmartSelection('Screenshots', screenshots);
              break;
            case 1:
              handleSmartSelection('Large Videos', largeVideos);
              break;
            case 2:
              handleSmartSelection('Low Quality Photos', lowQualityPhotos);
              break;
            case 3:
              handleSmartSelection('Possible Duplicates', possibleDuplicates);
              break;
          }
        }
      );
    } else {
      Alert.alert(
        'Smart Delete Filters',
        'Select a filter type:',
        [
          { text: `Screenshots (${screenshots.length})`, onPress: () => handleSmartSelection('Screenshots', screenshots) },
          { text: `Large Videos (${largeVideos.length})`, onPress: () => handleSmartSelection('Large Videos', largeVideos) },
          { text: `Low Quality Photos (${lowQualityPhotos.length})`, onPress: () => handleSmartSelection('Low Quality Photos', lowQualityPhotos) },
          { text: `Possible Duplicates (${possibleDuplicates.length})`, onPress: () => handleSmartSelection('Possible Duplicates', possibleDuplicates) },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    }
  };

  const renderAsset = ({ item, index }: { item: SelectableAsset; index: number }) => (
    <TouchableOpacity
      style={[
        styles.gridItem,
        item.selected && styles.selectedGridItem
      ]}
      onPress={() => handleAssetPress(item, index)}
      onLongPress={() => handleAssetLongPress(index)}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: item.uri }}
        style={styles.thumbnail}
        resizeMode="cover"
      />
      
      {item.type === 'video' && (
        <View style={styles.videoIndicator}>
          <Text style={styles.videoDuration}>
            {item.duration ? formatDuration(item.duration) : '0:00'}
          </Text>
        </View>
      )}
      
      {multiSelectMode && (
        <View style={styles.selectionOverlay}>
          <View style={[
            styles.selectionCircle,
            item.selected && styles.selectedCircle
          ]}>
            {item.selected && <View style={styles.checkmark} />}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );

  const formatDuration = (duration: number): string => {
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Loading photos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {cluster.label || 'Unknown Location'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {dayGroup.date}
            </Text>
          </View>
        </View>

        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadAssets()}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {cluster.label || 'Unknown Location'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {dayGroup.date} • {assets.length} items
          </Text>
        </View>
        
        {multiSelectMode ? (
          <TouchableOpacity style={styles.cancelButton} onPress={deselectAll}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.smartDeleteButton} 
            onPress={showSmartDeleteFilters}
          >
            <Text style={styles.smartDeleteButtonText}>
              Smart{!isPro && ' 🔒'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {multiSelectMode && (
        <View style={styles.multiSelectToolbar}>
          <TouchableOpacity style={styles.toolbarButton} onPress={selectAll}>
            <Text style={styles.toolbarButtonText}>Select All</Text>
          </TouchableOpacity>
          
          <Text style={styles.selectedCountText}>
            {selectedCount} selected
          </Text>
          
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.actionButton, selectedCount === 0 && styles.disabledButton]}
              onPress={showBatchActionsMenu}
              disabled={selectedCount === 0}
            >
              <Text style={styles.actionButtonText}>Actions</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.deleteButton, selectedCount === 0 && styles.disabledButton]}
              onPress={deleteSelectedAssets}
              disabled={selectedCount === 0}
            >
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <FlatList
        data={assets}
        renderItem={renderAsset}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        contentContainerStyle={[
          styles.gridContainer,
          assets.length === 0 && styles.emptyContainer
        ]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={21} // 7 rows × 3 columns
        updateCellsBatchingPeriod={50}
        initialNumToRender={21}
        windowSize={10}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        getItemLayout={(data, index) => ({
          length: GRID_ITEM_SIZE + GRID_SPACING,
          offset: (GRID_ITEM_SIZE + GRID_SPACING) * Math.floor(index / GRID_COLUMNS),
          index,
        })}
        ListEmptyComponent={
          !loading && !error ? (
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyStateText}>No photos in this album</Text>
              <Text style={styles.emptyStateSubtext}>Pull down to refresh</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
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
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  backButton: {
    marginRight: 12,
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: '#888888',
    fontSize: 14,
  },
  cancelButton: {
    marginLeft: 12,
  },
  cancelButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  smartDeleteButton: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 149, 0, 0.2)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  smartDeleteButtonText: {
    color: '#FF9500',
    fontSize: 14,
    fontWeight: '600',
  },
  multiSelectToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1C1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  toolbarButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toolbarButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  selectedCountText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  disabledButton: {
    backgroundColor: '#666666',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyStateText: {
    color: '#888888',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: '#666666',
    fontSize: 14,
    textAlign: 'center',
  },
  gridContainer: {
    padding: GRID_SPACING,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    margin: GRID_SPACING / 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  selectedGridItem: {
    borderWidth: 3,
    borderColor: '#007AFF',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  videoIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoDuration: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  selectionOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  selectionCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCircle: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkmark: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
});