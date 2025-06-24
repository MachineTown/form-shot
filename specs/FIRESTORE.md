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
  totalForms: number,           // Total number of forms in survey
  
  // Form metadata (from first form for backward compatibility)
  longTitle: string,            // Full form title
  shortName: string,            // Short form name
  viewportHeight: number,       // Required viewport height
  timestamp: timestamp,         // Form analysis timestamp
  
  // Form fields (subcollection reference)
  fieldsCount: number,          // Total number of questions across all forms
  totalFields: number,          // Same as fieldsCount
  
  // Test data summary
  hasTestData: boolean,         // Whether any test data was generated
  testDataSummary: {
    fieldsWithTestData: number,
    totalTestCases: number,
    generatedTestCases: number,
    humanTestCases: number,
    hybridTestCases: number,
    averageTestCasesPerField: number
  },
  
  // Cloud Storage references
  screenshotsPath: string,      // Base path to screenshots in Cloud Storage
  
  // Status and tracking
  status: string,               // "completed", "processing", "failed"
  processingDuration: number,   // Analysis time in milliseconds
  
  // Test run tracking
  lastTestRunAt: timestamp,     // When last test was run
  totalTestRuns: number,        // Total test runs executed
  lastTestRunId: string,        // Reference to latest test run
  lastTestRunStatus: string,    // Status of latest test run
  
  // Audit fields
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Subcollection: `survey-analyses/{docId}/forms`

**Document ID**: `form_{index}` (e.g., `form_1`, `form_2`)

**Document Schema**:
```javascript
{
  formIndex: number,            // 0-based form index
  longTitle: string,            // Full form title
  shortName: string,            // Short form name
  viewportHeight: number,       // Required viewport height
  timestamp: timestamp,         // Form analysis timestamp
  fieldsCount: number,          // Number of questions in this form
  navigationButtons: array<{    // Available navigation buttons
    type: string,              // "next", "previous", "finish"
    text: string,              // Button text
    selector: string,          // CSS selector
    isEnabled: boolean         // Whether button was enabled
  }>,
  order: number,               // Form order (1-based for display)
  hasTestData: boolean,        // Whether test data was generated
  testDataSummary: object,     // Summary of test data for this form
  onEntryScreenshot: string,   // Filename of on-entry screenshot
  onExitScreenshot: string,    // Filename of on-exit screenshot
  onEntryScreenshotUrl: string, // Cloud Storage URL for on-entry screenshot
  onExitScreenshotUrl: string  // Cloud Storage URL for on-exit screenshot
}
```

### Subcollection: `survey-analyses/{docId}/forms/{formId}/fields`

**Document ID**: Question number based (e.g., `q1`, `q2_1`)

**Document Schema**:
```javascript
{
  questionNumber: string,       // e.g., "1.", "2.3"
  questionText: string,         // Clean question text
  inputType: string,           // "radio", "dropdown", "text", "VAS", etc.
  isRequired: boolean,         // Required field indicator
  choices: array<string>,      // Array of choice options (if applicable)
  selector: string,            // CSS selector for the input
  cardBoxSelector: string,     // CSS selector for the container
  screenshotFilename: string,  // Filename in Cloud Storage
  screenshotUrl: string,       // Direct URL to screenshot
  order: number,               // Question order for sorting
  formIndex: number,           // Parent form index
  testData: {                  // Test data metadata (if generated)
    detectedType: string,
    confidence: number,
    detectionMethod: string,
    generatedAt: string,
    summary: object,
    metadata: object
  },
  conditionalInfo: {           // For conditional questions
    isConditional: boolean,
    parentQuestion: string,
    parentValue: any,
    appearedAfter: string
  }
}
```

### Subcollection: `survey-analyses/{docId}/forms/{formId}/fields/{fieldId}/test-cases`

**Document ID**: Test case ID (e.g., `choice_0`, `text_valid_1`)

