# Form-Shot Survey Analysis Tool

An automated survey form analysis tool that captures form fields, screenshots, and metadata from web surveys. Built as a pnpm monorepo with TypeScript and Puppeteer, containerized with Docker, and integrated with Firestore for cloud storage.

## Features

- **Automated Form Detection**: Analyzes survey forms in web pages, focusing on the survey-body-container
- **Field Analysis**: Extracts question numbers, text, input types, required fields, and choices
- **Screenshot Capture**: Takes individual screenshots of each form field
- **Intelligent Test Data Generation**: 
  - Position-based test cases for radio buttons/dropdowns (language independent)
  - Smart type detection for text fields (email, phone, name, age, etc.)
  - Varying length responses for text areas
  - Provenance tracking (generated, human-entered, hybrid)
- **Cloud Integration**: Uploads analysis results and screenshots to Firestore and Firebase Storage
- **Sub-collection Architecture**: Stores test cases in Firestore sub-collections for scalable querying
- **Test Case Management**: Update status, track reviews, and generate statistics
- **Automated Test Execution**: Execute test cases on live forms with validation detection
- **Validation Testing**: Capture form validation states and error messages
- **Containerized**: Runs completely within Docker with no local dependencies

## Prerequisites

- Docker installed on your system
- pnpm 8+ (for development only)
- Node.js 18+ LTS (for development only)
- Firestore service account credentials (optional, for cloud upload)

## Quick Start

### 1. Build the Docker Container

```bash
pnpm build && docker build -f Dockerfile.runtime -t form-shot-runtime .
```

### 2. Run Survey Analysis

Analyze a survey form and save results locally:

```bash
docker run --rm -v ./output:/app/output form-shot-runtime analyze https://main.qa.castoredc.org/survey/X9PAYLDQ PXL_KISQ,qa-test,sf36-gad7,en,v1
```

This will:
- Open the survey URL in a headless browser
- Detect all form fields in the survey-body-container
- Take screenshots of each question
- Save analysis.json and PNG files to `./output/PXL_KISQ/qa-test/sf36-gad7/en/v1/`

### 3. Upload to Firestore (Optional)

If you have Firestore credentials, upload the analysis to the cloud:

```bash
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime upload /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json
```

### 4. Query Cloud Data

Query stored analyses from Firestore:

```bash
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query --limit 5
```

## Command Reference

### 1. Analyze Survey (with automatic test data generation)
```bash
docker run --rm -v ./output:/app/output form-shot-runtime analyze <URL> <TUPLE>
```

- **URL**: The survey form URL to analyze
- **TUPLE**: Format `[customer_id,study_id,package_name,language,version]`

Example:
```bash
docker run --rm -v ./output:/app/output form-shot-runtime analyze https://main.qa.castoredc.org/survey/X9PAYLDQ PXL_KISQ,qa-test,sf36-gad7,en,v1
```

### 2. Upload Analysis to Firestore (includes test data)
```bash
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime upload <ANALYSIS_JSON_PATH> [OPTIONS]
```

Options:
- `--leave`: Keep local output files after upload (default: remove)

Examples:
```bash
# Upload and remove local files (default)
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime upload /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json

# Upload and keep local files
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime upload /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json --leave
```

### 3. Query Analyses from Firestore
```bash
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query [OPTIONS]
```

Options:
- `--customer <customerId>`: Filter by customer ID
- `--study <studyId>`: Filter by study ID  
- `--limit <number>`: Limit number of results (default: 10)

Examples:
```bash
# Query all analyses
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query --limit 5

# Filter by customer
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query --customer PXL_KISQ --limit 3
```

### 4. Query Test Cases from Firestore (sub-collection queries)
```bash
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query-test-cases [OPTIONS]
```

Options:
- `--analysis <analysisId>`: Filter by analysis ID
- `--customer <customerId>`: Filter by customer ID
- `--study <studyId>`: Filter by study ID
- `--status <status>`: Filter by status (draft, approved, rejected, needs_review)
- `--source <source>`: Filter by source (generated, human, hybrid)
- `--limit <number>`: Limit number of results (default: 20)

Examples:
```bash
# Query test cases by status
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query-test-cases --customer PXL_KISQ --status draft --limit 10

# Query specific analysis test cases
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime query-test-cases --analysis PXL_KISQ_qa-test_sf36-gad7_en_v1 --status draft
```

### 5. Get Complete Analysis with Test Cases
```bash
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime get-analysis <ANALYSIS_ID>
```

Example:
```bash
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime get-analysis PXL_KISQ_qa-test_sf36-gad7_en_v1
```

