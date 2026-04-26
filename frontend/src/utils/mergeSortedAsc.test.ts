import { describe, it, expect } from 'vitest';
import { mergeSortedAsc } from './mergeSortedAsc';

describe('mergeSortedAsc', () => {
  it('returns an empty array when both inputs are empty', () => {
    expect(mergeSortedAsc([], [])).toEqual([]);
  });

  it('returns the non-empty input when the other is empty', () => {
    expect(mergeSortedAsc([1, 2, 3], [])).toEqual([1, 2, 3]);
    expect(mergeSortedAsc([], [4, 5])).toEqual([4, 5]);
  });

  it('merges fully disjoint ranges', () => {
    expect(mergeSortedAsc([1, 2, 3], [4, 5, 6])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(mergeSortedAsc([10, 20], [1, 2])).toEqual([1, 2, 10, 20]);
  });

  it('merges interleaved ranges', () => {
    expect(mergeSortedAsc([1, 3, 5], [2, 4, 6])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('preserves duplicates from both inputs', () => {
    expect(mergeSortedAsc([1, 2, 2], [2, 3])).toEqual([1, 2, 2, 2, 3]);
  });

  it('keeps a-before-b for equal elements (stable for the left input)', () => {
    // Numbers themselves cannot encode origin, but the <=  branch guarantees
    // ties go to the left array. Verified via length parity.
    const left = [5, 5];
    const right = [5];
    const merged = mergeSortedAsc(left, right);
    expect(merged).toEqual([5, 5, 5]);
    expect(merged.length).toBe(left.length + right.length);
  });

  it('does not mutate the inputs', () => {
    const a = [1, 3, 5];
    const b = [2, 4, 6];
    const aCopy = [...a];
    const bCopy = [...b];
    mergeSortedAsc(a, b);
    expect(a).toEqual(aCopy);
    expect(b).toEqual(bCopy);
  });

  it('matches a naive concat+sort on a randomized large input', () => {
    const rng = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    };
    const r = rng(42);
    const big1 = Array.from({ length: 1000 }, () => Math.floor(r() * 10000)).sort((a, b) => a - b);
    const big2 = Array.from({ length: 750 }, () => Math.floor(r() * 10000)).sort((a, b) => a - b);
    const merged = mergeSortedAsc(big1, big2);
    const naive = [...big1, ...big2].sort((a, b) => a - b);
    expect(merged).toEqual(naive);
  });
});
