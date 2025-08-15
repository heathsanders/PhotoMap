# PhotoMap - Privacy-First Photo Organization

A React Native/Expo app that organizes your photos and videos into virtual albums based on date and location. All processing happens on-device - your photos never leave your phone.

## Features

### Free Tier
- 📅 **Timeline View**: Browse photos organized by date
- 🗺️ **Map View**: See photo locations on an interactive map
- 📱 **Album Grids**: View photos in responsive grids
- 🔍 **Media Viewer**: Fullscreen photo/video viewing
- 🗑️ **Manual Delete**: Multi-select photos for deletion
- 🌙 **Dark Theme**: Beautiful dark interface

### Pro Features
- 🎯 **Adjustable Clustering**: Customize cluster radius and minimum photos
- 🏷️ **Location Names**: POI and city names instead of coordinates
- 📊 **Batch Actions**: Share, favorite, and organize multiple photos
- 🧹 **Smart Cleanup**: Quick filters for screenshots, large videos, duplicates
- ✏️ **Rename Clusters**: Give your photo albums custom names
- 🎨 **Themes & Colors**: Light/dark themes and custom accent colors
- 📈 **Detailed Metadata**: Full EXIF data and location preview
- 🗺️ **Trip View**: Group photos across multiple days for trips

## Technical Architecture

### Core Technologies
- **Expo SDK**: Cross-platform React Native framework
- **SQLite**: Local database for metadata storage
- **DBSCAN**: Clustering algorithm for location grouping
- **react-native-maps**: Interactive map functionality
- **expo-media-library**: Photo/video access and management

### Key Services
- **MediaLibraryService**: Handles photo library access and permissions
- **DatabaseService**: SQLite operations for metadata storage
- **ClusteringService**: DBSCAN implementation for location clustering
- **MediaProcessorService**: Orchestrates scanning and organization

### Privacy & Security
- ✅ All processing happens on-device
- ✅ No cloud upload of photos
- ✅ Metadata stored locally in SQLite
- ✅ Optional reverse geocoding with offline mode
- ✅ System-level permission handling

## Development Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run ios     # iOS simulator
   npm run android # Android emulator
   npm run web     # Web browser
   ```

3. **Required permissions**:
   - iOS: NSPhotoLibraryUsageDescription
   - Android: READ_EXTERNAL_STORAGE, ACCESS_MEDIA_LOCATION

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── AlbumGrid.tsx   # Photo grid with multi-select
│   ├── MediaViewer.tsx # Fullscreen photo/video viewer
│   └── UpgradeModal.tsx # Pro upgrade interface
├── services/           # Core business logic
│   ├── database.ts     # SQLite operations
│   ├── mediaLibrary.ts # Photo library access
│   ├── clustering.ts   # DBSCAN clustering
│   └── mediaProcessor.ts # Main orchestration
├── types/              # TypeScript definitions
└── utils/              # Helper functions

app/
├── (tabs)/             # Main tab navigation
│   ├── index.tsx       # Timeline view
│   ├── map.tsx         # Map view
│   └── settings.tsx    # Settings & Pro features
└── _layout.tsx         # Root navigation
```

## Data Models

### MediaAsset
- Metadata extracted from photos/videos
- GPS coordinates, timestamps, file info
- Stored locally, never uploaded

### Cluster
- Groups of photos taken at similar locations
- DBSCAN algorithm with configurable radius
- Labeled with POI names or coordinates

### DayGroup
- Photos organized by capture date
- Contains multiple location clusters
- Majority location determines day label

## Performance Considerations

- **Incremental Indexing**: Only scan new/changed photos
- **Thumbnail Caching**: Smooth scrolling in grids
- **Lazy Loading**: Large albums load on demand
- **Batch Processing**: Deletion in chunks ≤200 items
- **Background Processing**: Non-blocking UI during scans

## Monetization Strategy

**Freemium model** with strategic feature gating:
- Core organization features remain free
- Advanced customization and convenience in Pro
- Clear upgrade prompts with feature benefits
- 7-day free trial with subscription tiers

## Platform Compatibility

- **iOS**: 14+ (supports limited library access)
- **Android**: 10+ (scoped storage compatibility)
- **Web**: Progressive web app fallback

---

Built with privacy-first principles - your photos stay on your device, always.
