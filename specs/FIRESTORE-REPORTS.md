# Firestore Schema for PDF Report Generation

## Overview
This document defines the Firestore collections and data structures for the PDF report generation feature in Form-Shot. The feature enables users to create customized PDF reports from survey form screenshots with configurable ordering and multi-language support.

## Collections

### 1. `report-configurations`

Stores user-defined report configurations for generating PDFs from survey analyses.

**Document ID Pattern**: Auto-generated Firebase ID

**Document Schema**:
```typescript
interface ReportConfiguration {
  // Identifiers
  id: string;                           // Document ID
  customerId: string;                   // Customer identifier (e.g., "PXL_KISQ")
  studyId: string;                      // Study identifier (e.g., "qa-test")
  packageName: string;                  // Package name (e.g., "sf36-gad7")
  
  // Configuration Details
  name: string;                         // User-friendly configuration name
  description?: string;                 // Optional description
  
  // Report Settings
  formOrder: string[];                  // Ordered array of form IDs/indices
  selectedLanguages: string[];          // Languages to generate PDFs for
  includeMetadata: boolean;             // Include form titles and metadata
  pageOrientation: 'portrait' | 'landscape';
  pageSize: 'A4' | 'Letter' | 'Legal'; // Paper size
  
  // Screenshot Settings
  screenshotType: 'on-exit' | 'on-entry' | 'both';
  includeQuestionScreenshots: boolean;  // Include individual question screenshots
  
  // Metadata
  createdBy: string;                    // User email who created the config
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  lastGeneratedAt?: FirebaseFirestore.Timestamp;
  generationCount: number;              // Number of times PDFs generated
  
  // Status
  status: 'draft' | 'active' | 'archived';
  isDefault: boolean;                   // Mark as default configuration
  
  // Sharing
  sharedWith: string[];                 // Array of user emails with access
  isPublic: boolean;                    // Public configurations can be cloned
}
```

**Example Document**:
```json
{
  "id": "config_abc123",
  "customerId": "PXL_KISQ",
  "studyId": "qa-test",
  "packageName": "sf36-gad7",
  "name": "Quarterly Report Config",
  "description": "Standard configuration for Q4 2024 reports",
  "formOrder": ["form_001", "form_003", "form_002", "form_005"],
  "selectedLanguages": ["en", "es", "fr"],
  "includeMetadata": true,
  "pageOrientation": "portrait",
  "pageSize": "A4",
  "screenshotType": "on-exit",
  "includeQuestionScreenshots": false,
  "createdBy": "user@castoredc.com",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-20T14:45:00Z",
  "lastGeneratedAt": "2024-01-20T14:45:00Z",
  "generationCount": 5,
  "status": "active",
  "isDefault": false,
  "sharedWith": ["colleague@castoredc.com"],
  "isPublic": false
}
```

### 2. `report-generation-jobs`

Tracks PDF generation requests and their status.

**Document ID Pattern**: `{configurationId}_{timestamp}`

**Document Schema**:
```typescript
interface ReportGenerationJob {
  // Identifiers
  id: string;                           // Document ID
  configurationId: string;              // Reference to report-configurations document
  analysisId: string;                   // Reference to survey-analyses document
  
  // Request Details
  requestedBy: string;                  // User email who requested generation
  requestedAt: FirebaseFirestore.Timestamp;
  requestSource: 'ui' | 'api' | 'scheduled'; // How the request was initiated
  
  // Processing Details
  startedAt?: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  duration?: number;                    // Processing time in milliseconds
  
  // Status
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;                     // Progress percentage (0-100)
  currentStep: string;                  // Current processing step description
  
  // Generation Settings (snapshot from configuration)
  languages: string[];                  // Languages being generated
  formCount: number;                    // Number of forms in report
  pageOrientation: 'portrait' | 'landscape';
  
  // Results
  generatedFiles: {
    [language: string]: {
      url: string;                     // Signed Cloud Storage URL
      storageRef: string;               // Cloud Storage reference path
      size: number;                     // File size in bytes
      pageCount: number;                // Number of pages in PDF
      generatedAt: FirebaseFirestore.Timestamp;
      expiresAt: FirebaseFirestore.Timestamp; // URL expiration
    }
  };
  
  // Error Handling
  error?: {
    code: string;                      // Error code
    message: string;                   // User-friendly error message
    details?: any;                      // Technical error details
    occurredAt: FirebaseFirestore.Timestamp;
  };
  
  // Retry Information
  retryCount: number;                  // Number of retry attempts
  maxRetries: number;                  // Maximum allowed retries
  nextRetryAt?: FirebaseFirestore.Timestamp;
  
  // Metadata
  estimatedSize?: number;              // Estimated total size in bytes
  priority: 'low' | 'normal' | 'high'; // Processing priority
  notificationSent: boolean;           // Whether completion notification was sent
}
```

