import React from 'react';
import './Header.css';
import logo from '../logo.svg';
import { supabase } from '../services/auth';

const PUZZLES = [
  { value: '222', label: '2x2' },
  { value: '333', label: '3x3' },
  { value: '444', label: '4x4' },
  { value: '555', label: '5x5' },
  { value: '666', label: '6x6' },
  { value: '777', label: '7x7' },
  { value: 'pyram', label: 'Pyraminx' },
  { value: 'mega', label: 'Megaminx' },
  { value: 'skewb', label: 'Skewb' },
  { value: 'sq1', label: 'SQ-1' },
  { value: 'clock', label: 'Clock' },
];

const Header = ({ type, handleTypeChange, isGuest, onSignIn }) => {
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
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
        {PUZZLES.map(p => (
          <button key={p.value} className={`button ${type === p.value ? 'active' : ''}`} value={p.value} onClick={handleTypeChange}>{p.label}</button>
        ))}
      </div>
      <select
        className="puzzle-select"
        value={type}
        onChange={handleTypeChange}
      >
        {PUZZLES.map(p => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      {isGuest ? (
        <button className="sign-in-button" onClick={onSignIn}>
          Sign In
        </button>
      ) : (
        <button className="logout-button" onClick={handleLogout}>
          Logout
        </button>
      )}
    </header>
  );
};

export default Header;