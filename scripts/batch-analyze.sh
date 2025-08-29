#!/bin/bash

# Batch Survey Analysis Script
# Executes multiple form-shot analyses in parallel using Docker containers
# Usage: ./batch-analyze.sh <input_file>

# Configuration
LOG_DIR="./logs"
SCRIPT_NAME="$(basename "$0")"
INPUT_FILE=""

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
    
    # Display parsed data for verification (Milestone 1 completion)
    log_info "Parsed configurations:"
    local count=0
    for config in "${configurations[@]}"; do
        ((count++))
        IFS='|' read -r width tuple url <<< "$config"
        local log_filename=$(convert_tuple_to_filename "$tuple")
        echo "  $count. Width: $width, Tuple: $tuple, URL: $url"
        echo "     Log file: $LOG_DIR/$log_filename"
    done
    
    log_info "Milestone 1 completed: Basic script structure and file parsing implemented"
}

# Handle script interruption
cleanup() {
    log_warn "Script interrupted, cleaning up..."
    exit 130
}

# Set up signal handlers
trap cleanup INT TERM

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi