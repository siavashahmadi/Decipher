import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import useMedianTracker from './useMedianTracker';
import useScrambleQueue from './useScrambleQueue';
import useSolveStore from './useSolveStore';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import type { PersonalBest, PuzzleType, Solve } from '../types';

export interface PenaltyFlags { plusTwo: boolean; dnf: boolean }

export interface UseSolveSessionResult {
  puzzleType: PuzzleType;
  setPuzzleType: (p: PuzzleType) => void;
  solves: Solve[];
  mostRecent: Solve | null;
  recentSolves: Solve[];
  pbHistory: PersonalBest[];
  lastPercentile: number | null;
  currentMedian: number | null;
  nextCursor: string | null;
  isLoadingMore: boolean;
  currentScramble: string | null;
  scrambleLoading: boolean;
  handleSolveComplete: (time: number, flags: PenaltyFlags) => Promise<void>;
  handleSolveUpdate: (solve: Solve) => Promise<void>;
  handleSolveDelete: (solve: Solve) => Promise<void>;
  handleTypeChange: (
    e: React.ChangeEvent<HTMLSelectElement> | React.MouseEvent<HTMLButtonElement>,
  ) => void;
  loadMore: () => Promise<void>;
  clearView: () => void;
}

// DSA-2: Binary search (bisect_left). Returns the leftmost index where `val`
// can be inserted into sorted `arr` to keep it sorted. O(log n).
const bisectLeft = (arr: number[], val: number): number => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < val) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

