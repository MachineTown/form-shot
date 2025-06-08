# form-shot

Automated form analysis and test case generation tool using Puppeteer and TypeScript.

## Features

- **Form Field Detection**: Automatically identifies all form inputs, selects, textareas, and buttons
- **Comprehensive Test Cases**: Generates normal, edge, boundary, and invalid test cases for each field
- **JSON Test Matrix**: Outputs structured test cases that can drive future automated testing
- **Docker Support**: Runs in containerized environment with Chrome/Chromium
- **CLI Interface**: Simple command-line interface for easy integration

## Setup

1. Copy `.env` file and configure your credentials:
```bash
cp .env.example .env
# Edit .env with your actual credentials
```

2. Install dependencies:
```bash
yarn install
```

3. Build the project:
```bash
yarn build
```

## Usage

### CLI Commands

Analyze a form and generate test matrix:
```bash
yarn analyze <url> [options]

# Options:
# -o, --output <path>     Output file path (default: output/test-matrix.json)
# -v, --viewport <size>   Browser viewport (default: 1024x768)
# -w, --wait-for <ms>     Wait time after page load (default: 3000)
# -s, --screenshot        Take screenshot during analysis
```

### Docker Usage

Build and run with Docker:
```bash
# Build the image
docker-compose build

# Run analysis
docker-compose run --rm form-shot analyze https://example.com/form --screenshot
```

## Output Format

The tool generates a JSON test matrix with the following structure:

```json
{
  "formMetadata": {
    "url": "https://example.com/form",
    "title": "Contact Form",
    "analyzedAt": "2025-01-08T10:30:00Z",
    "totalFields": 5,
    "viewport": "1024x768"
  },
  "fields": [...],
  "testCases": [
    {
      "id": "tc_001",
      "category": "normal",
      "description": "Valid email input",
      "field": "email",
      "inputValue": "test@example.com",
      "expectedOutcome": {
        "valid": true,
        "formSubmittable": true
      }
    }
  ]
}
```

## Test Categories

- **Normal**: Valid inputs that should pass validation
- **Edge**: Boundary cases that should still be valid
- **Invalid**: Inputs that should fail validation
- **Boundary**: Numeric boundary testing (min/max values)