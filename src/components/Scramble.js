import React, { useState, useEffect, useCallback } from 'react';
import './Scramble.css';

const Scramble = ({ type }) => {
  const [scramble, setScramble] = useState('');
  const [loading, setLoading] = useState(true);

  const generateScramble = useCallback(async () => {
    setLoading(true);
    try {
      const { randomScrambleForEvent } = await import('https://cdn.cubing.net/js/cubing/scramble');
      const eventId = 
        type === '222' ? '222' :
        type === '333' ? '333' :
        type === '444' ? '444' :
        type === '555' ? '555' :
        type === '666' ? '666' :
        type === '777' ? '777' :
        type === 'sq1' ? 'sq1' :
        type === 'minx' ? 'minx' :
        type === 'clock' ? 'clock' :
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

  return (
    <div className="scramble-container">
      {loading ? (
        <h2 className="scramble-text">Generating scramble...</h2>
      ) : (
        <h2 className="scramble-text">{scramble}</h2>
      )}
    </div>
  );
};

export default Scramble;