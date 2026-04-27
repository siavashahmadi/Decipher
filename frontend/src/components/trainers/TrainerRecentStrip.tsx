import type { ReactElement } from 'react';
import { formatSolveLabel } from '../../utils/solveLabel';
import './TrainerRecentStrip.css';

export interface RecentEntry {
  time: number;
  plusTwo: boolean;
  dnf: boolean;
}

interface TrainerRecentStripProps {
  entries: RecentEntry[];
}

const renderEntry = (entry: RecentEntry): string =>
  formatSolveLabel({
    id: '',
    puzzle_type: '333',
    scramble: '',
    created_at: '',
    dnf: entry.dnf,
    plus_two: entry.plusTwo,
    time: entry.time,
  });

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
