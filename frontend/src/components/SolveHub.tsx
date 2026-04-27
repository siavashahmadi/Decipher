import { useMemo, type ReactElement } from 'react';
import { ao5 } from '../utils/averages';
import { effectiveTime } from '../utils/solveTime';
import { StatsGrid } from './stats/StatsGrid';
import { MiniLineChart } from './stats/MiniLineChart';
import { PBLineChart } from './PBLineChart';
import type { Solve, PersonalBest } from '../types';
import './SolveHub.css';

interface SolveHubProps {
  solves: Solve[];
  recentSolves?: Solve[];
  pbHistory?: PersonalBest[];
  lastPercentile?: number | null;
  currentMedian?: number | null;
}

// DSA-3: recentSolves comes from the circular buffer in SolveSession (last 12).
// SD-3: pbHistory is the write-time materialized personal best progression.
// DSA-2: lastPercentile shows where this solve ranks among previous solves.
// DSA-4: currentMedian from the two-heap tracker (O(log n) insert, O(1) query).
const SolveHub = ({
  solves,
  recentSolves = [],
  pbHistory = [],
  lastPercentile = null,
  currentMedian = null,
}: SolveHubProps): ReactElement => {
  const stats = useMemo(() => {
    if (!solves?.length) return null;

    const validSolves = solves.filter(s => !s.dnf);
    const times = validSolves.map(effectiveTime);

    if (times.length === 0) return null;

    const ao5Result = ao5(solves);

    return {
      totalSolves: solves.length,
      validSolves: validSolves.length,
      bestTime: Math.min(...times),
      averageTime: times.reduce((a, b) => a + b, 0) / times.length,
      ao5: typeof ao5Result === 'number' ? ao5Result : null,
    };
  }, [solves]);

  // Lifetime best single derived from materialized PB rows. Empty for guests
  // (pbHistory is server-only) so the row hides rather than showing a fake value.
  const lifetimeBest = useMemo<number | null>(() => {
    if (!pbHistory.length) return null;
    return Math.min(...pbHistory.map(pb => Number(pb.time)));
  }, [pbHistory]);

  // DSA-3: Chart data from circular buffer (last 12 solves, oldest to newest)
  const chartData = useMemo(() => {
    return recentSolves
      .filter(s => !s.dnf)
      .map((s, i) => ({ solve: i + 1, time: effectiveTime(s) }));
  }, [recentSolves]);

  // SD-3: PB progression chart data
  const pbChartData = useMemo(() => {
    return pbHistory.map((pb, i) => ({
      solve: i + 1,
      time: Number(pb.time),
      date: new Date(pb.achieved_at).toLocaleDateString(),
    }));
  }, [pbHistory]);

  if (!stats) return (
    <div className="solve-hub empty-state">
      <p>No solves yet. Start solving to see your stats!</p>
    </div>
  );

  return (
    <div className="solve-hub">
      <StatsGrid stats={{ ...stats, lifetimeBest, currentMedian, lastPercentile }} />

      {/* DSA-3: Recent solve times from circular buffer */}
      {chartData.length > 1 && <MiniLineChart data={chartData} />}

      {/* SD-3: PB progression chart — write-time materialized from personal_bests table */}
      {pbChartData.length > 1 && (
        <div className="chart-container">
          <p className="chart-title">PB Progression</p>
          <PBLineChart data={pbChartData} compact />
        </div>
      )}
    </div>
  );
};

export default SolveHub;
