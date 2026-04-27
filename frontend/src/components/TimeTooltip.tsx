import { type ReactElement } from 'react';
import { formatTime } from '../utils/formatTime';

interface Props {
  active?: boolean;
  payload?: Array<{ value: number; payload?: { date?: string } }>;
  prefix: string;
  showDate?: boolean;
}

export const TimeTooltip = ({ active, payload, prefix, showDate = false }: Props): ReactElement | null => {
  if (!active || !payload?.length || typeof payload[0].value !== 'number') return null;
  return (
    <div className="custom-tooltip">
      <p>{`${prefix}: ${formatTime(payload[0].value)}`}</p>
      {showDate && <p className="tooltip-date">{payload[0].payload?.date}</p>}
    </div>
  );
};
