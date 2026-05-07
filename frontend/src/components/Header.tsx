import { useCallback, useRef, useState, type ChangeEvent, type MouseEvent, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabaseAuthClient } from '../services/authClient';
import { useAuth } from '../contexts/AuthContext';
import useMatchMedia from '../hooks/useMatchMedia';
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick';
import { useFocusTrap } from '../hooks/useFocusTrap';
import SettingsPanel from './SettingsPanel';
import AppNav from './AppNav';
import type { PuzzleType } from '../types';
import { PUZZLES } from '../data/puzzles';
import './Header.css';

interface HeaderProps {
  type: PuzzleType;
  handleTypeChange: (event: ChangeEvent<HTMLSelectElement> | MouseEvent<HTMLButtonElement>) => void;
}

const Header = ({ type, handleTypeChange }: HeaderProps): ReactElement => {
  const navigate = useNavigate();
  const { isGuest } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const settingsWrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const settingsModalRef = useRef<HTMLDivElement>(null);
  const isMobile = useMatchMedia('(max-width: 600px)');

  useDismissOnOutsideClick(settingsWrapperRef, () => setSettingsOpen(false), settingsOpen && !isMobile);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismissOnOutsideClick(menuRef, closeMenu, menuOpen);
  useFocusTrap(menuRef, menuOpen);

  const closeSettingsModal = useCallback(() => setSettingsOpen(false), []);
  useDismissOnOutsideClick(settingsModalRef, closeSettingsModal, settingsOpen && isMobile);
  useFocusTrap(settingsModalRef, settingsOpen && isMobile);

  const handleLogout = async () => {
    const { error } = await supabaseAuthClient.signOut();
    if (error) toast.error('Could not sign out.');
    setMenuOpen(false);
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };

  const handleSettingsClick = () => {
    setMenuOpen(false);
    setSettingsOpen(true);
  };

  if (isMobile) {
    return (
      <>
        <header className="header header-mobile">
          <div className="title-container">
            <h1 className="title">Ao5</h1>
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
          <button
            type="button"
            className="hamburger-button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen(prev => !prev)}
          >
            <span className="hamburger-icon" aria-hidden="true" />
          </button>
        </header>
        {menuOpen && (
          <div className="mobile-menu" ref={menuRef} role="menu">
            <button type="button" role="menuitem" className="mobile-menu-item" onClick={() => handleNavClick('/')}>Timer</button>
            <button type="button" role="menuitem" className="mobile-menu-item" onClick={() => handleNavClick('/stats')}>Stats</button>
            <button type="button" role="menuitem" className="mobile-menu-item" onClick={() => handleNavClick('/trainers/pll')}>Trainers</button>
            <button type="button" role="menuitem" className="mobile-menu-item" onClick={handleSettingsClick}>Settings</button>
            <div className="mobile-menu-separator" />
            {isGuest ? (
              <button type="button" role="menuitem" className="mobile-menu-item" onClick={() => handleNavClick('/login')}>Sign In</button>
            ) : (
              <button type="button" role="menuitem" className="mobile-menu-item" onClick={handleLogout}>Logout</button>
            )}
          </div>
        )}
        {settingsOpen && (
          <div className="settings-modal-backdrop">
            <div className="settings-modal" ref={settingsModalRef}>
              <button
                type="button"
                className="settings-modal-close"
                aria-label="Close"
                onClick={closeSettingsModal}
              >
                &times;
              </button>
              <SettingsPanel asModal />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <header className="header">
      <AppNav />
      <div className="title-container">
        <h1 className="title">Ao5</h1>
      </div>
      <div className="puzzle-buttons">
        {PUZZLES.map(p => (
          <button key={p.value} className={`button ${type === p.value ? 'active' : ''}`} value={p.value} onClick={handleTypeChange}>{p.label}</button>
        ))}
      </div>
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
          &#9881;
        </button>
        {settingsOpen && <SettingsPanel />}
      </div>
      {isGuest ? (
        <button className="sign-in-button" onClick={() => navigate('/login')}>
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
