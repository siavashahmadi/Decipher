import { describe, it, expect } from 'vitest';
import { scrambleEventToTwisty } from './puzzleIds';

describe('scrambleEventToTwisty', () => {
  it('maps NxN cubes to TwistyPlayer ids', () => {
    expect(scrambleEventToTwisty('222')).toBe('2x2x2');
    expect(scrambleEventToTwisty('333')).toBe('3x3x3');
    expect(scrambleEventToTwisty('444')).toBe('4x4x4');
    expect(scrambleEventToTwisty('555')).toBe('5x5x5');
    expect(scrambleEventToTwisty('666')).toBe('6x6x6');
    expect(scrambleEventToTwisty('777')).toBe('7x7x7');
  });

  it('maps named puzzles', () => {
    expect(scrambleEventToTwisty('pyram')).toBe('pyraminx');
    expect(scrambleEventToTwisty('mega')).toBe('megaminx');
    expect(scrambleEventToTwisty('skewb')).toBe('skewb');
    expect(scrambleEventToTwisty('sq1')).toBe('square1');
  });

  it('returns null for clock (unsupported in v1)', () => {
    expect(scrambleEventToTwisty('clock')).toBeNull();
  });
});
