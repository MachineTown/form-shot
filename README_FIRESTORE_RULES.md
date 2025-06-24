# Firestore Security Rules Update

The UI is not pulling data from Firestore because the security rules are blocking read access.

## Quick Fix for Development

### Option 1: Manual Update via Firebase Console

1. Go to the [Firebase Console](https://console.firebase.google.com)
2. Select your project: **castor-form-shot**
3. Navigate to Firestore Database → Rules
4. Replace the existing rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read access to all documents for development
    // WARNING: This is for development only. Implement proper authentication for production.
    match /{document=**} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

5. Click "Publish"

### Option 2: Deploy via Firebase CLI

Firebase configuration files have been created:
- `.firebaserc` - Sets the default project to castor-form-shot
- `firebase.json` - Configures Firestore rules location
- `firestore.rules` - Contains the security rules

To deploy:
1. Install firebase-tools globally: `npm install -g firebase-tools`
2. Authenticate: `firebase login`
3. Deploy rules: `firebase deploy --only firestore:rules`

## Production Solution

For production, implement authentication in the UI and use these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```