import { getDistance } from 'geolib';
import { MediaAsset, Cluster, ClusteringOptions } from '../types';
import { v4 as uuidv4 } from 'react-native-uuid';

interface Point {
  asset: MediaAsset;
  clusterId?: string;
  visited: boolean;
}

class ClusteringService {
  private readonly DEFAULT_RADIUS = 300; // meters
  private readonly DEFAULT_MIN_POINTS = 2;

  /**
   * Clusters media assets by location using DBSCAN algorithm
   */
  clusterByLocation(
    assets: MediaAsset[], 
    options: ClusteringOptions = {
      radius: this.DEFAULT_RADIUS,
      minPoints: this.DEFAULT_MIN_POINTS
    }
  ): Cluster[] {
    // Filter assets that have GPS coordinates
    const geotaggedAssets = assets.filter(asset => asset.lat !== undefined && asset.lon !== undefined);
    const nonGeotaggedAssets = assets.filter(asset => asset.lat === undefined || asset.lon === undefined);

    if (geotaggedAssets.length === 0) {
      // Return a single "No GPS" cluster if no geotagged assets
      if (nonGeotaggedAssets.length > 0) {
        return [{
          id: uuidv4(),
          dayDate: this.getDateString(nonGeotaggedAssets[0].takenAt),
          centroidLat: 0,
          centroidLon: 0,
          label: 'No GPS',
          assets: nonGeotaggedAssets,
          radius: 0
        }];
      }
      return [];
    }

    const points: Point[] = geotaggedAssets.map(asset => ({
      asset,
      visited: false
    }));

    const clusters: Cluster[] = [];
    let clusterId = 0;

    for (const point of points) {
      if (point.visited) continue;

      point.visited = true;
      const neighbors = this.getNeighbors(point, points, options.radius);

      if (neighbors.length < options.minPoints) {
        // Mark as noise (will be handled later)
        continue;
      }

      // Create new cluster
      const cluster: Cluster = {
        id: uuidv4(),
        dayDate: this.getDateString(point.asset.takenAt),
        centroidLat: 0,
        centroidLon: 0,
        label: undefined,
        assets: [point.asset],
        radius: options.radius
      };

      point.clusterId = cluster.id;
      clusterId++;

      // Expand cluster
      let i = 0;
      while (i < neighbors.length) {
        const neighbor = neighbors[i];
        
        if (!neighbor.visited) {
          neighbor.visited = true;
          const neighborNeighbors = this.getNeighbors(neighbor, points, options.radius);
          
          if (neighborNeighbors.length >= options.minPoints) {
            // Add new neighbors to the list
            for (const nn of neighborNeighbors) {
              if (!neighbors.find(n => n.asset.id === nn.asset.id)) {
                neighbors.push(nn);
              }
            }
          }
        }

        if (!neighbor.clusterId) {
          neighbor.clusterId = cluster.id;
          cluster.assets.push(neighbor.asset);
        }

        i++;
      }

      clusters.push(cluster);
    }

    // Handle noise points (assets not assigned to any cluster)
    const noiseAssets = points
      .filter(point => !point.clusterId)
      .map(point => point.asset);

    // Add non-geotagged assets to noise
    const allNoiseAssets = [...noiseAssets, ...nonGeotaggedAssets];

    if (allNoiseAssets.length > 0) {
      clusters.push({
        id: uuidv4(),
        dayDate: this.getDateString(allNoiseAssets[0].takenAt),
        centroidLat: 0,
        centroidLon: 0,
        label: allNoiseAssets.some(a => a.lat !== undefined) ? 'Scattered Locations' : 'No GPS',
        assets: allNoiseAssets,
        radius: 0
      });
    }

    // Calculate centroids for each cluster
    clusters.forEach(cluster => {
      const geotaggedInCluster = cluster.assets.filter(a => a.lat !== undefined && a.lon !== undefined);
      if (geotaggedInCluster.length > 0) {
        cluster.centroidLat = geotaggedInCluster.reduce((sum, asset) => sum + asset.lat!, 0) / geotaggedInCluster.length;
        cluster.centroidLon = geotaggedInCluster.reduce((sum, asset) => sum + asset.lon!, 0) / geotaggedInCluster.length;
      }
    });

    return clusters.sort((a, b) => b.assets.length - a.assets.length);
  }

