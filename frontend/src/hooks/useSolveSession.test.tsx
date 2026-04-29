import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useSolveSession from './useSolveSession';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isGuest: true }),
}));

vi.mock('../services/api', () => ({
  default: {
    getPersonalBests: vi.fn(async () => []),
  },
}));

const guestStore: Record<string, unknown[]> = { '333': [] };
vi.mock('../services/guestStorage', () => ({
  getGuestSolves: vi.fn((puzzle: string) => guestStore[puzzle] ?? []),
  addGuestSolve: vi.fn((puzzle: string, solve: unknown) => {
    guestStore[puzzle] = [solve, ...(guestStore[puzzle] ?? [])];
  }),
  updateGuestSolve: vi.fn(),
  deleteGuestSolve: vi.fn((puzzle: string, id: string) => {
    guestStore[puzzle] = (guestStore[puzzle] ?? []).filter(
      (s) => (s as { id: string }).id !== id,
    );
  }),
}));

// Avoid spinning up the scramble generator in tests.
vi.mock('./useScrambleQueue', () => ({
  default: () => ({
    currentScramble: 'R U R\'',
    loading: false,
    advance: vi.fn(),
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe('useSolveSession', () => {
  beforeEach(() => {
    Object.keys(guestStore).forEach((k) => { guestStore[k] = []; });
  });

  it('creates a solve and prepends it to the list', async () => {
    const { result } = renderHook(() => useSolveSession(), { wrapper });

    await waitFor(() => expect(result.current.solves).toEqual([]));

    await act(async () => {
      await result.current.handleSolveComplete(10.5, { plusTwo: false, dnf: false });
    });

    expect(result.current.solves).toHaveLength(1);
    expect(result.current.solves[0]!.time).toBe(10.5);
    expect(result.current.solves[0]!.scramble).toBe('R U R\'');
    expect(result.current.mostRecent?.time).toBe(10.5);
  });
});
