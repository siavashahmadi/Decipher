import React, { useEffect } from 'react';
import './HotkeyHelp.css';

interface HotkeyHelpProps {
  onClose: () => void;
}

const ENTRIES: Array<[string, string]> = [
  ['Space', 'Hold to start (inspection or solve)'],
  ['Esc', 'Cancel pending timer / close modal'],
  ['2', 'Toggle +2 on most recent solve'],
  ['d', 'Toggle DNF on most recent solve'],
  ['Shift+D', 'Delete most recent solve (with confirm)'],
  ['?', 'Show this help'],
];

const HotkeyHelp = ({ onClose }: HotkeyHelpProps): React.ReactElement => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="hotkey-help-backdrop" onClick={onClose}>
      <div
        className="hotkey-help-modal"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={e => e.stopPropagation()}
      >
        <h2>Keyboard shortcuts</h2>
        <ul>
          {ENTRIES.map(([key, desc]) => (
            <li key={key}>
              <kbd>{key}</kbd>
              <span>{desc}</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

export default HotkeyHelp;
