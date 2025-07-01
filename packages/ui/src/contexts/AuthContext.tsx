import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { collection, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { callHelloworld } from '../services/functions';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkDomainAllowed = async (email: string): Promise<boolean> => {
    // In development with emulators, allow any domain for easier testing
    const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';
    if (useEmulators && import.meta.env.DEV) {
      console.log('🔧 Development mode: allowing all domains for emulator testing');
      return true;
    }
    
    const domain = email.split('@')[1];
    try {
      const domainDoc = await getDoc(doc(db, 'allowed-domains', domain));
      return domainDoc.exists() && domainDoc.data()?.enabled === true;
    } catch (err) {
      console.error('Error checking domain:', err);
      return false;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && user.email) {
        // Check if the user's domain is allowed
        const isAllowed = await checkDomainAllowed(user.email);
        if (!isAllowed) {
          // Sign out user if domain is not allowed
          await signOut(auth);
          setError(`Access denied. Your email domain is not authorized to use this application.`);
          setUser(null);
        } else {
          setUser(user);
          setError(null);
          
          // Call helloworld function after successful authentication
          try {
            await callHelloworld();
          } catch (funcError) {
            console.warn('Failed to call helloworld function:', funcError);
            // Don't set auth error for function call failures
          }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Check if the user's domain is allowed
      if (result.user.email) {
        const isAllowed = await checkDomainAllowed(result.user.email);
        if (!isAllowed) {
          // Sign out immediately if domain is not allowed
          await signOut(auth);
          const domain = result.user.email.split('@')[1];
          setError(`Access denied. The domain '${domain}' is not authorized to use this application.`);
          throw new Error('Domain not authorized');
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message !== 'Domain not authorized') {
        setError(err.message);
      }
      throw err;
    }
  };

  const logout = async () => {
    setError(null);
    try {
      await signOut(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during sign out');
      throw err;
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    error,
    signInWithGoogle,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};