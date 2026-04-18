import React, { useState, useEffect, useCallback } from 'react';
import { randomScrambleForEvent } from 'cubing/scramble';
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
  onScrambleGenerated: (scramble: string) => void;
}

const Scramble = ({ type, onScrambleGenerated }: ScrambleProps): React.ReactElement => {
  const [scramble, setScramble] = useState('');
  const [loading, setLoading] = useState(true);

  const generateScramble = useCallback(async () => {
    setLoading(true);
    try {
      const scrambleObj = await randomScrambleForEvent(type);
      const scrambleString = scrambleObj.toString();
      onScrambleGenerated(scrambleString);
      setScramble(scrambleString);
    } catch (error) {
      console.error('Error generating scramble:', error);
      setScramble('Error generating scramble');
    } finally {
      setLoading(false);
    }
  }, [type, onScrambleGenerated]);

  useEffect(() => {
    generateScramble();
  }, [generateScramble]);

  const scrambleSize = getScrambleSize(type);

  return (
    <div className="scramble-container">
      {loading ? (
        <h2 className={`scramble-text ${scrambleSize}`}>Generating scramble...</h2>
      ) : (
        <h2 className={`scramble-text ${scrambleSize}`}>{scramble}</h2>
      )}
    </div>
  );
};

export default Scramble;
