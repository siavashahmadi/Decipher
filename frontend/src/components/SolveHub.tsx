import { useMemo, type ReactElement } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatTime } from '../utils/formatTime';
import { ao5 } from '../utils/averages';
import { useSettings } from '../hooks/useSettings';
import { chartColors } from '../utils/themeColors';
import type { Solve, PersonalBest } from '../types';
import './SolveHub.css';

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: { date?: string } }>;
}

const CustomTooltip = ({ active, payload }: TooltipProps): ReactElement | null => {
  if (active && payload && payload.length && typeof payload[0].value === 'number') {
    return (
      <div className="custom-tooltip">
        <p>{`Time: ${formatTime(payload[0].value)}`}</p>
      </div>
    );
  }
  return null;
};

const PBTooltip = ({ active, payload }: TooltipProps): ReactElement | null => {
  if (active && payload && payload.length && typeof payload[0].value === 'number') {
    return (
      <div className="custom-tooltip">
        <p>{`PB: ${formatTime(payload[0].value)}`}</p>
        <p className="tooltip-date">{payload[0].payload?.date}</p>
      </div>
    );
  }
  return null;
};

interface Stats {
  totalSolves: number;
  validSolves: number;
  bestTime: number;
  averageTime: number;
  ao5: number | null;
}

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
  const stats = useMemo<Stats | null>(() => {
    if (!solves?.length) return null;

    const validSolves = solves.filter(s => !s.dnf);
    const times = validSolves.map(s => s.plus_two ? s.time + 2 : s.time);

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
  // (pbHistory is server-only) so the row hides rather than showing a fake
  // value.
  const lifetimeBest = useMemo<number | null>(() => {
    if (!pbHistory.length) return null;
    return Math.min(...pbHistory.map(pb => Number(pb.time)));
  }, [pbHistory]);

  // DSA-3: Chart data from circular buffer (last 12 solves, oldest → newest)
  const chartData = useMemo(() => {
    return recentSolves
      .filter(s => !s.dnf)
      .map((s, i) => ({ solve: i + 1, time: s.plus_two ? s.time + 2 : s.time }));
  }, [recentSolves]);

  // SD-3: PB progression chart data
  const pbChartData = useMemo(() => {
    return pbHistory.map((pb, i) => ({
      solve: i + 1,
      time: Number(pb.time),
      date: new Date(pb.achieved_at).toLocaleDateString(),
    }));
  }, [pbHistory]);

  const { effectiveTheme } = useSettings();
  const colors = chartColors(effectiveTheme);

  if (!stats) return (
    <div className="solve-hub empty-state">
      <p>No solves yet. Start solving to see your stats!</p>
    </div>
  );

  return (
    <div className="solve-hub">
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">Solves</span>
          <span className="stat-value">{stats.validSolves}/{stats.totalSolves}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Best (session)</span>
          <span className="stat-value">{formatTime(stats.bestTime)}</span>
        </div>
        {lifetimeBest !== null && (
          <div className="stat-item">
            <span className="stat-label">Best (all-time)</span>
            <span className="stat-value">{formatTime(lifetimeBest)}</span>
          </div>
        )}
        <div className="stat-item">
          <span className="stat-label">Average</span>
          <span className="stat-value">{formatTime(stats.averageTime)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">AO5</span>
          <span className="stat-value">{stats.ao5 !== null ? formatTime(stats.ao5) : '-'}</span>
        </div>

        {/* DSA-4: Running median from two-heap tracker */}
        {currentMedian !== null && (
          <div className="stat-item">
            <span className="stat-label">Median</span>
            <span className="stat-value">{formatTime(currentMedian)}</span>
          </div>
        )}

        {/* DSA-2: Percentile from binary search insert position */}
        {lastPercentile !== null && (
          <div className="stat-item percentile-stat">
            <span className="stat-label">Last Solve</span>
            <span className="stat-value">
              Faster than {lastPercentile}%
            </span>
          </div>
        )}
      </div>

      {/* DSA-3: Recent solve times from circular buffer */}
      {chartData.length > 1 && (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={chartData}>
              <XAxis dataKey="solve" stroke={colors.axis} tick={{ fill: colors.axis }} />
              <YAxis stroke={colors.axis} tick={{ fill: colors.axis }} />
              <Tooltip content={<CustomTooltip />} />
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
      )}

      {/* SD-3: PB progression chart — write-time materialized from personal_bests table */}
      {pbChartData.length > 1 && (
        <div className="chart-container">
          <p className="chart-title">PB Progression</p>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={pbChartData}>
              <XAxis dataKey="solve" stroke={colors.axis} tick={{ fill: colors.axis }} />
              <YAxis stroke={colors.axis} tick={{ fill: colors.axis }} />
              <Tooltip content={<PBTooltip />} />
              <Line
                type="monotone"
                dataKey="time"
                stroke={colors.pb}
                strokeWidth={2}
                dot={{ r: 3, fill: colors.pb }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default SolveHub;
