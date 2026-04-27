import { type ReactElement } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TimeTooltip } from './TimeTooltip';
import { formatTime } from '../utils/formatTime';
import { useSettings } from '../hooks/useSettings';
import { chartColors } from '../utils/themeColors';

interface DataPoint {
  time: number;
  date?: string;
  label?: string;
  solve?: number;
}

interface Props {
  data: DataPoint[];
  compact?: boolean;
}

// compact=true: SolveHub mini chart (index X-axis, monotone, height 150)
// compact=false: Stats page chart (date X-axis, stepAfter, height 220, tick formatter)
export const PBLineChart = ({ data, compact = false }: Props): ReactElement => {
  const { effectiveTheme } = useSettings();
  const colors = chartColors(effectiveTheme);
  const height = compact ? 150 : 220;
  const xDataKey = compact ? 'solve' : 'label';
  const lineType = compact ? 'monotone' : 'stepAfter';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <XAxis dataKey={xDataKey} stroke={colors.axis} tick={{ fill: colors.axis, fontSize: compact ? undefined : 11 }} />
        <YAxis
          stroke={colors.axis}
          tick={{ fill: colors.axis }}
          tickFormatter={compact ? undefined : (v: number) => formatTime(v)}
        />
        {compact ? (
          <Tooltip content={<TimeTooltip prefix="PB" showDate />} />
        ) : (
          <Tooltip formatter={(v: number | string) => typeof v === 'number' ? formatTime(v) : v} />
        )}
        <Line
          type={lineType}
          dataKey="time"
          stroke={colors.pb}
          strokeWidth={2}
          dot={{ r: 3, fill: compact ? colors.pb : undefined }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
