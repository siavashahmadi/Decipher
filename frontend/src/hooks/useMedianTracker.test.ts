import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import useMedianTracker from './useMedianTracker';

describe('useMedianTracker', () => {
  it('returns a stable identity across re-renders', () => {
    const { result, rerender } = renderHook(() => useMedianTracker());
    const first = result.current;
    rerender();
    const second = result.current;
    expect(second).toBe(first);
  });

  it('computes median correctly across pushes', () => {
    const { result } = renderHook(() => useMedianTracker());
    expect(result.current.getMedian()).toBeNull();
    result.current.push(5);
    expect(result.current.getMedian()).toBe(5);
    result.current.push(1);
    expect(result.current.getMedian()).toBe(3);
    result.current.push(3);
    expect(result.current.getMedian()).toBe(3);
    result.current.push(9);
    expect(result.current.getMedian()).toBe(4);
  });

  it('reset clears state', () => {
    const { result } = renderHook(() => useMedianTracker());
    result.current.push(1);
    result.current.push(2);
    result.current.reset();
    expect(result.current.getMedian()).toBeNull();
  });

  it('handles even and odd counts as it grows', () => {
    const { result } = renderHook(() => useMedianTracker());
    // sequence: 4, 1, 6, 3, 8, 2 — pre-sorted halves shift each step
    const values = [4, 1, 6, 3, 8, 2];
    const expected = [4, 2.5, 4, 3.5, 4, 3.5];
    values.forEach((v, i) => {
      result.current.push(v);
      expect(result.current.getMedian()).toBe(expected[i]);
    });
  });

  it('handles repeated duplicates without skewing', () => {
    const { result } = renderHook(() => useMedianTracker());
    [5, 5, 5, 5, 5].forEach(v => result.current.push(v));
    expect(result.current.getMedian()).toBe(5);
    result.current.push(10);
    expect(result.current.getMedian()).toBe(5);
    result.current.push(0);
    expect(result.current.getMedian()).toBe(5);
  });

  it('matches the naive median across 500 random pushes', () => {
    const { result } = renderHook(() => useMedianTracker());
    // Deterministic LCG so a flake here points at a real bug.
    let seed = 12345;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    const naiveMedian = (xs: number[]): number => {
      const sorted = [...xs].sort((a, b) => a - b);
      const mid = sorted.length >> 1;
      return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    };
    const inserted: number[] = [];
    for (let i = 0; i < 500; i++) {
      const v = Math.round(rand() * 1000) / 100; // 0.00..10.00
      result.current.push(v);
      inserted.push(v);
      expect(result.current.getMedian()).toBeCloseTo(naiveMedian(inserted), 10);
    }
  });

  it('after reset, behaves like a fresh tracker', () => {
    const { result } = renderHook(() => useMedianTracker());
    [1, 2, 3, 4, 5, 6, 7].forEach(v => result.current.push(v));
    expect(result.current.getMedian()).toBe(4);
    result.current.reset();
    expect(result.current.getMedian()).toBeNull();
    result.current.push(100);
    expect(result.current.getMedian()).toBe(100);
    result.current.push(200);
    expect(result.current.getMedian()).toBe(150);
  });
});
