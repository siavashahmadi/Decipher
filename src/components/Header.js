import React from 'react';
import './Header.css';

const Header = ({ type, setPuzzleType, handleTypeChange }) => {

const puzzleTypes = [
  { id: '222', name: '2×2' },
  { id: '333', name: '3×3' },
  { id: '444', name: '4×4' },
  { id: '555', name: '5×5' },
  { id: '666', name: '6x6' },
  { id: '777', name: '7x7' },
  { id: 'pyram', name: 'Pyraminx' },
  { id: 'minx', name: 'Megaminx' },
  { id: 'skewb', name: 'Skewb' },
  { id: 'sq1', name: 'SQ-1' },
  { id: 'clock', name: 'Clock' },
];

  return (
    <header className="header">
      <h1 className="title">Ao5</h1>
      <div className="puzzle-buttons">
        {puzzleTypes.map(puzzle => (
          <button
          key={puzzle.id}
          className={`button ${type === puzzle.id ? 'active' : ''}`}
          onClick={() => handleTypeChange({ target: { value: puzzle.id } })}  
        >
          {puzzle.name}
        </button>
        ))}
      </div>

      {/* Dropdown for smaller screens */}
      <select 
        className="puzzle-select"
        value={type}
        onChange={handleTypeChange}
      >
        {puzzleTypes.map(puzzle => (
          <option key={puzzle.id} value={puzzle.id}>
            {puzzle.name}
          </option>
        ))}
      </select>
    </header>
  );
};

export default Header;