import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AlbumGrid from '../src/components/AlbumGrid';
import { Cluster, DayGroup } from '../src/types';

export default function AlbumScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Parse the cluster and dayGroup from params
  const cluster = JSON.parse(params.cluster as string) as Cluster;
  const dayGroup = JSON.parse(params.dayGroup as string) as DayGroup;
  
  const handleBack = () => {
    router.back();
  };

  const handleAssetsChanged = () => {
    // Navigate back and trigger a refresh of the parent timeline
    // Use replace instead of back to avoid navigation stack issues
    try {
      if (router.canGoBack()) {
        router.back();
      } else {
        // Fallback: navigate to timeline if can't go back
        router.replace('/(tabs)/');
      }
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback navigation
      router.replace('/(tabs)/');
    }
  };
  
  return (
    <AlbumGrid
      cluster={cluster}
      dayGroup={dayGroup}
      onBack={handleBack}
      onAssetsChanged={handleAssetsChanged}
    />
  );
}