import { describe, it, expect } from 'vitest';
import { formatSolveLabel } from './solveLabel';
import { makeSolve } from '../test-utils/makeSolve';

describe('formatSolveLabel', () => {
  it('returns "DNF" for a DNF solve', () => {
    expect(formatSolveLabel(makeSolve({ dnf: true, time: 10 }))).toBe('DNF');
  });

  it('returns plain time string for a normal solve', () => {
    expect(formatSolveLabel(makeSolve({ time: 12.34 }))).toBe('12.34');
  });

  it('appends "+" for a plus_two solve by default', () => {
    expect(formatSolveLabel(makeSolve({ plus_two: true, time: 12.34 }))).toBe('14.34+');
  });

  it('omits "+" when plusSuffix is false', () => {
    expect(formatSolveLabel(makeSolve({ plus_two: true, time: 12.34 }), { plusSuffix: false })).toBe('14.34');
  });

  it('returns "DNF" for a solve with both dnf and plus_two', () => {
    expect(formatSolveLabel(makeSolve({ dnf: true, plus_two: true, time: 10 }))).toBe('DNF');
  });
});
