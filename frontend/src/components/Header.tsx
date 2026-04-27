import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../services/auth';
import { useAuth } from '../contexts/AuthContext';
import useMatchMedia from '../hooks/useMatchMedia';
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick';
import SettingsPanel from './SettingsPanel';
import AppNav from './AppNav';
import type { PuzzleType } from '../types';
import { PUZZLES } from '../data/puzzles';
import './Header.css';

interface HeaderProps {
  type: PuzzleType;
  handleTypeChange: (event: React.ChangeEvent<HTMLSelectElement> | React.MouseEvent<HTMLButtonElement>) => void;
}

const Header = ({ type, handleTypeChange }: HeaderProps): React.ReactElement => {
  const { isGuest, showSignIn } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsWrapperRef = useRef<HTMLDivElement>(null);
  const isMobile = useMatchMedia('(max-width: 639px)');

  useDismissOnOutsideClick(settingsWrapperRef, () => setSettingsOpen(false), settingsOpen);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      toast.error('Could not sign out.');
    }
  };

  return (
    <header className="header">
      <AppNav />
      <div className="title-container">
        <h1 className="title">Ao5</h1>
      </div>
      {isMobile ? (
        <select
          className="puzzle-select"
          value={type}
          onChange={handleTypeChange}
        >
          {PUZZLES.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      ) : (
        <div className="puzzle-buttons">
          {PUZZLES.map(p => (
            <button key={p.value} className={`button ${type === p.value ? 'active' : ''}`} value={p.value} onClick={handleTypeChange}>{p.label}</button>
          ))}
        </div>
      )}
      <div className="settings-wrapper" ref={settingsWrapperRef}>
        <button
          type="button"
          className="settings-button"
          aria-label="Settings"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          title="Settings"
          onClick={() => setSettingsOpen(prev => !prev)}
        >
          {'\u2699'}
        </button>
        {settingsOpen && <SettingsPanel />}
      </div>
      {isGuest ? (
        <button className="sign-in-button" onClick={showSignIn}>
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
