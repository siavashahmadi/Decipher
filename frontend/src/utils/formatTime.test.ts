import { describe, it, expect } from 'vitest';
import { formatTime } from './formatTime';

describe('formatTime', () => {
  it('returns "-" for non-finite inputs', () => {
    expect(formatTime(NaN)).toBe('-');
    expect(formatTime(Infinity)).toBe('-');
    expect(formatTime(-Infinity)).toBe('-');
  });

  it('returns "-" for negative inputs without showSign', () => {
    expect(formatTime(-0.5)).toBe('-');
    expect(formatTime(-9.12)).toBe('-');
  });

  it('formats seconds under 60 with no leading zero', () => {
    expect(formatTime(0)).toBe('0.00');
    expect(formatTime(0.05)).toBe('0.05');
    expect(formatTime(9.12)).toBe('9.12');
    expect(formatTime(23.45)).toBe('23.45');
  });

  it('rounds centiseconds half-away-from-zero', () => {
    expect(formatTime(9.125)).toBe('9.13');
  });

  it('carries across the ones boundary', () => {
    expect(formatTime(9.999)).toBe('10.00');
  });

  it('carries across the minute boundary', () => {
    expect(formatTime(59.995)).toBe('1:00.00');
  });

  it('formats minutes with zero-padded seconds', () => {
    expect(formatTime(60)).toBe('1:00.00');
    expect(formatTime(127.45)).toBe('2:07.45');
  });

  it('carries across the hour boundary', () => {
    expect(formatTime(3599.999)).toBe('1:00:00.00');
  });

  it('formats hours with zero-padded minutes and seconds', () => {
    expect(formatTime(3600)).toBe('1:00:00.00');
    expect(formatTime(3723.45)).toBe('1:02:03.45');
  });

  it('applies showSign for positive, negative, and zero', () => {
    expect(formatTime(9.12, { showSign: true })).toBe('+9.12');
    expect(formatTime(-9.12, { showSign: true })).toBe('-9.12');
    expect(formatTime(0, { showSign: true })).toBe('0.00');
    expect(formatTime(127.45, { showSign: true })).toBe('+2:07.45');
  });
});
