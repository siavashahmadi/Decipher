import React, { useMemo } from 'react';
import './SolveLog.css';

const calculateAverage = (times, size) => {
  if (times.length < size) return null;
  
  // Get the most recent 'size' number of times
  const recentTimes = times.slice(0, size)
    .map(solve => solve.dnf ? Infinity : solve.plus_two ? solve.time + 2 : solve.time);
  
  // If more than half are DNF, the average is DNF
  if (recentTimes.filter(time => time === Infinity).length > size / 2) {
    return 'DNF';
  }

  // Sort times to remove best and worst
  let sortedTimes = [...recentTimes].sort((a, b) => a - b);
  
  // Remove best and worst times
  sortedTimes = sortedTimes.slice(1, -1);
  
  // Calculate average
  const sum = sortedTimes.reduce((acc, time) => acc + (time === Infinity ? 0 : time), 0);
  const validTimes = sortedTimes.filter(time => time !== Infinity).length;
  
  return (sum / validTimes).toFixed(2);
};

const formatTime = (time) => {
  if (time === null) return '-';
  if (time === 'DNF') return 'DNF';
  return `${time}s`;
};

const SolveLog = ({ solves, onSolveUpdate, onSolveDelete, onReset, onLoadMore, hasMore, isLoadingMore }) => {
  const { ao5, ao12, sessionMean, bestSingle } = useMemo(() => {
    const ao5 = calculateAverage(solves, 5);
    const ao12 = calculateAverage(solves, 12);
    const validSolves = solves.filter(solve => !solve.dnf);
    const sessionMean = validSolves.length > 0
      ? (validSolves.reduce((acc, solve) => acc + solve.time, 0) / validSolves.length).toFixed(2)
      : null;
    const bestSingle = validSolves.length > 0
      ? Math.min(...validSolves.map(solve => solve.time))
      : null;
    return { ao5, ao12, sessionMean, bestSingle };
  }, [solves]);

  // DSA-1: Sliding window O(n) — each step slices exactly 5 elements (O(1)),
  // not the entire tail (O(n-i)). Total: O(n) vs the previous O(n²).
  const perSolveAo5 = useMemo(
    () => solves.map((_, index) => calculateAverage(solves.slice(index, index + 5), 5)),
    [solves]
  );

  return (
    <div className="solve-log">
      <button 
          onClick={onReset}
          className="reset-button"
        >
          Reset Session
        </button>
      <div className="stats-container">
        <div className="stat-box">
          <span className="stat-label">Ao5</span>
          <span className="stat-value">{formatTime(ao5)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Ao12</span>
          <span className="stat-value">{formatTime(ao12)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Mean</span>
          <span className="stat-value">{formatTime(sessionMean)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Best</span>
          <span className="stat-value">{formatTime(bestSingle)}</span>
        </div>
      </div>

      <ul className="solves-list">
        {solves.map((solve, index) => {
          const currentAo5 = perSolveAo5[index];
          return (
            <li key={solve.id} className="solve-log-item">
              <span className="solve-time">
                {solve.dnf ? 'DNF' : 
                solve.plus_two ? `${(solve.time + 2).toFixed(2)}+` : 
                `${solve.time.toFixed(2)}s`}
              </span>
              <span className="solve-ao5">
                {currentAo5 ? `(${formatTime(currentAo5)})` : ''}
              </span>
              <div className="solve-actions">
                <button 
                  onClick={() => onSolveUpdate({ ...solve, dnf: !solve.dnf })}
                  className={`dnf-button ${solve.dnf ? 'active' : ''}`}
                >
                  DNF
                </button>
                <button 
                  onClick={() => onSolveUpdate({
                    ...solve,
                    plus_two: !solve.plus_two
                  })}
                  className={`plus_two-button ${solve.plus_two ? 'active' : ''}`}
                >
                  +2
                </button>
                <button 
                  onClick={() => {
                    onSolveDelete(solve);
                  }}
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
    </div>
  );
};

export default SolveLog;