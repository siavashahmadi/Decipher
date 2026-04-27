import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStatsFilters } from './useStatsFilters';
import { makeSolve } from '../test-utils/makeSolve';

describe('useStatsFilters', () => {
  it('defaults to preset "all" with null bounds', () => {
    const { result } = renderHook(() => useStatsFilters([]));
    expect(result.current.preset).toBe('all');
    expect(result.current.bounds.start).toBeNull();
    expect(result.current.bounds.end).toBeNull();
  });

  it('returns all solves when preset is "all"', () => {
    const solves = [makeSolve(), makeSolve()];
    const { result } = renderHook(() => useStatsFilters(solves));
    expect(result.current.filteredSolves).toBe(solves);
  });

  it('"7d" preset sets bounds.end close to now', () => {
    const before = Date.now();
    const { result } = renderHook(() => useStatsFilters([]));
    act(() => { result.current.setPreset('7d'); });
    const after = Date.now();
    const end = result.current.bounds.end;
    expect(end).not.toBeNull();
    expect(end!.getTime()).toBeGreaterThanOrEqual(before);
    expect(end!.getTime()).toBeLessThanOrEqual(after + 5);
  });

  it('"7d" preset sets bounds.start ~7 days ago', () => {
    const before = Date.now();
    const { result } = renderHook(() => useStatsFilters([]));
    act(() => { result.current.setPreset('7d'); });
    const after = Date.now();
    const start = result.current.bounds.start;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(start).not.toBeNull();
    expect(start!.getTime()).toBeGreaterThanOrEqual(before - sevenDaysMs);
    expect(start!.getTime()).toBeLessThanOrEqual(after - sevenDaysMs + 5);
  });

  it('"custom" preset with no dates gives null bounds', () => {
    const { result } = renderHook(() => useStatsFilters([]));
    act(() => { result.current.setPreset('custom'); });
    expect(result.current.bounds.start).toBeNull();
    expect(result.current.bounds.end).toBeNull();
  });

  it('"custom" preset derives bounds from customStart and customEnd', () => {
    const { result } = renderHook(() => useStatsFilters([]));
    act(() => {
      result.current.setPreset('custom');
      result.current.setCustomStart('2026-04-01');
      result.current.setCustomEnd('2026-04-10');
    });
    expect(result.current.bounds.start).toEqual(new Date('2026-04-01'));
    expect(result.current.bounds.end).toEqual(new Date('2026-04-10T23:59:59.999Z'));
  });

  it('customStart/customEnd do not affect bounds when preset is not "custom"', () => {
    const { result } = renderHook(() => useStatsFilters([]));
    act(() => {
      result.current.setCustomStart('2026-04-01');
      result.current.setCustomEnd('2026-04-10');
    });
    expect(result.current.preset).toBe('all');
    expect(result.current.bounds.start).toBeNull();
    expect(result.current.bounds.end).toBeNull();
  });

  it('filteredSolves recomputes when solves change', () => {
    const earlyDate = '2026-01-01T00:00:00Z';
    const recentDate = '2026-04-25T00:00:00Z';
    const s1 = makeSolve({ created_at: earlyDate });
    const s2 = makeSolve({ created_at: recentDate });

    const { result, rerender } = renderHook(
      ({ solves }) => useStatsFilters(solves),
      { initialProps: { solves: [s1] } },
    );

    act(() => { result.current.setPreset('30d'); });
    const firstFiltered = result.current.filteredSolves;
    expect(firstFiltered).not.toContain(s1);

    rerender({ solves: [s1, s2] });
    expect(result.current.filteredSolves).toContain(s2);
    expect(result.current.filteredSolves).not.toContain(s1);
  });

  it('filteredSolves reference is stable when unrelated state changes', () => {
    const solves = [makeSolve()];
    const { result } = renderHook(() => useStatsFilters(solves));

    const first = result.current.filteredSolves;
    act(() => {
      result.current.setCustomStart('2026-04-01');
    });
    expect(result.current.filteredSolves).toBe(first);
  });
});
