import { useQuery, type QueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { getGuestSolves } from '../services/guestStorage';
import type { PuzzleType, Solve } from '../types';

// H.3: shared query cache for solve data. Mutations elsewhere call
// `invalidateSolveCaches(qc, puzzleType)` so a solve created on the timer
// page propagates to Stats without a manual refetch.

export const solvesQueryKey = {
  all: ['solves'] as const,
  byPuzzle: (puzzleType: PuzzleType) => ['solves', puzzleType] as const,
  fullList: (puzzleType: PuzzleType, isGuest: boolean) =>
    ['solves', puzzleType, 'full', isGuest] as const,
};

export interface UseAllSolvesQueryResult {
  solves: Solve[];
  loading: boolean;
  truncated: boolean;
}

const DEFAULT_PAGE_SIZE = 50; // matches backend `_parse_positive_int` default in routes/solves.py
const MAX_PAGES = 200;
export const MAX_SOLVES = MAX_PAGES * DEFAULT_PAGE_SIZE;

const fetchAllAuthSolves = async (
  puzzleType: PuzzleType,
  signal: AbortSignal,
): Promise<{ solves: Solve[]; truncated: boolean }> => {
  const all: Solve[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let truncated = false;
  do {
    const page = await api.getSolves(puzzleType, cursor, signal);
    all.push(...page.solves);
    cursor = page.next_cursor;
    pages += 1;
    if (pages >= MAX_PAGES) {
      if (cursor) truncated = true;
      break;
    }
  } while (cursor);
  return { solves: all, truncated };
};

/**
 * Loads every solve for `puzzleType` (paginated server-side for auth users,
 * read in one pass from localStorage for guests). The result lives in the
 * shared TanStack Query cache so any mutation that calls
 * `invalidateSolveCaches` propagates here.
 */
export const useAllSolvesQuery = (
  puzzleType: PuzzleType,
  isGuest: boolean,
): UseAllSolvesQueryResult => {
  const query = useQuery({
    queryKey: solvesQueryKey.fullList(puzzleType, isGuest),
    queryFn: async ({ signal }) => {
      if (isGuest) {
        return { solves: getGuestSolves(puzzleType), truncated: false };
      }
      return fetchAllAuthSolves(puzzleType, signal);
    },
  });

  return {
    solves: query.data?.solves ?? [],
    loading: query.isLoading || query.isFetching,
    truncated: query.data?.truncated ?? false,
  };
};

/**
 * Invalidate every solve list cached for `puzzleType`. Called from
 * useSolveSession after create/update/delete so cross-page consumers (Stats)
 * get a fresh fetch on next navigation.
 */
export const invalidateSolveCaches = (
  qc: QueryClient,
  puzzleType: PuzzleType,
): void => {
  qc.invalidateQueries({ queryKey: solvesQueryKey.byPuzzle(puzzleType) });
};
