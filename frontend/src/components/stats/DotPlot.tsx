import { useMemo, type ReactElement } from 'react';
import { Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart } from 'recharts';
import { formatTime } from '../../utils/formatTime';
import { trimmedMeanNumbers } from '../../utils/averages';
import { useSettings } from '../../hooks/useSettings';
import { chartColors } from '../../utils/themeColors';
import type { Solve } from '../../types';
import './DotPlot.css';

interface Point { index: number; time: number; isPb: boolean; isWorst: boolean; created_at: string; }

const effective = (s: Solve): number => s.plus_two ? s.time + 2 : s.time;

const DotPlot = ({ solves }: { solves: Solve[] }): ReactElement => {
  // Chronological order (API returns newest first).
  const chronological = useMemo(() => [...solves].reverse(), [solves]);

  const points = useMemo<Point[]>(() => {
    const valid = chronological.filter(s => !s.dnf);
    if (!valid.length) return [];
    const times = valid.map(effective);
    let pb = times[0], worst = times[0];
    for (const t of times) { if (t < pb) pb = t; if (t > worst) worst = t; }
    return valid.map((s, i) => {
      const t = effective(s);
      return { index: i + 1, time: t, isPb: t === pb, isWorst: t === worst, created_at: s.created_at };
    });
  }, [chronological]);

  // Rolling ao5 (mean of middle 3 of 5) at each point.
  const ao5Line = useMemo(() => {
    const result: { index: number; ao5: number | null }[] = [];
    const ts: number[] = [];
    for (const p of points) {
      ts.push(p.time);
      if (ts.length < 5) { result.push({ index: p.index, ao5: null }); continue; }
      result.push({ index: p.index, ao5: trimmedMeanNumbers(ts.slice(-5)) });
    }
    return result;
  }, [points]);

  const { effectiveTheme } = useSettings();
  const colors = chartColors(effectiveTheme);

  if (!points.length) return <p className="dot-plot-empty">No solves in range.</p>;

  const merged = points.map((p, i) => ({ ...p, ao5: ao5Line[i]?.ao5 ?? null }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={merged}>
        <XAxis dataKey="index" stroke={colors.axis} tick={{ fill: colors.axis }} />
        <YAxis dataKey="time" stroke={colors.axis} tick={{ fill: colors.axis }}
          tickFormatter={v => formatTime(v)} />
        <Tooltip
          formatter={(v: number | string) =>
            typeof v === 'number' ? formatTime(v) : v}
          labelFormatter={l => `Solve #${l}`}
        />
        <Line type="monotone" dataKey="ao5" stroke={colors.recent} dot={false}
          strokeWidth={2} strokeOpacity={0.55} isAnimationActive={false} />
        <Scatter dataKey="time" isAnimationActive={false}
          shape={(props: { cx?: number; cy?: number; payload?: Point }) => {
            const { cx, cy, payload } = props;
            if (cx === undefined || cy === undefined || !payload) return <g />;
            const fill = payload.isPb ? colors.pb : payload.isWorst ? colors.heatmap.worst : colors.recent;
            return <circle cx={cx} cy={cy} r={3} fill={fill} />;
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default DotPlot;
