import React, { useMemo } from 'react';
import { ResponsiveCalendar } from '@nivo/calendar';
import { buildHeatmapData } from '../../utils/statsBuckets';
import { useSettings } from '../../hooks/useSettings';
import type { Solve } from '../../types';

interface Props {
  solves: Solve[];
  from: Date;
  to: Date;
}

// Quantile-based color scale keeps one busy day from flattening the rest.
// Nivo accepts an explicit `colors` array + min/max; we compute thresholds
// from the data quantiles so intensity matches distribution shape.
const ActivityHeatmap = ({ solves, from, to }: Props): React.ReactElement => {
  const data = useMemo(() => buildHeatmapData(solves), [solves]);
  const { effectiveTheme } = useSettings();

  const values = data.map(d => d.value).sort((a, b) => a - b);
  const maxValue = values.length ? values[values.length - 1] : 1;

  const isoFrom = from.toISOString().slice(0, 10);
  const isoTo = to.toISOString().slice(0, 10);

  const colors = effectiveTheme === 'light'
    ? ['#e6f4ea', '#a8d5b0', '#68b97a', '#2f9e44', '#1b6a2d']
    : ['#1c2a20', '#254d36', '#2f7d4f', '#3bb26a', '#5ad48a'];

  return (
    <div style={{ height: 200 }}>
      <ResponsiveCalendar
        data={data}
        from={isoFrom}
        to={isoTo}
        emptyColor={effectiveTheme === 'light' ? '#ececea' : '#2a2a2a'}
        minValue={0}
        maxValue={Math.max(1, maxValue)}
        colors={colors}
        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        yearSpacing={30}
        monthBorderColor="transparent"
        dayBorderWidth={1}
        dayBorderColor={effectiveTheme === 'light' ? '#ffffff' : '#121212'}
        theme={{
          text: { fill: effectiveTheme === 'light' ? '#1a1a1a' : '#e5e5e5' },
          tooltip: {
            container: {
              background: effectiveTheme === 'light' ? '#ffffff' : '#1e1e1e',
              color: effectiveTheme === 'light' ? '#1a1a1a' : '#e5e5e5',
            },
          },
        }}
      />
    </div>
  );
};

export default ActivityHeatmap;
