import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/auth';
import { getAllGuestSolves, clearAllGuestSolves } from '../services/guestStorage';
import api from '../services/api';

interface AuthContextValue {
  session: Session | null;
  isGuest: boolean;
  showSignIn: () => void;
  hideSignIn: () => void;
  signInVisible: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }): React.ReactElement => {
  const [session, setSession] = useState<Session | null>(null);
  const [signInVisible, setSignInVisible] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, next) => {
      if (event === 'SIGNED_IN') {
        const guestSolves = getAllGuestSolves();
        if (guestSolves.length > 0) {
          await api.migrateSolves(guestSolves);
          clearAllGuestSolves();
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
