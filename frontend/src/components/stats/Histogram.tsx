import { useMemo, type ReactElement } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatTime } from '../../utils/formatTime';
import { buildHistogram } from '../../utils/statsBuckets';
import { useSettings } from '../../hooks/useSettings';
import { chartColors } from '../../utils/themeColors';
import type { Solve } from '../../types';

const effective = (s: Solve): number => s.plus_two ? s.time + 2 : s.time;

const Histogram = ({ solves, bins = 20 }: { solves: Solve[]; bins?: number }): ReactElement => {
  const { effectiveTheme } = useSettings();
  const colors = chartColors(effectiveTheme);

  const data = useMemo(() => {
    const times = solves.filter(s => !s.dnf).map(effective);
    return buildHistogram(times, bins).map(b => ({
      label: formatTime((b.min + b.max) / 2),
      count: b.count,
      range: `${formatTime(b.min)}–${formatTime(b.max)}`,
    }));
  }, [solves, bins]);

  if (!data.length) return <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>No solves in range.</p>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <XAxis dataKey="label" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 11 }} />
        <YAxis stroke={colors.axis} tick={{ fill: colors.axis }} allowDecimals={false} />
        <Tooltip labelFormatter={(_, p) => p[0]?.payload?.range ?? ''} />
        <Bar dataKey="count" fill={colors.recent} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default Histogram;
