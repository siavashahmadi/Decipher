import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Timer from './Timer';
import Scramble from './Scramble';
import Header from './Header';
import SolveLog from './SolveLog';
import SolveHub from './SolveHub';
import useCircularBuffer from '../hooks/useCircularBuffer';
import useMedianTracker from '../hooks/useMedianTracker';
import useScrambleQueue from '../hooks/useScrambleQueue';
import api from '../services/api';
import {
  getGuestSolves,
  addGuestSolve,
  updateGuestSolve,
  deleteGuestSolve,
} from '../services/guestStorage';
import type { PuzzleType, Solve, PersonalBest } from '../types';
import './SolveSession.css';

// ---------------------------------------------------------------------------
// DSA-2: Binary search (bisect_left)
//
// Returns the leftmost index where `val` can be inserted into sorted `arr`
// to keep it sorted. O(log n) vs O(n log n) for re-sorting on every solve.
//
// Example: bisectLeft([5, 8, 12], 9) → 2
// ---------------------------------------------------------------------------
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

interface SolveSessionProps {
  isGuest: boolean;
  onSignIn: () => void;
}

const SolveSession = ({ isGuest, onSignIn }: SolveSessionProps): React.ReactElement => {
  const [puzzleType, setPuzzleType] = useState<PuzzleType>('333');
  const [solves, setSolves] = useState<Solve[]>([]);
  const { currentScramble, loading: scrambleLoading, advance: advanceScramble } = useScrambleQueue(puzzleType);

  // SD-2: Cursor-based pagination state
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [lastPercentile, setLastPercentile] = useState<number | null>(null);

  // DSA-2: Sorted copy of valid times for O(log n) percentile lookup.
  const sortedTimesRef = useRef<number[]>([]);

  // SD-3: Personal best history for progression chart
  const [pbHistory, setPbHistory] = useState<PersonalBest[]>([]);

  // DSA-3: Circular buffer tracks the last 12 solves for rolling stats
  const recentBuffer = useCircularBuffer<Solve>(12);

  // DSA-4: Two-heap running median — O(log n) insert, O(1) query
  const medianTracker = useMedianTracker();
  const [currentMedian, setCurrentMedian] = useState<number | null>(null);

  // ---------------------------------------------------------------------------
  // Initial data fetch (SD-2: paginated for auth, localStorage for guest)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const fetchSolves = async () => {
      try {
        let data: Solve[];
        let next_cursor: string | null;
        if (isGuest) {
          data = getGuestSolves(puzzleType);
          next_cursor = null;
        } else {
          ({ solves: data, next_cursor } = await api.getSolves(puzzleType));
        }
        setSolves(data);
        setNextCursor(next_cursor);
        setLastPercentile(null);

        // Rebuild sorted times from fresh data (DSA-2)
        const times = data
          .filter(s => !s.dnf)
          .map(s => s.plus_two ? s.time + 2 : s.time)
          .sort((a, b) => a - b);
        sortedTimesRef.current = times;

        // DSA-4: Rebuild median tracker from scratch for this puzzle type
        medianTracker.reset();
        times.forEach(t => medianTracker.push(t));
        setCurrentMedian(medianTracker.getMedian());

        // Seed circular buffer with the 12 most recent solves (DSA-3)
        recentBuffer.reset();
        [...data].reverse().forEach(s => recentBuffer.push(s));
      } catch (err) {
        console.error('Error fetching solves:', err);
      }
    };
    fetchSolves();
  }, [puzzleType, isGuest]); // eslint-disable-line react-hooks/exhaustive-deps

  // SD-3: Fetch PB history when puzzle type changes (guests skip — no server backing)
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
      }
    };
    fetchPBs();
  }, [puzzleType, isGuest]);

  // ---------------------------------------------------------------------------
  // SD-2: Load next page of solves (auth only — guests have no cursor)
  // ---------------------------------------------------------------------------
  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const { solves: moreData, next_cursor } = await api.getSolves(puzzleType, nextCursor);
      setSolves(prev => [...prev, ...moreData]);
      setNextCursor(next_cursor);

      // Merge new times into sorted array (DSA-2) + push to median tracker (DSA-4)
      const merged = [...sortedTimesRef.current];
      moreData.filter(s => !s.dnf).forEach(s => {
        const t = s.plus_two ? s.time + 2 : s.time;
        merged.splice(bisectLeft(merged, t), 0, t);
        medianTracker.push(t);
      });
      sortedTimesRef.current = merged;
      setCurrentMedian(medianTracker.getMedian());
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, puzzleType]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Derived: last 12 solves from circular buffer for SolveHub chart (DSA-3)
  // ---------------------------------------------------------------------------
  const recentSolves = useMemo(() => recentBuffer.toArray(), [solves]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSolveComplete = useCallback(async (time: number, flags: { plusTwo: boolean; dnf: boolean }) => {
    const { plusTwo, dnf } = flags;
    const effectiveTime = plusTwo ? time + 2 : time;
    const prev = sortedTimesRef.current;
    const pos = bisectLeft(prev, effectiveTime);

    if (isGuest) {
      const guestSolve: Solve = {
        id: crypto.randomUUID(),
        puzzle_type: puzzleType,
        time,
        dnf,
        plus_two: plusTwo,
        scramble: currentScramble ?? '',
        created_at: new Date().toISOString(),
      };
      addGuestSolve(puzzleType, guestSolve);
      setSolves(prevSolves => [guestSolve, ...prevSolves]);
      recentBuffer.push(guestSolve);

      if (!dnf) {
        if (prev.length > 0) {
          setLastPercentile(Math.round(((prev.length - pos) / prev.length) * 100));
        }
        sortedTimesRef.current = [...prev.slice(0, pos), effectiveTime, ...prev.slice(pos)];
        medianTracker.push(effectiveTime);
        setCurrentMedian(medianTracker.getMedian());
      }
      advanceScramble();
      return;
    }

    const newSolve = {
      puzzle_type: puzzleType,
      time,
      dnf,
      plus_two: plusTwo,
      scramble: currentScramble ?? '',
    };

    try {
      const savedSolve = await api.createSolve(newSolve);
      if (savedSolve) {
        setSolves(prevSolves => [savedSolve, ...prevSolves]);
        recentBuffer.push(savedSolve);

        if (!dnf) {
          if (prev.length > 0) {
            const beaten = prev.length - pos;
            setLastPercentile(Math.round((beaten / prev.length) * 100));
          }
          sortedTimesRef.current = [...prev.slice(0, pos), effectiveTime, ...prev.slice(pos)];
          medianTracker.push(effectiveTime);
          setCurrentMedian(medianTracker.getMedian());
        }
        advanceScramble();
      }
    } catch (err) {
      console.error('API Error:', err);
    }
  }, [isGuest, puzzleType, currentScramble, advanceScramble]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // SD-6: Optimistic update — update UI immediately, rollback on API failure.
  // ---------------------------------------------------------------------------
  const handleSolveUpdate = async (updatedSolve: Solve) => {
    const snapshot = solves;
    setSolves(prev => prev.map(s => s.id === updatedSolve.id ? updatedSolve : s));
    if (isGuest) {
      updateGuestSolve(puzzleType, updatedSolve);
      return;
    }
    try {
      await api.updateSolve(updatedSolve.id, updatedSolve);
    } catch (err) {
      setSolves(snapshot); // rollback
      console.error(err);
    }
  };

  // ---------------------------------------------------------------------------
  // SD-6: Optimistic delete — removes from UI immediately, rolls back on error.
  // DSA-4: Rebuilds the two-heap from the new sortedTimes after deletion.
  // ---------------------------------------------------------------------------
  const handleSolveDelete = async (solveToDelete: Solve) => {
    const snapshot = solves;
    const sortedSnapshot = sortedTimesRef.current;

    setSolves(prev => prev.filter(s => s.id !== solveToDelete.id));

    if (!solveToDelete.dnf) {
      const t = solveToDelete.plus_two ? solveToDelete.time + 2 : solveToDelete.time;
      const pos = bisectLeft(sortedSnapshot, t);
      const newSorted = [...sortedSnapshot.slice(0, pos), ...sortedSnapshot.slice(pos + 1)];
      sortedTimesRef.current = newSorted;

      // DSA-4: Rebuild two-heap from new sorted array
      medianTracker.reset();
      newSorted.forEach(v => medianTracker.push(v));
      setCurrentMedian(medianTracker.getMedian());
    }

    if (isGuest) {
      deleteGuestSolve(puzzleType, solveToDelete.id);
      return;
    }

    try {
      await api.deleteSolve(solveToDelete.id);
    } catch (err) {
      setSolves(snapshot);
      sortedTimesRef.current = sortedSnapshot;
      medianTracker.reset();
      sortedSnapshot.forEach(v => medianTracker.push(v));
      setCurrentMedian(medianTracker.getMedian());
      console.error(err);
    }
  };

  const handleTypeChange = (event: React.ChangeEvent<HTMLSelectElement> | React.MouseEvent<HTMLButtonElement>) => {
    const value = (event.currentTarget as HTMLSelectElement | HTMLButtonElement).value as PuzzleType;
    setPuzzleType(value);
  };

  const resetTimer = useCallback(() => {
    if (window.confirm('Clear Session View? All times will be saved.')) {
      setSolves([]);
      recentBuffer.reset();
      setLastPercentile(null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') event.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="solve-session">
      <Header
        type={puzzleType}
        handleTypeChange={handleTypeChange}
        isGuest={isGuest}
        onSignIn={onSignIn}
      />
      <div className="main-content">
        <div className="timer-section">
          <Timer onSolveComplete={handleSolveComplete} />
        </div>
        <div className="mid-section">
          <div className="left-section">
            <div className="scramble-wrapper">
              <Scramble
                type={puzzleType}
                scramble={currentScramble}
                loading={scrambleLoading}
              />
            </div>
            <div className="solve-hub-wrapper">
              <SolveHub
                solves={solves}
                recentSolves={recentSolves}
                pbHistory={pbHistory}
                lastPercentile={lastPercentile}
                currentMedian={currentMedian}
              />
            </div>
          </div>
          <div className="right-section">
            <SolveLog
              solves={solves}
              onSolveUpdate={handleSolveUpdate}
              onSolveDelete={handleSolveDelete}
              onReset={resetTimer}
              onLoadMore={loadMore}
              hasMore={!!nextCursor}
              isLoadingMore={isLoadingMore}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SolveSession;