**Example Document**:
```json
{
  "id": "config_abc123_1705315800000",
  "configurationId": "config_abc123",
  "analysisId": "PXL_KISQ_qa-test_sf36-gad7_en_v1",
  "requestedBy": "user@castoredc.com",
  "requestedAt": "2024-01-15T10:30:00Z",
  "requestSource": "ui",
  "startedAt": "2024-01-15T10:30:05Z",
  "completedAt": "2024-01-15T10:31:30Z",
  "duration": 85000,
  "status": "completed",
  "progress": 100,
  "currentStep": "Generation complete",
  "languages": ["en", "es"],
  "formCount": 4,
  "pageOrientation": "portrait",
  "generatedFiles": {
    "en": {
      "url": "https://storage.googleapis.com/...",
      "storageRef": "reports/PXL_KISQ/qa-test/sf36-gad7/report_en_20240115.pdf",
      "size": 2457600,
      "pageCount": 12,
      "generatedAt": "2024-01-15T10:31:00Z",
      "expiresAt": "2024-01-16T10:31:00Z"
    },
    "es": {
      "url": "https://storage.googleapis.com/...",
      "storageRef": "reports/PXL_KISQ/qa-test/sf36-gad7/report_es_20240115.pdf",
      "size": 2501632,
      "pageCount": 12,
      "generatedAt": "2024-01-15T10:31:25Z",
      "expiresAt": "2024-01-16T10:31:25Z"
    }
  },
  "retryCount": 0,
  "maxRetries": 3,
  "priority": "normal",
  "notificationSent": true
}
```

### 3. `report-templates` (Future Enhancement)

Pre-defined report templates that can be used as starting points.

**Document Schema**:
```typescript
interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: string;                     // Template category
  formSelectionRule: 'all' | 'required' | 'custom';
  customFormIds?: string[];
  defaultLanguages: string[];
  pageSettings: {
    orientation: 'portrait' | 'landscape';
    size: 'A4' | 'Letter' | 'Legal';
  };
  createdBy: string;
  isSystemTemplate: boolean;            // System vs user-created
  usageCount: number;
}
```

## Indexes

### Composite Indexes

```javascript
// Query configurations by customer and status
collection("report-configurations")
  .where("customerId", "==", "PXL_KISQ")
  .where("status", "==", "active")
  .orderBy("updatedAt", "desc")

// Query generation jobs by configuration and status
collection("report-generation-jobs")
  .where("configurationId", "==", "config_abc123")
  .where("status", "==", "completed")
  .orderBy("completedAt", "desc")

// Query active configurations for a package
collection("report-configurations")
  .where("customerId", "==", "PXL_KISQ")
  .where("studyId", "==", "qa-test")
  .where("packageName", "==", "sf36-gad7")
  .where("status", "==", "active")
  .orderBy("name", "asc")
```

### Single Field Indexes
- `report-configurations`:
  - customerId
  - studyId
  - packageName
  - status
  - createdBy
  - isDefault
  - updatedAt

- `report-generation-jobs`:
  - configurationId
  - requestedBy
  - status
  - completedAt
  - priority

## Cloud Storage Structure

Generated PDFs are stored in Cloud Storage with the following structure:

