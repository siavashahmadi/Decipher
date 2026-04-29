import { type ReactElement } from 'react';
import { formatTime } from '../utils/formatTime';

interface Props {
  active?: boolean;
  payload?: Array<{ value: number; payload?: { date?: string } }>;
  prefix: string;
  showDate?: boolean;
}

export const TimeTooltip = ({ active, payload, prefix, showDate = false }: Props): ReactElement | null => {
  const first = payload?.[0];
  if (!active || !first || typeof first.value !== 'number') return null;
  return (
    <div className="custom-tooltip">
      <p>{`${prefix}: ${formatTime(first.value)}`}</p>
      {showDate && <p className="tooltip-date">{first.payload?.date}</p>}
    </div>
  );
};
