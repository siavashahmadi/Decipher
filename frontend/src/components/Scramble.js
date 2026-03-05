import React, { useState, useEffect, useCallback } from 'react';
import './Scramble.css';

const Scramble = ({ type }) => {
  const [scramble, setScramble] = useState('');
  const [loading, setLoading] = useState(true);

  const getScrambleSize = (puzzleType) => {
    // Larger text for simpler puzzles
    if (['222', 'pyram', 'skewb'].includes(puzzleType)) {
      return 'large';
    }
    // Smaller text for complex puzzles
    if (['444', '555', '666', '777', 'minx'].includes(puzzleType)) {
      return 'small';
    }
    // Medium (default) text for other puzzles
    return 'medium';
  };

  const generateScramble = useCallback(async () => {
    setLoading(true);
    try {
      const { randomScrambleForEvent } = await import('https://cdn.cubing.net/v0/js/cubing/scramble');
      const eventId = 
        type === '222' ? '222' :
        type === '333' ? '333' :
        type === '444' ? '444' :
        type === '555' ? '555' :
        type === '666' ? '666' :
        type === '777' ? '777' :
        type === 'sq1' ? 'sq1' :
        type === 'minx' ? 'minx' :
        type === 'pyram' ? 'pyram' : 
        type === 'skewb' ? 'skewb' : '333';

      const scrambleObj = await randomScrambleForEvent(eventId);
      const scrambleString = scrambleObj.toString();
      setScramble(scrambleString);
    } catch (error) {
      console.error('Error generating scramble:', error);
      setScramble('Error generating scramble');
    } finally {
      setLoading(false);
    }
  }, [type]);

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