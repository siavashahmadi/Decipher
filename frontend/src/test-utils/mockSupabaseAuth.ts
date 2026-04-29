import { vi, type Mock } from 'vitest';
import type { Session } from '@supabase/supabase-js';

export interface MockSupabaseAuthHandle {
  getSession: Mock;
  onAuthStateChange: Mock;
  unsubscribe: Mock;
  fireAuthEvent: (event: string, session: Session | null) => Promise<void>;
}

// Build the standard `vi.mock('../services/auth', ...)` factory used by tests
// that exercise `AuthContext` (or any consumer that calls `getSession` /
// `onAuthStateChange`). Returns a handle whose `fireAuthEvent` triggers the
// callback registered by the consumer, plus the spies for the two methods.
export const createMockSupabaseAuth = (
  initialSession: Session | null = null,
): MockSupabaseAuthHandle => {
  let listener: ((event: string, session: Session | null) => void | Promise<void>) | null = null;
  const unsubscribe = vi.fn();
  const getSession = vi.fn().mockResolvedValue({ data: { session: initialSession } });
  const onAuthStateChange = vi.fn((cb: (event: string, session: Session | null) => void | Promise<void>) => {
    listener = cb;
    return { data: { subscription: { unsubscribe } } };
  });

  const fireAuthEvent = async (event: string, session: Session | null): Promise<void> => {
    if (!listener) throw new Error('mockSupabaseAuth: no listener registered yet');
    await listener(event, session);
  };

  return { getSession, onAuthStateChange, unsubscribe, fireAuthEvent };
};

// Convenience used by simpler tests that just need the providers to settle on
// the unauthenticated state without driving any subsequent events.
export const mockSupabaseAuthQuiet = (
  initialSession: Session | null = null,
): { supabase: { auth: { getSession: Mock; onAuthStateChange: Mock } }; supabaseConfigMissing: false } => {
  const { getSession, onAuthStateChange } = createMockSupabaseAuth(initialSession);
  return {
    supabase: { auth: { getSession, onAuthStateChange } },
    supabaseConfigMissing: false,
  };
};
