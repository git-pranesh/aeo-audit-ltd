import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { trackGa, trackMeta } from "@/lib/meta-pixel";
import { auth } from "@/lib/firebase";
import { api } from "@/lib/queryClient";
import type { MeResponse } from "@shared/api";

interface AuthContextType {
  user: User | null;
  me: MeResponse | null;
  loading: boolean;
  isAuthenticated: boolean;
  refreshMe: () => Promise<MeResponse | null>;
  setMe: (me: MeResponse) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    if (!auth.currentUser) {
      setMe(null);
      return null;
    }
    try {
      const data = await api<MeResponse>("GET", "/api/me");
      // Only the response that created the account carries this id (shared with the server event).
      if (data.metaRegistrationEventId) {
        trackMeta("CompleteRegistration", {}, data.metaRegistrationEventId);
        trackGa("sign_up");
      }
      setMe(data);
      return data;
    } catch (err) {
      console.error("Failed to load account:", err);
      return null;
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await refreshMe();
      }
      else setMe(null);
      setLoading(false);
    });
  }, [refreshMe]);

  return (
    <AuthContext.Provider value={{ user, me, loading, isAuthenticated: !!user, refreshMe, setMe }}>
      {children}
    </AuthContext.Provider>
  );
}
