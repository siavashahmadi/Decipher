import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  invalidateSolveCaches,
  solvesQueryKey,
  useAllSolvesQuery,
} from './solves';
import api from '../services/api';

vi.mock('../services/api');
vi.mock('../services/guestStorage', () => ({
  getGuestSolves: vi.fn(() => []),
}));

const wrapWith = (qc: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('solvesQueryKey', () => {
  it('namespaces caches per puzzle type so 333 and 222 do not collide', () => {
    expect(solvesQueryKey.byPuzzle('333')).not.toEqual(solvesQueryKey.byPuzzle('222'));
  });
});

describe('invalidateSolveCaches', () => {
  it('marks every cache for the puzzle as stale so consumers refetch', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    });
    const wrapper = wrapWith(qc);
    (api.getSolves as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      solves: [{ id: 'a', puzzle_type: '333', time: 10, dnf: false, plus_two: false,
        scramble: '', created_at: '2026-04-25T00:00:00Z' }],
      next_cursor: null,
    });

    const { result } = renderHook(() => useAllSolvesQuery('333', false), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getSolves).toHaveBeenCalledTimes(1);

    // Simulate the timer page mutating: a fresh solve is created and the
    // cache is invalidated. Stats's useAllSolvesQuery (this hook) should
    // refetch, picking up the new dataset.
    (api.getSolves as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      solves: [
        { id: 'b', puzzle_type: '333', time: 9, dnf: false, plus_two: false,
          scramble: '', created_at: '2026-04-26T00:00:00Z' },
        { id: 'a', puzzle_type: '333', time: 10, dnf: false, plus_two: false,
          scramble: '', created_at: '2026-04-25T00:00:00Z' },
      ],
      next_cursor: null,
    });

    invalidateSolveCaches(qc, '333');

    await waitFor(() => expect(api.getSolves).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.solves.map(s => s.id)).toEqual(['b', 'a']));
  });

  it('does not refetch caches for unrelated puzzles', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    });
    const wrapper = wrapWith(qc);
    (api.getSolves as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      solves: [], next_cursor: null,
    });

    renderHook(() => useAllSolvesQuery('333', false), { wrapper });
    await waitFor(() => expect(api.getSolves).toHaveBeenCalledTimes(1));

    invalidateSolveCaches(qc, '222');
    // Give react-query a tick to consider refetching; it shouldn't.
    await new Promise(r => setTimeout(r, 10));
    expect(api.getSolves).toHaveBeenCalledTimes(1);
  });
});
