# Firebase Emulator Setup and Usage

This document explains how to set up and use Firebase emulators for local development and testing with Form-Shot.

## Overview

The Firebase emulators allow you to run Firebase services locally for development and testing without affecting your production data. Form-Shot supports the following emulated services:

- **Firestore** (port 8080) - Document database for storing analyses and test cases
- **Storage** (port 9199) - File storage for screenshots and images  
- **Auth** (port 9099) - Authentication service
- **Emulator UI** (port 4000) - Web interface to manage emulated data

## Prerequisites

- Firebase CLI installed (`firebase --version` should show 14.8.0 or later)
- Service account JSON file at `~/firestore.json`
- Docker and Docker Compose (for containerized workflows)

## Quick Start

### 1. Start the Emulators

```bash
# Start emulators with persistent data storage
pnpm emulator:start
```

This will:
- Start all Firebase emulators (Firestore, Storage, Auth, UI)
- Import any existing data from `./emulator-data/`
- Export data to `./emulator-data/` when stopped (Ctrl+C)
- Open the Emulator UI at http://localhost:4000

### 2. Provision Base Data

In a new terminal (keep emulators running):

```bash
# Set up initial data (allowed domains for authentication)
pnpm emulator:provision
```

This creates the `allowed-domains` collection with:
- `castoredc.com` (production domain)
- `gmail.com` (for testing)

### 3. Use Form-Shot with Emulators

All Form-Shot commands support a `--local` flag to use emulators instead of production:

```bash
# Analyze a survey form
docker run --rm -v ./output:/app/output form-shot-runtime \
  analyze https://cvsclinicalstudies.castoredc.com/survey/WVY74GGC \
  CVS,Lyme,Attrition-Survey,en,v99

# Upload to local emulator (note --network host for Docker)
docker run --rm \
  -v ./output:/app/output \
  -v ~/firestore.json:/app/firestore.json \
  --network host \
  form-shot-runtime upload \
  /app/output/CVS/Lyme/Attrition-Survey/en/v99/analysis.json \
  --local

# Query data from local emulator
docker run --rm \
  -v ~/firestore.json:/app/firestore.json \
  --network host \
  form-shot-runtime query --customer CVS --local
```

## Detailed Commands

### Starting Emulators

```bash
# Method 1: Using pnpm script (recommended)
pnpm emulator:start

# Method 2: Direct Firebase CLI
firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data
```

### Provisioning Data

```bash
# Set up base data for new emulator instance
pnpm emulator:provision

# Or run the provision script directly
cd scripts && pnpm install && pnpm provision-emulator
```

### Using --local Flag

The `--local` flag is available on these commands:

#### Upload Command
```bash
# Upload analysis to local emulator
docker run --rm \
  -v ./output:/app/output \
  -v ~/firestore.json:/app/firestore.json \
  --network host \
  form-shot-runtime upload <analysis-json-path> --local

# Examples:
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json --network host \
  form-shot-runtime upload /app/output/CVS/Lyme/Attrition-Survey/en/v99/analysis.json --local

# Keep local files after upload
docker run --rm -v ./output:/app/output -v ~/firestore.json:/app/firestore.json --network host \
  form-shot-runtime upload /app/output/CVS/Lyme/Attrition-Survey/en/v99/analysis.json --local --leave
```

#### Query Command
```bash
# Query analyses from local emulator
docker run --rm -v ~/firestore.json:/app/firestore.json --network host \
  form-shot-runtime query --local

# Filter by customer
docker run --rm -v ~/firestore.json:/app/firestore.json --network host \
  form-shot-runtime query --customer CVS --local

# Filter by study and limit results
docker run --rm -v ~/firestore.json:/app/firestore.json --network host \
  form-shot-runtime query --customer CVS --study Lyme --limit 5 --local
```

## Complete Workflow Example

Here's a complete example of analyzing a survey and uploading to the local emulator:

```bash
# 1. Start emulators (in terminal 1)
pnpm emulator:start

# 2. Provision base data (in terminal 2)
pnpm emulator:provision

# 3. Analyze a survey form
docker run --rm -v ./output:/app/output form-shot-runtime \
  analyze https://cvsclinicalstudies.castoredc.com/survey/WVY74GGC \
  CVS,Lyme,Attrition-Survey,en,v99

# 4. Upload to local emulator
docker run --rm \
  -v ./output:/app/output \
  -v ~/firestore.json:/app/firestore.json \
  --network host \
  form-shot-runtime upload \
  /app/output/CVS/Lyme/Attrition-Survey/en/v99/analysis.json \
  --local

# 5. Verify the data
docker run --rm \
  -v ~/firestore.json:/app/firestore.json \
  --network host \
  form-shot-runtime query --customer CVS --local

# 6. View in Emulator UI
# Open http://localhost:4000 in your browser
```

