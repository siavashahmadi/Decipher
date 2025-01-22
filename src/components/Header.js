import React from 'react';
import './Header.css';

const Header = ({ type, handleTypeChange }) => {
  const handlePuzzleSelect = (puzzleType) => {
    handleTypeChange({ target: { value: puzzleType } });
  };

  return (
    <header className="header">
      <h1 className="title">Ao5</h1>
      <div className="puzzle-buttons">
      <button 
          className={`puzzle-button ${type === '222' ? 'active' : ''}`}
          onClick={() => handlePuzzleSelect('222')}
        >
          2×2
        </button>
        <button 
          className={`puzzle-button ${type === '333' ? 'active' : ''}`}
          onClick={() => handlePuzzleSelect('333')}
        >
          3×3
        </button>
        <button 
          className={`puzzle-button ${type === '444' ? 'active' : ''}`}
          onClick={() => handlePuzzleSelect('444')}
        >
          4×4
        </button>
        <button 
          className={`puzzle-button ${type === '555' ? 'active' : ''}`}
          onClick={() => handlePuzzleSelect('555')}
        >
          5×5
        </button>
        <button 
          className={`puzzle-button ${type === '666' ? 'active' : ''}`}
          onClick={() => handlePuzzleSelect('666')}
        >
          6×6
        </button>
        <button 
          className={`puzzle-button ${type === '777' ? 'active' : ''}`}
          onClick={() => handlePuzzleSelect('777')}
        >
          7×7
        </button>
        <button 
          className={`puzzle-button ${type === 'pyram' ? 'active' : ''}`}
          onClick={() => handlePuzzleSelect('pyram')}
        >
          Pyraminx
        </button>
        <button 
          className={`puzzle-button ${type === 'minx' ? 'active' : ''}`}
          onClick={() => handlePuzzleSelect('minx')}
        >
          Megaminx
        </button>
        <button 
          className={`puzzle-button ${type === 'skewb' ? 'active' : ''}`}
          onClick={() => handlePuzzleSelect('skewb')}
        >
          Skewb
        </button>
        <button 
          className={`puzzle-button ${type === 'sq1' ? 'active' : ''}`}
          onClick={() => handlePuzzleSelect('sq1')}
        >
          SQ1
        </button>
        <button 
          className={`puzzle-button ${type === 'clock' ? 'active' : ''}`}
          onClick={() => handlePuzzleSelect('clock')}
        >
          Clock
        </button>
      </div>
    </header>
  );
};

export default Header;