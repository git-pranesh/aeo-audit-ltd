import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { userDb, type UserDocument } from '@/lib/firestore-utils';

interface AuthContextType {
  user: User | null;
  userDoc: UserDocument | null;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userDoc: null,
  loading: true,
  isAuthenticated: false
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [userDoc, setUserDoc] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);

  // Function to refresh user doc - can be called after sign-in
  const refreshUserDoc = async (userId: string) => {
    try {
      const userDocument = await userDb.getUser(userId);
      setUserDoc(userDocument);
      return userDocument;
    } catch (error) {
      console.error('Error fetching user document:', error);
      return null;
    }
  };

  useEffect(() => {
    // Simple auth state listener - popup handles everything directly
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('🔄 Auth state:', firebaseUser?.email || 'No user');
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Try to get user doc, with retry for newly created users
        let userDocument = await refreshUserDoc(firebaseUser.uid);
        
        // If doc not found, wait a bit and retry (for newly signed up users)
        if (!userDocument) {
          console.log('⏳ User doc not found, retrying in 500ms...');
          await new Promise(resolve => setTimeout(resolve, 500));
          userDocument = await refreshUserDoc(firebaseUser.uid);
        }
        
        if (!userDocument) {
          console.log('⏳ Still not found, retrying in 1s...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          await refreshUserDoc(firebaseUser.uid);
        }
      } else {
        setUserDoc(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value: AuthContextType = {
    user,
    userDoc,
    loading,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
