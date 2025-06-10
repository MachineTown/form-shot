# Form-Shot Survey Analysis Tool

An automated survey form analysis tool that captures form fields, screenshots, and metadata from web surveys. Built with TypeScript and Puppeteer, containerized with Docker, and integrated with Firestore for cloud storage.

## Features

- **Automated Form Detection**: Analyzes survey forms in web pages, focusing on the survey-body-container
- **Field Analysis**: Extracts question numbers, text, input types, required fields, and choices
- **Screenshot Capture**: Takes individual screenshots of each form field
- **Clean Data Processing**: Removes question numbers, choice values, and handles required field indicators
- **Cloud Integration**: Uploads analysis results and screenshots to Firestore and Firebase Storage
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

### Analysis Command

```bash
docker run --rm -v ./output:/app/output form-shot-runtime analyze <URL> <TUPLE>
```

- **URL**: The survey form URL to analyze
- **TUPLE**: Format `[customer_id,study_id,package_name,language,version]`

Example:
```bash
docker run --rm -v ./output:/app/output form-shot-runtime analyze https://main.qa.castoredc.org/survey/X9PAYLDQ PXL_KISQ,qa-test,sf36-gad7,en,v1
```

### Upload Command

```bash
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime upload <ANALYSIS_JSON_PATH>
```

Example:
```bash
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json form-shot-runtime upload /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json
```

### Query Command

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

## Complete Workflow Example

Here's a complete example using the SF-36 survey:

```bash
# Step 1: Analyze the survey form
docker run --rm -v ./output:/app/output form-shot-runtime analyze \
  https://main.qa.castoredc.org/survey/X9PAYLDQ \
  PXL_KISQ,qa-test,sf36-gad7,en,v1

# Step 2: Upload results to Firestore (requires service account)
docker run --rm \
  -v ./output:/app/output \
  -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime upload \
  /app/output/PXL_KISQ/qa-test/sf36-gad7/en/v1/analysis.json

# Step 3: Query the uploaded data
docker run --rm -v ~/firestore.json:/app/firestore.json \
  form-shot-runtime query --customer PXL_KISQ --limit 5
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
        "cardBoxSelector": "[data-question-id=\"cardbox-q-1\"]"
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
- `survey-analyses` - Main analysis documents
- `survey-analyses/{id}/fields` - Individual form fields
- `customers` - Customer metadata
- `survey-metadata` - Survey type metadata

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