import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  feature?: string;
  onUpgrade: (plan: string) => void;
}

interface PricingPlan {
  id: string;
  name: string;
  price: string;
  period: string;
  savings?: string;
  popular?: boolean;
}

const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: '$4.99',
    period: 'month',
  },
  {
    id: 'annual',
    name: 'Annual',
    price: '$39.99',
    period: 'year',
    savings: 'Save 33%',
    popular: true,
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    price: '$99.99',
    period: 'one-time',
    savings: 'Best Value',
  },
];

const PRO_FEATURES = [
  {
    icon: '🎯',
    title: 'Adjustable Clustering',
    description: 'Customize cluster radius and minimum photos per cluster',
  },
  {
    icon: '🏷️',
    title: 'Location Names',
    description: 'See POI and city names instead of just coordinates',
  },
  {
    icon: '📱',
    title: 'Batch Actions',
    description: 'Share, favorite, and organize multiple photos at once',
  },
  {
    icon: '🧹',
    title: 'Smart Cleanup',
    description: 'Quick selection filters for screenshots, large videos, and duplicates',
  },
  {
    icon: '✏️',
    title: 'Rename Clusters',
    description: 'Give your photo albums custom names',
  },
  {
    icon: '🎨',
    title: 'Themes & Colors',
    description: 'Light/dark themes and custom accent colors',
  },
  {
    icon: '📊',
    title: 'Detailed Metadata',
    description: 'Full EXIF data and location preview in photo viewer',
  },
  {
    icon: '🗺️',
    title: 'Trip View',
    description: 'Group photos across multiple days for trips',
  },
];

export default function UpgradeModal({ 
  visible, 
  onClose, 
  feature,
  onUpgrade 
}: UpgradeModalProps) {
  const [selectedPlan, setSelectedPlan] = useState('annual');

  const handleUpgrade = () => {
    onUpgrade(selectedPlan);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            
            <Text style={styles.title}>Upgrade to PhotoMap Pro</Text>
            <Text style={styles.subtitle}>
              Unlock powerful features to organize and clean up your photo library
            </Text>
          </View>

          {feature && (
            <View style={styles.featureCallout}>
              <Text style={styles.featureCalloutText}>
                📍 {feature} is a Pro feature
              </Text>
            </View>
          )}

          <View style={styles.featuresSection}>
            <Text style={styles.sectionTitle}>What you get with Pro:</Text>
            
            {PRO_FEATURES.map((feature, index) => (
              <View key={index} style={styles.featureItem}>
                <Text style={styles.featureIcon}>{feature.icon}</Text>
                <View style={styles.featureContent}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureDescription}>{feature.description}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.pricingSection}>
            <Text style={styles.sectionTitle}>Choose your plan:</Text>
            
            {PRICING_PLANS.map((plan) => (
              <TouchableOpacity
                key={plan.id}
                style={[
                  styles.pricingCard,
                  selectedPlan === plan.id && styles.selectedPricingCard,
                  plan.popular && styles.popularPricingCard,
                ]}
                onPress={() => setSelectedPlan(plan.id)}
              >
                {plan.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>Most Popular</Text>
                  </View>
                )}
                
                <View style={styles.pricingHeader}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  {plan.savings && (
                    <Text style={styles.savingsText}>{plan.savings}</Text>
                  )}
                </View>
                
                <View style={styles.pricingContent}>
                  <Text style={styles.priceText}>{plan.price}</Text>
                  <Text style={styles.periodText}>/{plan.period}</Text>
                </View>
                
                <View style={[
                  styles.radioButton,
                  selectedPlan === plan.id && styles.selectedRadioButton
                ]}>
                  {selectedPlan === plan.id && <View style={styles.radioButtonInner} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
            <Text style={styles.upgradeButtonText}>
              Start Free Trial • {PRICING_PLANS.find(p => p.id === selectedPlan)?.price}
            </Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              • 7-day free trial, cancel anytime{'\n'}
              • All processing happens on your device{'\n'}
              • Your photos never leave your phone
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: '#CCCCCC',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  featureCallout: {
    backgroundColor: 'rgba(255, 149, 0, 0.2)',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  featureCalloutText: {
    color: '#FF9500',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  featuresSection: {
    padding: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 12,
    marginTop: 2,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  featureDescription: {
    color: '#CCCCCC',
    fontSize: 14,
    lineHeight: 20,
  },
  pricingSection: {
    padding: 20,
    paddingTop: 0,
  },
  pricingCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  selectedPricingCard: {
    borderColor: '#007AFF',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  popularPricingCard: {
    borderColor: '#FF9500',
  },
  popularBadge: {
    position: 'absolute',
    top: -8,
    left: 16,
    backgroundColor: '#FF9500',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  pricingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  savingsText: {
    color: '#34C759',
    fontSize: 14,
    fontWeight: '600',
  },
  pricingContent: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  periodText: {
    color: '#888888',
    fontSize: 16,
    marginLeft: 4,
  },
  radioButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#666666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedRadioButton: {
    borderColor: '#007AFF',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
  },
  upgradeButton: {
    backgroundColor: '#007AFF',
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 20,
  },
  footerText: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});