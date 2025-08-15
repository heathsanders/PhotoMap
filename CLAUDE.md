# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
- `npm install` - Install dependencies
- `npm run ios` - Start iOS development server
- `npm run android` - Start Android development server  
- `npm run web` - Start web development server
- `npm run lint` - Run ESLint on the codebase
- `npm start` - Start Expo development server (choose platform)

### Development Notes
- Uses Expo SDK ~53.0.20 with new architecture enabled
- Requires iOS 14+ and Android 10+ for production builds
- All platforms (iOS/Android/Web) supported via Expo Router

### Development Build Setup
For full functionality (complete photo library access + maps), use development builds:
- **Expo Go limitations**: Only accesses ~6 photos due to iOS restrictions, no maps support
- **Development build**: `npx expo run:ios --device` for full photo library access
- **Code signing**: Requires Apple ID in Xcode, enable "Automatically manage signing"
- **Device setup**: Enable Developer Mode in Settings → Privacy & Security
- **Metro bundler**: Must run `npx expo start` for JavaScript bundle serving

## Architecture Overview

### Core Application Flow
PhotoMap is a privacy-first photo organization app that processes everything on-device:

1. **Permission & Scanning**: `mediaLibraryService` requests photo library access and scans media with EXIF extraction
2. **Data Processing**: `mediaProcessorService` orchestrates the complete workflow: scan → extract metadata → group by date → cluster by location → store in SQLite
3. **Clustering**: `clusteringService` implements DBSCAN algorithm to group photos by geographic proximity
4. **Storage**: `databaseService` manages SQLite operations for MediaAssets, DayGroups, Clusters, and geocoding cache
5. **UI Presentation**: Three main screens (Timeline/Map/Settings) display organized photo collections

### Service Layer Architecture
The app uses a modular service architecture in `src/services/`:

- **mediaLibraryService**: Handles `expo-media-library` operations, EXIF parsing, GPS coordinate extraction, and photo deletion
- **databaseService**: SQLite operations using `expo-sqlite` with proper schema for assets/clusters/day groups
- **clusteringService**: DBSCAN clustering algorithm with configurable radius and minimum points
- **mediaProcessorService**: Main orchestrator that coordinates scanning, processing, clustering, and storage

### Data Flow & Types
Key data models in `src/types/index.ts`:

- **MediaAsset**: Core photo/video entity with metadata (GPS, timestamps, EXIF)
- **Cluster**: Group of MediaAssets clustered by location using DBSCAN
- **DayGroup**: Collection of clusters for a specific date with majority city determination
- **GeocodeCache**: Cached reverse geocoding results for offline functionality

### Navigation Structure
Uses Expo Router with file-based routing:
- `app/(tabs)/` - Main tab navigation (Timeline/Map/Settings)
- Tab navigation configured in `app/(tabs)/_layout.tsx`
- Navigation types defined in NavigationParamList for type safety

### Component Architecture
Reusable components in `src/components/`:
- **AlbumGrid**: Photo grid with multi-select deletion functionality and batch processing (≤200 items)
- **MediaViewer**: Fullscreen photo/video viewer with gesture handling and Pro metadata features
- **UpgradeModal**: Freemium subscription flow with pricing tiers and feature gating

## Critical Implementation Details

### Media Processing Workflow
The `mediaProcessorService.performFullScan()` method orchestrates the complete photo organization:
1. Scans photo library via `expo-media-library`
2. Extracts EXIF metadata including GPS coordinates and timestamps
3. Groups photos by local capture date (YYYY-MM-DD format)
4. Applies DBSCAN clustering algorithm to same-day photos by location
5. Stores all data in SQLite for offline access
6. Supports incremental scanning for new photos

### Privacy & Security Implementation
- All processing happens on-device using SQLite storage
- No cloud upload of photos or metadata
- Platform-specific permission handling in `app.json`
- Optional reverse geocoding with offline cache
- Media deletion uses system APIs with proper confirmation flows

### Freemium Feature Gating
Strategic Pro features implemented throughout UI:
- Lock icons (🔒) on Pro-only controls in Settings
- Feature-specific upgrade prompts via UpgradeModal component
- Free tier: manual photo deletion, dark theme, basic clustering
- Pro tier: adjustable clustering, location names, batch actions, themes, smart filters

### Performance Considerations
- Chunked deletion processing (≤200 items per batch via `MediaLibrary.deleteAssetsAsync`)
- Incremental indexing to avoid re-scanning entire library
- Lazy loading for large photo collections
- Thumbnail caching for smooth grid scrolling
- Background processing with progress callbacks

## Working with Media Features

