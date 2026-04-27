import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSortedSolveStats } from './useSortedSolveStats';
import { makeSolve } from '../test-utils/makeSolve';

describe('useSortedSolveStats', () => {
  it('starts with empty sortedTimes, null median, null percentile', () => {
    const { result } = renderHook(() => useSortedSolveStats());
    expect(result.current.sortedTimesRef.current).toEqual([]);
    expect(result.current.currentMedian).toBeNull();
    expect(result.current.lastPercentile).toBeNull();
  });

  it('rebuildFrom populates sortedTimes sorted ascending and sets median', () => {
    const { result } = renderHook(() => useSortedSolveStats());
    const s1 = makeSolve({ time: 15 });
    const s2 = makeSolve({ time: 10 });
    const s3 = makeSolve({ time: 20 });

    act(() => result.current.rebuildFrom([s1, s2, s3]));

    expect(result.current.sortedTimesRef.current).toEqual([10, 15, 20]);
    expect(result.current.currentMedian).toBe(15);
    expect(result.current.lastPercentile).toBeNull();
  });

  it('applySolveAdded inserts into correct position and updates median', () => {
    const { result } = renderHook(() => useSortedSolveStats());
    const s1 = makeSolve({ time: 10 });
    const s2 = makeSolve({ time: 20 });
    act(() => result.current.rebuildFrom([s1, s2]));

    const s3 = makeSolve({ time: 15 });
    act(() => result.current.applySolveAdded(s3));

    expect(result.current.sortedTimesRef.current).toEqual([10, 15, 20]);
    expect(result.current.currentMedian).toBe(15);
  });

  it('applySolveAdded sets lastPercentile based on position in sorted array', () => {
    const { result } = renderHook(() => useSortedSolveStats());
    const s1 = makeSolve({ time: 10 });
    const s2 = makeSolve({ time: 20 });
    const s3 = makeSolve({ time: 30 });
    const s4 = makeSolve({ time: 40 });
    act(() => result.current.rebuildFrom([s1, s2, s3, s4]));

    // Add a solve with time=5 (fastest, pos=0). percentile = ((4 - 0) / 4) * 100 = 100
    const fast = makeSolve({ time: 5 });
    act(() => result.current.applySolveAdded(fast));
    expect(result.current.lastPercentile).toBe(100);

    // Add a solve with time=100 (slowest, pos=5 in 5-element array). percentile = ((5 - 5) / 5) * 100 = 0
    const slow = makeSolve({ time: 100 });
    act(() => result.current.applySolveAdded(slow));
    expect(result.current.lastPercentile).toBe(0);
  });

  it('applySolveAdded does not set percentile when array was empty', () => {
    const { result } = renderHook(() => useSortedSolveStats());
    const s = makeSolve({ time: 10 });
    act(() => result.current.applySolveAdded(s));
    expect(result.current.lastPercentile).toBeNull();
    expect(result.current.sortedTimesRef.current).toEqual([10]);
  });

  it('applySolveRemoved removes from sortedTimes and rebuilds median', () => {
    const { result } = renderHook(() => useSortedSolveStats());
    const s1 = makeSolve({ time: 10 });
    const s2 = makeSolve({ time: 20 });
    const s3 = makeSolve({ time: 30 });
    act(() => result.current.rebuildFrom([s1, s2, s3]));
    expect(result.current.currentMedian).toBe(20);

    act(() => result.current.applySolveRemoved(s2));
    expect(result.current.sortedTimesRef.current).toEqual([10, 30]);
    expect(result.current.currentMedian).toBe(20);
  });

  it('DNF solves are excluded from sortedTimes, median, and percentile', () => {
    const { result } = renderHook(() => useSortedSolveStats());
    const s1 = makeSolve({ time: 10 });
    const dnf = makeSolve({ time: 5, dnf: true });
    act(() => result.current.rebuildFrom([s1, dnf]));

    expect(result.current.sortedTimesRef.current).toEqual([10]);
    expect(result.current.currentMedian).toBe(10);

    act(() => result.current.applySolveAdded(dnf));
    expect(result.current.sortedTimesRef.current).toEqual([10]);
    expect(result.current.lastPercentile).toBeNull();

    act(() => result.current.applySolveRemoved(dnf));
    expect(result.current.sortedTimesRef.current).toEqual([10]);
  });

  it('plus_two solves use effective time (time + 2)', () => {
    const { result } = renderHook(() => useSortedSolveStats());
    const s = makeSolve({ time: 10, plus_two: true });
    act(() => result.current.rebuildFrom([s]));
    expect(result.current.sortedTimesRef.current).toEqual([12]);
  });

  it('repeated rebuildFrom resets to clean state', () => {
    const { result } = renderHook(() => useSortedSolveStats());
    const s1 = makeSolve({ time: 5 });
    const s2 = makeSolve({ time: 50 });

    act(() => result.current.rebuildFrom([s1]));
    expect(result.current.sortedTimesRef.current).toEqual([5]);
    expect(result.current.currentMedian).toBe(5);

    act(() => result.current.rebuildFrom([s2]));
    expect(result.current.sortedTimesRef.current).toEqual([50]);
    expect(result.current.currentMedian).toBe(50);
    expect(result.current.lastPercentile).toBeNull();
  });

  it('mergePageTimes merges new page solves into sortedTimes and updates median', () => {
    const { result } = renderHook(() => useSortedSolveStats());
    const s1 = makeSolve({ time: 10 });
    const s2 = makeSolve({ time: 30 });
    act(() => result.current.rebuildFrom([s1, s2]));

    const s3 = makeSolve({ time: 20 });
    act(() => result.current.mergePageTimes([s3]));

    expect(result.current.sortedTimesRef.current).toEqual([10, 20, 30]);
    expect(result.current.currentMedian).toBe(20);
  });
});
