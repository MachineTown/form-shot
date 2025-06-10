# Firestore Migration Plan for Survey Analysis Tool

## Overview
This document outlines the proposed Firestore database structure for migrating the survey analysis tool from file-based JSON storage to cloud-based Firestore NoSQL database.

## Collection Structure

### Primary Collection: `survey-analyses`

**Document ID Pattern**: `{customerId}_{studyId}_{packageName}_{language}_{version}`

**Document Schema**:
```javascript
{
  // Metadata fields
  id: string,                    // Document ID (composite key)
  customerId: string,            // e.g., "PXL_KISQ"
  studyId: string,              // e.g., "qa-test"
  packageName: string,          // e.g., "sf36-gad7"
  language: string,             // e.g., "en"
  version: string,              // e.g., "v1"
  
  // Analysis metadata
  analysisDate: timestamp,       // When analysis was performed
  url: string,                  // Original survey URL
  
  // Form metadata
  longTitle: string,            // Full form title
  shortName: string,            // Short form name
  viewportHeight: number,       // Required viewport height
  timestamp: timestamp,         // Form analysis timestamp
  
  // Form fields (subcollection reference)
  fieldsCount: number,          // Number of questions for quick queries
  
  // Cloud Storage references
  screenshotsPath: string,      // Base path to screenshots in Cloud Storage
  
  // Status and tracking
  status: string,               // "completed", "processing", "failed"
  processingDuration: number,   // Analysis time in milliseconds
  
  // Audit fields
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Subcollection: `survey-analyses/{docId}/fields`

**Document ID**: Auto-generated or question number based (e.g., `q1`, `q2_1`)

**Document Schema**:
```javascript
{
  questionNumber: string,       // e.g., "1.", "2.3"
  questionText: string,         // Clean question text
  inputType: string,           // "radio", "dropdown", "text", etc.
  isRequired: boolean,         // Required field indicator
  choices: array<string>,      // Array of choice options (if applicable)
  selector: string,            // CSS selector for the input
  cardBoxSelector: string,     // CSS selector for the container
  screenshotFilename: string,  // Filename in Cloud Storage
  screenshotUrl: string,       // Direct URL to screenshot
  order: number,               // Question order for sorting
}
```

### Secondary Collection: `customers`

**Document ID**: `customerId` (e.g., "PXL_KISQ")

**Document Schema**:
```javascript
{
  customerId: string,
  name: string,                // Full customer name
  createdAt: timestamp,
  lastAnalysisAt: timestamp,
  totalAnalyses: number,       // Counter for analytics
  activeStudies: array<string> // List of active study IDs
}
```

### Secondary Collection: `survey-metadata`

**Document ID**: `{studyId}_{packageName}` (e.g., "qa-test_sf36-gad7")

**Document Schema**:
```javascript
{
  studyId: string,
  packageName: string,
  description: string,
  category: string,            // e.g., "health", "psychology"
  averageQuestions: number,    // For estimation
  supportedLanguages: array<string>,
  versions: array<string>,
  createdAt: timestamp,
  lastUsed: timestamp
}
```

## Indexing Strategy

### Composite Indexes
```javascript
// Query by customer and date range
collection("survey-analyses")
  .where("customerId", "==", "PXL_KISQ")
  .where("analysisDate", ">=", startDate)
  .orderBy("analysisDate", "desc")

// Query by study and status
collection("survey-analyses")
  .where("studyId", "==", "qa-test")
  .where("status", "==", "completed")
  .orderBy("analysisDate", "desc")

// Query by package across customers
collection("survey-analyses")
  .where("packageName", "==", "sf36-gad7")
  .where("language", "==", "en")
  .orderBy("analysisDate", "desc")
```

### Single Field Indexes
- `customerId`
- `studyId`
- `packageName`
- `language`
- `version`
- `status`
- `analysisDate`

## Cloud Storage Integration

### Directory Structure
```
/survey-screenshots/
  ├── {customerId}/
  │   ├── {studyId}/
  │   │   ├── {packageName}/
  │   │   │   ├── {language}/
  │   │   │   │   ├── {version}/
  │   │   │   │   │   ├── question_1_metadata.json
  │   │   │   │   │   ├── question_1_screenshot.png
  │   │   │   │   │   ├── question_2_screenshot.png
  │   │   │   │   │   └── ...
```

### File Naming Convention
- Screenshots: `question_{questionNumber}_{customerId}_{studyId}.png`
- Metadata: `question_{questionNumber}_metadata.json`

## Migration Considerations

### Data Transformation
1. Parse existing JSON files in `/output` directory
2. Extract tuple information from directory structure
3. Convert file-based structure to Firestore documents
4. Upload screenshots to Cloud Storage
5. Update document references with Cloud Storage URLs

### Batch Operations
- Use Firestore batch writes for atomic operations
- Process migrations in chunks to avoid timeout limits
- Implement retry logic for failed uploads

### Validation
- Verify all screenshots are properly uploaded
- Confirm document structure matches schema
- Test query performance with sample data

## Benefits of Migration

### Scalability
- Handle large volumes of survey analyses
- Efficient querying across multiple dimensions
- Automatic scaling with usage

### Performance
- Fast queries with proper indexing
- Real-time updates and synchronization
- Reduced cold start times

### Features
- Advanced querying capabilities
- Built-in backup and disaster recovery
- Integration with other Google Cloud services
- Real-time listeners for live updates

### Cost Optimization
- Pay-per-use pricing model
- Automatic data compression
- Efficient storage of structured data

## Implementation Phases

### Phase 1: Schema Design & Testing
- Finalize Firestore schema
- Create test collections with sample data
- Validate query patterns and performance

### Phase 2: Migration Script Development
- Build data transformation utilities
- Implement Cloud Storage upload logic
- Create batch processing workflows

### Phase 3: Data Migration
- Migrate existing analyses to Firestore
- Upload screenshots to Cloud Storage
- Verify data integrity

### Phase 4: Application Updates
- Update analysis tool to write to Firestore
- Modify read operations to use Firestore queries
- Add error handling and retry logic

### Phase 5: Monitoring & Optimization
- Monitor query performance
- Optimize indexes based on usage patterns
- Implement data retention policies

## Security Considerations

### Access Control
- Implement IAM roles for different user types
- Use security rules to restrict access by customer
- Audit logging for compliance requirements

### Data Privacy
- Encrypt sensitive survey data
- Implement data retention policies
- Support data deletion requests (GDPR compliance)

### Network Security
- Use VPC for private network access
- Implement proper firewall rules
- Enable audit logging for all operations