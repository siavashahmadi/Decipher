export type PuzzleType =
  | '222'
  | '333'
  | '444'
  | '555'
  | '666'
  | '777'
  | 'pyram'
  | 'mega'
  | 'skewb'
  | 'sq1'
  | 'clock';

const PUZZLE_TYPE_VALUES: ReadonlySet<string> = new Set([
  '222', '333', '444', '555', '666', '777',
  'pyram', 'mega', 'skewb', 'sq1', 'clock',
]);

export const isPuzzleType = (value: unknown): value is PuzzleType =>
  typeof value === 'string' && PUZZLE_TYPE_VALUES.has(value);

export interface Solve {
  id: string;
  user_id?: string;
  puzzle_type: PuzzleType;
  time: number;
  dnf: boolean;
  plus_two: boolean;
  scramble: string;
  created_at: string;
}

export interface PersonalBest {
  puzzle_type: PuzzleType;
  time: number;
  achieved_at: string;
}

export interface PenaltyFlags {
  plusTwo: boolean;
  dnf: boolean;
}
