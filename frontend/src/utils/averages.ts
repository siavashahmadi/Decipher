import type { Solve } from '../types';

export type AverageResult = number | 'DNF' | null;

const effective = (s: Solve): number =>
  s.dnf ? Number.POSITIVE_INFINITY : s.plus_two ? s.time + 2 : s.time;

/**
 * WCA-style trimmed mean: drop best and worst, average the rest.
 * Returns null if fewer than `size` solves; 'DNF' if >1 DNF in the window
 * (1 DNF gets trimmed as the worst); a number otherwise.
 */
export function trimmedMean(solves: Solve[], size: number): AverageResult {
  if (solves.length < size) return null;
  const window = solves.slice(0, size).map(effective);
  const dnfCount = window.filter(t => t === Number.POSITIVE_INFINITY).length;
  if (dnfCount > 1) return 'DNF';
  const sorted = [...window].sort((a, b) => a - b);
  const inner = sorted.slice(1, -1);
  if (inner.some(t => t === Number.POSITIVE_INFINITY)) return 'DNF';
  return inner.reduce((a, b) => a + b, 0) / inner.length;
}

export const ao5 = (solves: Solve[]): AverageResult => trimmedMean(solves, 5);
export const ao12 = (solves: Solve[]): AverageResult => trimmedMean(solves, 12);

/** Number-only variant for call sites that already carry effective times. */
export function trimmedMeanNumbers(window: number[]): number | null {
  if (window.length < 3) return null;
  const sorted = [...window].sort((a, b) => a - b).slice(1, -1);
  return sorted.reduce((a, b) => a + b, 0) / sorted.length;
}
