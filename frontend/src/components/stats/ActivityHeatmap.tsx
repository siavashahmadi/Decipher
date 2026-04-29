import { useMemo, type ReactElement } from 'react';
import { ResponsiveCalendar } from '@nivo/calendar';
import { buildHeatmapData } from '../../utils/statsBuckets';
import { useSettings } from '../../hooks/useSettings';
import { chartColors } from '../../utils/themeColors';
import type { Solve } from '../../types';

interface Props {
  solves: Solve[];
  from: Date;
  to: Date;
}

// Quantile-based color scale keeps one busy day from flattening the rest.
// Nivo accepts an explicit `colors` array + min/max; we compute thresholds
// from the data quantiles so intensity matches distribution shape.
const ActivityHeatmap = ({ solves, from, to }: Props): ReactElement => {
  const data = useMemo(() => buildHeatmapData(solves), [solves]);
  const { effectiveTheme } = useSettings();
  const colors = useMemo(() => chartColors(effectiveTheme), [effectiveTheme]);

  const maxValue = useMemo(() => {
    if (data.length === 0) return 1;
    let max = data[0]!.value;
    for (let i = 1; i < data.length; i++) {
      const v = data[i]!.value;
      if (v > max) max = v;
    }
    return max;
  }, [data]);

  const safeFrom = Number.isFinite(from.getTime()) ? from : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const safeTo = Number.isFinite(to.getTime()) ? to : new Date();
  const isoFrom = safeFrom.toISOString().slice(0, 10);
  const isoTo = safeTo.toISOString().slice(0, 10);

  return (
    <div style={{ height: 200 }}>
      <ResponsiveCalendar
        data={data}
        from={isoFrom}
        to={isoTo}
        emptyColor={colors.heatmap.empty}
        minValue={0}
        maxValue={Math.max(1, maxValue)}
        colors={colors.heatmap.scale}
        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        yearSpacing={30}
        monthBorderColor="transparent"
        dayBorderWidth={1}
        dayBorderColor={colors.heatmap.border}
        theme={{
          text: { fill: colors.heatmap.text },
          tooltip: {
            container: {
              background: colors.heatmap.tooltipBg,
              color: colors.heatmap.text,
            },
          },
        }}
      />
    </div>
  );
};

export default ActivityHeatmap;
