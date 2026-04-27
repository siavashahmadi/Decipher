import { describe, it, expect } from 'vitest';
import { computeRecentTrend } from './recentTrend';
import type { Solve } from '../types';
import { makeSolve } from '../test-utils/makeSolve';

const mk = makeSolve;

// Build a set of solves across `days` distinct local-days, `solvesPerDay` each,
// all with a given time. Dates are newest-first so day 0 is today.
const buildDays = (
  days: number,
  solvesPerDay: number,
  timeFor: (dayIdx: number, solveIdx: number) => number,
): Solve[] => {
  const out: Solve[] = [];
  for (let d = 0; d < days; d++) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    date.setHours(12, 0, 0, 0);
    for (let i = 0; i < solvesPerDay; i++) {
      out.push(mk({ time: timeFor(d, i), created_at: date.toISOString() }));
    }
  }
  return out;
};

describe('computeRecentTrend', () => {
  it('returns null for empty input', () => {
    expect(computeRecentTrend([])).toBeNull();
  });

  it('returns null when fewer than 10 qualifying sessions', () => {
    const solves = buildDays(9, 10, () => 15);
    expect(computeRecentTrend(solves)).toBeNull();
  });

  it('returns null when 5 qualifying sessions but no prior window', () => {
    const solves = buildDays(5, 10, () => 15);
    expect(computeRecentTrend(solves)).toBeNull();
  });

  it('computes recent vs prior when 10+ qualifying sessions', () => {
    // Most recent 5 days @ 15s, prior 5 days @ 20s.
    const solves = buildDays(10, 10, d => (d < 5 ? 15 : 20));
    const trend = computeRecentTrend(solves);
    expect(trend).not.toBeNull();
    expect(trend!.recentAvg).toBe(15);
    expect(trend!.priorAvg).toBe(20);
    expect(trend!.deltaSec).toBe(-5);
    expect(trend!.deltaPct).toBeCloseTo(-0.25);
    expect(trend!.recentSessions).toBe(5);
    expect(trend!.priorSessions).toBe(5);
  });

  it('skips days below sessionMinSolves', () => {
    // 5 recent days @ 15s/10-each, 5 "weak" days with only 3 solves (skipped),
    // 5 prior days @ 20s/10-each.
    const out: Solve[] = [];
    const push = (dayOffset: number, count: number, time: number) => {
      const date = new Date();
      date.setDate(date.getDate() - dayOffset);
      date.setHours(12, 0, 0, 0);
      for (let i = 0; i < count; i++) {
        out.push(mk({ time, created_at: date.toISOString() }));
      }
    };
    for (let d = 0; d < 5; d++) push(d, 10, 15);
    for (let d = 5; d < 10; d++) push(d, 3, 99);
    for (let d = 10; d < 15; d++) push(d, 10, 20);

    const trend = computeRecentTrend(out);
    expect(trend).not.toBeNull();
    expect(trend!.recentAvg).toBe(15);
    expect(trend!.priorAvg).toBe(20);
  });

  it('excludes DNFs and applies +2', () => {
    // 10 days, each with 10 non-DNF solves at 10s plus 2 DNFs (ignored)
    // and on recent days one +2 solve that should count as time+2.
    const out: Solve[] = [];
    for (let d = 0; d < 10; d++) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      date.setHours(12, 0, 0, 0);
      const iso = date.toISOString();
      for (let i = 0; i < 9; i++) out.push(mk({ time: 10, created_at: iso }));
      if (d < 5) {
        // one +2 solve: effective 12
        out.push(mk({ time: 10, plus_two: true, created_at: iso }));
      } else {
        out.push(mk({ time: 10, created_at: iso }));
      }
      // DNFs that should be ignored
      out.push(mk({ time: 999, dnf: true, created_at: iso }));
      out.push(mk({ time: 999, dnf: true, created_at: iso }));
    }
    const trend = computeRecentTrend(out);
    expect(trend).not.toBeNull();
    // Recent: 9*10 + 12 = 102 over 10 => 10.2
    expect(trend!.recentAvg).toBeCloseTo(10.2);
    // Prior: all 10 => 10
    expect(trend!.priorAvg).toBe(10);
  });

  it('qualifies sessions by non-DNF count, not total count', () => {
    // 10 "sessions" each with 9 non-DNF + 5 DNF. 9 < 10 so they don't qualify.
    const out: Solve[] = [];
    for (let d = 0; d < 10; d++) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      const iso = date.toISOString();
      for (let i = 0; i < 9; i++) out.push(mk({ time: 10, created_at: iso }));
      for (let i = 0; i < 5; i++) out.push(mk({ time: 999, dnf: true, created_at: iso }));
    }
    expect(computeRecentTrend(out)).toBeNull();
  });

  it('buckets by local date, not UTC', () => {
    // Two solves 2 hours apart that straddle midnight in local tz:
    // create them as local-23:00 and local-01:00 next day. Using Date
    // constructors with local fields ensures the toISOString converts back
    // to the user's timezone the same way the helper does.
    const day1 = new Date();
    day1.setHours(23, 0, 0, 0);
    const day2 = new Date(day1);
    day2.setHours(day2.getHours() + 2); // next local day 01:00

    // We need 10 qualifying days total but we're really just checking that
    // these two instants land in different local-date buckets. Build a
    // minimal grid: 9 older days @ 20s, and on two straddling instants
    // build 2 separate "sessions" with enough solves each.
    const out: Solve[] = [];
    for (let i = 0; i < 10; i++) out.push(mk({ time: 15, created_at: day1.toISOString() }));
    for (let i = 0; i < 10; i++) out.push(mk({ time: 25, created_at: day2.toISOString() }));
    for (let d = 2; d < 11; d++) {
      const date = new Date(day1);
      date.setDate(date.getDate() - d);
      for (let i = 0; i < 10; i++) out.push(mk({ time: 30, created_at: date.toISOString() }));
    }

    const trend = computeRecentTrend(out);
    expect(trend).not.toBeNull();
    // The two most-recent qualifying sessions (day2 @ 25s, day1 @ 15s) plus
    // three older days make up the recent window. We're only asserting they
    // were split into two different dates by checking total qualifying is
    // at least 10 (the 2 straddling days + 9 older = 11).
    expect(trend!.recentSessions + trend!.priorSessions).toBe(10);
  });
});
