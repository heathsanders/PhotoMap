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
import { useTheme } from '../../src/contexts/ThemeContext';

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
  const { theme, settings, updateSetting, updateSettings, isDark } = useTheme();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<string>();

  const handleLockedFeature = (featureName: string) => {
    setUpgradeFeature(featureName);
    setShowUpgradeModal(true);
  };

  const handleUpgrade = (plan: string) => {
    // TODO: Implement actual purchase flow
    Alert.alert('Upgrade', `Selected plan: ${plan}. Purchase flow would be implemented here.`);
    setShowUpgradeModal(false);
  };

  const handleThemeChange = () => {
    if (!settings.isPro) {
      handleLockedFeature('Light Theme');
      return;
    }
    
    // Show theme picker for Pro users
    Alert.alert(
      'Choose Theme',
      'Select your preferred theme',
      [
        { text: 'Dark', onPress: () => updateSetting('theme', 'dark') },
        { text: 'Light', onPress: () => updateSetting('theme', 'light') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const settingsItems: SettingsItem[] = [
    {
      id: 'clustering-section',
      title: 'Clustering',
      type: 'info',
    },
    {
      id: 'cluster-radius',
      title: 'Cluster Radius',
      subtitle: `${settings.clusterRadius}m - How close photos need to be to group together`,
      type: 'slider',
      value: settings.clusterRadius,
      min: 50,
      max: 2000,
      step: 50,
      locked: !settings.isPro,
      onChange: async (value: number) => {
        if (!settings.isPro) {
          handleLockedFeature('Adjustable Clustering');
          return;
        }
        try {
          await updateSetting('clusterRadius', value);
        } catch (error) {
          Alert.alert('Error', 'Failed to update cluster radius');
        }
      },
    },
    {
      id: 'min-photos',
      title: 'Minimum Photos per Cluster',
      subtitle: `${settings.minPhotosPerCluster} photos - Minimum number to form a cluster`,
      type: 'slider',
      value: settings.minPhotosPerCluster,
      min: 1,
      max: 10,
      step: 1,
      locked: !settings.isPro,
      onChange: async (value: number) => {
        if (!settings.isPro) {
          handleLockedFeature('Adjustable Clustering');
          return;
        }
        try {
          await updateSetting('minPhotosPerCluster', value);
        } catch (error) {
          Alert.alert('Error', 'Failed to update minimum photos per cluster');
        }
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
      value: settings.reverseGeocodingEnabled,
      onChange: async (value: boolean) => {
        try {
          await updateSetting('reverseGeocodingEnabled', value);
        } catch (error) {
          Alert.alert('Error', 'Failed to update location names setting');
        }
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
      subtitle: settings.isPro 
        ? `Current: ${settings.theme === 'dark' ? 'Dark' : 'Light'} theme`
        : 'Dark theme only (Pro: Light theme)',
      type: 'button',
      locked: !settings.isPro,
      onPress: handleThemeChange,
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
      value: settings.tripViewEnabled,
      locked: !settings.isPro,
      onChange: async (value: boolean) => {
        if (!settings.isPro) {
          handleLockedFeature('Trip View');
          return;
        }
        try {
          await updateSetting('tripViewEnabled', value);
        } catch (error) {
          Alert.alert('Error', 'Failed to update trip view setting');
        }
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
          <View key={item.id} style={dynamicStyles.sectionHeader}>
            <Text style={dynamicStyles.sectionTitle}>{item.title}</Text>
          </View>
        );

      case 'toggle':
        return (
          <TouchableOpacity
            key={item.id}
            style={dynamicStyles.settingRow}
            onPress={() => item.onChange && item.onChange(!item.value)}
            disabled={item.locked}
          >
            <View style={dynamicStyles.settingContent}>
              <Text style={[dynamicStyles.settingTitle, item.locked && dynamicStyles.lockedText]}>
                {item.title}
                {item.locked && ' 🔒'}
              </Text>
              {item.subtitle && (
                <Text style={dynamicStyles.settingSubtitle}>{item.subtitle}</Text>
              )}
            </View>
            <Switch
              value={item.value}
              onValueChange={item.onChange}
              disabled={item.locked}
              trackColor={{ 
                false: isDark ? '#3e3e3e' : '#C7C7CC', 
                true: theme.accent 
              }}
              thumbColor={item.value ? '#FFFFFF' : '#f4f3f4'}
            />
          </TouchableOpacity>
        );

      case 'slider':
        return (
          <View key={item.id} style={dynamicStyles.settingRow}>
            <View style={dynamicStyles.settingContent}>
              <Text style={[dynamicStyles.settingTitle, item.locked && dynamicStyles.lockedText]}>
                {item.title}
                {item.locked && ' 🔒'}
              </Text>
              {item.subtitle && (
                <Text style={dynamicStyles.settingSubtitle}>{item.subtitle}</Text>
              )}
            </View>
            <View style={dynamicStyles.sliderContainer}>
              <Slider
                style={dynamicStyles.slider}
                minimumValue={item.min}
                maximumValue={item.max}
                step={item.step}
                value={item.value}
                onValueChange={item.onChange}
                disabled={item.locked}
                minimumTrackTintColor={item.locked ? theme.textSecondary : theme.accent}
                maximumTrackTintColor={theme.border}
                thumbStyle={{ backgroundColor: item.locked ? theme.textSecondary : theme.accent }}
              />
            </View>
          </View>
        );

      case 'button':
        return (
          <TouchableOpacity
            key={item.id}
            style={dynamicStyles.settingRow}
            onPress={item.onPress}
            disabled={item.locked}
          >
            <View style={dynamicStyles.settingContent}>
              <Text style={[dynamicStyles.settingTitle, item.locked && dynamicStyles.lockedText]}>
                {item.title}
                {item.locked && ' 🔒'}
              </Text>
              {item.subtitle && (
                <Text style={dynamicStyles.settingSubtitle}>{item.subtitle}</Text>
              )}
            </View>
            <Text style={dynamicStyles.chevron}>›</Text>
          </TouchableOpacity>
        );

      default:
        return null;
    }
  };

  // Create dynamic styles based on theme
  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitle: {
      color: theme.text,
      fontSize: 28,
      fontWeight: 'bold',
    },
    upgradeButton: {
      backgroundColor: theme.secondary,
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
      backgroundColor: `${theme.secondary}33`, // 20% opacity
      margin: 20,
      padding: 20,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.secondary,
    },
    proCalloutTitle: {
      color: theme.secondary,
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 8,
    },
    proCalloutText: {
      color: theme.text,
      fontSize: 14,
      lineHeight: 20,
    },
    sectionHeader: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 8,
    },
    sectionTitle: {
      color: theme.accent,
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
      borderBottomColor: theme.border,
    },
    settingContent: {
      flex: 1,
      marginRight: 16,
    },
    settingTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '500',
      marginBottom: 2,
    },
    lockedText: {
      color: theme.textSecondary,
    },
    settingSubtitle: {
      color: theme.textSecondary,
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
      color: theme.textSecondary,
      fontSize: 20,
      fontWeight: '300',
    },
  });

  return (
    <SafeAreaProvider>
      <SafeAreaView style={dynamicStyles.container}>
        <StatusBar style={isDark ? "light" : "dark"} />
        
        <View style={dynamicStyles.header}>
          <Text style={dynamicStyles.headerTitle}>Settings</Text>
          {!settings.isPro && (
            <TouchableOpacity
              style={dynamicStyles.upgradeButton}
              onPress={() => setShowUpgradeModal(true)}
            >
              <Text style={dynamicStyles.upgradeButtonText}>Upgrade to Pro</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={dynamicStyles.scrollView}>
          {!settings.isPro && (
            <TouchableOpacity
              style={dynamicStyles.proCallout}
              onPress={() => setShowUpgradeModal(true)}
            >
              <Text style={dynamicStyles.proCalloutTitle}>✨ Unlock Pro Features</Text>
              <Text style={dynamicStyles.proCalloutText}>
                Get adjustable clustering, location names, batch actions, and more
              </Text>
            </TouchableOpacity>
          )}

          {settingsItems.map(renderSettingItem)}
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

