import type { Solve } from '../types';

export type DateRangePreset = 'all' | '30d' | '7d' | 'custom';

export interface DateRangeBounds {
  start: Date | null;
  end: Date | null;
}

export function getPresetBounds(preset: DateRangePreset, now: Date = new Date()): DateRangeBounds {
  if (preset === 'all' || preset === 'custom') return { start: null, end: null };
  const days = preset === '7d' ? 7 : 30;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end: now };
}

export function filterSolvesByRange(solves: Solve[], bounds: DateRangeBounds): Solve[] {
  if (!bounds.start && !bounds.end) return solves;
  return solves.filter(s => {
    const t = new Date(s.created_at).getTime();
    if (bounds.start && t < bounds.start.getTime()) return false;
    if (bounds.end && t > bounds.end.getTime()) return false;
    return true;
  });
}
