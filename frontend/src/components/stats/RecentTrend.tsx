import { useMemo, type ReactElement } from 'react';
import { formatTime } from '../../utils/formatTime';
import { computeRecentTrend } from '../../utils/recentTrend';
import type { Solve } from '../../types';
import './RecentTrend.css';

interface RecentTrendProps {
  solves: Solve[];
}

const RecentTrend = ({ solves }: RecentTrendProps): ReactElement | null => {
  const trend = useMemo(() => computeRecentTrend(solves), [solves]);
  if (!trend) return null;

  const improving = trend.deltaSec < 0;
  const arrow = improving ? '↓' : trend.deltaSec > 0 ? '↑' : '→';
  const pct = Math.abs(trend.deltaPct * 100).toFixed(1);
  const delta = Math.abs(trend.deltaSec);

  return (
    <div className="recent-trend">
      <div className="recent-trend-row">
        <span className="recent-trend-label">Last 5 sessions</span>
        <span className="recent-trend-value">{formatTime(trend.recentAvg)}</span>
      </div>
      <div className="recent-trend-row">
        <span className="recent-trend-label">Prior 5</span>
        <span className="recent-trend-value">{formatTime(trend.priorAvg)}</span>
      </div>
      <div
        className={`recent-trend-delta${improving ? ' improving' : trend.deltaSec > 0 ? ' regressing' : ''}`}
      >
        {arrow} {formatTime(delta)} ({pct}%)
      </div>
    </div>
  );
};

export default RecentTrend;