### Adding New Clustering Logic
When modifying clustering behavior:
1. Update `clusteringService.ts` DBSCAN implementation
2. Modify `ClusteringOptions` interface in types
3. Update Settings screen sliders and Pro feature gating
4. Test with various GPS coordinate densities

### Extending Database Schema
For schema changes:
1. Update interface definitions in `src/types/index.ts`
2. Modify table creation in `databaseService.initialize()`
3. Update insert/query methods in `databaseService`
4. Consider data migration for existing users

### Media Library Operations
When working with photo access:
- Always check permissions via `mediaLibraryService.checkPermissions()`
- Handle iOS "limited library access" gracefully
- Use platform-aware deletion confirmations (iOS: "Recently Deleted", Android: "Delete")
- Batch process large operations to avoid memory issues

### Freemium Implementation
When adding Pro features:
1. Add feature flag to `UserSettings` interface
2. Implement lock UI with upgrade prompts
3. Update `UpgradeModal` feature list
4. Test both Free and Pro user flows

## Platform-Specific Considerations

### iOS Specifics
- Handles limited photo library access introduced in iOS 14+
- Uses NSPhotoLibraryUsageDescription for permission messaging
- "Move to Recently Deleted" deletion flow with 30-day restore

### Android Specifics  
- Scoped storage compliance for Android 10+
- ACCESS_MEDIA_LOCATION permission for GPS metadata
- Direct deletion confirmation without Recently Deleted folder

### Cross-Platform
- Expo Router provides consistent navigation across platforms
- Gesture handling via react-native-gesture-handler for MediaViewer
- Safe area handling throughout UI components

## Project Structure

```
PhotoMap/
├── app/                          # Expo Router navigation
│   ├── (tabs)/                   # Tab-based navigation
│   │   ├── _layout.tsx          # Tab navigation configuration
│   │   ├── index.tsx            # Timeline screen with progress modal
│   │   ├── map.tsx              # Map screen with Expo Go fallback
│   │   └── settings.tsx         # Settings screen
│   └── _layout.tsx              # Root layout
├── src/
│   ├── components/              # Reusable UI components
│   │   ├── AlbumGrid.tsx        # Photo grid with selection
│   │   ├── MediaViewer.tsx      # Fullscreen photo viewer
│   │   └── UpgradeModal.tsx     # Freemium upgrade flow
│   ├── services/                # Business logic services
│   │   ├── mediaLibrary.ts      # Photo library access & EXIF extraction
│   │   ├── mediaProcessor.ts    # Main orchestration service
│   │   ├── clustering.ts        # DBSCAN clustering algorithm
│   │   └── database.ts          # SQLite operations
│   └── types/
│       └── index.ts             # TypeScript type definitions
├── assets/                      # Static assets (images, fonts)
└── package.json                 # Dependencies and scripts
```

## Recent Progress & Fixes

### 2025-08-15 Session Summary
- **Fixed package compatibility**: Updated react-native-maps and slider versions for Expo SDK 53
- **Implemented progress tracking**: Added detailed scanning progress modal with real-time updates
- **Fixed UUID issue**: Replaced problematic react-native-uuid with custom UUID generator
- **Resolved Expo Go limitations**: Added fallback UI for maps, identified photo library restrictions
- **Development build setup**: Successfully created development build for full functionality
- **Progress calculation fixes**: Adjusted progress ranges to reflect actual processing time (10%-80% for scanning)
- **Enhanced error handling**: Added comprehensive logging and fallback states
- **Resolved clustering issues**: Fixed DBSCAN algorithm to properly handle single photos and create meaningful clusters
- **Database relationship fixes**: Added cluster_id column to media_assets table for proper cluster-asset relationships
- **Map performance optimization**: Implemented viewport culling and dynamic marker limiting for smooth map interactions
- **Background processing improvements**: Fixed UI state management and progress indicators for batch processing
- **GPS extraction optimization**: Achieved 74-85% GPS success rate using both EXIF and iOS location data

### Current Status (2025-08-15)
- ✅ **Core functionality working**: Photo scanning, GPS extraction, clustering, and organization
- ✅ **Development build optimized**: Full photo library access (3866+ photos) and maps support
- ✅ **Performance optimized**: Batch processing with background continuation and map viewport culling
- ✅ **User experience polished**: Progress indicators, background processing state management
- ✅ **Database schema stable**: Proper cluster-asset relationships with migration support

### Known Issues & Solutions
- **Expo Go limitations**: Limited to ~6 photos, no maps support → Use development build with `npx expo run:ios --device`
- **Code signing setup**: Required for physical device testing → Use Apple ID in Xcode with "Automatically manage signing"
- **Metro bundler dependency**: Development builds require separate `npx expo start` for JavaScript bundle serving