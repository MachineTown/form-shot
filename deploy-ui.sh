#!/bin/bash

# Deploy UI with all Firebase services (hosting, firestore rules, storage rules)
# This script ensures all security rules are deployed along with the UI

echo "🚀 Starting Form-Shot UI deployment..."

# Build the UI
echo "📦 Building UI..."
pnpm ui:build

# Deploy all Firebase services
echo "☁️  Deploying to Firebase..."
echo "  - Hosting (UI)"
echo "  - Firestore security rules"
echo "  - Storage security rules"

firebase deploy --only hosting,firestore,storage

echo "✅ Deployment complete!"
echo ""
echo "📌 Deployed services:"
echo "  - UI: https://castor-form-shot.web.app"
echo "  - Firestore rules: Updated to require authentication"
echo "  - Storage rules: Updated to require authentication"
echo ""
echo "⚠️  Note: Ensure Google authentication is enabled in Firebase Console"