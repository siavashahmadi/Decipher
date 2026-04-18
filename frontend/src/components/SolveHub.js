import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import './SolveHub.css';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <p>{`Time: ${payload[0].value.toFixed(2)}s`}</p>
      </div>
    );
  }
  return null;
};

const PBTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <p>{`PB: ${payload[0].value.toFixed(2)}s`}</p>
        <p className="tooltip-date">{payload[0].payload.date}</p>
      </div>
    );
  }
  return null;
};

// DSA-3: recentSolves comes from the circular buffer in SolveSession (last 12).
// SD-3: pbHistory is the write-time materialized personal best progression.
// DSA-2: lastPercentile shows where this solve ranks among previous solves.
// DSA-4: currentMedian from the two-heap tracker (O(log n) insert, O(1) query).
const SolveHub = ({ solves, recentSolves = [], pbHistory = [], lastPercentile = null, currentMedian = null }) => {
  const stats = useMemo(() => {
    if (!solves?.length) return null;

    const validSolves = solves.filter(solve => !solve.dnf);
    const times = validSolves.map(solve => solve.plus_two ? solve.time + 2 : solve.time);

    if (times.length === 0) return null;

    const ao5 = times.length >= 5
      ? ((times.slice(0, 5).sort((a, b) => a - b).slice(1, 4).reduce((a, b) => a + b, 0)) / 3).toFixed(2)
      : null;

    return {
      totalSolves: solves.length,
      validSolves: validSolves.length,
      bestTime: Math.min(...times).toFixed(2),
      averageTime: (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2),
      ao5,
    };
  }, [solves]);

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
      time: parseFloat(pb.time),
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
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">Solves</span>
          <span className="stat-value">{stats.validSolves}/{stats.totalSolves}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Best</span>
          <span className="stat-value">{stats.bestTime}s</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Average</span>
          <span className="stat-value">{stats.averageTime}s</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">AO5</span>
          <span className="stat-value">{stats.ao5 ? `${stats.ao5}s` : '-'}</span>
        </div>

        {/* DSA-4: Running median from two-heap tracker */}
        {currentMedian !== null && (
          <div className="stat-item">
            <span className="stat-label">Median</span>
            <span className="stat-value">{currentMedian.toFixed(2)}s</span>
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
              <XAxis dataKey="solve" stroke="#e4e4e4" tick={{ fill: '#e4e4e4' }} />
              <YAxis stroke="#e4e4e4" tick={{ fill: '#e4e4e4' }} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="time"
                stroke="#3dc942"
                strokeWidth={2}
                dot={{ r: 3, fill: '#3dc942' }}
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
              <XAxis dataKey="solve" stroke="#e4e4e4" tick={{ fill: '#e4e4e4' }} />
              <YAxis stroke="#e4e4e4" tick={{ fill: '#e4e4e4' }} />
              <Tooltip content={<PBTooltip />} />
              <Line
                type="monotone"
                dataKey="time"
                stroke="#f5a623"
                strokeWidth={2}
                dot={{ r: 3, fill: '#f5a623' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default SolveHub;
