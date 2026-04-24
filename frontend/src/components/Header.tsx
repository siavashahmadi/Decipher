import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../services/auth';
import { useAuth } from '../contexts/AuthContext';
import useMatchMedia from '../hooks/useMatchMedia';
import SettingsPanel from './SettingsPanel';
import AppNav from './AppNav';
import type { PuzzleType } from '../types';
import './Header.css';

interface PuzzleOption {
  value: PuzzleType;
  label: string;
}

const PUZZLES: PuzzleOption[] = [
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

interface HeaderProps {
  type: PuzzleType;
  handleTypeChange: (event: React.ChangeEvent<HTMLSelectElement> | React.MouseEvent<HTMLButtonElement>) => void;
}

const Header = ({ type, handleTypeChange }: HeaderProps): React.ReactElement => {
  const { isGuest, showSignIn } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsWrapperRef = useRef<HTMLDivElement>(null);
  const isMobile = useMatchMedia('(max-width: 639px)');

  useEffect(() => {
    if (!settingsOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (
        settingsWrapperRef.current &&
        !settingsWrapperRef.current.contains(event.target as Node)
      ) {
        setSettingsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [settingsOpen]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      window.location.reload();
    } catch (error) {
      console.error('Error signing out:', error);
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