**Document Schema**:
```javascript
{
  id: string,                  // Test case ID
  type: string,                // "valid", "boundary", "edge", "invalid"
  value: any,                  // Test value
  position: number,            // Position for choice-based inputs
  description: string,         // Description of test case
  source: string,              // "generated", "human", "hybrid"
  provenance: {
    createdBy: string,         // "system", "user", "admin"
    createdAt: string,         // ISO timestamp
    generator: {               // For generated test cases
      algorithm: string,
      version: string,
      template: string,
      confidence: number
    },
    human: {                   // For human-created test cases
      userId: string,
      userName: string,
      reason: string,
      context: string
    },
    modifications: array<{     // Modification history
      timestamp: string,
      modifiedBy: string,
      action: string,
      changes: object,
      reason: string
    }>
  },
  status: string,              // "draft", "approved", "rejected", "needs_review"
  quality: {
    confidence: number,
    reviewCount: number,
    lastReviewed: string
  },
  // References for easier querying
  fieldId: string,
  formId: string,
  formIndex: number,
  questionNumber: string,
  analysisId: string,
  customerId: string,
  studyId: string,
  createdAt: timestamp
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

### Primary Collection: `test-runs`

**Document ID**: `{analysisId}_{timestamp}` (e.g., "PXL_KISQ_qa-test_sf36-gad7_en_v1_1701234567890")

**Document Schema**:
```javascript
{
  runId: string,                 // Document ID
  analysisId: string,            // Reference to survey-analyses document
  url: string,                   // Survey URL tested
  startTime: timestamp,          // Test run start time
  endTime: timestamp,            // Test run end time
  totalDuration: number,         // Duration in milliseconds
  fieldsProcessed: number,       // Number of fields tested
  testCasesExecuted: number,     // Total test cases run
  successfulTestCases: number,   // Successfully applied test cases
  failedTestCases: number,       // Failed test cases
  validationErrorsFound: number, // Validation errors detected
  screenshotsPath: string,       // Base path in Cloud Storage
  status: string,                // "completed", "completed_with_failures"
  createdAt: timestamp
}
```

### Subcollection: `test-runs/{runId}/results`

**Document ID**: `{fieldId}_{testCaseId}` (e.g., "q1_choice_0")

**Document Schema**:
```javascript
{
  fieldId: string,               // Field document ID
  testCaseId: string,            // Test case ID
  questionNumber: string,        // Question number for reference
  testCaseValue: any,            // Value applied to field
  applied: boolean,              // Whether value was successfully applied
  validationTriggered: boolean,  // Whether validation was triggered
  validationMessages: array<string>, // Validation messages if any
  screenshotPath: string,        // Filename in Cloud Storage
  screenshotUrl: string,         // Direct URL to screenshot
  error: string,                 // Error message if failed
  duration: number,              // Duration in milliseconds
  timestamp: timestamp           // Result timestamp
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
  │   │   │   │   │   ├── form_1_on_entry_{customerId}_{studyId}.png
  │   │   │   │   │   ├── form_1_on_exit_{customerId}_{studyId}.png
  │   │   │   │   │   ├── form1_question_1_{customerId}_{studyId}.png
  │   │   │   │   │   ├── form1_question_2_{customerId}_{studyId}.png
  │   │   │   │   │   ├── form_2_on_entry_{customerId}_{studyId}.png
  │   │   │   │   │   ├── form_2_on_exit_{customerId}_{studyId}.png
  │   │   │   │   │   ├── form2_question_1_{customerId}_{studyId}.png
  │   │   │   │   │   └── ...

/test-runs/
  ├── {analysisId}/
  │   ├── {timestamp}/
  │   │   ├── test_1_choice_0_1701234567890.png
  │   │   ├── test_1_1_choice_1_1701234567891.png
  │   │   ├── test_2_text_short_1701234567892.png
  │   │   └── ...
```

### File Naming Convention
- Form-level screenshots: 
  - On-entry: `form_{formIndex}_on_entry_{customerId}_{studyId}.png`
  - On-exit: `form_{formIndex}_on_exit_{customerId}_{studyId}.png`
- Question screenshots: `form{formIndex}_question_{questionNumber}_{customerId}_{studyId}.png`
- Test run screenshots: `test_{questionNumber}_{testCaseId}_{timestamp}.png`

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