## Emulator UI

The Firebase Emulator UI provides a web interface to:

- Browse Firestore collections and documents
- View Storage bucket contents
- Manage Auth users
- Monitor emulator logs

Access it at: **http://localhost:4000**

### Key Features:
- **Firestore tab**: Browse analyses, test-cases, and allowed-domains collections
- **Storage tab**: View uploaded screenshots and form images
- **Auth tab**: Manage test user accounts
- **Logs tab**: View real-time emulator activity

## Data Persistence

The emulators are configured for data persistence:

- **Data Storage**: `./emulator-data/` directory
- **Import on Start**: Automatically loads existing data when emulators start
- **Export on Exit**: Saves all data when emulators stop (Ctrl+C)
- **Git Ignored**: The `emulator-data/` directory is excluded from version control

### Managing Emulator Data

```bash
# Start fresh (delete all emulator data)
rm -rf ./emulator-data/

# Backup emulator data
cp -r ./emulator-data/ ./emulator-data-backup/

# Restore from backup
cp -r ./emulator-data-backup/ ./emulator-data/
```

## Docker Networking

When using Docker with emulators, use `--network host` to allow containers to access host services:

```bash
# ✅ Correct - uses host network
docker run --network host form-shot-runtime upload <path> --local

# ❌ Incorrect - container cannot reach localhost emulators
docker run form-shot-runtime upload <path> --local
```

## Configuration

### Emulator Ports

| Service | Port | Purpose |
|---------|------|---------|
| Firestore | 8080 | Document database |
| Storage | 9199 | File storage |
| Auth | 9099 | Authentication |
| UI | 4000 | Web interface |

### Service Account

The emulators require a service account JSON file at `~/firestore.json`. This file should contain:

```json
{
  "type": "service_account",
  "project_id": "castor-form-shot",
  "private_key_id": "...",
  "private_key": "...",
  "client_email": "...",
  "client_id": "...",
  "auth_uri": "...",
  "token_uri": "...",
  "auth_provider_x509_cert_url": "...",
  "client_x509_cert_url": "..."
}
```

## Troubleshooting

### Common Issues

1. **"Connection refused" errors**
   ```bash
   # Check if emulators are running
   curl http://localhost:8080  # Should return "Ok"
   curl http://localhost:4000  # Should return HTML
   ```

2. **"Service account not found"**
   ```bash
   # Verify service account file exists
   ls -la ~/firestore.json
   ```

3. **Docker cannot connect to emulators**
   ```bash
   # Use --network host flag
   docker run --network host ...
   ```

4. **Permission denied errors**
   ```bash
   # Check Firestore rules - they're designed to block unauthorized access
   # Use the --local flag with proper service account authentication
   ```

### Logs and Debugging

- **Emulator Logs**: Check the terminal where `pnpm emulator:start` is running
- **Firebase UI Logs**: Visit http://localhost:4000 → Logs tab
- **Form-Shot Logs**: Docker containers show detailed logging with timestamps

## Development Tips

1. **Use Separate Terminals**: Keep emulators running in one terminal, run commands in another
2. **Provision After Fresh Start**: Always run `pnpm emulator:provision` after clearing emulator data
3. **Backup Important Data**: Copy `./emulator-data/` before making major changes
4. **Monitor the UI**: Keep http://localhost:4000 open to watch data changes in real-time
5. **Test Incrementally**: Upload small datasets first to verify everything works

## Production vs Emulator

| Aspect | Production | Emulator |
|--------|------------|----------|
| Data Persistence | Permanent | Local files |
| Authentication | Real Google accounts | Mock auth |
| Storage URLs | Public Firebase Storage | Local emulator URLs |
| Security Rules | Enforced | Enforced (same rules) |
| Performance | Cloud latency | Local (fast) |
| Costs | Pay per use | Free |

Use emulators for:
- ✅ Development and testing
- ✅ Experimenting with new features  
- ✅ Training and demos
- ✅ CI/CD pipelines

Use production for:
- ✅ Live data collection
- ✅ Production deployments
- ✅ Permanent data storage