import type { ReactElement } from 'react';
import { formatTime } from '../../utils/formatTime';
import type { StatsSummary as Summary } from '../../utils/statsBuckets';
import './StatsSummary.css';

const fmt = (v: number | null): string => v === null ? '-' : formatTime(v);

const StatsSummary = ({ summary }: { summary: Summary }): ReactElement => (
  <div className="stats-summary">
    <div className="ss-item"><span>Solves</span><b>{summary.validSolves}/{summary.totalSolves}</b></div>
    <div className="ss-item"><span>Total time</span><b>{formatTime(summary.totalSolveTimeSeconds)}</b></div>
    <div className="ss-item"><span>Best single</span><b>{fmt(summary.bestSingle)}</b></div>
    <div className="ss-item"><span>Best ao5</span><b>{fmt(summary.bestAo5)}</b></div>
    <div className="ss-item"><span>Best ao12</span><b>{fmt(summary.bestAo12)}</b></div>
    <div className="ss-item"><span>Current ao100</span><b>{fmt(summary.currentAo100)}</b></div>
  </div>
);

export default StatsSummary;
