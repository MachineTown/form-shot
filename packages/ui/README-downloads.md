# Download Feature Documentation

## Overview

The Form-Shot UI now includes comprehensive download functionality for on-entry screenshots, supporting both study-level and package-level downloads with real-time progress tracking.

## Features

### 1. Study-Level Downloads
- Download all on-entry screenshots for an entire study (all packages)
- Available in the Analysis page header when viewing a specific study
- Available in PackageGrid filters when a specific study is selected

### 2. Package-Level Downloads  
- Download all on-entry screenshots for a specific package
- Available on each package card in the PackageGrid

### 3. Download Options
- **Screenshots Only**: ZIP file containing just the screenshot images
- **With Metadata**: ZIP file including screenshots plus analysis metadata JSON

### 4. Progress Tracking
- Real-time progress indicators during download generation
- Percentage completion display
- File count and total size information
- Success/error status updates

### 5. Automatic Download
- Files automatically download to browser's download folder when ready
- Temporary signed URLs with 1-hour expiration for security

## Components

### DownloadButton
**Location**: `src/components/analysis/DownloadButton.tsx`

A reusable button component that provides download functionality with progress tracking.

```tsx
import DownloadButton from '../components/analysis/DownloadButton';

// Package-level download
<DownloadButton
  customerId="PXL_KISQ"
  studyId="qa-test"
  packageName="sf36-gad7"
/>

// Study-level download
<DownloadButton
  customerId="PXL_KISQ"
  studyId="qa-test"
/>
```

**Props**:
- `customerId: string` - Customer identifier
- `studyId: string` - Study identifier  
- `packageName?: string` - Package name (optional, enables package-level download)
- `disabled?: boolean` - Disable the button

**Features**:
- Dropdown menu with download options
- Progress indicators with percentage and file count
- Error handling with user-friendly messages
- Visual status indicators (loading, success, error)
- Prevents multiple simultaneous downloads

### useDownload Hook
**Location**: `src/hooks/useDownload.ts`

A React hook that provides download functionality with state management.

```tsx
import { useDownload } from '../hooks/useDownload';

const MyComponent = () => {
  const { 
    isDownloading, 
    progress, 
    error, 
    downloadStudy, 
    downloadPackage,
    reset 
  } = useDownload({
    onProgress: (status) => console.log('Progress:', status.progress),
    onComplete: (status) => console.log('Download complete!'),
    onError: (error) => console.error('Download failed:', error),
    autoDownload: true // Automatically download file when ready
  });

  const handleStudyDownload = () => {
    downloadStudy('PXL_KISQ', 'qa-test', true); // With metadata
  };

  const handlePackageDownload = () => {
    downloadPackage('PXL_KISQ', 'qa-test', 'sf36-gad7', false); // Screenshots only
  };
};
```

**State**:
- `isDownloading: boolean` - Whether a download is in progress
- `progress?: number` - Download progress percentage (0-100)
- `status?: DownloadStatus` - Detailed status information
- `error?: string` - Error message if download failed
- `requestId?: string` - Unique request identifier

**Methods**:
- `downloadStudy(customerId, studyId, includeMetadata)` - Start study download
- `downloadPackage(customerId, studyId, packageName, includeMetadata)` - Start package download
- `reset()` - Clear download state

## Service Functions

### Functions Service
**Location**: `src/services/functions.ts`

Direct service functions for download operations.

```tsx
import { 
  downloadStudyZip, 
  downloadPackageZip, 
  getDownloadStatus,
  pollDownloadStatus 
} from '../services/functions';

// Download study
const response = await downloadStudyZip({
  customerId: 'PXL_KISQ',
  studyId: 'qa-test',
  includeMetadata: true
});

// Download package
const response = await downloadPackageZip({
  customerId: 'PXL_KISQ',
  studyId: 'qa-test',
  packageName: 'sf36-gad7',
  includeMetadata: false
});

// Check download status
const status = await getDownloadStatus(response.requestId);

// Poll for completion
const finalStatus = await pollDownloadStatus(
  response.requestId,
  (status) => console.log('Progress:', status.progress)
);
```

## Integration Points

### 1. Analysis Page
**Location**: `src/pages/Analysis.tsx`

- Study-level download button in page header when viewing specific study
- Automatically shows when URL contains both customerId and studyId

### 2. PackageGrid Component  
**Location**: `src/components/analysis/PackageGrid.tsx`

- Package-level download buttons on each package card
- Study-level download button in filters section when study is selected
- Buttons are disabled when no packages are available

## Backend Integration

The UI connects to Firebase Functions for download processing:

- `downloadStudyZip` - Generates ZIP for all packages in a study
- `downloadPackageZip` - Generates ZIP for specific package
- `getDownloadStatus` - Checks download progress and status

**Function Timeouts**:
- Study downloads: 60 seconds
- Package downloads: 30 seconds

**Memory Allocation**:
- Study downloads: 2GiB
- Package downloads: 1GiB

## Security

- All downloads require Firebase Authentication
- Temporary signed URLs expire after 1 hour
- Progress tracking stored in Firestore with automatic cleanup
- No sensitive data exposed in client-side code

## Error Handling

The download system includes comprehensive error handling:

1. **Authentication Errors**: User must be logged in
2. **Validation Errors**: Missing required parameters
3. **Network Errors**: Connection timeouts or failures  
4. **Server Errors**: Function execution failures
5. **Progress Errors**: Status polling failures with retry logic

Error messages are displayed to users with actionable information and automatic retry where appropriate.

## Performance

- Streaming ZIP generation for memory efficiency
- Progress updates every 10 processed files
- Automatic file cleanup after download
- Chunked download support for large files
- Client-side caching of status requests

## Future Enhancements

- Batch download queue for multiple requests
- Download history and re-download capabilities
- Custom filtering options (date ranges, specific forms)
- Email notifications for large downloads
- Download analytics and usage tracking