### 6. Update Individual Test Case Status
```bash
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime update-test-case <ANALYSIS_ID> <FIELD_ID> <TEST_CASE_ID> <STATUS> [OPTIONS]
```

Options:
- `--reviewer <reviewerId>`: Reviewer ID

Example:
```bash
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime update-test-case PXL_KISQ_qa-test_sf36-gad7_en_v1 q1_ choice_1__0 approved --reviewer user123
```

### 7. Generate Pattern Statistics
```bash
docker run --rm -v ./output:/app/output form-shot-runtime pattern-stats
```

### 8. Export Unknown Fields for Classification
```bash
docker run --rm -v ./output:/app/output form-shot-runtime export-unknown
```

### 9. Execute Test Cases on Survey Form (Test Run)
```bash
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime test-run <ANALYSIS_ID> <URL> [OPTIONS]
```

Options:
- `-o, --output <dir>`: Output directory for test results (default: ./output/test-runs)
- `-d, --delay <ms>`: Delay after field input in milliseconds (default: 500)
- `--skip-validation`: Skip validation message detection
- `--leave`: Keep local output files after upload (default: remove)

Examples:
```bash
# Execute test run and remove local files (default)
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime test-run PXL_KISQ_qa-test_sf36-gad7_en_v1 https://main.qa.castoredc.org/survey/X9PAYLDQ

# Execute test run and keep local files
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime test-run PXL_KISQ_qa-test_sf36-gad7_en_v1 https://main.qa.castoredc.org/survey/X9PAYLDQ --leave
```

This will:
- Retrieve analysis and test cases from Firestore
- Apply each test case value to the corresponding form field
- Move focus away to trigger validation
- Capture validation messages and states
- Take screenshots of each field after test case application
- Generate a comprehensive test run report
- Upload results to Firestore and Cloud Storage
- Clean up local files unless --leave flag is used

### 10. Clear All Firestore Data (⚠️ WARNING: Irreversible!)
```bash
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime clear
```

This will permanently delete:
- All survey analyses from Firestore
- All test case subcollections
- All screenshots from Firebase Storage

## Complete Workflow Examples

### Basic Workflow (Analyze + Upload)
```bash
# Step 1: Analyze survey (now includes automatic test data generation)
docker run --rm -v ./output:/app/output form-shot-runtime analyze \
  https://main.qa.castoredc.org/survey/X9PAYLDQ \
  PXL_KISQ,qa-test,sf36-gad7,en,v1

# Step 2: Upload results (test cases stored in sub-collections)
# Note: This will remove local files after successful upload
docker run --rm \
  -v ./output:/app/output \
  -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime upload \
  /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json

# Step 3: Query specific test cases
docker run --rm -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime query-test-cases --analysis PXL_KISQ_qa-test_sf36-gad7_en_v1 --status draft
```

### Extended Workflow (Full Test Data Management + Testing)
```bash
# Step 1: Analyze (includes test data generation)
docker run --rm -v ./output:/app/output form-shot-runtime analyze \
  https://main.qa.castoredc.org/survey/X9PAYLDQ \
  PXL_KISQ,qa-test,sf36-gad7,en,v1

# Step 2: Upload to Firestore with test cases
docker run --rm \
  -v ./output:/app/output \
  -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime upload \
  /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json

# Step 3: Execute test cases on the live form
# Note: Results uploaded to Firestore/Cloud Storage, local files removed after upload
docker run --rm \
  -v ./output:/app/output \
  -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime test-run PXL_KISQ_qa-test_sf36-gad7_en_v1 \
  https://main.qa.castoredc.org/survey/X9PAYLDQ

# Step 4: Get complete analysis with test cases
docker run --rm -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime get-analysis PXL_KISQ_qa-test_sf36-gad7_en_v1

# Step 5: Query test cases by status
docker run --rm -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime query-test-cases --customer PXL_KISQ --status draft --limit 10

# Step 6: Update test case status after review
docker run --rm -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime update-test-case PXL_KISQ_qa-test_sf36-gad7_en_v1 q1_ choice_1__0 approved --reviewer user123

# Step 7: Generate pattern statistics for optimization
docker run --rm -v ./output:/app/output form-shot-runtime pattern-stats
```

### Data Management Workflow
```bash
# Export unknown fields for manual classification
docker run --rm -v ./output:/app/output form-shot-runtime export-unknown

# Query all analyses for overview
docker run --rm -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime query --limit 10

# Clear all data when starting fresh (⚠️ WARNING: Irreversible!)
docker run --rm -v ~/firestore.json:/app/firestore.json form-shot-runtime clear
```

## Output Structure

