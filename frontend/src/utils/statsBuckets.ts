import type { Solve } from '../types';
import { trimmedMeanNumbers } from './averages';

export interface HistogramBin {
  min: number;
  max: number;
  count: number;
  label: string;
}

// Effective time (accounts for +2). DNFs are the caller's problem.
const effective = (s: Solve): number => (s.plus_two ? s.time + 2 : s.time);

export function buildHistogram(times: number[], binCount: number): HistogramBin[] {
  if (!times.length || binCount <= 0) return [];
  let min = times[0], max = times[0];
  for (const t of times) { if (t < min) min = t; if (t > max) max = t; }
  if (min === max) {
    return [{ min, max, count: times.length, label: min.toFixed(2) }];
  }
  const span = max - min;
  const width = span / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    min: min + i * width,
    max: min + (i + 1) * width,
    count: 0,
    label: `${(min + i * width).toFixed(2)}`,
  }));
  for (const t of times) {
    let idx = Math.floor((t - min) / width);
    if (idx >= binCount) idx = binCount - 1; // include the max in the last bin
    bins[idx].count += 1;
  }
  return bins;
}

export interface HeatmapCell {
  day: string; // YYYY-MM-DD (UTC)
  value: number;
}

export function buildHeatmapData(solves: Solve[]): HeatmapCell[] {
  const counts = new Map<string, number>();
  for (const s of solves) {
    if (s.dnf) continue;
    const day = s.created_at.slice(0, 10); // ISO-8601 prefix is UTC date
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()].map(([day, value]) => ({ day, value }));
}

export interface StatsSummary {
  totalSolves: number;
  validSolves: number;
  totalSolveTimeSeconds: number;
  bestSingle: number | null;
  bestAo5: number | null;
  bestAo12: number | null;
  currentAo100: number | null;
}

function bestWindow(times: number[], size: number): number | null {
  if (times.length < size) return null;
  let best: number | null = null;
  for (let i = 0; i + size <= times.length; i++) {
    const avg = trimmedMeanNumbers(times.slice(i, i + size));
    if (avg !== null && (best === null || avg < best)) best = avg;
  }
  return best;
}

export function computeSummary(solves: Solve[]): StatsSummary {
  const valid = solves.filter(s => !s.dnf);
  const times = valid.map(effective);
  // Solves arrive newest-first from the API; bestWindow assumes chronological.
  const chronological = [...times].reverse();
  return {
    totalSolves: solves.length,
    validSolves: valid.length,
    totalSolveTimeSeconds: times.reduce((s, v) => s + v, 0),
    bestSingle: times.length ? (() => {
      let min = times[0];
      for (const t of times) { if (t < min) min = t; }
      return min;
    })() : null,
    bestAo5: bestWindow(chronological, 5),
    bestAo12: bestWindow(chronological, 12),
    currentAo100: chronological.length >= 100
      ? trimmedMeanNumbers(chronological.slice(-100))
      : null,
  };
}
