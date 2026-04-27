import { useState, useMemo } from 'react';
import type { Solve } from '../types';
import { filterSolvesByRange, getPresetBounds, type DateRangePreset, type DateRangeBounds } from '../utils/dateRanges';

export interface UseStatsFiltersResult {
  preset: DateRangePreset;
  setPreset: (p: DateRangePreset) => void;
  customStart: string | null;
  setCustomStart: (v: string | null) => void;
  customEnd: string | null;
  setCustomEnd: (v: string | null) => void;
  bounds: DateRangeBounds;
  filteredSolves: Solve[];
}

export function useStatsFilters(solves: Solve[]): UseStatsFiltersResult {
  const [preset, setPreset] = useState<DateRangePreset>('all');
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [customEnd, setCustomEnd] = useState<string | null>(null);

  const bounds = useMemo((): DateRangeBounds => {
    if (preset === 'custom') {
      return {
        start: customStart ? new Date(customStart) : null,
        end: customEnd ? new Date(`${customEnd}T23:59:59.999Z`) : null,
      };
    }
    return getPresetBounds(preset);
  }, [preset, customStart, customEnd]);

  const filteredSolves = useMemo(() => filterSolvesByRange(solves, bounds), [solves, bounds]);

  return { preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd, bounds, filteredSolves };
}
