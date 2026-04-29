import { describe, it, expect, vi, beforeEach } from 'vitest';

// Each test installs its own mock for ./auth.supabase, then dynamically
// imports authClient so it picks up the mock on a fresh module evaluation.
// This isolates the test from any other file that has already imported
// authClient with a different mock state.
beforeEach(() => {
  vi.resetModules();
});

describe('supabaseAuthClient.getAccessToken', () => {
  it('returns the access token when a session exists', async () => {
    vi.doMock('./auth', () => ({
      supabase: {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: { access_token: 'tok-abc', user: { id: 'u1' } } },
          }),
        },
      },
    }));
    const { supabaseAuthClient } = await import('./authClient');
    expect(await supabaseAuthClient.getAccessToken()).toBe('tok-abc');
  });

  it('returns null when no session exists', async () => {
    vi.doMock('./auth', () => ({
      supabase: {
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
      },
    }));
    const { supabaseAuthClient } = await import('./authClient');
    expect(await supabaseAuthClient.getAccessToken()).toBeNull();
  });
});

describe('supabaseAuthClient.signInWithPassword', () => {
  it('returns error: null on success', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    vi.doMock('./auth', () => ({ supabase: { auth: { signInWithPassword } } }));
    const { supabaseAuthClient } = await import('./authClient');
    const r = await supabaseAuthClient.signInWithPassword('a@b.c', 'pw');
    expect(r).toEqual({ error: null });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw' });
  });

  it('surfaces error.message as a string on failure', async () => {
    vi.doMock('./auth', () => ({
      supabase: {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            error: { message: 'Invalid login credentials' },
          }),
        },
      },
    }));
    const { supabaseAuthClient } = await import('./authClient');
    const r = await supabaseAuthClient.signInWithPassword('a@b.c', 'pw');
    expect(r).toEqual({ error: 'Invalid login credentials' });
  });
});

describe('supabaseAuthClient.onAuthStateChange', () => {
  it('returns a cleanup function that unsubscribes the listener', async () => {
    const unsubscribe = vi.fn();
    vi.doMock('./auth', () => ({
      supabase: {
        auth: {
          onAuthStateChange: vi.fn(() => ({
            data: { subscription: { unsubscribe } },
          })),
        },
      },
    }));
    const { supabaseAuthClient } = await import('./authClient');
    const cleanup = supabaseAuthClient.onAuthStateChange(() => {});
    expect(unsubscribe).not.toHaveBeenCalled();
    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
