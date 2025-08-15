import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Alert,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
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
}

interface SelectableAsset extends MediaAsset {
  selected: boolean;
}

export default function AlbumGrid({ cluster, dayGroup, onBack }: AlbumGridProps) {
  const [assets, setAssets] = useState<SelectableAsset[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAssets();
  }, [cluster.id]);

  useEffect(() => {
    const count = assets.filter(asset => asset.selected).length;
    setSelectedCount(count);
    
    // Exit multi-select mode if no items are selected
    if (count === 0 && multiSelectMode) {
      setMultiSelectMode(false);
    }
  }, [assets]);

  const loadAssets = async () => {
    try {
      setLoading(true);
      
      // Convert cluster assets to selectable assets
      const selectableAssets: SelectableAsset[] = cluster.assets.map(asset => ({
        ...asset,
        selected: false
      }));
      
      setAssets(selectableAssets);
    } catch (error) {
      console.error('Failed to load assets:', error);
      Alert.alert('Error', 'Failed to load photos');
    } finally {
      setLoading(false);
    }
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Loading photos...</Text>
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
        
        {multiSelectMode && (
          <TouchableOpacity style={styles.cancelButton} onPress={deselectAll}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
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
          
          <TouchableOpacity 
            style={[styles.deleteButton, selectedCount === 0 && styles.disabledButton]}
            onPress={deleteSelectedAssets}
            disabled={selectedCount === 0}
          >
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={assets}
        renderItem={renderAsset}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        contentContainerStyle={styles.gridContainer}
        showsVerticalScrollIndicator={false}
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