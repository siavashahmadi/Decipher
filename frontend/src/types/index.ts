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