  /**
   * Groups assets by day and clusters each day separately
   */
  clusterByDayAndLocation(
    assets: MediaAsset[], 
    options: ClusteringOptions = {
      radius: this.DEFAULT_RADIUS,
      minPoints: this.DEFAULT_MIN_POINTS
    }
  ): Map<string, Cluster[]> {
    // Group assets by day
    const assetsByDay = new Map<string, MediaAsset[]>();
    
    assets.forEach(asset => {
      const dateString = this.getDateString(asset.takenAt);
      if (!assetsByDay.has(dateString)) {
        assetsByDay.set(dateString, []);
      }
      assetsByDay.get(dateString)!.push(asset);
    });

    // Cluster each day separately
    const clustersByDay = new Map<string, Cluster[]>();
    
    for (const [date, dayAssets] of assetsByDay) {
      const clusters = this.clusterByLocation(dayAssets, options);
      clustersByDay.set(date, clusters);
    }

    return clustersByDay;
  }

  /**
   * Merge small clusters that are close to each other
   */
  mergeClusters(clusters: Cluster[], maxMergeDistance = 500): Cluster[] {
    const merged: Cluster[] = [...clusters];
    let changed = true;

    while (changed) {
      changed = false;
      
      for (let i = 0; i < merged.length; i++) {
        for (let j = i + 1; j < merged.length; j++) {
          const cluster1 = merged[i];
          const cluster2 = merged[j];
          
          if (cluster1.centroidLat === 0 || cluster2.centroidLat === 0) continue;
          
          const distance = getDistance(
            { latitude: cluster1.centroidLat, longitude: cluster1.centroidLon },
            { latitude: cluster2.centroidLat, longitude: cluster2.centroidLon }
          );
          
          if (distance <= maxMergeDistance) {
            // Merge cluster2 into cluster1
            cluster1.assets.push(...cluster2.assets);
            
            // Recalculate centroid
            const geotaggedAssets = cluster1.assets.filter(a => a.lat !== undefined && a.lon !== undefined);
            if (geotaggedAssets.length > 0) {
              cluster1.centroidLat = geotaggedAssets.reduce((sum, asset) => sum + asset.lat!, 0) / geotaggedAssets.length;
              cluster1.centroidLon = geotaggedAssets.reduce((sum, asset) => sum + asset.lon!, 0) / geotaggedAssets.length;
            }
            
            // Remove cluster2
            merged.splice(j, 1);
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }

    return merged.sort((a, b) => b.assets.length - a.assets.length);
  }

  private getNeighbors(point: Point, allPoints: Point[], radius: number): Point[] {
    const neighbors: Point[] = [];
    
    for (const otherPoint of allPoints) {
      if (point === otherPoint) continue;
      
      const distance = getDistance(
        { latitude: point.asset.lat!, longitude: point.asset.lon! },
        { latitude: otherPoint.asset.lat!, longitude: otherPoint.asset.lon! }
      );
      
      if (distance <= radius) {
        neighbors.push(otherPoint);
      }
    }
    
    return neighbors;
  }

  private getDateString(timestamp: number): string {
    return new Date(timestamp).toISOString().split('T')[0];
  }

  /**
   * Calculate optimal cluster radius based on data density
   */
  calculateOptimalRadius(assets: MediaAsset[]): number {
    const geotaggedAssets = assets.filter(asset => asset.lat !== undefined && asset.lon !== undefined);
    
    if (geotaggedAssets.length < 2) {
      return this.DEFAULT_RADIUS;
    }

    const distances: number[] = [];
    
    // Calculate distances between all pairs
    for (let i = 0; i < geotaggedAssets.length; i++) {
      for (let j = i + 1; j < geotaggedAssets.length; j++) {
        const distance = getDistance(
          { latitude: geotaggedAssets[i].lat!, longitude: geotaggedAssets[i].lon! },
          { latitude: geotaggedAssets[j].lat!, longitude: geotaggedAssets[j].lon! }
        );
        distances.push(distance);
      }
    }

    // Sort distances and take the median of the lower half
    distances.sort((a, b) => a - b);
    const lowerHalf = distances.slice(0, Math.floor(distances.length / 2));
    const medianDistance = lowerHalf[Math.floor(lowerHalf.length / 2)];

    // Use median distance as radius, but clamp to reasonable bounds
    return Math.max(100, Math.min(1000, medianDistance));
  }
}

export const clusteringService = new ClusteringService();