### Local Output
After analysis, files are saved to:
```
output/
├── {customer_id}/
│   ├── {study_id}/
│   │   ├── {package_name}/
│   │   │   ├── {language}/
│   │   │   │   ├── {version}/
│   │   │   │   │   ├── analysis.json
│   │   │   │   │   ├── question_1_customer_study.png
│   │   │   │   │   ├── question_2_customer_study.png
│   │   │   │   │   └── ...
├── test-runs/
│   ├── {analysis_id}_{timestamp}/
│   │   ├── test-run-results.json
│   │   ├── test_q1__choice_1__0_{timestamp}.png
│   │   ├── test_q1__choice_1__2_{timestamp}.png
│   │   └── ...
```

### Analysis JSON Structure
```json
{
  "metadata": {
    "tuple": {
      "customerId": "PXL_KISQ",
      "studyId": "qa-test", 
      "packageName": "sf36-gad7",
      "language": "en",
      "version": "v1"
    },
    "analysisDate": "2025-06-10T09:54:30.760Z",
    "url": "https://main.qa.castoredc.org/survey/X9PAYLDQ"
  },
  "form": {
    "longTitle": "SF 36",
    "shortName": "SF 36", 
    "fields": [
      {
        "questionNumber": "1.",
        "questionText": "In general, would you say your health is",
        "inputType": "radio",
        "isRequired": true,
        "choices": ["Excellent", "Very good", "Good", "Fair", "Poor"],
        "selector": "#element-id",
        "screenshotPath": "question_1_PXL_KISQ_qa-test.png",
        "cardBoxSelector": "[data-question-id=\"cardbox-q-1\"]",
        "testData": {
          "fieldType": "health_rating_scale",
          "confidence": 0.95,
          "testCases": [
            {
              "id": "choice_1__0",
              "type": "choice_selection",
              "value": 0,
              "description": "Select first option (position-based)",
              "source": "generated",
              "status": "draft"
            },
            {
              "id": "choice_1__2", 
              "type": "choice_selection",
              "value": 2,
              "description": "Select middle option (position-based)",
              "source": "generated",
              "status": "draft"
            }
          ],
          "summary": {
            "totalTestCases": 5,
            "generatedCount": 5,
            "humanCount": 0,
            "hybridCount": 0
          }
        }
      }
    ],
    "viewportHeight": 6978,
    "url": "https://main.qa.castoredc.org/survey/X9PAYLDQ",
    "timestamp": "2025-06-10T09:54:30.760Z"
  }
}
```

### Test Run Results JSON Structure
```json
{
  "analysisId": "PXL_KISQ_qa-test_sf36-gad7_en_v1",
  "url": "https://main.qa.castoredc.org/survey/X9PAYLDQ",
  "startTime": "2025-06-10T20:45:30.123Z",
  "endTime": "2025-06-10T20:47:15.456Z",
  "totalDuration": 105333,
  "fieldsProcessed": 36,
  "testCasesExecuted": 180,
  "successfulTestCases": 175,
  "failedTestCases": 5,
  "validationErrorsFound": 12,
  "results": [
    {
      "fieldId": "q1_",
      "testCaseId": "choice_1__0",
      "questionNumber": "1.",
      "testCaseValue": 0,
      "applied": true,
      "validationTriggered": false,
      "validationMessages": [],
      "screenshotPath": "test_q1__choice_1__0_1675123456789.png",
      "duration": 850
    },
    {
      "fieldId": "q2_",
      "testCaseId": "text_age_invalid",
      "questionNumber": "2.",
      "testCaseValue": "abc",
      "applied": true,
      "validationTriggered": true,
      "validationMessages": ["Please enter a valid number"],
      "screenshotPath": "test_q2__text_age_invalid_1675123457890.png",
      "duration": 1200
    }
  ]
}
```

## Firestore Setup (Optional)

To use cloud upload features:

1. Create a Firebase project
2. Enable Firestore and Storage
3. Enable Google Authentication in Firebase Console
4. Create a service account with admin permissions
5. Download the service account JSON as `~/firestore.json`
6. Initialize allowed domains for access control (see Domain-Based Access Control section)

The tool will automatically create collections following this structure:
- `survey-analyses` - Main analysis documents with metadata
- `survey-analyses/{id}/fields` - Individual form field data
- `survey-analyses/{id}/fields/{fieldId}/test-cases` - Test cases for each field
- `test-runs` - Test execution results with metadata
- `test-runs/{runId}/results` - Individual test case execution results
- Screenshots stored in Firebase Storage:
  - Analysis screenshots: `survey-screenshots/{customer}/{study}/{package}/{language}/{version}/`
  - Test run screenshots: `test-runs/{analysisId}/{timestamp}/`

