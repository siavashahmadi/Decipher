import type { Solve } from '../types';

let counter = 0;
export const makeSolve = (overrides: Partial<Solve> = {}): Solve => ({
  id: `solve-${++counter}`,
  puzzle_type: '333',
  time: 10,
  dnf: false,
  plus_two: false,
  scramble: '',
  created_at: '2026-04-20T00:00:00Z',
  ...overrides,
});
