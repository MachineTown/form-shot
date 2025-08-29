#!/bin/bash

# Batch Survey Analysis Script
# Executes multiple form-shot analyses in parallel using Docker containers
# Usage: ./batch-analyze.sh <input_file>

# Configuration
LOG_DIR="./logs"
SCRIPT_NAME="$(basename "$0")"
INPUT_FILE=""
MAX_CONCURRENT_JOBS=10
BACKGROUND_PIDS=()
DOCKER_IMAGE="form-shot-runtime"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Usage information
show_usage() {
    cat << EOF
Usage: $SCRIPT_NAME <input_file>

Batch execution of form-shot survey analysis using Docker containers.

Arguments:
  input_file    Text file containing analysis configurations

Input file format (one per line):
  <width>,<customer_id>,<study_id>,<package_name>,<language>,<version>,<survey_url>

Example input file:
  1024,PXL_KISQ,qa-test,sf36-gad7,en,v1,https://main.qa.castoredc.org/survey/X9PAYLDQ
  767,CUSTOMER2,study-2,package-2,es,v2,https://example.com/survey/ABC123

EOF
}

# Convert tuple to log filename
convert_tuple_to_filename() {
    local tuple="$1"
    echo "${tuple//,/-}.log"
}

# Parse a single line from input file
parse_line() {
    local line="$1"
    
    # Remove leading/trailing whitespace
    line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    
    # Split by comma - expect at least 7 parts
    IFS=',' read -ra PARTS <<< "$line"
    
    if [[ ${#PARTS[@]} -lt 7 ]]; then
        return 1
    fi
    
    local width="${PARTS[0]}"
    local tuple="${PARTS[1]},${PARTS[2]},${PARTS[3]},${PARTS[4]},${PARTS[5]}"
    local url="${PARTS[6]}"
    
    # Handle URLs that might contain commas
    if [[ ${#PARTS[@]} -gt 7 ]]; then
        for ((i=7; i<${#PARTS[@]}; i++)); do
            url="${url},${PARTS[i]}"
        done
    fi
    
    echo "$width|$tuple|$url"
}

# Create necessary directories
setup_directories() {
    if [[ ! -d "$LOG_DIR" ]]; then
        log_info "Creating log directory: $LOG_DIR"
        mkdir -p "$LOG_DIR"
    fi
    
    if [[ ! -d "./output" ]]; then
        log_info "Creating output directory: ./output"
        mkdir -p "./output"
    fi
}

# Construct Docker command for analysis
build_docker_command() {
    local width="$1"
    local tuple="$2" 
    local url="$3"
    local log_file="$4"
    
    echo "docker run --rm -v ./output:/app/output $DOCKER_IMAGE analyze \"$url\" \"$tuple\" --screen-width $width"
}

# Execute Docker command in background with logging
execute_analysis_background() {
    local width="$1"
    local tuple="$2"
    local url="$3"
    local log_filename="$4"
    local log_filepath="$LOG_DIR/$log_filename"
    
    # Build the Docker command
    local docker_cmd=$(build_docker_command "$width" "$tuple" "$url" "$log_filepath")
    
    log_info "Starting analysis: $tuple (width: $width)"
    log_info "Command: $docker_cmd"
    log_info "Logging to: $log_filepath"
    
    # Execute in background and capture PID
    (
        echo "=== Starting analysis at $(date) ===" 
        echo "Width: $width"
        echo "Tuple: $tuple" 
        echo "URL: $url"
        echo "Command: $docker_cmd"
        echo "=================================="
        echo ""
        
        # Execute the Docker command
        eval "$docker_cmd" 2>&1
        local exit_code=$?
        
        echo ""
        echo "=== Analysis completed at $(date) ===" 
        echo "Exit code: $exit_code"
        echo "======================================="
        
        exit $exit_code
    ) > "$log_filepath" 2>&1 &
    
    local bg_pid=$!
    BACKGROUND_PIDS+=("$bg_pid")
    
    log_info "Started background process PID: $bg_pid"
    return 0
}

# Check if Docker image exists
check_docker_image() {
    if ! docker image inspect "$DOCKER_IMAGE" >/dev/null 2>&1; then
        log_error "Docker image '$DOCKER_IMAGE' not found"
        log_error "Please build the image first: pnpm build && docker build -f Dockerfile.runtime -t $DOCKER_IMAGE ."
        exit 1
    fi
}

# Wait for active jobs to finish if at max capacity
wait_for_job_slot() {
    while [[ ${#BACKGROUND_PIDS[@]} -ge $MAX_CONCURRENT_JOBS ]]; do
        log_info "At maximum concurrent jobs ($MAX_CONCURRENT_JOBS), waiting for completion..."
        
        # Check for completed jobs
        local new_pids=()
        local completed_count=0
        
        for pid in "${BACKGROUND_PIDS[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                # Process still running
                new_pids+=("$pid")
            else
                # Process completed
                ((completed_count++))
            fi
        done
        
        if [[ $completed_count -gt 0 ]]; then
            log_info "Completed $completed_count job(s), continuing..."
            BACKGROUND_PIDS=("${new_pids[@]}")
        else
            # No jobs completed, wait a bit
            sleep 2
        fi
    done
}

# Main function
main() {
    log_info "Starting $SCRIPT_NAME"
    
    # Check arguments
    if [[ $# -ne 1 ]]; then
        log_error "Invalid number of arguments"
        show_usage
        exit 1
    fi
    
    INPUT_FILE="$1"
    
    # Check if input file exists and is readable
    if [[ ! -f "$INPUT_FILE" ]]; then
        log_error "Input file not found: $INPUT_FILE"
        exit 1
    fi
    
    if [[ ! -r "$INPUT_FILE" ]]; then
        log_error "Input file not readable: $INPUT_FILE"
        exit 1
    fi
    
    # Setup
    setup_directories
    
    # Parse input file
    log_info "Parsing input file: $INPUT_FILE"
    
    local line_num=0
    local valid_lines=0
    local configurations=()
    
    # Read file directly using mapfile to avoid issues
    mapfile -t lines < "$INPUT_FILE"
    
    for line in "${lines[@]}"; do
        ((line_num++))
        
        # Skip empty lines and comments
        if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
            continue
        fi
        
        if result=$(parse_line "$line"); then
            ((valid_lines++))
            configurations+=("$result")
            log_info "Line $line_num: parsed successfully"
        else
            log_warn "Line $line_num: skipped due to parsing error"
        fi
    done
    
    if [[ $valid_lines -eq 0 ]]; then
        log_error "No valid lines found in input file"
        exit 1
    fi
    
    log_success "Parsed $valid_lines valid configuration(s) from $line_num total lines"
    
    # Check Docker image availability
    check_docker_image
    
    # Execute analyses in parallel
    log_info "Starting parallel execution of analyses (max concurrent: $MAX_CONCURRENT_JOBS)"
    
    local count=0
    for config in "${configurations[@]}"; do
        ((count++))
        IFS='|' read -r width tuple url <<< "$config"
        local log_filename=$(convert_tuple_to_filename "$tuple")
        
        # Wait for available job slot
        wait_for_job_slot
        
        # Execute analysis in background
        execute_analysis_background "$width" "$tuple" "$url" "$log_filename"
        
        log_success "Queued analysis $count/$valid_lines: $tuple"
    done
    
    log_info "All analyses queued. Background processes: ${#BACKGROUND_PIDS[@]}"
    log_info "Check log files in $LOG_DIR/ for progress"
    log_info "Milestone 2 completed: Docker command execution and background processing implemented"
}

# Handle script interruption
cleanup() {
    log_warn "Script interrupted, cleaning up..."
    
    # Kill all background processes
    if [[ ${#BACKGROUND_PIDS[@]} -gt 0 ]]; then
        log_info "Terminating ${#BACKGROUND_PIDS[@]} background process(es)..."
        
        for pid in "${BACKGROUND_PIDS[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                log_info "Killing process $pid..."
                kill -TERM "$pid" 2>/dev/null || true
            fi
        done
        
        # Give processes a moment to terminate gracefully
        sleep 2
        
        # Force kill any remaining processes
        for pid in "${BACKGROUND_PIDS[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                log_warn "Force killing process $pid..."
                kill -KILL "$pid" 2>/dev/null || true
            fi
        done
        
        log_info "Cleanup complete"
    fi
    
    exit 130
}

# Set up signal handlers
trap cleanup INT TERM

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi