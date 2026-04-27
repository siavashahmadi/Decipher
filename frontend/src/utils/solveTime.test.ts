import { describe, it, expect } from 'vitest';
import { effectiveTime, displayTime } from './solveTime';
import { makeSolve } from '../test-utils/makeSolve';

describe('effectiveTime', () => {
  it('returns Infinity for DNF', () => {
    expect(effectiveTime(makeSolve({ dnf: true, time: 10 }))).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns time + 2 for plus_two', () => {
    expect(effectiveTime(makeSolve({ plus_two: true, time: 10 }))).toBe(12);
  });

  it('returns raw time for a normal solve', () => {
    expect(effectiveTime(makeSolve({ time: 15 }))).toBe(15);
  });

  it('DNF takes precedence over plus_two', () => {
    expect(effectiveTime(makeSolve({ dnf: true, plus_two: true, time: 10 }))).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('displayTime', () => {
  it('returns null for DNF', () => {
    expect(displayTime(makeSolve({ dnf: true, time: 10 }))).toBeNull();
  });

  it('returns time + 2 for plus_two', () => {
    expect(displayTime(makeSolve({ plus_two: true, time: 10 }))).toBe(12);
  });

  it('returns raw time for a normal solve', () => {
    expect(displayTime(makeSolve({ time: 15 }))).toBe(15);
  });

  it('DNF takes precedence over plus_two', () => {
    expect(displayTime(makeSolve({ dnf: true, plus_two: true, time: 10 }))).toBeNull();
  });
});
