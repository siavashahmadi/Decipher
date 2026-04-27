import { useEffect, useMemo, useState, type ReactElement } from 'react';
import api from '../../services/api';
import { PBLineChart } from '../PBLineChart';
import type { PuzzleType, PersonalBest } from '../../types';

// Date-axis PB progression. Guests have no server-backed PBs, so the chart is
// empty for them. The spec says PB chart shows only when history exists.
const PBProgression = ({ puzzleType, isGuest }: { puzzleType: PuzzleType; isGuest: boolean }): ReactElement => {
  const [pbs, setPbs] = useState<PersonalBest[]>([]);

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
      label: new Date(pb.achieved_at).toLocaleDateString(),
      time: Number(pb.time),
    })),
    [pbs],
  );

  if (data.length < 2) return <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Not enough PB history yet.</p>;

  return <PBLineChart data={data} />;
};

export default PBProgression;
