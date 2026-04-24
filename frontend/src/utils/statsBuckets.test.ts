import { describe, it, expect } from 'vitest';
import { buildHistogram, buildHeatmapData, computeSummary } from './statsBuckets';
import type { Solve } from '../types';

const mk = (overrides: Partial<Solve>): Solve => ({
  id: Math.random().toString(), puzzle_type: '333', time: 10, dnf: false,
  plus_two: false, scramble: '', created_at: '2026-04-20T00:00:00Z', ...overrides,
});

describe('buildHistogram', () => {
  it('returns empty bins for no solves', () => {
    expect(buildHistogram([], 5)).toEqual([]);
  });
  it('buckets times into N bins with inclusive max on the last bin', () => {
    const bins = buildHistogram([10, 12, 14, 16, 20], 5);
    expect(bins).toHaveLength(5);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(5);
    expect(bins[0].min).toBe(10);
    expect(bins[bins.length - 1].max).toBe(20);
  });
});

describe('buildHeatmapData', () => {
  const localKey = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  it('groups solves by local date', () => {
    // Build three local-time instants so the assertion is independent of the
    // test runner's timezone.
    const eveningA = new Date(2026, 3, 20, 23, 30); // Apr 20 local
    const morningA = new Date(2026, 3, 20, 1, 0);   // Apr 20 local
    const dayBefore = new Date(2026, 3, 19, 12, 0); // Apr 19 local
    const solves = [
      mk({ created_at: eveningA.toISOString() }),
      mk({ created_at: morningA.toISOString() }),
      mk({ created_at: dayBefore.toISOString() }),
    ];
    const data = buildHeatmapData(solves);
    const byDay = Object.fromEntries(data.map(d => [d.day, d.value]));
    expect(byDay[localKey(eveningA)]).toBe(2);
    expect(byDay[localKey(dayBefore)]).toBe(1);
  });

  it('attributes a late-evening solve to the local day, not UTC', () => {
    // 23:30 local time — in any tz west of UTC this ISO string's UTC date
    // is the NEXT day; we want the cell on the LOCAL day.
    const lateLocal = new Date(2026, 3, 20, 23, 30);
    const data = buildHeatmapData([mk({ created_at: lateLocal.toISOString() })]);
    expect(data[0].day).toBe(localKey(lateLocal));
  });

  it('excludes dnf solves from the count', () => {
    const t = new Date(2026, 3, 20, 1, 0);
    const solves = [
      mk({ created_at: t.toISOString(), dnf: true }),
      mk({ created_at: new Date(2026, 3, 20, 2, 0).toISOString() }),
    ];
    expect(buildHeatmapData(solves)[0].value).toBe(1);
  });
});

describe('computeSummary', () => {
  it('reports counts and bests', () => {
    const solves = [
      mk({ time: 10 }), mk({ time: 12 }), mk({ time: 9, plus_two: true }),
      mk({ time: 15, dnf: true }), mk({ time: 11 }), mk({ time: 13 }),
    ];
    const s = computeSummary(solves);
    expect(s.totalSolves).toBe(6);
    expect(s.validSolves).toBe(5);
    expect(s.bestSingle).toBe(10); // 9+2=11 so 10 wins
  });
  it('returns null bests when no valid solves', () => {
    expect(computeSummary([mk({ dnf: true })]).bestSingle).toBeNull();
  });
});
