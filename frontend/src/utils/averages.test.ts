import { describe, it, expect } from 'vitest';
import { ao5, ao12, trimmedMean, trimmedMeanNumbers } from './averages';
import { makeSolve } from '../test-utils/makeSolve';

const mk = makeSolve;

describe('ao5', () => {
  it('returns null for empty input', () => {
    expect(ao5([])).toBeNull();
  });

  it('returns null for fewer than 5 solves', () => {
    const solves = [10, 11, 12, 13].map(t => mk({ time: t }));
    expect(ao5(solves)).toBeNull();
  });

  it('trims best and worst, averages the middle three', () => {
    const solves = [8, 10, 12, 14, 20].map(t => mk({ time: t }));
    expect(ao5(solves)).toBe((10 + 12 + 14) / 3);
  });

  it('applies +2 to effective time', () => {
    const solves = [
      mk({ time: 10 }),
      mk({ time: 11 }),
      mk({ time: 12 }),
      mk({ time: 13, plus_two: true }), // effective 15
      mk({ time: 20 }), // worst, trimmed
    ];
    // Sorted effective: 10, 11, 12, 15, 20 → inner: 11, 12, 15
    expect(ao5(solves)).toBe((11 + 12 + 15) / 3);
  });

  it('treats 1 DNF as the worst and trims it', () => {
    const solves = [
      mk({ time: 10 }),
      mk({ time: 11 }),
      mk({ time: 12 }),
      mk({ time: 13 }),
      mk({ time: 99, dnf: true }), // worst → trimmed
    ];
    // Sorted: 10, 11, 12, 13, Infinity → inner: 11, 12, 13
    expect(ao5(solves)).toBe((11 + 12 + 13) / 3);
  });

  it("returns 'DNF' when 2 solves are DNF", () => {
    const solves = [
      mk({ time: 10 }),
      mk({ time: 11 }),
      mk({ time: 12 }),
      mk({ time: 99, dnf: true }),
      mk({ time: 99, dnf: true }),
    ];
    expect(ao5(solves)).toBe('DNF');
  });

  it("returns 'DNF' when 4 of 5 are DNF", () => {
    const solves = [
      mk({ time: 10 }),
      mk({ time: 99, dnf: true }),
      mk({ time: 99, dnf: true }),
      mk({ time: 99, dnf: true }),
      mk({ time: 99, dnf: true }),
    ];
    expect(ao5(solves)).toBe('DNF');
  });
});

describe('ao12', () => {
  it('returns null for 11 solves', () => {
    const solves = Array.from({ length: 11 }, (_, i) => mk({ time: 10 + i }));
    expect(ao12(solves)).toBeNull();
  });

  it('trims best and worst across 12', () => {
    const solves = Array.from({ length: 12 }, (_, i) => mk({ time: 10 + i }));
    // values 10..21; trim 10 and 21; sum 11..20 = 155; /10 = 15.5
    expect(ao12(solves)).toBe(15.5);
  });
});

describe('trimmedMean (generic size)', () => {
  it('works for size 3', () => {
    const solves = [10, 20, 30].map(t => mk({ time: t }));
    expect(trimmedMean(solves, 3)).toBe(20);
  });
});

describe('trimmedMeanNumbers', () => {
  it('returns the middle average for 5 values', () => {
    expect(trimmedMeanNumbers([1, 2, 3, 4, 5])).toBe(3);
  });

  it('returns null when fewer than 3 values', () => {
    expect(trimmedMeanNumbers([1, 2])).toBeNull();
  });

  it('works with unsorted input', () => {
    expect(trimmedMeanNumbers([5, 1, 3, 4, 2])).toBe(3);
  });
});
