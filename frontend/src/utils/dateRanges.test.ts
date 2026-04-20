import { describe, it, expect } from 'vitest';
import { getPresetBounds, filterSolvesByRange } from './dateRanges';
import type { Solve } from '../types';

const makeSolve = (created_at: string): Solve => ({
  id: created_at, puzzle_type: '333', time: 10, dnf: false, plus_two: false,
  scramble: '', created_at,
});

describe('getPresetBounds', () => {
  it('returns null bounds for "all"', () => {
    expect(getPresetBounds('all', new Date('2026-04-20T12:00:00Z'))).toEqual({ start: null, end: null });
  });
  it('returns last-7-days bounds', () => {
    const now = new Date('2026-04-20T12:00:00Z');
    const { start, end } = getPresetBounds('7d', now);
    expect(end).toEqual(now);
    expect(start).toEqual(new Date('2026-04-13T12:00:00Z'));
  });
  it('returns last-30-days bounds', () => {
    const now = new Date('2026-04-20T12:00:00Z');
    const { start } = getPresetBounds('30d', now);
    expect(start).toEqual(new Date('2026-03-21T12:00:00Z'));
  });
});

describe('filterSolvesByRange', () => {
  it('returns all solves when bounds are null', () => {
    const s = [makeSolve('2026-04-10T00:00:00Z'), makeSolve('2026-01-01T00:00:00Z')];
    expect(filterSolvesByRange(s, { start: null, end: null })).toEqual(s);
  });
  it('filters to inclusive start and end', () => {
    const s = [
      makeSolve('2026-04-20T00:00:00Z'),
      makeSolve('2026-04-13T00:00:00Z'),
      makeSolve('2026-04-12T23:59:59Z'),
    ];
    const result = filterSolvesByRange(s, {
      start: new Date('2026-04-13T00:00:00Z'),
      end: new Date('2026-04-20T00:00:00Z'),
    });
    expect(result.map(x => x.id)).toEqual(['2026-04-20T00:00:00Z', '2026-04-13T00:00:00Z']);
  });
});
