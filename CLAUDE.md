# Summary instructions

When you are using compact, please focus on test output and code changes

# Form Shot - Automated Form Analysis Tool

## Project Overview
This is an automated form analysis and test case generation tool built with TypeScript, Node.js, Puppeteer, and Docker. The tool navigates to web forms, handles authentication, detects form fields, and generates comprehensive test matrices for automated testing.

## Current Status: COMPREHENSIVE SCREENSHOT SYSTEM IMPLEMENTED ✅
The tool is fully functional and successfully:
- Performs two-step login authentication (email → password)
- Clears cookies/localStorage between runs for clean state
- Detects div-based form structures (not just traditional `<form>` elements)
- Focuses on right panel form fields using positional detection
- Extracts meaningful labels from parent div text content
- **NEW: Implements comprehensive screenshot system with right panel scrolling**
- **NEW: Automatically detects scrollable containers and captures multiple scroll positions**
- **NEW: Always takes screenshots during analysis with intelligent scrolling**
- Generates comprehensive test case matrices with normal, edge, and invalid cases
- Successfully tested on Castor EDC platform

## Architecture

### Key Components
- **CLI Interface**: Commander.js-based CLI with analyze command
- **Browser Automation**: Puppeteer with Chrome in Docker container
- **Form Detection**: Advanced div-based field detection with label extraction
- **Test Generation**: Comprehensive test case matrix generation
- **Authentication**: Two-step login flow support
- **Output**: Structured JSON test matrices for test execution

### Project Structure
```
form-shot/
├── src/
│   ├── browser/puppeteer-manager.ts      # Browser automation & login
│   ├── commands/analyze.ts               # Main analyze command
│   ├── config/env-loader.ts              # Environment configuration
│   ├── form-analyzer/field-detector.ts   # Form field detection
│   ├── test-generator/                   # Test case generation
│   ├── utils/                           # Types and utilities
│   └── index.ts                         # CLI entry point
├── Dockerfile                           # Chrome container setup
├── docker-compose.yml                   # Container orchestration
└── output/                             # Generated test matrices & screenshots
```

## Key Features Implemented

### 1. Two-Step Authentication ✅
- Detects and fills email field on first login page
- Submits form and navigates to password page
- Fills password field and completes login
- Waits for final page load after authentication

### 2. Cookie/Storage Management ✅
- Clears localStorage and sessionStorage on browser launch
- Clears browser cookies and cache via CDP
- Ensures clean state between container executions

### 3. Div-Based Form Detection ✅
- Searches entire document for input/select/textarea elements
- Filters fields to right panel area (>30% from left edge)
- Extracts labels from parent div text content with DOM traversal
- Handles radio button grouping with option extraction
- Supports numeric patterns and field attribute parsing

### 4. Test Case Generation ✅
- Normal cases: Valid inputs for each field type
- Edge cases: Boundary conditions, special characters, Unicode
- Invalid cases: Length violations, XSS attempts, control characters
- Generates 10+ test cases per field with expected outcomes

### 5. Comprehensive Screenshot System ✅ **NEW**
- **Right Panel Container Detection**: Uses CSS selectors and overflow detection to find scrollable containers
- **Container-Specific Scrolling**: Scrolls the form container rather than entire page
- **Multiple Screenshot Capture**: Takes 5+ screenshots at different scroll positions with 20% overlap
- **Intelligent Scroll Detection**: Detects containers >30% from left edge with scrollHeight > clientHeight
- **CSS.escape() Support**: Properly handles special character IDs in selectors
- **Dynamic Content Loading**: Pre-scrolls to trigger lazy-loaded form fields
- **Always Active**: Removed optional screenshot flag - screenshots always taken during analysis

### 6. Docker Integration ✅
- Full Chrome/Chromium installation in container
- Volume mounting for output files and .env credentials
- Proper user permissions and container networking

## Usage

### Environment Setup
```bash
# Create .env file with credentials
USERNAME=your-email@domain.com
PASSWORD=your-password
```

### Docker Commands
```bash
# Build container
docker compose build

# Run analysis (screenshots always taken automatically)
sg docker -c "docker compose run --rm form-shot analyze https://example.com/form"

# Clean docker system if needed
sg docker -c "docker system prune -f"
```

### Local Development
```bash
yarn install
yarn build
yarn start analyze https://example.com/form
```

## Output Format
The tool generates JSON test matrices with:
- Form metadata (URL, title, timestamp, field count)
- Detected fields with selectors, types, labels, attributes
- Test cases with categories, descriptions, input values, expected outcomes

