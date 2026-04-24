import type { ReactElement } from 'react';
import { formatTime } from '../../utils/formatTime';
import './TrainerRecentStrip.css';

export interface RecentEntry {
  time: number;
  plusTwo: boolean;
  dnf: boolean;
}

interface TrainerRecentStripProps {
  entries: RecentEntry[];
}

const renderEntry = (entry: RecentEntry): string => {
  if (entry.dnf) return 'DNF';
  const displayTime = entry.plusTwo ? entry.time + 2 : entry.time;
  const base = formatTime(displayTime);
  return entry.plusTwo ? `${base}+` : base;
};

const TrainerRecentStrip = ({
  entries,
}: TrainerRecentStripProps): ReactElement => (
  <div className="trainer-recent-strip">
    <span className="trainer-recent-label">Recent</span>
    {entries.length === 0 ? (
      <span className="trainer-recent-empty">No solves yet</span>
    ) : (
      entries.map((entry, idx) => (
        <span key={idx} className="trainer-recent-entry">
          {renderEntry(entry)}
        </span>
      ))
    )}
  </div>
);

export default TrainerRecentStrip;
