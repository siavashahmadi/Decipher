import { describe, it, expect } from 'vitest';
import { PUZZLES, PUZZLE_HOTKEYS } from './puzzles';
import type { PuzzleType } from '../types';

describe('PUZZLES', () => {
  it('contains the known core puzzle set', () => {
    const values = PUZZLES.map(p => p.value);
    const expected: PuzzleType[] = [
      '222', '333', '444', '555', '666', '777',
      'pyram', 'mega', 'skewb', 'sq1', 'clock',
    ];
    expect(values).toEqual(expected);
  });

  it('every entry with a hotkey appears as a value in PUZZLE_HOTKEYS', () => {
    for (const entry of PUZZLES) {
      if (entry.hotkey) {
        expect(PUZZLE_HOTKEYS[entry.hotkey]).toBe(entry.value);
      }
    }
  });

  it('PUZZLE_HOTKEYS only contains keys that map to PUZZLES entries with hotkeys', () => {
    const hotkeyEntries = PUZZLES.filter(p => p.hotkey);
    const hotkeySet = new Set(hotkeyEntries.map(p => p.hotkey!));
    for (const key of Object.keys(PUZZLE_HOTKEYS)) {
      expect(hotkeySet.has(key)).toBe(true);
    }
    expect(Object.keys(PUZZLE_HOTKEYS).length).toBe(hotkeyEntries.length);
  });

  it('clock has no hotkey and is absent from PUZZLE_HOTKEYS', () => {
    const clock = PUZZLES.find(p => p.value === 'clock');
    expect(clock).toBeDefined();
    expect(clock!.hotkey).toBeUndefined();
    const hotkeyValues = Object.values(PUZZLE_HOTKEYS);
    expect(hotkeyValues).not.toContain('clock');
  });

  it('adding a hotkey-less entry would not pollute PUZZLE_HOTKEYS', () => {
    // Verify the filter predicate works: entries without hotkey are excluded
    const withoutHotkey = PUZZLES.filter(p => !p.hotkey);
    expect(withoutHotkey.length).toBeGreaterThan(0);
    for (const entry of withoutHotkey) {
      const appearsAsValue = Object.values(PUZZLE_HOTKEYS).includes(entry.value);
      expect(appearsAsValue).toBe(false);
    }
  });
});
