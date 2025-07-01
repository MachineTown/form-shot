#!/bin/bash

# Create emulator data directory if it doesn't exist
EMULATOR_DATA_DIR="./emulator-data"
mkdir -p "$EMULATOR_DATA_DIR"

echo "Starting Firebase emulators with data persistence..."
echo "Data will be saved to: $EMULATOR_DATA_DIR"

# Start emulators with import/export functionality
firebase emulators:start \
  --import="$EMULATOR_DATA_DIR" \
  --export-on-exit="$EMULATOR_DATA_DIR"