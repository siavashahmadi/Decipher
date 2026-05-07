import { useMemo, useRef, type ReactElement } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatTime } from '../utils/formatTime';
import { ao5, ao12, type AverageResult } from '../utils/averages';
import { formatSolveLabel } from '../utils/solveLabel';
import type { Solve } from '../types';
import './SolveLog.css';

const fmt = (v: AverageResult): string =>
  v === null ? '-' : v === 'DNF' ? 'DNF' : formatTime(v);

const ROW_HEIGHT = 40;

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
}: SolveLogProps): ReactElement => {
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

  const perSolveAo5 = useMemo(
    () => solves.map((_, index) => ao5(solves.slice(index, index + 5))),
    [solves]
  );

  const scrollParentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: solves.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

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

      <div ref={scrollParentRef} className="solves-list-scroll">
        <ul
          className="solves-list"
          style={{ height: `${totalSize}px` }}
          role="list"
          aria-rowcount={solves.length}
        >
          {virtualItems.map(vi => {
            const solve = solves[vi.index];
            const itemAo5 = perSolveAo5[vi.index];
            if (!solve || itemAo5 === undefined) return null;
            return (
              <li
                key={solve.id}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                className="solve-log-item"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <button
                  type="button"
                  className="solve-row-button"
                  onClick={() => onSolveClick(solve, vi.index)}
                  aria-label={`Solve ${vi.index + 1} details`}
                >
                  <span className="solve-time">
                    {formatSolveLabel(solve)}
                  </span>
                  <span className="solve-ao5">
                    {itemAo5 !== null ? `(${fmt(itemAo5)})` : ''}
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
      </div>

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