export default function useSolveSession(): UseSolveSessionResult {
  const { isGuest } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Read any replay payload carried in router state at mount time, so the
  // scramble queue can be seeded directly with the replayed scramble and we
  // do not need a post-mount override hop.
  const [initialReplay] = useState(() => {
    const state = location.state as
      | { replayScramble?: string; replayPuzzle?: PuzzleType }
      | null;
    return {
      scramble: state?.replayScramble,
      puzzle: state?.replayPuzzle,
    };
  });

  const [puzzleType, setPuzzleType] = useState<PuzzleType>(
    initialReplay.puzzle ?? '333',
  );
  const store = useSolveStore(isGuest, puzzleType);
  const [solves, setSolves] = useState<Solve[]>([]);
  const {
    currentScramble,
    loading: scrambleLoading,
    advance: advanceScramble,
  } = useScrambleQueue(puzzleType, { initialScramble: initialReplay.scramble });

  // Clear the router state once after mount so a page refresh does not
  // re-apply a stale replay.
  useEffect(() => {
    if (location.state) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastPercentile, setLastPercentile] = useState<number | null>(null);
  const sortedTimesRef = useRef<number[]>([]);
  const [pbHistory, setPbHistory] = useState<PersonalBest[]>([]);
  const medianTracker = useMedianTracker();
  const [currentMedian, setCurrentMedian] = useState<number | null>(null);

  useEffect(() => {
    const fetchSolves = async () => {
      try {
        const { solves: data, next_cursor } = await store.fetchPage();
        setSolves(data);
        setNextCursor(next_cursor);
        setLastPercentile(null);

        const times = data
          .filter(s => !s.dnf)
          .map(s => (s.plus_two ? s.time + 2 : s.time))
          .sort((a, b) => a - b);
        sortedTimesRef.current = times;

        medianTracker.reset();
        times.forEach(t => medianTracker.push(t));
        setCurrentMedian(medianTracker.getMedian());
      } catch (err) {
        console.error('Error fetching solves:', err);
        toast.error('Could not load solves.');
      }
    };
    fetchSolves();
  }, [puzzleType, store, medianTracker]);

  useEffect(() => {
    if (isGuest) {
      setPbHistory([]);
      return;
    }
    const fetchPBs = async () => {
      try {
        const data = await api.getPersonalBests(puzzleType);
        setPbHistory(data);
      } catch (err) {
        console.error('Error fetching personal bests:', err);
        toast.error('Could not load personal bests.');
      }
    };
    fetchPBs();
  }, [puzzleType, isGuest]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const { solves: moreData, next_cursor } = await store.fetchPage(nextCursor);
      setSolves(prev => [...prev, ...moreData]);
      setNextCursor(next_cursor);

      const newTimes = moreData
        .filter(s => !s.dnf)
        .map(s => (s.plus_two ? s.time + 2 : s.time));
      newTimes.forEach(t => medianTracker.push(t));
      sortedTimesRef.current = [...sortedTimesRef.current, ...newTimes]
        .sort((a, b) => a - b);
      setCurrentMedian(medianTracker.getMedian());
    } catch (err) {
      console.error(err);
      toast.error('Could not load more solves.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, puzzleType, store, medianTracker]);

  const recentSolves = useMemo(() => solves.slice(0, 12).reverse(), [solves]);

  const handleSolveComplete = useCallback(
    async (time: number, flags: PenaltyFlags) => {
      const { plusTwo, dnf } = flags;
      const effectiveTime = plusTwo ? time + 2 : time;
      const prev = sortedTimesRef.current;
      const pos = bisectLeft(prev, effectiveTime);

      const payload = {
        puzzle_type: puzzleType,
        time,
        dnf,
        plus_two: plusTwo,
        scramble: currentScramble ?? '',
      };

      advanceScramble();

      try {
        const savedSolve = await store.create(payload);
        if (!savedSolve) return;
        setSolves(prevSolves => [savedSolve, ...prevSolves]);

        if (!dnf) {
          if (prev.length > 0) {
            setLastPercentile(Math.round(((prev.length - pos) / prev.length) * 100));
          }
          sortedTimesRef.current = [...prev.slice(0, pos), effectiveTime, ...prev.slice(pos)];
          medianTracker.push(effectiveTime);
          setCurrentMedian(medianTracker.getMedian());
        }
      } catch (err) {
        console.error('Error creating solve:', err);
        if (err instanceof Error && err.name === 'GuestStorageQuotaError') {
          toast.error(
            'Local storage is full. Your recent solve was not saved. Sign in to keep your history.',
            { duration: 8000 },
          );
        } else {
          toast.error('Could not save solve.');
        }
      }
    },
    [puzzleType, currentScramble, advanceScramble, store, medianTracker],
  );

  const handleSolveUpdate = async (updatedSolve: Solve) => {
    const snapshot = solves;
    setSolves(prev => prev.map(s => (s.id === updatedSolve.id ? updatedSolve : s)));
    try {
      await store.update(updatedSolve);
    } catch (err) {
      setSolves(snapshot);
      console.error(err);
      toast.error('Could not update solve.');
    }
  };

  const handleSolveDelete = async (solveToDelete: Solve) => {
    const snapshot = solves;
    const sortedSnapshot = sortedTimesRef.current;

    setSolves(prev => prev.filter(s => s.id !== solveToDelete.id));

    if (!solveToDelete.dnf) {
      const t = solveToDelete.plus_two ? solveToDelete.time + 2 : solveToDelete.time;
      const pos = bisectLeft(sortedSnapshot, t);
      const newSorted = [...sortedSnapshot.slice(0, pos), ...sortedSnapshot.slice(pos + 1)];
      sortedTimesRef.current = newSorted;

      medianTracker.reset();
      newSorted.forEach(v => medianTracker.push(v));
      setCurrentMedian(medianTracker.getMedian());
    }

    try {
      await store.remove(solveToDelete.id);
    } catch (err) {
      setSolves(snapshot);
      sortedTimesRef.current = sortedSnapshot;
      medianTracker.reset();
      sortedSnapshot.forEach(v => medianTracker.push(v));
      setCurrentMedian(medianTracker.getMedian());
      console.error(err);
      toast.error('Could not delete solve.');
    }
  };

  const handleTypeChange = (
    event: React.ChangeEvent<HTMLSelectElement> | React.MouseEvent<HTMLButtonElement>,
  ) => {
    const value = (event.currentTarget as HTMLSelectElement | HTMLButtonElement)
      .value as PuzzleType;
    setPuzzleType(value);
  };

  const clearView = useCallback(() => {
    if (window.confirm('Clear the current view? Your solves stay saved.')) {
      setSolves([]);
      setLastPercentile(null);
    }
  }, []);

  // Block the default page-scroll on Space so the timer can own it.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') event.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const mostRecent = solves[0] ?? null;

  return {
    puzzleType,
    setPuzzleType,
    solves,
    mostRecent,
    recentSolves,
    pbHistory,
    lastPercentile,
    currentMedian,
    nextCursor,
    isLoadingMore,
    currentScramble,
    scrambleLoading,
    handleSolveComplete,
    handleSolveUpdate,
    handleSolveDelete,
    handleTypeChange,
    loadMore,
    clearView,
  };
}
