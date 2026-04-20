import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatTime } from '../../utils/formatTime';
import type { Solve } from '../../types';
import './ScrambleHistory.css';

interface ScrambleHistoryProps {
  solves: Solve[];
}

const MAX_ROWS = 100;
const TRUNCATE = 60;

const truncate = (s: string): string =>
  s.length <= TRUNCATE ? s : `${s.slice(0, TRUNCATE)}...`;

const label = (s: Solve): string =>
  s.dnf ? 'DNF' : formatTime(s.plus_two ? s.time + 2 : s.time);

const ScrambleHistory = ({ solves }: ScrambleHistoryProps): React.ReactElement => {
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
          <span className="scramble-history-time">{label(s)}</span>
          <code className="scramble-history-text" title={s.scramble}>
            {truncate(s.scramble || '\u2014')}
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
