import { useEffect, useState, type ReactElement } from 'react';
import { useParams } from 'react-router-dom';
import api, { type PublicSolve } from '../services/api';
import { formatTime } from '../utils/formatTime';
import './SharedSolve.css';

const SharedSolve = (): ReactElement => {
  const { token } = useParams<{ token: string }>();
  const [solve, setSolve] = useState<PublicSolve | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setError(true);
      return;
    }
    // Silent: this page renders its own error UI ("This link is invalid or
    // the solve was removed.") when setError(true). A toast would duplicate it.
    api.getSharedSolve(token)
      .then(data => { if (!cancelled) setSolve(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [token]);

  const copyScramble = async (): Promise<void> => {
    if (!solve?.scramble) return;
    try {
      await navigator.clipboard.writeText(solve.scramble);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  if (error) {
    return (
      <div className="shared-solve-page">
        <div className="shared-solve-card">
          <p className="shared-solve-error">This link is invalid or the solve was removed.</p>
        </div>
      </div>
    );
  }

  if (!solve) {
    return (
      <div className="shared-solve-page">
        <div className="shared-solve-card">
          <p className="shared-solve-loading">Loading...</p>
        </div>
      </div>
    );
  }

  const display = solve.dnf
    ? 'DNF'
    : formatTime(solve.plus_two ? solve.time + 2 : solve.time);

  return (
    <div className="shared-solve-page">
      <div className="shared-solve-card">
        <div className="shared-solve-badge">{solve.puzzle_type}</div>
        <div className="shared-solve-time">{display}</div>
        <div className="shared-solve-date">{new Date(solve.created_at).toLocaleString()}</div>
        {solve.scramble && (
          <div className="shared-solve-scramble-section">
            <div className="shared-solve-label">Scramble</div>
            <code className="shared-solve-scramble">{solve.scramble}</code>
            <button type="button" onClick={copyScramble}>
              {copied ? 'Copied' : 'Copy scramble'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SharedSolve;
