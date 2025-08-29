# Batch Survey Analysis Script Implementation Plan

## Overview
This plan outlines the implementation of a bash script that executes multiple form-shot survey analyses in parallel using Docker containers, with each execution logged to separate files.

## Requirements Summary
- Read input from a text file with format: `<width>,<tuple of 5 comma separated labels>,<survey-url>`
- Execute: `docker run --rm -v ./output:/app/output form-shot-runtime analyze <survey-url> <tuple> --screen-width <width>`
- Run each execution as a background task
- Log stdout/stderr to files named `<tuple-with-dashes>.log`

## Implementation Milestones

### Milestone 1: Basic Script Structure and File Parsing
**Objective**: Create the foundation script with file reading and parsing capabilities

**Deliverables**:
- [ ] Create `scripts/batch-analyze.sh` with basic structure
- [ ] Implement file reading functionality
- [ ] Add line parsing to extract width, tuple, and URL
- [ ] Create helper function to convert tuple to log filename
- [ ] Add basic usage documentation

**Acceptance Criteria**:
- Script can read and parse input file correctly
- Tuple conversion to filename works (commas → dashes)
- Basic error handling for file not found

---

### Milestone 2: Docker Command Execution and Background Processing
**Objective**: Implement Docker command execution with background process management

**Deliverables**:
- [ ] Add Docker command construction logic
- [ ] Implement background process execution
- [ ] Add stdout/stderr redirection to log files
- [ ] Create process tracking mechanism
- [ ] Add basic logging to script execution

**Acceptance Criteria**:
- Docker commands execute in background
- Each process logs to correct filename
- Multiple processes can run simultaneously
- No blocking behavior on script execution

---

### Milestone 3: Error Handling and Input Validation
**Objective**: Add robust error handling and input validation

**Deliverables**:
- [ ] Input file format validation
- [ ] URL format validation
- [ ] Tuple component validation (5 parts)
- [ ] Width parameter validation (numeric, positive)
- [ ] Error reporting and logging
- [ ] Graceful handling of malformed lines

**Acceptance Criteria**:
- Invalid input is detected and reported
- Script continues processing valid lines after encountering invalid ones
- Clear error messages for different failure types
- Error log contains sufficient debugging information

---

### Milestone 4: Process Management and Completion Tracking
**Objective**: Implement comprehensive process management and completion tracking

**Deliverables**:
- [ ] Process ID tracking for all background jobs
- [ ] Wait functionality for all processes to complete
- [ ] Success/failure status reporting
- [ ] Process timeout handling
- [ ] Summary report generation
- [ ] Clean shutdown on script interruption

**Acceptance Criteria**:
- Script can wait for all background processes
- Process failures are detected and reported
- Summary shows total/successful/failed executions
- Clean shutdown preserves existing processes

---

### Milestone 5: Final Integration and Documentation
**Objective**: Complete the implementation with documentation and examples

**Deliverables**:
- [ ] Complete usage documentation
- [ ] Sample input files and examples
- [ ] Performance optimization
- [ ] Final integration verification
- [ ] Error handling refinement

**Acceptance Criteria**:
- Script performance meets requirements (handles 10+ concurrent jobs)
- Complete documentation with examples
- All error conditions handled gracefully

---

## Technical Design

### Script Architecture
```bash
#!/bin/bash

# Configuration
INPUT_FILE=""
MAX_CONCURRENT_JOBS=10
TIMEOUT_SECONDS=3600
LOG_DIR="./logs"

# Main Functions
main()                    # Entry point and argument parsing
parse_input_file()        # Read and validate input file
parse_line()             # Parse individual line to extract components
validate_components()     # Validate width, tuple, URL
convert_tuple_to_filename() # Convert tuple to log filename
execute_analysis()        # Execute Docker command in background
track_process()          # Add process to tracking list
wait_for_completion()    # Wait for all processes to finish
generate_summary()       # Create execution summary report
cleanup()               # Clean shutdown handler
```

### File Structure
```
scripts/
├── batch-analyze.sh           # Main batch analysis script
└── fixtures/
    ├── sample-input.txt       # Sample input file for testing
    └── invalid-input.txt      # Invalid input for error testing
```

### Input File Format
```
# Comments start with #
# Format: width,customer_id,study_id,package_name,language,version,survey_url
1024,PXL_KISQ,qa-test,sf36-gad7,en,v1,https://main.qa.castoredc.org/survey/X9PAYLDQ
767,CUSTOMER2,study-2,package-2,es,v2,https://example.com/survey/ABC123
1200,CUSTOMER3,study-3,package-3,fr,v1,https://example.com/survey/DEF456
```

### Log File Naming
```
Input tuple: PXL_KISQ,qa-test,sf36-gad7,en,v1
Output log: PXL_KISQ-qa-test-sf36-gad7-en-v1.log
```

## Risk Mitigation

### Technical Risks
1. **Docker Container Limits**: Implement configurable concurrency limits
2. **Disk Space**: Monitor output directory size, implement cleanup
3. **Process Leaks**: Proper signal handling and cleanup procedures
4. **Log File Growth**: Implement log rotation if needed

### Operational Risks
1. **Invalid URLs**: Comprehensive URL validation before execution
2. **Network Issues**: Timeout handling and retry logic
3. **Permission Issues**: Clear error messages for Docker/file permissions
4. **Resource Exhaustion**: Memory and CPU monitoring

## Success Criteria
- [ ] Script successfully processes input files with multiple entries
- [ ] All Docker commands execute in parallel as background tasks
- [ ] Each execution logs to correctly named file
- [ ] Error handling prevents script failure on invalid input
- [ ] Performance meets requirements (10+ concurrent jobs)
- [ ] Complete documentation with examples

## Timeline
- **Milestone 1-2**: 2-3 hours (core functionality)
- **Milestone 3-4**: 2-3 hours (robustness and management) 
- **Milestone 5**: 1-2 hours (documentation and integration)
- **Total Estimated Time**: 5-8 hours

---

*This plan will be updated as implementation progresses and requirements are refined.*