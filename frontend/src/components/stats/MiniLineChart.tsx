import { type ReactElement } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TimeTooltip } from '../TimeTooltip';
import { useSettings } from '../../hooks/useSettings';
import { chartColors } from '../../utils/themeColors';

interface DataPoint {
  solve: number;
  time: number;
}

interface Props {
  data: DataPoint[];
}

export const MiniLineChart = ({ data }: Props): ReactElement => {
  const { effectiveTheme } = useSettings();
  const colors = chartColors(effectiveTheme);
  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data}>
          <XAxis dataKey="solve" stroke={colors.axis} tick={{ fill: colors.axis }} />
          <YAxis stroke={colors.axis} tick={{ fill: colors.axis }} />
          <Tooltip content={<TimeTooltip prefix="Time" />} />
          <Line
            type="monotone"
            dataKey="time"
            stroke={colors.recent}
            strokeWidth={2}
            dot={{ r: 3, fill: colors.recent }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
