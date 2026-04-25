import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '../services/auth';
import { getAllGuestSolves, removeGuestSolves } from '../services/guestStorage';
import api from '../services/api';

interface AuthContextValue {
  session: Session | null;
  isGuest: boolean;
  showSignIn: () => void;
  hideSignIn: () => void;
  signInVisible: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }): ReactElement => {
  const [session, setSession] = useState<Session | null>(null);
  const [signInVisible, setSignInVisible] = useState(false);
  const migratingRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, next) => {
      if (event === 'SIGNED_IN' && !migratingRef.current) {
        migratingRef.current = true;
        try {
          const guestSolves = getAllGuestSolves();
          if (guestSolves.length > 0) {
            const { migrated, failed } = await api.migrateSolves(guestSolves);
            removeGuestSolves(migrated);
            if (failed.length > 0) {
              toast.error(
                `${failed.length} solve(s) could not be synced and remain in local storage.`,
                { duration: 8000 },
              );
            }
          }
        } finally {
          migratingRef.current = false;
        }
      }
      setSession(next);
      setSignInVisible(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    isGuest: !session,
    showSignIn: () => setSignInVisible(true),
    hideSignIn: () => setSignInVisible(false),
    signInVisible,
  }), [session, signInVisible]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const useOptionalAuth = (): AuthContextValue | null => {
  return useContext(AuthContext);
};
