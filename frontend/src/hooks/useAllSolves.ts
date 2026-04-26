import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import api from '../services/api';
import { getGuestSolves } from '../services/guestStorage';
import type { PuzzleType, Solve } from '../types';

interface UseAllSolvesResult {
  solves: Solve[];
  loading: boolean;
  truncated: boolean;
}

// Paginates through /api/solves until next_cursor is null.
// For guests, reads all non-deleted solves from localStorage.
export default function useAllSolves(puzzleType: PuzzleType, isGuest: boolean): UseAllSolvesResult {
  const [solves, setSolves] = useState<Solve[]>([]);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      setTruncated(false);
      try {
        if (isGuest) {
          if (!controller.signal.aborted) setSolves(getGuestSolves(puzzleType));
          return;
        }
        const all: Solve[] = [];
        let cursor: string | null = null;
        const MAX_PAGES = 200;
        let pages = 0;
        let didTruncate = false;
        do {
          const page = await api.getSolves(puzzleType, cursor, controller.signal);
          all.push(...page.solves);
          cursor = page.next_cursor;
          pages += 1;
          if (pages >= MAX_PAGES) {
            if (cursor) didTruncate = true;
            break;
          }
        } while (cursor);
        if (!controller.signal.aborted) {
          setSolves(all);
          setTruncated(didTruncate);
        }
      } catch (e) {
        // Cancellation is expected on puzzle/route change. Swallow it
        // silently; only surface real failures.
        if (axios.isCancel(e) || (e instanceof Error && e.name === 'CanceledError')) return;
        if (!controller.signal.aborted) {
          toast.error('Could not load all solves for stats.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    run();
    return () => { controller.abort(); };
  }, [puzzleType, isGuest]);

  return { solves, loading, truncated };
}
