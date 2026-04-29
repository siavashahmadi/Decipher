import { useAllSolvesQuery } from '../queries/solves';
import type { PuzzleType, Solve } from '../types';

interface UseAllSolvesResult {
  solves: Solve[];
  loading: boolean;
  truncated: boolean;
}

/**
 * H.3: thin shim over useAllSolvesQuery so callers (Stats etc.) keep their
 * existing interface but read from the shared TanStack Query cache. A
 * mutation in useSolveSession invalidates the same key, so creating a solve
 * on the timer makes Stats refetch without manual coordination.
 */
export default function useAllSolves(
  puzzleType: PuzzleType,
  isGuest: boolean,
): UseAllSolvesResult {
  return useAllSolvesQuery(puzzleType, isGuest);
}
