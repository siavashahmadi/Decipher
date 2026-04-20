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
  it('groups solves by UTC date', () => {
    const solves = [
      mk({ created_at: '2026-04-20T01:00:00Z' }),
      mk({ created_at: '2026-04-20T23:00:00Z' }),
      mk({ created_at: '2026-04-19T12:00:00Z' }),
    ];
    const data = buildHeatmapData(solves);
    const byDay = Object.fromEntries(data.map(d => [d.day, d.value]));
    expect(byDay['2026-04-20']).toBe(2);
    expect(byDay['2026-04-19']).toBe(1);
  });
  it('excludes dnf solves from the count', () => {
    const solves = [
      mk({ created_at: '2026-04-20T00:00:00Z', dnf: true }),
      mk({ created_at: '2026-04-20T01:00:00Z' }),
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
