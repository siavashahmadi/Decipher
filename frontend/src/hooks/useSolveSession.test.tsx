import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import useSolveSession from './useSolveSession';
import { createTestQueryClient } from '../test-utils/renderWithProviders';
import type { Solve } from '../types';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isGuest: true }),
}));

vi.mock('../services/api', () => ({
  default: {
    getPersonalBests: vi.fn(async () => []),
  },
}));

// Drive the session through a mocked SolveStore so each test can configure
// fetchPage / create / update / remove behaviour independently. The store
// integration with guestStorage is covered separately in guestStorage tests.
const store = {
  fetchPage: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
};
vi.mock('./useSolveStore', () => ({
  default: () => store,
}));

vi.mock('./useScrambleQueue', () => ({
  default: () => ({
    currentScramble: "R U R'",
    loading: false,
    advance: vi.fn(),
  }),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

const makeMockSolve = (overrides: Partial<Solve> = {}): Solve => ({
  id: 'solve-1',
  puzzle_type: '333',
  time: 10,
  dnf: false,
  plus_two: false,
  scramble: '',
  created_at: '2026-04-25T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  toastError.mockClear();
  store.fetchPage.mockResolvedValue({ solves: [], next_cursor: null });
  store.create.mockReset();
  store.update.mockReset();
  store.remove.mockReset();
});

describe('useSolveSession', () => {
  it('creates a solve and prepends it to the list', async () => {
    store.create.mockResolvedValue(makeMockSolve({ id: 's-new', time: 10.5 }));
    const { result } = renderHook(() => useSolveSession(), { wrapper });

    await waitFor(() => expect(result.current.solves).toEqual([]));

    await act(async () => {
      await result.current.handleSolveComplete(10.5, { plusTwo: false, dnf: false });
    });

    expect(result.current.solves).toHaveLength(1);
    expect(result.current.solves[0]!.time).toBe(10.5);
    expect(result.current.mostRecent?.id).toBe('s-new');
  });

  it('rolls back optimistic update when store.update rejects', async () => {
    const original = makeMockSolve({ id: 's-1', time: 10, dnf: false });
    store.fetchPage.mockResolvedValue({ solves: [original], next_cursor: null });
    store.update.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useSolveSession(), { wrapper });
    await waitFor(() => expect(result.current.solves).toHaveLength(1));

    const edited = { ...original, dnf: true };
    await act(async () => {
      await result.current.handleSolveUpdate(edited);
    });

    expect(result.current.solves).toEqual([original]);
    expect(toastError).toHaveBeenCalledWith('Could not update solve.');
  });

  it('rolls back optimistic delete when store.remove rejects', async () => {
    const a = makeMockSolve({ id: 'a', time: 9 });
    const b = makeMockSolve({ id: 'b', time: 11 });
    store.fetchPage.mockResolvedValue({ solves: [a, b], next_cursor: null });
    store.remove.mockRejectedValue(new Error('5xx'));

    const { result } = renderHook(() => useSolveSession(), { wrapper });
    await waitFor(() => expect(result.current.solves).toHaveLength(2));
    const medianBefore = result.current.currentMedian;

    await act(async () => {
      await result.current.handleSolveDelete(a);
    });

    expect(result.current.solves.map(s => s.id)).toEqual(['a', 'b']);
    expect(result.current.currentMedian).toBe(medianBefore);
    expect(toastError).toHaveBeenCalledWith('Could not delete solve.');
  });

  it('appends a loadMore page and reflects it in solves', async () => {
    const page1 = [makeMockSolve({ id: 'p1-1' }), makeMockSolve({ id: 'p1-2' })];
    const page2 = [makeMockSolve({ id: 'p2-1' }), makeMockSolve({ id: 'p2-2' })];
    store.fetchPage
      .mockResolvedValueOnce({ solves: page1, next_cursor: 'cur-1' })
      .mockResolvedValueOnce({ solves: page2, next_cursor: null });

    const { result } = renderHook(() => useSolveSession(), { wrapper });
    await waitFor(() => expect(result.current.solves).toHaveLength(2));
    expect(result.current.nextCursor).toBe('cur-1');

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.solves.map(s => s.id))
      .toEqual(['p1-1', 'p1-2', 'p2-1', 'p2-2']);
    expect(result.current.nextCursor).toBeNull();
    expect(store.fetchPage).toHaveBeenCalledTimes(2);
  });

  it('clearView empties solves and resets percentile when confirmed', async () => {
    store.fetchPage.mockResolvedValue({
      solves: [makeMockSolve({ id: 'a', time: 9 }), makeMockSolve({ id: 'b', time: 11 })],
      next_cursor: null,
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { result } = renderHook(() => useSolveSession(), { wrapper });
    await waitFor(() => expect(result.current.solves).toHaveLength(2));
    // Drive lastPercentile non-null by recording a new solve.
    store.create.mockResolvedValue(makeMockSolve({ id: 'c', time: 10 }));
    await act(async () => {
      await result.current.handleSolveComplete(10, { plusTwo: false, dnf: false });
    });
    expect(result.current.lastPercentile).not.toBeNull();

    act(() => result.current.clearView());

    expect(result.current.solves).toEqual([]);
    expect(result.current.lastPercentile).toBeNull();
    confirmSpy.mockRestore();
  });

  it('clearView is a no-op when confirm is declined', async () => {
    store.fetchPage.mockResolvedValue({
      solves: [makeMockSolve({ id: 'a' })],
      next_cursor: null,
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { result } = renderHook(() => useSolveSession(), { wrapper });
    await waitFor(() => expect(result.current.solves).toHaveLength(1));

    act(() => result.current.clearView());

    expect(result.current.solves).toHaveLength(1);
    confirmSpy.mockRestore();
  });
});
