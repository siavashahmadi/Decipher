import React from 'react';
import './Header.css';
import logo from '../logo.svg';
import { supabase } from '../services/auth';
// import { auth } from '../services/auth';

const Header = ({ type, handleTypeChange }) => {
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      // await auth.signOut();
      // Force reload the page to return to auth screen
      window.location.reload();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <header className="header">
      <div className="title-container">
        <div className="header-logo">
          <img src={logo} alt="Ao5 Logo" />
        </div>
        <h1 className="title">Ao5</h1>
      </div>
      <div className="puzzle-buttons">
        <button className={`button ${type === '222' ? 'active' : ''}`} value="222" onClick={handleTypeChange}>2x2</button>
        <button className={`button ${type === '333' ? 'active' : ''}`} value="333" onClick={handleTypeChange}>3x3</button>
        <button className={`button ${type === '444' ? 'active' : ''}`} value="444" onClick={handleTypeChange}>4x4</button>
        <button className={`button ${type === '555' ? 'active' : ''}`} value="555" onClick={handleTypeChange}>5x5</button>
        <button className={`button ${type === '666' ? 'active' : ''}`} value="666" onClick={handleTypeChange}>6x6</button>
        <button className={`button ${type === '777' ? 'active' : ''}`} value="777" onClick={handleTypeChange}>7x7</button>
        <button className={`button ${type === 'pyram' ? 'active' : ''}`} value="pyram" onClick={handleTypeChange}>Pyraminx</button>
        <button className={`button ${type === 'mega' ? 'active' : ''}`} value="mega" onClick={handleTypeChange}>Megaminx</button>
        <button className={`button ${type === 'skewb' ? 'active' : ''}`} value="skewb" onClick={handleTypeChange}>Skewb</button>
        <button className={`button ${type === 'sq1' ? 'active' : ''}`} value="sq1" onClick={handleTypeChange}>SQ-1</button>
        <button className={`button ${type === 'clock' ? 'active' : ''}`} value="clock" onClick={handleTypeChange}>Clock</button>
      </div>
      <select 
        className="puzzle-select"
        value={type}
        onChange={handleTypeChange}
      >
        <option value="222">2x2</option>
        <option value="333">3x3</option>
        <option value="444">4x4</option>
        <option value="555">5x5</option>
        <option value="666">6x6</option>
        <option value="777">7x7</option>
        <option value="pyram">Pyraminx</option>
        <option value="mega">Megaminx</option>
        <option value="skewb">Skewb</option>
        <option value="sq1">SQ-1</option>
        <option value="clock">Clock</option>
      </select>
      <button className="logout-button" onClick={handleLogout}>
        Logout
      </button>
    </header>
  );
};

export default Header;