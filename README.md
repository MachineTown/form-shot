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
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime upload <ANALYSIS_JSON_PATH>
```

Example:
```bash
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime upload /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json
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

### 9. Clear All Firestore Data (⚠️ WARNING: Irreversible!)
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
docker run --rm \
  -v ./output:/app/output \
  -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime upload \
  /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json

# Step 3: Query specific test cases
docker run --rm -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime query-test-cases --analysis PXL_KISQ_qa-test_sf36-gad7_en_v1 --status draft
```

### Extended Workflow (Full Test Data Management)
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

# Step 3: Get complete analysis with test cases
docker run --rm -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime get-analysis PXL_KISQ_qa-test_sf36-gad7_en_v1

# Step 4: Query test cases by status
docker run --rm -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime query-test-cases --customer PXL_KISQ --status draft --limit 10

# Step 5: Update test case status after review
docker run --rm -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime update-test-case PXL_KISQ_qa-test_sf36-gad7_en_v1 q1_ choice_1__0 approved --reviewer user123

# Step 6: Generate pattern statistics for optimization
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
- Screenshots stored in Firebase Storage at `survey-screenshots/{customer}/{study}/{package}/{language}/{version}/`

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