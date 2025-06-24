# Form-Shot UI

React-based web interface for the Form-Shot survey analysis tool.

## Development

```bash
# Start development server
pnpm ui:dev

# Build for production
pnpm ui:build

# Preview production build locally
pnpm --filter @form-shot/ui preview
```

## Deployment to Firebase Hosting

### Prerequisites

1. Firebase CLI installed globally: `npm install -g firebase-tools`
2. Authenticated with Firebase: `firebase login`
3. Firebase project configured (already set up in `.firebaserc`)

### Deploy to Production

```bash
# From root directory
pnpm ui:deploy

# Or from packages/ui directory
pnpm deploy:prod
```

This will:
1. Build the production bundle
2. Deploy to Firebase Hosting at https://castor-form-shot.web.app

### Deploy Preview Channel

For testing before production deployment:

```bash
# From root directory
pnpm ui:deploy:preview

# Or from packages/ui directory
pnpm deploy:preview
```

This creates a preview channel URL (e.g., https://castor-form-shot--preview-xxxxx.web.app)

## Environment Variables

The UI uses Vite environment variables defined in `.env`:

- `VITE_FIREBASE_API_KEY` - Firebase API key
- `VITE_FIREBASE_AUTH_DOMAIN` - Firebase auth domain
- `VITE_FIREBASE_PROJECT_ID` - Firebase project ID
- `VITE_FIREBASE_STORAGE_BUCKET` - Firebase storage bucket
- `VITE_FIREBASE_MESSAGING_SENDER_ID` - Firebase messaging sender ID
- `VITE_FIREBASE_APP_ID` - Firebase app ID

## Build Output

Production builds are output to `packages/ui/dist/` directory.