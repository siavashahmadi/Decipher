import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import useScrambleQueue from './useScrambleQueue';
import useSolveStore from './useSolveStore';
import { useSortedSolveStats } from './useSortedSolveStats';
import { useReplayState } from './useReplayState';
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

export default function useSolveSession(): UseSolveSessionResult {
  const { isGuest } = useAuth();
  const replay = useReplayState();
  const stats = useSortedSolveStats();

  const [puzzleType, setPuzzleType] = useState<PuzzleType>(replay.puzzle ?? '333');
  const store = useSolveStore(isGuest, puzzleType);
  const [solves, setSolves] = useState<Solve[]>([]);
  const {
    currentScramble,
    loading: scrambleLoading,
    advance: advanceScramble,
  } = useScrambleQueue(puzzleType, { initialScramble: replay.scramble });

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pbHistory, setPbHistory] = useState<PersonalBest[]>([]);

  // Mirror the latest solves into a ref so async handlers can capture a
  // snapshot for optimistic-update rollback without depending on `solves`
  // (which would invalidate every callback identity on every solve change).
  const solvesRef = useRef<Solve[]>([]);
  solvesRef.current = solves;

  useEffect(() => {
    const fetchSolves = async () => {
      try {
        const { solves: data, next_cursor } = await store.fetchPage();
        setSolves(data);
        setNextCursor(next_cursor);
        stats.rebuildFrom(data);
      } catch (err) {
        console.error('Error fetching solves:', err);
        toast.error('Could not load solves.');
      }
    };
    fetchSolves();
  }, [puzzleType, store]); // eslint-disable-line react-hooks/exhaustive-deps

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
      stats.mergePageTimes(moreData);
    } catch (err) {
      console.error(err);
      toast.error('Could not load more solves.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, store]); // eslint-disable-line react-hooks/exhaustive-deps

  const recentSolves = useMemo(() => solves.slice(0, 12).reverse(), [solves]);

  const handleSolveComplete = useCallback(
    async (time: number, flags: PenaltyFlags) => {
      const { plusTwo, dnf } = flags;
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
        stats.applySolveAdded(savedSolve);
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
    [puzzleType, currentScramble, advanceScramble, store], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleSolveUpdate = useCallback(async (updatedSolve: Solve) => {
    const snapshot = solvesRef.current;
    setSolves(prev => prev.map(s => (s.id === updatedSolve.id ? updatedSolve : s)));
    try {
      await store.update(updatedSolve);
    } catch (err) {
      setSolves(snapshot);
      console.error(err);
      toast.error('Could not update solve.');
    }
  }, [store]);

  const handleSolveDelete = useCallback(async (solveToDelete: Solve) => {
    const snapshot = solvesRef.current;

    setSolves(prev => prev.filter(s => s.id !== solveToDelete.id));
    stats.applySolveRemoved(solveToDelete);

    try {
      await store.remove(solveToDelete.id);
    } catch (err) {
      setSolves(snapshot);
      stats.rebuildFrom(snapshot);
      console.error(err);
      toast.error('Could not delete solve.');
    }
  }, [store]); // eslint-disable-line react-hooks/exhaustive-deps

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
      stats.resetPercentile();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    lastPercentile: stats.lastPercentile,
    currentMedian: stats.currentMedian,
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
