import { describe, it, expect } from 'vitest';
import { tickInspection } from './inspectionTick';

describe('tickInspection', () => {
  it('elapsed=0 returns continue, second=15, warning=null', () => {
    const result = tickInspection(0, null);
    expect(result).toEqual({ kind: 'continue', remainingSecond: 15, warning: null });
  });

  it('elapsed just before 1s boundary returns second=15', () => {
    const result = tickInspection(999, 15);
    expect(result.kind).toBe('continue');
    if (result.kind === 'continue') {
      expect(result.remainingSecond).toBe(15);
      expect(result.warning).toBe(null);
    }
  });

  it('elapsed=1000ms returns second=14', () => {
    const result = tickInspection(1000, 15);
    expect(result).toEqual({ kind: 'continue', remainingSecond: 14, warning: null });
  });

  it('just before 8s warning: no warning emitted', () => {
    const result = tickInspection(7999, 8);
    expect(result.kind).toBe('continue');
    if (result.kind === 'continue') expect(result.warning).toBe(null);
  });

  it('crosses 8s boundary: warning=8 emitted', () => {
    const result = tickInspection(8000, 8);
    expect(result.kind).toBe('continue');
    if (result.kind === 'continue') {
      expect(result.remainingSecond).toBe(7);
      expect(result.warning).toBe(8);
    }
  });

  it('8s warning only fires once: same remainingSecond, same lastShownSecond does not re-emit', () => {
    const result = tickInspection(8100, 7);
    expect(result.kind).toBe('continue');
    if (result.kind === 'continue') expect(result.warning).toBe(null);
  });

  it('just before 12s warning: no warning emitted', () => {
    const result = tickInspection(11999, 4);
    expect(result.kind).toBe('continue');
    if (result.kind === 'continue') expect(result.warning).toBe(null);
  });

  it('crosses 12s boundary: warning=12 emitted', () => {
    const result = tickInspection(12000, 4);
    expect(result.kind).toBe('continue');
    if (result.kind === 'continue') {
      expect(result.remainingSecond).toBe(3);
      expect(result.warning).toBe(12);
    }
  });

  it('12s warning only fires once: after lastShownSecond is updated', () => {
    const result = tickInspection(12250, 3);
    expect(result.kind).toBe('continue');
    if (result.kind === 'continue') expect(result.warning).toBe(null);
  });

  it('elapsed=15001ms (just past limit) returns plus_two', () => {
    const result = tickInspection(15001, 0);
    expect(result.kind).toBe('plus_two');
  });

  it('elapsed=15000ms is exactly at limit: still continue', () => {
    const result = tickInspection(15000, 1);
    expect(result.kind).toBe('continue');
    if (result.kind === 'continue') expect(result.remainingSecond).toBe(0);
  });

  it('elapsed=17001ms returns expired', () => {
    const result = tickInspection(17001, -2);
    expect(result).toEqual({ kind: 'expired' });
  });

  it('elapsed=17000ms is exactly plus_two boundary: still plus_two (not expired)', () => {
    const result = tickInspection(17000, -2);
    expect(result.kind).toBe('plus_two');
  });

  it('lastShownSecond=null triggers warning if elapsed past threshold', () => {
    const result = tickInspection(8000, null);
    expect(result.kind).toBe('continue');
    if (result.kind === 'continue') expect(result.warning).toBe(8);
  });

  it('both warnings can fire independently', () => {
    const r8 = tickInspection(8000, 8);
    const r12 = tickInspection(12000, 4);
    if (r8.kind === 'continue') expect(r8.warning).toBe(8);
    if (r12.kind === 'continue') expect(r12.warning).toBe(12);
  });
});
