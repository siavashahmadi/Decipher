import type { PuzzleType } from '../types';

export interface PuzzleEntry {
  value: PuzzleType;
  label: string;
  hotkey?: string;
}

export const PUZZLES: PuzzleEntry[] = [
  { value: '222', label: '2x2', hotkey: 'Alt+1' },
  { value: '333', label: '3x3', hotkey: 'Alt+2' },
  { value: '444', label: '4x4', hotkey: 'Alt+3' },
  { value: '555', label: '5x5', hotkey: 'Alt+4' },
  { value: '666', label: '6x6', hotkey: 'Alt+5' },
  { value: '777', label: '7x7', hotkey: 'Alt+6' },
  { value: 'pyram', label: 'Pyraminx', hotkey: 'Alt+7' },
  { value: 'mega', label: 'Megaminx', hotkey: 'Alt+8' },
  { value: 'skewb', label: 'Skewb', hotkey: 'Alt+9' },
  { value: 'sq1', label: 'SQ-1', hotkey: 'Alt+0' },
  { value: 'clock', label: 'Clock' },
];

export const PUZZLE_HOTKEYS: Record<string, PuzzleType> = Object.fromEntries(
  PUZZLES.filter(p => p.hotkey).map(p => [p.hotkey!, p.value]),
);
