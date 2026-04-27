import type { Solve } from '../types';
import { effectiveTime } from './solveTime';
import { localDateKey } from './localDateKey';

export interface TrendResult {
  recentAvg: number;
  priorAvg: number;
  deltaSec: number;
  deltaPct: number;
}

interface Options {
  sessionMinSolves?: number;
  windowSize?: number;
}

// Groups solves by local-date, filters to qualifying sessions (>= min non-DNF
// solves), then averages the last-N sessions vs. the prior-N weighted by solve
// count so a 200-solve day doesn't have the same weight as a 10-solve day.
export function computeRecentTrend(
  solves: Solve[],
  opts: Options = {},
): TrendResult | null {
  const sessionMin = opts.sessionMinSolves ?? 10;
  const windowSize = opts.windowSize ?? 5;

  if (solves.length === 0) return null;

  const byDate = new Map<string, Solve[]>();
  for (const s of solves) {
    const key = localDateKey(s.created_at);
    const bucket = byDate.get(key);
    if (bucket) bucket.push(s);
    else byDate.set(key, [s]);
  }

  const qualifying: { date: string; valid: Solve[] }[] = [];
  for (const [date, bucket] of byDate) {
    const valid = bucket.filter(s => !s.dnf);
    if (valid.length >= sessionMin) qualifying.push({ date, valid });
  }
  qualifying.sort((a, b) => (a.date < b.date ? 1 : -1));

  if (qualifying.length < windowSize * 2) return null;

  const recentSessions = qualifying.slice(0, windowSize);
  const priorSessions = qualifying.slice(windowSize, windowSize * 2);

  const avg = (sessions: { valid: Solve[] }[]): number => {
    let sum = 0;
    let count = 0;
    for (const s of sessions) {
      for (const solve of s.valid) {
        sum += effectiveTime(solve);
        count += 1;
      }
    }
    return sum / count;
  };

  const recentAvg = avg(recentSessions);
  const priorAvg = avg(priorSessions);
  const deltaSec = recentAvg - priorAvg;
  const deltaPct = priorAvg === 0 ? 0 : deltaSec / priorAvg;

  return {
    recentAvg,
    priorAvg,
    deltaSec,
    deltaPct,
  };
}
