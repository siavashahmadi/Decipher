import React from 'react';
import './Header.css';

const Header = ({ type, handleTypeChange }) => {
  return (
    <header className="header">
      <div className="header__title">Decipher</div>
      <div className="header__select">
        <select value={type} onChange={handleTypeChange}>
          <option value="222">2x2</option>
          <option value="333">3x3</option>
          <option value="444">4x4</option>
          <option value="555">5x5</option>
          <option value="666">6x6</option>
          <option value="777">7x7</option>
          <option value="pyram">Pyraminx</option>
          <option value="skewb">Skewb</option>
          <option value="sq1">Square-1</option>
          <option value="clock">Clock</option>
          <option value="minx">Megaminx</option>
        </select>
      </div>
    </header>
  );
};

export default Header;
