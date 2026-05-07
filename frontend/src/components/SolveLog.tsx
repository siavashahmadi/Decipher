import { useMemo, useRef, useCallback, useState, type ReactElement } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatTime } from '../utils/formatTime';
import { ao5, ao12, type AverageResult } from '../utils/averages';
import { formatSolveLabel } from '../utils/solveLabel';
import { useSwipeToReveal } from '../hooks/useSwipeToReveal';
import useMatchMedia from '../hooks/useMatchMedia';
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

interface SwipeRowProps {
  solve: Solve;
  index: number;
  isPhone: boolean;
  onSolveUpdate: (solve: Solve) => void;
  onSolveDelete: (solve: Solve) => void;
  onSolveClick: (solve: Solve, index: number) => void;
  measureRef: (el: Element | null) => void;
  style: React.CSSProperties;
  ao5Value: AverageResult;
}

const SwipeRow = ({
  solve,
  index,
  isPhone,
  onSolveUpdate,
  onSolveDelete,
  onSolveClick,
  measureRef,
  style,
  ao5Value,
}: SwipeRowProps): ReactElement => {
  const { ref: swipeRef, revealed, offsetX, reset } = useSwipeToReveal();
  const [confirming, setConfirming] = useState(false);

  const rowRef = useCallback((el: HTMLLIElement | null) => {
    measureRef(el);
    if (isPhone) {
      swipeRef(el);
    }
  }, [measureRef, swipeRef, isPhone]);

  const handleDeleteTap = useCallback(() => {
    if (confirming) {
      onSolveDelete(solve);
      reset();
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  }, [confirming, onSolveDelete, solve, reset]);

  const swiping = isPhone && (revealed || offsetX < 0);
  const translateX = revealed ? -70 : offsetX < 0 ? Math.max(offsetX, -70) : 0;

  return (
    <li
      key={solve.id}
      data-index={index}
      ref={rowRef}
      className={`solve-log-item ${swiping ? 'swiping' : ''}`}
      style={style}
    >
      <div
        className="solve-row-content"
        style={isPhone ? { transform: `translateX(${translateX}px)`, transition: revealed || offsetX === 0 ? 'transform 0.2s ease' : 'none' } : undefined}
      >
        <button
          type="button"
          className="solve-row-button"
          onClick={() => onSolveClick(solve, index)}
          aria-label={`Solve ${index + 1} details`}
        >
          <span className="solve-time">
            {formatSolveLabel(solve)}
          </span>
          <span className="solve-ao5">
            {ao5Value !== null ? `(${fmt(ao5Value)})` : ''}
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
          {!isPhone && (
            <button
              onClick={() => onSolveDelete(solve)}
              className="delete-button"
              title="Delete solve"
            >
              ×
            </button>
          )}
        </div>
      </div>
      {isPhone && (
        <button
          className={`swipe-delete-affordance ${confirming ? 'confirming' : ''}`}
          onClick={handleDeleteTap}
          aria-label="Delete solve"
          data-testid="swipe-delete"
        >
          {confirming ? 'Confirm' : 'Delete'}
        </button>
      )}
    </li>
  );
};

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
  const isPhone = useMatchMedia('(max-width: 600px)');

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
              <SwipeRow
                key={solve.id}
                solve={solve}
                index={vi.index}
                isPhone={isPhone}
                onSolveUpdate={onSolveUpdate}
                onSolveDelete={onSolveDelete}
                onSolveClick={onSolveClick}
                measureRef={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${vi.start}px)`,
                }}
                ao5Value={itemAo5}
              />
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
