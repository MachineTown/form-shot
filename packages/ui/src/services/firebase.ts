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

// Connect to emulators if in development
// Note: Emulator connection is disabled for now to avoid connection issues
// Uncomment the following code to enable emulator support:
/*
if (import.meta.env.DEV && !window.location.hostname.includes('localhost')) {
  // Only connect if not already connected
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
  } catch (error) {
    // Emulators might already be connected
    console.log('Emulators already connected or not available');
  }
}
*/

// Helper function to check if user is authenticated
export const isAuthenticated = () => {
  return auth.currentUser !== null;
};

// Helper function to get current user
export const getCurrentUser = () => {
  return auth.currentUser;
};

export default app;