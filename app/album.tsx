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
  
  return (
    <AlbumGrid
      cluster={cluster}
      dayGroup={dayGroup}
      onBack={handleBack}
    />
  );
}