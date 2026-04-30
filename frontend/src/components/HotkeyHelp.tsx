import { useRef, type ReactElement } from 'react';
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick';
import { useFocusTrap } from '../hooks/useFocusTrap';
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
  ['Alt+1 .. Alt+9', 'Switch puzzle (2x2 through Skewb)'],
  ['Alt+0', 'Switch to SQ-1'],
  ['?', 'Show this help'],
];

const HotkeyHelp = ({ onClose }: HotkeyHelpProps): ReactElement => {
  const modalRef = useRef<HTMLDivElement>(null);
  useDismissOnOutsideClick(modalRef, onClose);
  useFocusTrap(modalRef);

  return (
    <div className="hotkey-help-backdrop">
      <div
        ref={modalRef}
        className="hotkey-help-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
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
