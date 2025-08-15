import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import UpgradeModal from '../../src/components/UpgradeModal';

interface SettingsItem {
  id: string;
  title: string;
  subtitle?: string;
  type: 'toggle' | 'slider' | 'button' | 'info';
  value?: any;
  min?: number;
  max?: number;
  step?: number;
  locked?: boolean;
  onPress?: () => void;
  onChange?: (value: any) => void;
}

export default function SettingsScreen() {
  const [isPro, setIsPro] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<string>();
  
  // Settings state
  const [clusterRadius, setClusterRadius] = useState(300);
  const [minPhotosPerCluster, setMinPhotosPerCluster] = useState(2);
  const [reverseGeocodingEnabled, setReverseGeocodingEnabled] = useState(false);
  const [tripViewEnabled, setTripViewEnabled] = useState(false);
  const [theme, setTheme] = useState('dark');

  const handleLockedFeature = (featureName: string) => {
    setUpgradeFeature(featureName);
    setShowUpgradeModal(true);
  };

  const handleUpgrade = (plan: string) => {
    // TODO: Implement actual purchase flow
    Alert.alert('Upgrade', `Selected plan: ${plan}. Purchase flow would be implemented here.`);
    setShowUpgradeModal(false);
  };

  const settings: SettingsItem[] = [
    {
      id: 'clustering-section',
      title: 'Clustering',
      type: 'info',
    },
    {
      id: 'cluster-radius',
      title: 'Cluster Radius',
      subtitle: `${clusterRadius}m - How close photos need to be to group together`,
      type: 'slider',
      value: clusterRadius,
      min: 50,
      max: 2000,
      step: 50,
      locked: !isPro,
      onChange: (value: number) => {
        if (!isPro) {
          handleLockedFeature('Adjustable Clustering');
          return;
        }
        setClusterRadius(value);
      },
    },
    {
      id: 'min-photos',
      title: 'Minimum Photos per Cluster',
      subtitle: `${minPhotosPerCluster} photos - Minimum number to form a cluster`,
      type: 'slider',
      value: minPhotosPerCluster,
      min: 1,
      max: 10,
      step: 1,
      locked: !isPro,
      onChange: (value: number) => {
        if (!isPro) {
          handleLockedFeature('Adjustable Clustering');
          return;
        }
        setMinPhotosPerCluster(value);
      },
    },
    {
      id: 'location-section',
      title: 'Location',
      type: 'info',
    },
    {
      id: 'reverse-geocoding',
      title: 'Location Names',
      subtitle: 'Show POI and city names instead of coordinates',
      type: 'toggle',
      value: reverseGeocodingEnabled,
      locked: !isPro,
      onChange: (value: boolean) => {
        if (!isPro) {
          handleLockedFeature('Location Names');
          return;
        }
        setReverseGeocodingEnabled(value);
      },
    },
    {
      id: 'appearance-section',
      title: 'Appearance',
      type: 'info',
    },
    {
      id: 'theme',
      title: 'Theme',
      subtitle: isPro ? 'Light/Dark themes available' : 'Dark theme only (Pro: Light theme)',
      type: 'button',
      locked: !isPro,
      onPress: () => {
        if (!isPro) {
          handleLockedFeature('Light Theme');
          return;
        }
        // Show theme picker
        Alert.alert('Theme', 'Theme picker would be shown here');
      },
    },
    {
      id: 'organization-section',
      title: 'Organization',
      type: 'info',
    },
    {
      id: 'trip-view',
      title: 'Trip View',
      subtitle: 'Group photos across multiple days for trips',
      type: 'toggle',
      value: tripViewEnabled,
      locked: !isPro,
      onChange: (value: boolean) => {
        if (!isPro) {
          handleLockedFeature('Trip View');
          return;
        }
        setTripViewEnabled(value);
      },
    },
    {
      id: 'about-section',
      title: 'About',
      type: 'info',
    },
    {
      id: 'privacy',
      title: 'Privacy Policy',
      subtitle: 'Learn how your data is protected',
      type: 'button',
      onPress: () => {
        Alert.alert('Privacy', 'All processing happens on-device. Your photos never leave your phone.');
      },
    },
    {
      id: 'version',
      title: 'Version',
      subtitle: '1.0.0',
      type: 'info',
    },
  ];

  const renderSettingItem = (item: SettingsItem) => {
    switch (item.type) {
      case 'info':
        return (
          <View key={item.id} style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{item.title}</Text>
          </View>
        );

      case 'toggle':
        return (
          <TouchableOpacity
            key={item.id}
            style={styles.settingRow}
            onPress={() => item.onChange && item.onChange(!item.value)}
            disabled={item.locked}
          >
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, item.locked && styles.lockedText]}>
                {item.title}
                {item.locked && ' 🔒'}
              </Text>
              {item.subtitle && (
                <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
              )}
            </View>
            <Switch
              value={item.value}
              onValueChange={item.onChange}
              disabled={item.locked}
              trackColor={{ false: '#3e3e3e', true: '#007AFF' }}
              thumbColor={item.value ? '#FFFFFF' : '#f4f3f4'}
            />
          </TouchableOpacity>
        );

      case 'slider':
        return (
          <View key={item.id} style={styles.settingRow}>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, item.locked && styles.lockedText]}>
                {item.title}
                {item.locked && ' 🔒'}
              </Text>
              {item.subtitle && (
                <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
              )}
            </View>
            <View style={styles.sliderContainer}>
              <Slider
                style={styles.slider}
                minimumValue={item.min}
                maximumValue={item.max}
                step={item.step}
                value={item.value}
                onValueChange={item.onChange}
                disabled={item.locked}
                minimumTrackTintColor={item.locked ? '#666666' : '#007AFF'}
                maximumTrackTintColor="#3e3e3e"
                thumbStyle={{ backgroundColor: item.locked ? '#666666' : '#007AFF' }}
              />
            </View>
          </View>
        );

      case 'button':
        return (
          <TouchableOpacity
            key={item.id}
            style={styles.settingRow}
            onPress={item.onPress}
            disabled={item.locked}
          >
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, item.locked && styles.lockedText]}>
                {item.title}
                {item.locked && ' 🔒'}
              </Text>
              {item.subtitle && (
                <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
              )}
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          {!isPro && (
            <TouchableOpacity
              style={styles.upgradeButton}
              onPress={() => setShowUpgradeModal(true)}
            >
              <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={styles.scrollView}>
          {!isPro && (
            <TouchableOpacity
              style={styles.proCallout}
              onPress={() => setShowUpgradeModal(true)}
            >
              <Text style={styles.proCalloutTitle}>✨ Unlock Pro Features</Text>
              <Text style={styles.proCalloutText}>
                Get adjustable clustering, location names, batch actions, and more
              </Text>
            </TouchableOpacity>
          )}

          {settings.map(renderSettingItem)}
        </ScrollView>

        <UpgradeModal
          visible={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          feature={upgradeFeature}
          onUpgrade={handleUpgrade}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
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
  upgradeButton: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  proCallout: {
    backgroundColor: 'rgba(255, 149, 0, 0.2)',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  proCalloutTitle: {
    color: '#FF9500',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  proCalloutText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333333',
  },
  settingContent: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  lockedText: {
    color: '#888888',
  },
  settingSubtitle: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 18,
  },
  sliderContainer: {
    width: 120,
  },
  slider: {
    width: 120,
    height: 40,
  },
  chevron: {
    color: '#666666',
    fontSize: 20,
    fontWeight: '300',
  },
});