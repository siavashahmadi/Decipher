import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import useAllSolves from './useAllSolves';
import api from '../services/api';
import { createTestQueryClient } from '../test-utils/renderWithProviders';
import type { Solve } from '../types';

vi.mock('../services/api');
vi.mock('../services/guestStorage', () => ({
  getGuestSolves: vi.fn(() => []),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
);

const makeSolve = (id: string, created_at: string): Solve => ({
  id, puzzle_type: '333', time: 10, dnf: false, plus_two: false,
  scramble: '', created_at,
});

describe('useAllSolves (auth)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('paginates through all pages until next_cursor is null', async () => {
    const page1 = [makeSolve('a', '2026-04-10T00:00:00Z'), makeSolve('b', '2026-04-09T00:00:00Z')];
    const page2 = [makeSolve('c', '2026-04-08T00:00:00Z')];
    (api.getSolves as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ solves: page1, next_cursor: '2026-04-09T00:00:00Z' })
      .mockResolvedValueOnce({ solves: page2, next_cursor: null });

    const { result } = renderHook(() => useAllSolves('333', false), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.solves.map(s => s.id)).toEqual(['a', 'b', 'c']);
    expect(api.getSolves).toHaveBeenCalledTimes(2);
  });

  it('passes an AbortSignal to api.getSolves so react-query can cancel in-flight requests', async () => {
    // H.3: cancellation is now react-query's responsibility (it aborts the
    // signal when an in-flight query loses its last observer). This test
    // pins the contract that we forward react-query's signal through to
    // api.getSolves; the cancellation behaviour is covered by react-query.
    (api.getSolves as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      solves: [], next_cursor: null,
    });

    renderHook(() => useAllSolves('333', false), { wrapper });
    await waitFor(() => expect(api.getSolves).toHaveBeenCalled());

    const call = (api.getSolves as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const signal = call[2] as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
