import { httpsCallable } from 'firebase/functions';
import { functions, auth } from './firebase';

export interface HelloworldResponse {
  message: string;
  timestamp: string;
  user: {
    uid: string;
    email: string;
    emailVerified: boolean;
  } | null;
  requestId: string;
  processingTime: number;
}

export const callHelloworld = async (): Promise<HelloworldResponse> => {
  try {
    // Get the current user's ID token if authenticated
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated to call functions');
    }

    const idToken = await currentUser.getIdToken();
    
    // Make HTTP request to the function
    const baseUrl = import.meta.env.VITE_USE_EMULATORS === 'true' 
      ? 'http://localhost:5001/castor-form-shot/us-central1'
      : 'https://us-central1-castor-form-shot.cloudfunctions.net';
    
    const response = await fetch(`${baseUrl}/helloworld`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Log success to console
    console.log('✅ Helloworld function called successfully:', {
      authenticated: !!data.user,
      user: data.user?.email,
      processingTime: data.processingTime,
      requestId: data.requestId,
      timestamp: data.timestamp
    });

    return data;
  } catch (error) {
    // Log failure to console
    console.error('❌ Helloworld function call failed:', {
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
    
    throw error;
  }
};