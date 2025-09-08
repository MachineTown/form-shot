#!/bin/bash

# Batch Survey Analysis Script - Working Version
# Executes multiple form-shot analyses in parallel using Docker containers
# Usage: ./batch-analyze-working.sh <input_file>

# Configuration
OUTPUT_DIR="./output"
LOG_DIR="$OUTPUT_DIR/logs"
SCRIPT_NAME="$(basename "$0")"
INPUT_FILE=""
MAX_CONCURRENT_JOBS=10
BACKGROUND_PIDS=()
DOCKER_IMAGE="form-shot-runtime"
PROCESS_TIMEOUT=3600  # 60 minutes per process

# Performance tuning
ENABLE_COMPRESSION=false  # Compress logs after completion
ENABLE_METRICS=false      # Track performance metrics
ENABLE_UPLOAD=false       # Upload successful analyses to Firestore
START_TIME=$(date +%s)    # Track total execution time

# Process tracking
declare -A PROCESS_STATUS  # Track status of each process
declare -A PROCESS_CONFIG  # Track configuration for each process
declare -A PROCESS_START_TIME  # Track start time for each process
declare -A PROCESS_END_TIME    # Track end time for each process
TOTAL_PROCESSES=0
COMPLETED_PROCESSES=0
SUCCESSFUL_PROCESSES=0
FAILED_PROCESSES=0
UPLOADED_PROCESSES=0
UPLOAD_FAILED_PROCESSES=0

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
Usage: $SCRIPT_NAME [OPTIONS] <input_file>

Batch execution of form-shot survey analysis using Docker containers.

Arguments:
  input_file    Text file containing analysis configurations

Options:
  -j, --jobs NUM        Maximum concurrent jobs (default: $MAX_CONCURRENT_JOBS)
  -t, --timeout SECS    Timeout per process in seconds (default: $PROCESS_TIMEOUT)
  -c, --compress        Compress log files after completion
  -m, --metrics         Enable performance metrics tracking
  -u, --upload          Upload successful analyses to Firestore (requires ~/firestore.json)
  -h, --help            Show this help message

Input file format (one per line):
  <width>,<customer_id>,<study_id>,<package_name>,<language>,<version>,<survey_url>

Example:
  1024,PXL_KISQ,qa-test,sf36-gad7,en,v1,https://main.qa.castoredc.org/survey/X9PAYLDQ

EOF
}

# Convert tuple to log filename
convert_tuple_to_filename() {
    local tuple="$1"
    echo "${tuple//,/-}.log"
}

# Simple validation functions
validate_width() {
    local width="$1"
    if [[ ! "$width" =~ ^[0-9]+$ ]] || [[ $width -le 0 ]]; then
        return 1
    fi
    return 0
}

