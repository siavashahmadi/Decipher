import React from 'react';
import type { DateRangePreset } from '../../utils/dateRanges';
import './DateRangeFilter.css';

interface Props {
  preset: DateRangePreset;
  customStart: string | null; // yyyy-mm-dd
  customEnd: string | null;
  onPresetChange: (p: DateRangePreset) => void;
  onCustomChange: (start: string | null, end: string | null) => void;
}

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '30d', label: 'Last 30 days' },
  { value: '7d', label: 'Last 7 days' },
  { value: 'custom', label: 'Custom' },
];

const DateRangeFilter = ({ preset, customStart, customEnd, onPresetChange, onCustomChange }: Props): React.ReactElement => (
  <div className="date-range-filter">
    <div className="drf-presets" role="group" aria-label="Date range">
      {PRESETS.map(p => (
        <button
          key={p.value}
          type="button"
          className={`drf-preset${preset === p.value ? ' active' : ''}`}
          onClick={() => onPresetChange(p.value)}
          aria-pressed={preset === p.value}
        >
          {p.label}
        </button>
      ))}
    </div>
    {preset === 'custom' && (
      <div className="drf-custom">
        <label>
          <span>From</span>
          <input
            type="date"
            value={customStart ?? ''}
            onChange={e => onCustomChange(e.target.value || null, customEnd)}
          />
        </label>
        <label>
          <span>To</span>
          <input
            type="date"
            value={customEnd ?? ''}
            onChange={e => onCustomChange(customStart, e.target.value || null)}
          />
        </label>
      </div>
    )}
  </div>
);

export default DateRangeFilter;
