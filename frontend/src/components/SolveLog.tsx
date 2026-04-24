import React, { useMemo } from 'react';
import { formatTime } from '../utils/formatTime';
import { ao5, ao12, type AverageResult } from '../utils/averages';
import type { Solve } from '../types';
import './SolveLog.css';

const fmt = (v: AverageResult): string =>
  v === null ? '-' : v === 'DNF' ? 'DNF' : formatTime(v);

interface SolveLogProps {
  solves: Solve[];
  onSolveUpdate: (solve: Solve) => void;
  onSolveDelete: (solve: Solve) => void;
  onSolveClick: (solve: Solve, index: number) => void;
  onReset: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
}

const SolveLog = ({
  solves,
  onSolveUpdate,
  onSolveDelete,
  onSolveClick,
  onReset,
  onLoadMore,
  hasMore,
  isLoadingMore,
}: SolveLogProps): React.ReactElement => {
  const { currentAo5, currentAo12, sessionMean, bestSingle } = useMemo(() => {
    const currentAo5 = ao5(solves);
    const currentAo12 = ao12(solves);
    const validSolves = solves.filter(s => !s.dnf);
    const sessionMean: number | null = validSolves.length > 0
      ? validSolves.reduce((acc, s) => acc + s.time, 0) / validSolves.length
      : null;
    const bestSingle: number | null = validSolves.length > 0
      ? Math.min(...validSolves.map(s => s.time))
      : null;
    return { currentAo5, currentAo12, sessionMean, bestSingle };
  }, [solves]);

  // DSA-1: Sliding window O(n) — each step slices exactly 5 elements (O(1)),
  // not the entire tail (O(n-i)). Total: O(n) vs the previous O(n²).
  const perSolveAo5 = useMemo(
    () => solves.map((_, index) => ao5(solves.slice(index, index + 5))),
    [solves]
  );

  return (
    <div className="solve-log">
      <div className="stats-container">
        <div className="stat-box">
          <span className="stat-label">Ao5</span>
          <span className="stat-value">{fmt(currentAo5)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Ao12</span>
          <span className="stat-value">{fmt(currentAo12)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Mean</span>
          <span className="stat-value">{fmt(sessionMean)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Best</span>
          <span className="stat-value">{fmt(bestSingle)}</span>
        </div>
      </div>

      <ul className="solves-list">
        {solves.map((solve, index) => {
          const currentAo5 = perSolveAo5[index];
          return (
            <li key={solve.id} className="solve-log-item">
              <button
                type="button"
                className="solve-row-button"
                onClick={() => onSolveClick(solve, index)}
                aria-label={`Solve ${index + 1} details`}
              >
                <span className="solve-time">
                  {solve.dnf
                    ? 'DNF'
                    : solve.plus_two
                      ? `${formatTime(solve.time + 2)}+`
                      : formatTime(solve.time)}
                </span>
                <span className="solve-ao5">
                  {currentAo5 !== null ? `(${fmt(currentAo5)})` : ''}
                </span>
              </button>
              <div className="solve-actions" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => onSolveUpdate({ ...solve, dnf: !solve.dnf })}
                  className={`dnf-button ${solve.dnf ? 'active' : ''}`}
                >
                  DNF
                </button>
                <button
                  onClick={() => onSolveUpdate({ ...solve, plus_two: !solve.plus_two })}
                  className={`plus_two-button ${solve.plus_two ? 'active' : ''}`}
                >
                  +2
                </button>
                <button
                  onClick={() => onSolveDelete(solve)}
                  className="delete-button"
                  title="Delete solve"
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* SD-2: Load more for cursor-based pagination */}
      {hasMore && (
        <button
          className="load-more-button"
          onClick={onLoadMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? 'Loading...' : 'Load More'}
        </button>
      )}

      {solves.length > 0 && (
        <button
          onClick={onReset}
          className="clear-view-button"
        >
          Clear view
        </button>
      )}
    </div>
  );
};

export default SolveLog;