validate_url() {
    local url="$1"
    if [[ ! "$url" =~ ^https?:// ]]; then
        return 1
    fi
    return 0
}

# Parse a single line from input file
parse_line() {
    local line="$1"
    local line_num="$2"
    
    # Remove leading/trailing whitespace
    line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    
    # Split by comma - expect at least 7 parts
    IFS=',' read -ra PARTS <<< "$line"
    
    if [[ ${#PARTS[@]} -lt 7 ]]; then
        log_error "Line $line_num: Invalid format - expected at least 7 comma-separated parts"
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
    
    # Basic validation
    if ! validate_width "$width"; then
        log_error "Line $line_num: Invalid width '$width'"
        return 1
    fi
    
    if ! validate_url "$url"; then
        log_error "Line $line_num: Invalid URL '$url'"
        return 1
    fi
    
    echo "$width|$tuple|$url"
}

# Create necessary directories
setup_directories() {
    if [[ ! -d "$OUTPUT_DIR" ]]; then
        log_info "Creating output directory: $OUTPUT_DIR"
        mkdir -p "$OUTPUT_DIR"
    fi

    if [[ ! -d "$LOG_DIR" ]]; then
        log_info "Creating log directory: $LOG_DIR"
        mkdir -p "$LOG_DIR"
    fi
}

# Check if Docker image exists
check_docker_image() {
    if ! docker image inspect "$DOCKER_IMAGE" >/dev/null 2>&1; then
        log_error "Docker image '$DOCKER_IMAGE' not found"
        log_error "Please build the image first: pnpm build && docker build -f Dockerfile.runtime -t $DOCKER_IMAGE ."
        exit 1
    fi
}

# Convert tuple to directory path
tuple_to_path() {
    local tuple="$1"
    echo "${tuple//,/\/}"
}

# Check if analysis.json exists for a given tuple
check_analysis_exists() {
    local tuple="$1"
    local path=$(tuple_to_path "$tuple")
    local analysis_file="$OUTPUT_DIR/$path/analysis.json"
    
    if [[ -f "$analysis_file" ]]; then
        return 0  # File exists
    else
        return 1  # File does not exist
    fi
}

# Execute upload command in background for a given analysis file
execute_upload_background() {
    local tuple="$1"
    local path=$(tuple_to_path "$tuple")
    local analysis_file="/app/output/$path/analysis.json"
    local log_filename="upload-$(convert_tuple_to_filename "$tuple")"
    local log_filepath="$LOG_DIR/$log_filename"
    
    log_info "Starting upload: $tuple"
    
    # Check if firestore.json exists
    if [[ ! -f ~/firestore.json ]]; then
        log_error "~/firestore.json not found - cannot upload"
        return 1
    fi
    
    # Execute upload command in background
    (
        echo "=== Starting upload at $(date) ==="
        echo "Tuple: $tuple"
        echo "Analysis file: $analysis_file"
        echo "=================================="
        echo ""
        
        docker run --rm \
            -v "$OUTPUT_DIR:/app/output" \
            -v ~/firestore.json:/app/firestore.json \
            "$DOCKER_IMAGE" \
            upload "$analysis_file" 2>&1
        
        local exit_code=$?
        
        echo ""
        echo "=== Upload completed at $(date) ==="
        echo "Exit code: $exit_code"
        
        exit $exit_code
    ) > "$log_filepath" 2>&1 &
    
    local bg_pid=$!
    BACKGROUND_PIDS+=("$bg_pid")
    PROCESS_STATUS["$bg_pid"]="uploading"
    PROCESS_CONFIG["$bg_pid"]="upload:$tuple"
    PROCESS_START_TIME["$bg_pid"]=$(date +%s)
    
    log_info "Started upload process PID: $bg_pid for $tuple"
    return 0
}

# Execute Docker command in background with logging
execute_analysis_background() {
    local width="$1"
    local tuple="$2"
    local url="$3"
    local log_filename="$4"
    local log_filepath="$LOG_DIR/$log_filename"
    
    # Check if analysis already exists and upload is enabled
    if [[ $ENABLE_UPLOAD == true ]] && check_analysis_exists "$tuple"; then
        log_info "Analysis already exists for $tuple, skipping to upload"
        wait_for_job_slot  # Wait for available slot before starting upload
        execute_upload_background "$tuple"
        return 0
    fi
    
    log_info "Starting analysis: $tuple"
    
    # Execute in background and capture PID
    (
        echo "=== Starting analysis at $(date) ==="
        echo "Width: $width"
        echo "Tuple: $tuple"
        echo "URL: $url"
        echo "=================================="
        echo ""
        
        # Execute the Docker command with timeout
        timeout $PROCESS_TIMEOUT docker run --rm -v $OUTPUT_DIR:/app/output "$DOCKER_IMAGE" analyze "$url" "$tuple" --screen-width "$width" 2>&1
        local exit_code=$?
        
        echo ""
        echo "=== Analysis completed at $(date) ==="
        echo "Exit code: $exit_code"
        
        exit $exit_code
    ) > "$log_filepath" 2>&1 &
    
    local bg_pid=$!
    BACKGROUND_PIDS+=("$bg_pid")
    PROCESS_STATUS["$bg_pid"]="running"
    PROCESS_CONFIG["$bg_pid"]="$tuple"
    PROCESS_START_TIME["$bg_pid"]=$(date +%s)
    ((TOTAL_PROCESSES++))
    
    log_info "Started process PID: $bg_pid for $tuple"
    return 0
}

# Wait for a job slot to become available
wait_for_job_slot() {
    while [[ ${#BACKGROUND_PIDS[@]} -ge $MAX_CONCURRENT_JOBS ]]; do
        log_info "At maximum concurrent jobs ($MAX_CONCURRENT_JOBS), waiting..."
        
        # Check for completed jobs
        local new_pids=()
        for pid in "${BACKGROUND_PIDS[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                new_pids+=("$pid")
            else
                # Process completed
                wait "$pid"
                local exit_code=$?
                
                # Check if this was an upload or analysis process
                local config="${PROCESS_CONFIG[$pid]}"
                if [[ "$config" == upload:* ]]; then
                    # Upload process
                    if [[ $exit_code -eq 0 ]]; then
                        ((UPLOADED_PROCESSES++))
                        PROCESS_STATUS["$pid"]="upload_success"
                        log_success "Upload process $pid completed successfully (${config#upload:})"
                    else
                        ((UPLOAD_FAILED_PROCESSES++))
                        PROCESS_STATUS["$pid"]="upload_failed"
                        log_error "Upload process $pid failed with exit code $exit_code (${config#upload:})"
                    fi
                else
                    # Analysis process
                    ((COMPLETED_PROCESSES++))
                    
                    if [[ $exit_code -eq 0 ]]; then
                        ((SUCCESSFUL_PROCESSES++))
                        PROCESS_STATUS["$pid"]="success"
                        log_success "Process $pid completed successfully ($config)"
                        
                        # Trigger upload if enabled and analysis succeeded
                        if [[ $ENABLE_UPLOAD == true ]]; then
                            local tuple="$config"
                            if check_analysis_exists "$tuple"; then
                                log_info "Triggering upload for successful analysis: $tuple"
                                execute_upload_background "$tuple"
                            else
                                log_warn "Analysis succeeded but analysis.json not found for $tuple"
                            fi
                        fi
                    else
                        ((FAILED_PROCESSES++))
                        PROCESS_STATUS["$pid"]="failed"
                        log_error "Process $pid failed with exit code $exit_code ($config)"
                    fi
                fi
            fi
        done
        
        BACKGROUND_PIDS=("${new_pids[@]}")
        
        if [[ ${#BACKGROUND_PIDS[@]} -ge $MAX_CONCURRENT_JOBS ]]; then
            sleep 2
        fi
    done
}

# Wait for all remaining processes to complete
wait_for_all_processes() {
    if [[ ${#BACKGROUND_PIDS[@]} -eq 0 ]]; then
        log_info "No remaining processes to wait for"
        return
    fi
    
    log_info "Waiting for ${#BACKGROUND_PIDS[@]} remaining process(es) to complete..."
    
    for pid in "${BACKGROUND_PIDS[@]}"; do
        log_info "Waiting for PID $pid (${PROCESS_CONFIG[$pid]})..."
        wait "$pid" 2>/dev/null
        local exit_code=$?
        
        # Check if this was an upload or analysis process
        local config="${PROCESS_CONFIG[$pid]}"
        if [[ "$config" == upload:* ]]; then
            # Upload process
            if [[ $exit_code -eq 0 ]]; then
                ((UPLOADED_PROCESSES++))
                PROCESS_STATUS["$pid"]="upload_success"
                log_success "Upload process $pid completed successfully (${config#upload:})"
            else
                ((UPLOAD_FAILED_PROCESSES++))
                PROCESS_STATUS["$pid"]="upload_failed"
                log_error "Upload process $pid failed with exit code $exit_code (${config#upload:})"
            fi
        else
            # Analysis process
            ((COMPLETED_PROCESSES++))
            
            if [[ $exit_code -eq 0 ]]; then
                ((SUCCESSFUL_PROCESSES++))
                PROCESS_STATUS["$pid"]="success"
                log_success "Process $pid completed successfully ($config)"
                
                # Trigger upload if enabled and analysis succeeded
                if [[ $ENABLE_UPLOAD == true ]]; then
                    local tuple="$config"
                    if check_analysis_exists "$tuple"; then
                        log_info "Triggering upload for successful analysis: $tuple"
                        execute_upload_background "$tuple"
                        # Wait for the upload to complete since we're in final cleanup
                        wait $!
                        local upload_exit=$?
                        if [[ $upload_exit -eq 0 ]]; then
                            ((UPLOADED_PROCESSES++))
                            log_success "Upload completed for $tuple"
                        else
                            ((UPLOAD_FAILED_PROCESSES++))
                            log_error "Upload failed for $tuple"
                        fi
                    else
                        log_warn "Analysis succeeded but analysis.json not found for $tuple"
                    fi
                fi
            elif [[ $exit_code -eq 124 ]]; then
                ((FAILED_PROCESSES++))
                PROCESS_STATUS["$pid"]="timeout"
                log_warn "Process $pid timed out after ${PROCESS_TIMEOUT}s ($config)"
            else
                ((FAILED_PROCESSES++))
                PROCESS_STATUS["$pid"]="failed"
                log_error "Process $pid failed with exit code $exit_code ($config)"
            fi
        fi
    done
    
    log_info "All processes completed"
}

# Generate summary report
generate_summary_report() {
    local summary_file="$LOG_DIR/batch-summary-$(date +%Y%m%d-%H%M%S).txt"
    local end_time=$(date +%s)
    local total_time=$((end_time - START_TIME))
    local minutes=$((total_time / 60))
    local seconds=$((total_time % 60))
    
    {
        echo "===== BATCH ANALYSIS EXECUTION SUMMARY ====="
        echo "Date: $(date)"
        echo "Input file: $INPUT_FILE"
        echo ""
        echo "STATISTICS:"
        echo "  Total processes started: $TOTAL_PROCESSES"
        echo "  Completed processes: $COMPLETED_PROCESSES"
        echo "  Successful: $SUCCESSFUL_PROCESSES"
        echo "  Failed: $FAILED_PROCESSES"
        
        if [[ $ENABLE_UPLOAD == true ]]; then
            echo "  Uploaded: $UPLOADED_PROCESSES"
            echo "  Upload failed: $UPLOAD_FAILED_PROCESSES"
        fi
        
        local success_rate=0
        if [[ $TOTAL_PROCESSES -gt 0 ]]; then
            success_rate=$((SUCCESSFUL_PROCESSES * 100 / TOTAL_PROCESSES))
        fi
        
        echo "  Success rate: ${success_rate}%"
        echo "  Total execution time: ${minutes}m ${seconds}s"
        
        if [[ $ENABLE_METRICS == true && $COMPLETED_PROCESSES -gt 0 ]]; then
            local avg_time=$((total_time / COMPLETED_PROCESSES))
            echo "  Average time per analysis: ${avg_time}s"
        fi
        
        echo ""
        echo "CONFIGURATION:"
        echo "  Max concurrent jobs: $MAX_CONCURRENT_JOBS"
        echo "  Process timeout: ${PROCESS_TIMEOUT}s"
        echo "  Compression enabled: $ENABLE_COMPRESSION"
        echo "  Metrics enabled: $ENABLE_METRICS"
        echo "  Upload enabled: $ENABLE_UPLOAD"
        echo ""
        echo "OUTPUTS:"
        echo "  Log files: $LOG_DIR/"
        echo "  Output files: $OUTPUT_DIR/"
        echo ""
        
        echo "PROCESS DETAILS:"
        for pid in "${!PROCESS_STATUS[@]}"; do
            local config="${PROCESS_CONFIG[$pid]}"
            local status="${PROCESS_STATUS[$pid]}"
            if [[ "$config" == upload:* ]]; then
                echo "  PID $pid: [UPLOAD] ${config#upload:} - $status"
            else
                echo "  PID $pid: [ANALYZE] $config - $status"
            fi
        done
        
        if [[ $FAILED_PROCESSES -gt 0 ]]; then
            echo ""
            echo "FAILED ANALYSES:"
            for pid in "${!PROCESS_STATUS[@]}"; do
                if [[ "${PROCESS_STATUS[$pid]}" == "failed" || "${PROCESS_STATUS[$pid]}" == "timeout" ]]; then
                    echo "  - ${PROCESS_CONFIG[$pid]} (PID: $pid) - ${PROCESS_STATUS[$pid]}"
                fi
            done
        fi
        
        echo ""
        echo "===== END OF SUMMARY ====="
    } | tee "$summary_file"
    
    log_info "Summary report saved to: $summary_file"
    
    # Compress logs if enabled
    if [[ $ENABLE_COMPRESSION == true ]]; then
        compress_logs
    fi
}

# Compress log files
compress_logs() {
    log_info "Compressing log files..."
    local compressed_count=0
    
    for log_file in "$LOG_DIR"/*.log; do
        if [[ -f "$log_file" ]]; then
            gzip -9 "$log_file"
            ((compressed_count++))
        fi
    done
    
    log_success "Compressed $compressed_count log files"
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -j|--jobs)
                MAX_CONCURRENT_JOBS="$2"
                shift 2
                ;;
            -t|--timeout)
                PROCESS_TIMEOUT="$2"
                shift 2
                ;;
            -c|--compress)
                ENABLE_COMPRESSION=true
                shift
                ;;
            -m|--metrics)
                ENABLE_METRICS=true
                shift
                ;;
            -u|--upload)
                ENABLE_UPLOAD=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                INPUT_FILE="$1"
                shift
                ;;
        esac
    done
}

# Main function
main() {
    log_info "Starting $SCRIPT_NAME"
    
    # Parse arguments
    parse_arguments "$@"
    
    # Check that input file was provided
    if [[ -z "$INPUT_FILE" ]]; then
        log_error "No input file provided"
        show_usage
        exit 1
    fi
    
    # Check if input file exists
    if [[ ! -f "$INPUT_FILE" ]]; then
        log_error "Input file not found: $INPUT_FILE"
        exit 1
    fi
    
    # Setup
    setup_directories
    check_docker_image
    
    # Check for firestore.json if upload is enabled
    if [[ $ENABLE_UPLOAD == true ]]; then
        if [[ ! -f ~/firestore.json ]]; then
            log_error "Upload enabled but ~/firestore.json not found"
            log_error "Please ensure ~/firestore.json exists or disable upload with -u flag"
            exit 1
        fi
        log_info "Upload enabled - firestore.json found"
    fi
    
    # Parse input file
    log_info "Parsing input file: $INPUT_FILE"
    
    local line_num=0
    local valid_lines=0
    local configurations=()
    
    while IFS= read -r line; do
        ((line_num++))
        
        # Skip empty lines and comments
        if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
            continue
        fi
        
        if result=$(parse_line "$line" "$line_num"); then
            ((valid_lines++))
            configurations+=("$result")
            log_info "Line $line_num: valid configuration"
        else
            log_warn "Line $line_num: skipped due to error"
        fi
    done < "$INPUT_FILE"
    
    if [[ $valid_lines -eq 0 ]]; then
        log_error "No valid configurations found"
        exit 1
    fi
    
    log_success "Found $valid_lines valid configuration(s)"
    
    # Execute analyses in parallel
    log_info "Starting parallel execution (max concurrent: $MAX_CONCURRENT_JOBS)"
    
    local count=0
    for config in "${configurations[@]}"; do
        ((count++))
        IFS='|' read -r width tuple url <<< "$config"
        local log_filename=$(convert_tuple_to_filename "$tuple")
        
        # Wait for available job slot
        wait_for_job_slot
        
        # Execute analysis in background
        execute_analysis_background "$width" "$tuple" "$url" "$log_filename"
    done
    
    # Wait for all processes to complete
    wait_for_all_processes
    
    # Generate summary report
    generate_summary_report
    
    log_success "Batch analysis complete!"
}

# Handle script interruption
cleanup() {
    log_warn "Script interrupted, cleaning up..."
    
    if [[ ${#BACKGROUND_PIDS[@]} -gt 0 ]]; then
        log_info "Terminating ${#BACKGROUND_PIDS[@]} background process(es)..."
        
        for pid in "${BACKGROUND_PIDS[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                kill -TERM "$pid" 2>/dev/null || true
            fi
        done
        
        sleep 2
        
        for pid in "${BACKGROUND_PIDS[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                kill -KILL "$pid" 2>/dev/null || true
            fi
        done
    fi
    
    generate_summary_report
    exit 130
}

# Set up signal handlers
trap cleanup INT TERM

# Execute main function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi