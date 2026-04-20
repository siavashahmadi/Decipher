import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { getGuestSolves } from '../services/guestStorage';
import type { PuzzleType, Solve } from '../types';

interface UseAllSolvesResult {
  solves: Solve[];
  loading: boolean;
  error: unknown;
  refetch: () => void;
}

// Paginates through /api/solves until next_cursor is null.
// For guests, reads all non-deleted solves from localStorage.
export default function useAllSolves(puzzleType: PuzzleType, isGuest: boolean): UseAllSolvesResult {
  const [solves, setSolves] = useState<Solve[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        if (isGuest) {
          if (!cancelled) setSolves(getGuestSolves(puzzleType));
          return;
        }
        const all: Solve[] = [];
        let cursor: string | null = null;
        const MAX_PAGES = 200;
        let pages = 0;
        do {
          const page = await api.getSolves(puzzleType, cursor);
          all.push(...page.solves);
          cursor = page.next_cursor;
          pages += 1;
          if (pages >= MAX_PAGES) break;
        } while (cursor);
        if (!cancelled) setSolves(all);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [puzzleType, isGuest, tick]);

  return { solves, loading, error, refetch };
}