## Testing History

### Successful Test: Castor EDC Platform
- **URL**: https://uk.castoredc.com/studies/vNwMSpmkixLQLb3pp6NVVc/participants/110001/visits
- **Result**: ✅ Successfully detected 5 form fields, generated 54 test cases
- **Fields Found**: 
  - Year of birth (text, 4 char max, numeric pattern)
  - Gender (radio buttons: Female/Male)
  - Height (text, numeric pattern, cm suffix)
  - Weight (text, numeric pattern, kg suffix)
  - Dropdown field (text input)
- **Authentication**: Two-step login completed successfully
- **Form Structure**: Div-based form in right panel correctly detected
- **Screenshot System**: ✅ **NEW - Successfully working!**
  - **Container Detected**: 644x568px scrollable container at position (340, 106)
  - **Scroll Content**: 808px total content vs 568px visible (scrollable)
  - **Screenshots Generated**: 6 total - initial, viewport, scroll-240px, bottom-240px, final
  - **Different Content**: Screenshots are no longer identical - capture different scroll positions
  - **Ready for Country Field**: System will capture "country of origin" field when it becomes visible

## Technical Implementation Details

### Form Field Detection Logic
1. **Right Panel Filtering**: `rect.left > windowWidth * 0.3`
2. **Label Extraction**: Walks up 5 levels of parent divs, extracts clean text
3. **Text Cleaning**: Removes numbers, normalizes whitespace, filters input values
4. **Radio Grouping**: Groups radio buttons by name attribute with option extraction
5. **Attribute Parsing**: Extracts maxLength, pattern, placeholder, etc.
6. **CSS Selector Escaping**: Uses CSS.escape() for special character IDs with fallback to attribute selectors

### Comprehensive Screenshot System **NEW**
1. **Container Detection**: Searches for scrollable containers using multiple CSS selectors
2. **Right Panel Focus**: Filters containers to right side (>30% from left edge)
3. **Scroll Detection**: Checks `scrollHeight > clientHeight` and CSS overflow properties
4. **Dynamic Content Loading**: Pre-scrolls to bottom and back to trigger lazy loading
5. **Multi-Screenshot Capture**: Takes screenshots at different scroll positions with 20% overlap
6. **Screenshot Naming**: 01-initial, 02-viewport, 03+ scrolled positions, 98-bottom, 99-final

### Authentication Flow
1. Navigate to target URL
2. Wait for page load (3s + form detection)
3. Find email field using multiple selectors
4. Enter email and submit form
5. Wait for password page navigation
6. Find password field and enter credentials
7. Submit and wait for final authentication

### Container Configuration
- Base: Node.js 18 with Chrome dependencies
- Chrome path: `/usr/bin/google-chrome`
- Security: `--no-sandbox`, `--disable-setuid-sandbox`
- Volumes: `.env` (readonly), `./output` (read-write)

## Git History
- **Branch**: `feature/analyze`
- **Latest Commit**: `f3e1eea` - Implement comprehensive screenshot system with right panel scrolling detection
- **Previous**: `461b751` - Implement div-based form detection with right panel filtering
- **Previous**: `2a04d8f` - Implement automated form analysis tool with two-step login support

## Known Limitations
- Requires Docker group membership for local execution (`sg docker -c`)
- Uses sudo password "SCubar00" for permission fixes if needed
- Assumes right panel layout for form detection (>30% from left edge)
- Two-step login flow is specific to current implementation
- Country field detection: May require additional user interaction or deeper scrolling to reveal all form fields

## Latest Session Progress (2025-06-08) ✅
- **Problem Identified**: Screenshots were identical, missing "country of origin" field at bottom
- **Root Cause**: Page scrolling instead of right panel container scrolling
- **Solution Implemented**: Right panel container detection and scrolling
- **Result**: Successfully detects and scrolls 644x568px container with 808px content
- **Screenshots**: Now captures 6 different screenshots showing various scroll positions
- **Status**: Comprehensive screenshot system fully working, ready to capture all form fields

## Next Steps (if needed)
- **Field Detection Enhancement**: Run field detection after each scroll position to catch newly visible fields
- **Deeper Scrolling**: Increase scroll steps or implement full scroll to absolute bottom
- **Tab/Section Navigation**: Handle forms with multiple tabs or expandable sections
- **Test Execution Engine**: Add capability to run generated test cases
- **Multi-page Form Support**: Handle forms spanning multiple pages or steps