import { useRef, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { formatTime } from '../utils/formatTime';
import { ao5 } from '../utils/averages';
import { formatSolveLabel } from '../utils/solveLabel';
import api from '../services/api';
import { useOptionalAuth } from '../contexts/AuthContext';
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { Solve } from '../types';
import './SolveDetailModal.css';

interface SolveDetailModalProps {
  solve: Solve;
  solveWindow: Solve[];
  index: number;
  onClose: () => void;
  onUpdate: (solve: Solve) => void;
  onDelete: (solve: Solve) => void;
}

const SolveDetailModal = ({
  solve, solveWindow, index, onClose, onUpdate, onDelete,
}: SolveDetailModalProps): ReactElement => {
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const windowAo5 = ao5(solveWindow);
  const navigate = useNavigate();
  const auth = useOptionalAuth();
  const isGuest = auth?.isGuest ?? true;

  const useThisScramble = (): void => {
    if (!solve.scramble) return;
    navigate('/', {
      state: { replayScramble: solve.scramble, replayPuzzle: solve.puzzle_type },
    });
    onClose();
  };

  useDismissOnOutsideClick(modalRef, onClose);
  useFocusTrap(modalRef);

  const copyScramble = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(solve.scramble);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard failures
    }
  };

  const copyShareLink = async (): Promise<void> => {
    try {
      const token = await api.getShareToken(solve.id);
      await navigator.clipboard.writeText(`${window.location.origin}/s/${token}`);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch {
      toast.error('Could not generate share link.');
    }
  };

  const handleDelete = (): void => {
    onDelete(solve);
    onClose();
  };

  const date = new Date(solve.created_at);
  const dateStr = date.toLocaleString();

  return (
    <div className="solve-detail-backdrop">
      <div
        ref={modalRef}
        className="solve-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Solve details"
      >
        <button
          type="button"
          className="solve-detail-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        <div className="solve-detail-time" data-testid="solve-detail-time">
          {formatSolveLabel(solve, { plusSuffix: false })}
        </div>
        <div className="solve-detail-date">{dateStr}</div>

        <div className="solve-detail-section">
          <div className="solve-detail-label">Scramble</div>
          <div className="solve-detail-scramble">
            <code>{solve.scramble || '\u2014'}</code>
            <button
              type="button"
              onClick={copyScramble}
              disabled={!solve.scramble}
              aria-label="Copy scramble"
            >
              {copied ? 'Copied' : 'Copy scramble'}
            </button>
            <button
              type="button"
              onClick={useThisScramble}
              disabled={!solve.scramble}
              aria-label="Use this scramble in the timer"
            >
              Use this scramble
            </button>
            {!isGuest && (
              <button
                type="button"
                onClick={copyShareLink}
                aria-label="Copy shareable link to this solve"
              >
                {shareCopied ? 'Link copied' : 'Copy share link'}
              </button>
            )}
          </div>
        </div>

        <div className="solve-detail-section">
          <div className="solve-detail-label">±2 ao5 context</div>
          <div className="solve-detail-window">
            {solveWindow.map((s, i) => (
              <span
                key={s.id}
                className={`ao5-cell${i === index ? ' focused' : ''}`}
                data-testid={i === index ? 'ao5-focused' : undefined}
              >
                {formatSolveLabel(s)}
              </span>
            ))}
          </div>
          <div className="solve-detail-ao5">
            ao5: <span data-testid="ao5-value">{
              windowAo5 === null ? '-' : windowAo5 === 'DNF' ? 'DNF' : formatTime(windowAo5)
            }</span>
          </div>
        </div>

        <div className="solve-detail-actions">
          <button
            type="button"
            className={`detail-toggle ${solve.plus_two ? 'active' : ''}`}
            onClick={() => onUpdate({ ...solve, plus_two: !solve.plus_two })}
          >
            +2
          </button>
          <button
            type="button"
            className={`detail-toggle ${solve.dnf ? 'active' : ''}`}
            onClick={() => onUpdate({ ...solve, dnf: !solve.dnf })}
          >
            DNF
          </button>
          <button
            type="button"
            className="detail-delete"
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default SolveDetailModal;
