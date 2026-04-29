import { useRef, useState, useCallback } from 'react';
import useMedianTracker from './useMedianTracker';
import { mergeSortedAsc } from '../utils/mergeSortedAsc';
import { effectiveTime } from '../utils/solveTime';
import type { Solve } from '../types';

export interface UseSortedSolveStatsResult {
  sortedTimesRef: React.MutableRefObject<number[]>;
  currentMedian: number | null;
  lastPercentile: number | null;
  rebuildFrom: (solves: Solve[]) => void;
  applySolveAdded: (s: Solve) => void;
  applySolveRemoved: (s: Solve) => void;
  mergePageTimes: (pageSolves: Solve[]) => void;
  resetPercentile: () => void;
}

// DSA-2: Binary search (bisect_left). Returns the leftmost index where `val`
// can be inserted into sorted `arr` to keep it sorted. O(log n).
const bisectLeft = (arr: number[], val: number): number => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! < val) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

export function useSortedSolveStats(): UseSortedSolveStatsResult {
  const sortedTimesRef = useRef<number[]>([]);
  const [currentMedian, setCurrentMedian] = useState<number | null>(null);
  const [lastPercentile, setLastPercentile] = useState<number | null>(null);
  const medianTracker = useMedianTracker();

  const rebuildFrom = useCallback((solves: Solve[]) => {
    const times = solves
      .filter(s => !s.dnf)
      .map(effectiveTime)
      .sort((a, b) => a - b);
    sortedTimesRef.current = times;
    medianTracker.reset();
    times.forEach(t => medianTracker.push(t));
    setCurrentMedian(medianTracker.getMedian());
    setLastPercentile(null);
  // medianTracker identity is stable since A.8.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applySolveAdded = useCallback((s: Solve) => {
    if (s.dnf) return;
    const t = effectiveTime(s);
    const prev = sortedTimesRef.current;
    const pos = bisectLeft(prev, t);
    if (prev.length > 0) {
      setLastPercentile(Math.round(((prev.length - pos) / prev.length) * 100));
    }
    sortedTimesRef.current = [...prev.slice(0, pos), t, ...prev.slice(pos)];
    medianTracker.push(t);
    setCurrentMedian(medianTracker.getMedian());
  // medianTracker identity is stable since A.8.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applySolveRemoved = useCallback((s: Solve) => {
    if (s.dnf) return;
    const t = effectiveTime(s);
    const current = sortedTimesRef.current;
    const pos = bisectLeft(current, t);
    const newSorted = [...current.slice(0, pos), ...current.slice(pos + 1)];
    sortedTimesRef.current = newSorted;
    medianTracker.reset();
    newSorted.forEach(v => medianTracker.push(v));
    setCurrentMedian(medianTracker.getMedian());
  // medianTracker identity is stable since A.8.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mergePageTimes = useCallback((pageSolves: Solve[]) => {
    const newTimes = pageSolves
      .filter(s => !s.dnf)
      .map(effectiveTime)
      .sort((a, b) => a - b);
    newTimes.forEach(t => medianTracker.push(t));
    sortedTimesRef.current = mergeSortedAsc(sortedTimesRef.current, newTimes);
    setCurrentMedian(medianTracker.getMedian());
  // medianTracker identity is stable since A.8.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetPercentile = useCallback(() => {
    setLastPercentile(null);
  }, []);

  return {
    sortedTimesRef,
    currentMedian,
    lastPercentile,
    rebuildFrom,
    applySolveAdded,
    applySolveRemoved,
    mergePageTimes,
    resetPercentile,
  };
}
