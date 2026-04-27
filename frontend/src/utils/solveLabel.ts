import { formatTime } from './formatTime';
import { effectiveTime } from './solveTime';
import type { Solve } from '../types';

interface Opts { plusSuffix?: boolean; }

export const formatSolveLabel = (s: Solve, { plusSuffix = true }: Opts = {}): string => {
  if (s.dnf) return 'DNF';
  const base = formatTime(effectiveTime(s));
  return s.plus_two && plusSuffix ? `${base}+` : base;
};
