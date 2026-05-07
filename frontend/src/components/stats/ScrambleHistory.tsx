import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatSolveLabel } from '../../utils/solveLabel';
import type { Solve } from '../../types';
import './ScrambleHistory.css';

interface ScrambleHistoryProps {
  solves: Solve[];
}

const MAX_ROWS = 100;

const ScrambleHistory = ({ solves }: ScrambleHistoryProps): ReactElement => {
  const navigate = useNavigate();
  const rows = solves.slice(0, MAX_ROWS);

  if (rows.length === 0) {
    return <p className="scramble-history-empty">No scrambles in this range.</p>;
  }

  const replay = (s: Solve): void => {
    if (!s.scramble) return;
    navigate('/', {
      state: { replayScramble: s.scramble, replayPuzzle: s.puzzle_type },
    });
  };

  return (
    <ul className="scramble-history-list">
      {rows.map(s => (
        <li key={s.id} className="scramble-history-row">
          <span className="scramble-history-date">
            {new Date(s.created_at).toLocaleDateString()}
          </span>
          <span className="scramble-history-time">{formatSolveLabel(s)}</span>
          <code className="scramble-history-text" title={s.scramble}>
            {s.scramble || '\u2014'}
          </code>
          <button
            type="button"
            className="scramble-history-replay"
            onClick={() => replay(s)}
            disabled={!s.scramble}
            aria-label={`Replay scramble from ${new Date(s.created_at).toLocaleString()}`}
          >
            Replay
          </button>
        </li>
      ))}
    </ul>
  );
};

export default ScrambleHistory;
