import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from './auth';

// H.4: small adapter over Supabase's auth client. Every consumer of
// `supabase.auth.*` should go through this interface so the SDK seam is one
// file. This both shrinks the test mock surface (one fake instead of N
// scattered calls) and decouples the rest of the app from supabase-js so a
// future migration (e.g. PKCE + httpOnly cookie via @supabase/ssr, see
// docs/decisions/2026-04-26-token-storage.md) only touches this module.
export interface AuthClient {
  getAccessToken(): Promise<string | null>;
  getSession(): Promise<Session | null>;
  onAuthStateChange(
    cb: (event: AuthChangeEvent, session: Session | null) => void | Promise<void>,
  ): () => void;
  signInWithPassword(email: string, password: string): Promise<{ error: string | null }>;
  signUp(email: string, password: string): Promise<{ error: string | null }>;
  resetPasswordForEmail(email: string, redirectTo: string): Promise<{ error: string | null }>;
  updatePassword(newPassword: string): Promise<{ error: string | null }>;
  signOut(): Promise<{ error: string | null }>;
}

export const supabaseAuthClient: AuthClient = {
  async getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  },
  onAuthStateChange(cb) {
    const result = supabase.auth.onAuthStateChange(cb);
    return () => result.data.subscription.unsubscribe();
  },
  async signInWithPassword(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  },
  async signUp(email, password) {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  },
  async resetPasswordForEmail(email, redirectTo) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return { error: error?.message ?? null };
  },
  async updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  },
  async signOut() {
    const { error } = await supabase.auth.signOut();
    return { error: error?.message ?? null };
  },
};
