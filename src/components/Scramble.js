import React, { useState, useEffect, useCallback } from 'react';
import './Scramble.css';

const Scramble = ({ type }) => {
  const [scramble, setScramble] = useState('');

  const generateScramble = useCallback(async () => {
    try {
      console.log(`Requesting scramble for type: ${type}`);
      const { randomScrambleForEvent } = await import('https://cdn.cubing.net/js/cubing/scramble');
      const scramble = await randomScrambleForEvent(type);
      const scrambleString = scramble.toString();
      console.log('Scramble response:', scrambleString);
      setScramble(scrambleString);
    } catch (error) {
      console.error('Error fetching scramble:', error);
      setScramble('Error fetching scramble');
    }
  }, [type]);

  useEffect(() => {
    generateScramble();
  }, [generateScramble]);

  return (
    <div className="scramble-container">
      <h2 className="scramble-text">{scramble}</h2>
    </div>
  );
};

export default Scramble;
