import type { Solve } from '../types';

export const effectiveTime = (s: Solve): number =>
  s.dnf ? Number.POSITIVE_INFINITY : s.plus_two ? s.time + 2 : s.time;

export const displayTime = (s: Solve): number | null =>
  s.dnf ? null : s.plus_two ? s.time + 2 : s.time;
