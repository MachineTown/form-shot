import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

// Firebase configuration
// NOTE: In production, these should be environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Connect to emulators if in development and using local mode
const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

if (useEmulators && import.meta.env.DEV) {
  try {
    // Connect to Firebase emulators running on localhost
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
    
    console.log('🔧 Connected to Firebase emulators:');
    console.log('  - Auth: http://localhost:9099');
    console.log('  - Firestore: localhost:8080');
    console.log('  - Storage: localhost:9199');
    console.log('  - UI: http://localhost:4000');
  } catch (error) {
    console.warn('⚠️ Could not connect to emulators:', error);
    console.log('Make sure emulators are running: pnpm emulator:start');
  }
} else if (import.meta.env.DEV) {
  console.log('☁️ Using production Firebase services');
}

// Helper function to check if user is authenticated
export const isAuthenticated = () => {
  return auth.currentUser !== null;
};

// Helper function to get current user
export const getCurrentUser = () => {
  return auth.currentUser;
};

export default app;