## Troubleshooting

### Permission Issues
If you encounter permission issues with output files:
```bash
sudo chown -R $USER:$USER ./output
```

### Docker Build Issues
If the build times out, try increasing Docker's resource limits or build without cache:
```bash
docker build --no-cache -f Dockerfile.runtime -t form-shot-runtime .
```

### Firestore Authentication
Ensure your service account has the following roles:
- Cloud Datastore User
- Firebase Admin SDK Service Agent  
- Storage Admin

## Development

Form-Shot is structured as a pnpm monorepo with the following packages:

```
form-shot/
├── packages/
│   ├── cli/        # CLI application
│   ├── shared/     # Shared business logic, services, and types
│   └── ui/         # Future React UI (placeholder)
```

### Setup Development Environment

```bash
# Install pnpm globally
npm install -g pnpm@8.15.0

# Or use corepack (comes with Node.js 16+)
corepack enable
corepack prepare pnpm@8.15.0 --activate

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run CLI in development mode
pnpm dev
```

### Package Scripts

```bash
# Build all packages
pnpm build

# Run specific package commands
pnpm --filter @form-shot/cli build
pnpm --filter @form-shot/shared build

# Run CLI directly
pnpm cli analyze <URL> <TUPLE>
```

### Adding Dependencies

```bash
# Add to specific package
pnpm --filter @form-shot/cli add commander

# Add shared dependency
pnpm --filter @form-shot/shared add puppeteer

# Add dev dependency to root
pnpm add -D -w typescript
```

### Project Structure

- `packages/cli/` - CLI commands and entry point
- `packages/shared/` - Core business logic:
  - `form-analyzer/` - Form detection and analysis
  - `test-generator/` - Test data generation
  - `services/` - Firestore and screenshot services
  - `types/` - TypeScript type definitions
  - `utils/` - Common utilities
- `packages/ui/` - React web interface for viewing analysis results

## Web UI

Form-Shot includes a React-based web interface for viewing and managing survey analysis results.

### UI Development

```bash
# Start development server (from root directory)
pnpm ui:dev

# Build production bundle
pnpm ui:build

# Preview production build locally
pnpm --filter @form-shot/ui preview
```

### Domain-Based Access Control

Form-Shot implements domain-based access control to restrict UI access to specific organizations. Only users with email addresses from whitelisted domains can access the application.

#### Initial Setup

1. Run the initialization script to add allowed domains:
   ```bash
   node scripts/init-allowed-domains.js
   ```
   This will add `castoredc.com` as the initial allowed domain.

2. To add additional domains, use the Firebase Console:
   - Navigate to Firestore Database
   - Open the `allowed-domains` collection
   - Add a new document with the domain as the document ID
   - Set the following fields:
     ```json
     {
       "domain": "example.com",
       "enabled": true,
       "addedDate": <timestamp>,
       "description": "Example Corporation" // optional
     }
     ```

#### How It Works

- When users sign in with Google, their email domain is checked against the allowed list
- Both client-side and server-side validation ensure security
- Firestore and Storage security rules enforce domain restrictions
- Users from non-allowed domains receive a clear error message

### UI Deployment to Firebase Hosting

The UI can be deployed to Firebase Hosting for web access.

#### Prerequisites

1. Firebase CLI installed: `npm install -g firebase-tools`
2. Authenticated with Firebase: `firebase login`
3. Firebase project already configured in `.firebaserc`

#### Deploy to Production

```bash
# From root directory
pnpm ui:deploy

# Or from packages/ui directory
cd packages/ui && pnpm deploy:prod
```

This will:
1. Build the production bundle
2. Deploy to Firebase Hosting at https://castor-form-shot.web.app

#### Deploy Preview Channel

For testing before production deployment:

```bash
# From root directory
pnpm ui:deploy:preview

# Or from packages/ui directory
cd packages/ui && pnpm deploy:preview
```

This creates a preview channel URL for testing.

### UI Features

- **Analysis Explorer**: Browse and filter survey analyses by customer, study, and package
- **Screenshot Viewer**: View form-level (on-entry/on-exit) and field-level screenshots
- **Test Data Management**: Review and manage generated test cases
- **Metadata Viewer**: Inspect detailed analysis metadata and field information
- **Multi-panel Layout**: Efficient navigation with collapsible sidebar and tabbed content


en https://data.castoredc.com/survey/GTP6T36B
en visit 3 https://data.castoredc.com/survey/97P9PBJ5
en visit 4 https://data.castoredc.com/survey/65VGEBAG


es https://data.castoredc.com/survey/XZKPHP8H
