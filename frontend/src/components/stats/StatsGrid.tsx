import { type ReactElement } from 'react';
import { formatTime } from '../../utils/formatTime';

interface StatsData {
  totalSolves: number;
  validSolves: number;
  bestTime: number;
  averageTime: number;
  ao5: number | null;
  lifetimeBest: number | null;
  currentMedian: number | null;
  lastPercentile: number | null;
}

interface Props {
  stats: StatsData;
}

export const StatsGrid = ({ stats }: Props): ReactElement => (
  <div className="stats-grid">
    <div className="stat-item">
      <span className="stat-label">Solves</span>
      <span className="stat-value">{stats.validSolves}/{stats.totalSolves}</span>
    </div>
    <div className="stat-item">
      <span className="stat-label">Best (session)</span>
      <span className="stat-value">{formatTime(stats.bestTime)}</span>
    </div>
    {stats.lifetimeBest !== null && (
      <div className="stat-item">
        <span className="stat-label">Best (all-time)</span>
        <span className="stat-value">{formatTime(stats.lifetimeBest)}</span>
      </div>
    )}
    <div className="stat-item">
      <span className="stat-label">Average</span>
      <span className="stat-value">{formatTime(stats.averageTime)}</span>
    </div>
    <div className="stat-item">
      <span className="stat-label">AO5</span>
      <span className="stat-value">{stats.ao5 !== null ? formatTime(stats.ao5) : '-'}</span>
    </div>

    {/* DSA-4: Running median from two-heap tracker */}
    {stats.currentMedian !== null && (
      <div className="stat-item">
        <span className="stat-label">Median</span>
        <span className="stat-value">{formatTime(stats.currentMedian)}</span>
      </div>
    )}

    {/* DSA-2: Percentile from binary search insert position */}
    {stats.lastPercentile !== null && (
      <div className="stat-item percentile-stat">
        <span className="stat-label">Last Solve</span>
        <span className="stat-value">
          Faster than {stats.lastPercentile}%
        </span>
      </div>
    )}
  </div>
);
