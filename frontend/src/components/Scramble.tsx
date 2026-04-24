import type { ReactElement } from 'react';
import type { PuzzleType } from '../types';
import './Scramble.css';

type ScrambleSize = 'small' | 'medium' | 'large';

const getScrambleSize = (puzzleType: PuzzleType): ScrambleSize => {
  if (['222', 'pyram', 'skewb'].includes(puzzleType)) return 'large';
  if (['444', '555', '666', '777'].includes(puzzleType)) return 'small';
  return 'medium';
};

interface ScrambleProps {
  type: PuzzleType;
  scramble: string | null;
  loading: boolean;
}

const Scramble = ({ type, scramble, loading }: ScrambleProps): ReactElement => {
  const scrambleSize = getScrambleSize(type);
  const text = loading || !scramble ? 'Generating scramble...' : scramble;
  return (
    <div className="scramble-container">
      <div className={`scramble-text ${scrambleSize}`}>{text}</div>
    </div>
  );
};

export default Scramble;
