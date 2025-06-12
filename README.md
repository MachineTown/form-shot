# Form-Shot Survey Analysis Tool

An automated survey form analysis tool that captures form fields, screenshots, and metadata from web surveys. Built with TypeScript and Puppeteer, containerized with Docker, and integrated with Firestore for cloud storage.

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
- Firestore service account credentials (optional, for cloud upload)

## Quick Start

### 1. Build the Docker Container

```bash
npm run build && docker build -f Dockerfile.runtime -t form-shot-runtime .
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
3. Create a service account with admin permissions
4. Download the service account JSON as `~/firestore.json`

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

For local development without Docker:

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build  

# Run locally
node dist/index.js analyze <URL> <TUPLE>
```


https://data.castoredc.com/survey/GTP6T36B
