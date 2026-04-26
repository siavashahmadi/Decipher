import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../services/api';
import { formatTime } from '../../utils/formatTime';
import { useSettings } from '../../hooks/useSettings';
import { chartColors } from '../../utils/themeColors';
import type { PuzzleType, PersonalBest } from '../../types';

// Date-axis PB progression. Guests have no server-backed PBs, so the chart is
// empty for them. The spec says PB chart shows only when history exists.
const PBProgression = ({ puzzleType, isGuest }: { puzzleType: PuzzleType; isGuest: boolean }): ReactElement => {
  const [pbs, setPbs] = useState<PersonalBest[]>([]);
  const { effectiveTheme } = useSettings();
  const colors = useMemo(() => chartColors(effectiveTheme), [effectiveTheme]);

  useEffect(() => {
    if (isGuest) { setPbs([]); return; }
    let cancelled = false;
    // Silent: a non-essential chart that already renders an empty-state when
    // pbs is short. A toast on every nav for a flaky network would be noise.
    api.getPersonalBests(puzzleType).then(d => { if (!cancelled) setPbs(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [puzzleType, isGuest]);

  const data = useMemo(
    () => pbs.map(pb => ({
      ts: new Date(pb.achieved_at).getTime(),
      label: new Date(pb.achieved_at).toLocaleDateString(),
      time: Number(pb.time),
    })),
    [pbs],
  );

  if (data.length < 2) return <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Not enough PB history yet.</p>;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <XAxis dataKey="label" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 11 }} />
        <YAxis stroke={colors.axis} tick={{ fill: colors.axis }} tickFormatter={v => formatTime(v)} />
        <Tooltip formatter={(v: number | string) => typeof v === 'number' ? formatTime(v) : v} />
        <Line type="stepAfter" dataKey="time" stroke={colors.pb} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default PBProgression;
