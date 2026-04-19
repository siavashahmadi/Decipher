import type { PuzzleType } from '../types';

export type TwistyPuzzleId =
  | '2x2x2'
  | '3x3x3'
  | '4x4x4'
  | '5x5x5'
  | '6x6x6'
  | '7x7x7'
  | 'pyraminx'
  | 'megaminx'
  | 'skewb'
  | 'square1';

const EVENT_TO_TWISTY: Record<PuzzleType, TwistyPuzzleId | null> = {
  '222': '2x2x2',
  '333': '3x3x3',
  '444': '4x4x4',
  '555': '5x5x5',
  '666': '6x6x6',
  '777': '7x7x7',
  pyram: 'pyraminx',
  mega: 'megaminx',
  skewb: 'skewb',
  sq1: 'square1',
  clock: null,
};

const TWISTY_TO_EVENT: Record<string, PuzzleType> = Object.entries(EVENT_TO_TWISTY)
  .filter((entry): entry is [PuzzleType, TwistyPuzzleId] => entry[1] !== null)
  .reduce<Record<string, PuzzleType>>((acc, [event, twisty]) => {
    acc[twisty] = event;
    return acc;
  }, {});

export const scrambleEventToTwisty = (event: PuzzleType): TwistyPuzzleId | null => {
  return EVENT_TO_TWISTY[event];
};

export const twistyToScrambleEvent = (twisty: string): PuzzleType | null => {
  return TWISTY_TO_EVENT[twisty] ?? null;
};
