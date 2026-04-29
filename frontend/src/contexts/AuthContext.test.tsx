import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act, cleanup } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import {
  createMockSupabaseAuth,
  type MockSupabaseAuthHandle,
} from '../test-utils/mockSupabaseAuth';
import api from '../services/api';
import { makeSolve } from '../test-utils/makeSolve';

// Per-test mutable handle so each `it` starts with a fresh listener state.
// AuthContext reads supabase.auth.<method> at call time, so the dispatch
// table below stays valid across renews.
const authBox: { handle: MockSupabaseAuthHandle } = {
  handle: createMockSupabaseAuth(),
};

vi.mock('../services/auth', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) =>
        (authBox.handle.getSession as (...a: unknown[]) => unknown)(...args),
      onAuthStateChange: (...args: unknown[]) =>
        (authBox.handle.onAuthStateChange as (...a: unknown[]) => unknown)(...args),
    },
  },
  supabaseConfigMissing: false,
}));

vi.mock('../services/api', () => ({
  default: { migrateSolves: vi.fn() },
  __esModule: true,
}));

const guestSolvesState: { value: ReturnType<typeof makeSolve>[] } = { value: [] };
const removeGuestSolvesMock = vi.fn();

vi.mock('../services/guestStorage', () => ({
  getAllGuestSolves: () => guestSolvesState.value,
  removeGuestSolves: (solves: ReturnType<typeof makeSolve>[]) =>
    removeGuestSolvesMock(solves),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

const mockMigrate = api.migrateSolves as unknown as ReturnType<typeof vi.fn>;

const Probe = ({ onState }: { onState: (s: Session | null, isGuest: boolean) => void }): null => {
  const { session, isGuest } = useAuth();
  onState(session, isGuest);
  return null;
};

const renderProvider = (children: ReactNode = null) =>
  render(<AuthProvider>{children}</AuthProvider>);

const fakeSession = (id = 'user-1'): Session =>
  ({ access_token: 't', user: { id } } as unknown as Session);

beforeEach(() => {
  authBox.handle = createMockSupabaseAuth();
  guestSolvesState.value = [];
  removeGuestSolvesMock.mockClear();
  toastError.mockClear();
  mockMigrate.mockReset();
});

describe('AuthContext migration flow', () => {
  it('does not call migrateSolves when there are no guest solves', async () => {
    renderProvider();
    await waitFor(() => expect(authBox.handle.onAuthStateChange).toHaveBeenCalled());

    await act(async () => {
      await authBox.handle.fireAuthEvent('SIGNED_IN', fakeSession());
    });

    expect(mockMigrate).not.toHaveBeenCalled();
    expect(removeGuestSolvesMock).not.toHaveBeenCalled();
  });

  it('migrates and clears guest solves on SIGNED_IN', async () => {
    const solves = [makeSolve({ id: 'g1' }), makeSolve({ id: 'g2' })];
    guestSolvesState.value = solves;
    mockMigrate.mockResolvedValue({ migrated: solves, failed: [] });

    renderProvider();
    await waitFor(() => expect(authBox.handle.onAuthStateChange).toHaveBeenCalled());

    await act(async () => {
      await authBox.handle.fireAuthEvent('SIGNED_IN', fakeSession());
    });

    expect(mockMigrate).toHaveBeenCalledTimes(1);
    expect(mockMigrate).toHaveBeenCalledWith(solves);
    expect(removeGuestSolvesMock).toHaveBeenCalledWith(solves);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('shows a toast when migrateSolves returns failed rows', async () => {
    const a = makeSolve({ id: 'a' });
    const b = makeSolve({ id: 'b' });
    guestSolvesState.value = [a, b];
    mockMigrate.mockResolvedValue({ migrated: [a], failed: [b] });

    renderProvider();
    await waitFor(() => expect(authBox.handle.onAuthStateChange).toHaveBeenCalled());

    await act(async () => {
      await authBox.handle.fireAuthEvent('SIGNED_IN', fakeSession());
    });

    expect(removeGuestSolvesMock).toHaveBeenCalledWith([a]);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0]![0]).toMatch(/1 solve/);
  });

  it('does not re-enter migration if SIGNED_IN fires again while one is in flight', async () => {
    const initial = [makeSolve({ id: 'g1' })];
    guestSolvesState.value = initial;
    let resolveMigrate!: (v: { migrated: unknown[]; failed: unknown[] }) => void;
    mockMigrate.mockReturnValue(new Promise(r => { resolveMigrate = r; }));

    renderProvider();
    await waitFor(() => expect(authBox.handle.onAuthStateChange).toHaveBeenCalled());

    // Two rapid SIGNED_IN events fired before the first migration resolves.
    // The second must short-circuit on the migratingRef guard.
    let firstFire!: Promise<void>;
    let secondFire!: Promise<void>;
    act(() => {
      firstFire = authBox.handle.fireAuthEvent('SIGNED_IN', fakeSession());
      secondFire = authBox.handle.fireAuthEvent('SIGNED_IN', fakeSession());
    });
    await waitFor(() => expect(mockMigrate).toHaveBeenCalledTimes(1));

    // Resolve the migration so the listener finishes and the test cleans up
    // any pending promise; otherwise the leftover Promise pollutes later tests.
    await act(async () => {
      resolveMigrate({ migrated: initial, failed: [] });
      await firstFire;
      await secondFire;
    });
    expect(removeGuestSolvesMock).toHaveBeenCalledWith(initial);
  });

  it('exposes session and isGuest through useAuth on SIGNED_IN / SIGNED_OUT', async () => {
    const states: { session: Session | null; isGuest: boolean }[] = [];
    render(
      <AuthProvider>
        <Probe onState={(session, isGuest) => states.push({ session, isGuest })} />
      </AuthProvider>,
    );
    await waitFor(() => expect(authBox.handle.onAuthStateChange).toHaveBeenCalled());

    const session = fakeSession('user-42');
    await act(async () => {
      await authBox.handle.fireAuthEvent('SIGNED_IN', session);
    });
    expect(states[states.length - 1]).toEqual({ session, isGuest: false });

    await act(async () => {
      await authBox.handle.fireAuthEvent('SIGNED_OUT', null);
    });
    expect(states[states.length - 1]).toEqual({ session: null, isGuest: true });
  });

  it('unsubscribes the auth listener on unmount', async () => {
    renderProvider();
    await waitFor(() => expect(authBox.handle.onAuthStateChange).toHaveBeenCalled());

    cleanup();

    expect(authBox.handle.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