```
/generated-reports/
  ├── {customerId}/
  │   ├── {studyId}/
  │   │   ├── {packageName}/
  │   │   │   ├── {configurationId}/
  │   │   │   │   ├── report_{language}_{timestamp}.pdf
  │   │   │   │   ├── report_{language}_{timestamp}_compressed.pdf
  │   │   │   │   └── metadata.json
```

**Metadata JSON Structure**:
```json
{
  "generationJobId": "config_abc123_1705315800000",
  "configurationId": "config_abc123",
  "generatedAt": "2024-01-15T10:31:00Z",
  "languages": ["en", "es"],
  "files": {
    "en": {
      "filename": "report_en_20240115103100.pdf",
      "size": 2457600,
      "pageCount": 12,
      "checksum": "md5:abc123..."
    }
  }
}
```

## Security Rules

```javascript
// Report Configurations
match /report-configurations/{configId} {
  // Read: User must be authenticated and have access to the customer
  allow read: if request.auth != null && 
    (resource.data.createdBy == request.auth.token.email ||
     resource.data.sharedWith.hasAny([request.auth.token.email]) ||
     resource.data.isPublic == true);
  
  // Write: User must be authenticated and own the configuration
  allow write: if request.auth != null && 
    (resource == null || resource.data.createdBy == request.auth.token.email) &&
    request.auth.token.email.matches('.*@castoredc.com');
  
  // Delete: Only owner can delete
  allow delete: if request.auth != null && 
    resource.data.createdBy == request.auth.token.email;
}

// Report Generation Jobs
match /report-generation-jobs/{jobId} {
  // Read: User must have requested the job or have access to the configuration
  allow read: if request.auth != null && 
    (resource.data.requestedBy == request.auth.token.email ||
     exists(/databases/$(database)/documents/report-configurations/$(resource.data.configurationId)) &&
     get(/databases/$(database)/documents/report-configurations/$(resource.data.configurationId)).data.createdBy == request.auth.token.email);
  
  // Create: Authenticated users can create jobs
  allow create: if request.auth != null &&
    request.auth.token.email.matches('.*@castoredc.com');
  
  // Update: Only system (Cloud Functions) can update
  allow update: if false;
  
  // Delete: No deletion allowed
  allow delete: if false;
}
```

## Data Lifecycle

### Configuration Lifecycle
1. **Draft**: Initial creation, can be edited freely
2. **Active**: In use, changes create new versions
3. **Archived**: No longer in use, kept for history

### Generation Job Lifecycle
1. **Pending**: Job created, waiting in queue
2. **Processing**: Actively generating PDFs
3. **Completed**: PDFs generated successfully
4. **Failed**: Generation failed, can be retried
5. **Cancelled**: User cancelled the job

### Data Retention
- **Configurations**: Retained indefinitely
- **Generation Jobs**: Retained for 90 days
- **Generated PDFs**: Retained for 30 days in Cloud Storage
- **Signed URLs**: Valid for 24 hours

## Performance Considerations

### Optimization Strategies
1. **Caching**: Cache configuration data in Redux store
2. **Pagination**: Limit configuration lists to 20 items per page
3. **Lazy Loading**: Load form screenshots only when needed
4. **Background Processing**: Use Cloud Functions for PDF generation
5. **CDN**: Serve generated PDFs through CDN for faster downloads

### Scalability Limits
- Maximum forms per report: 100
- Maximum languages per generation: 10
- Maximum concurrent generations per user: 3
- Maximum PDF size: 100MB
- Maximum generation time: 5 minutes

## Migration Considerations

### Initial Setup
1. Create collections with proper indexes
2. Set up security rules
3. Initialize Cloud Storage buckets
4. Deploy Cloud Functions

### Future Migrations
- Version configuration schema changes
- Maintain backward compatibility
- Provide migration scripts for schema updates

## Monitoring & Analytics

### Key Metrics to Track
- Configuration creation rate
- PDF generation success rate
- Average generation time
- Storage usage
- Most used configurations
- Error rates by type

### Logging
- Log all configuration CRUD operations
- Log generation job lifecycle events
- Track performance metrics
- Monitor error patterns

---

*Last Updated: [Current Date]*
*Version: 1.0.0*