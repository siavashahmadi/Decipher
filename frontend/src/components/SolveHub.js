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

const SolveHub = ({ solves, type }) => {
  const stats = useMemo(() => {
    if (!solves?.length) return null;

    // Filter out DNF solves for calculations
    const validSolves = solves.filter(solve => !solve.dnf);
    const times = validSolves.map(solve => solve.plus2 ? solve.time + 2 : solve.time);

    if (times.length === 0) return null;

    // Calculate AO5
    const ao5 = times.length >= 5 
      ? ((times.slice(0, 5).sort((a, b) => a - b).slice(1, 4).reduce((a, b) => a + b, 0)) / 3).toFixed(2)
      : null;

    return {
      totalSolves: solves.length,
      validSolves: validSolves.length,
      bestTime: Math.min(...times).toFixed(2),
      averageTime: (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2),
      ao5,
      recentTimes: times.slice(0, 10).reverse() // Last 10 solves for the chart
    };
  }, [solves]);

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
      </div>

      {stats.recentTimes.length > 1 && (
        <div className="chart-container">
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={stats.recentTimes.map((time, index) => ({ solve: index + 1, time }))}>
                <XAxis 
                  dataKey="solve" 
                  stroke="#e4e4e4"
                  tick={{ fill: '#e4e4e4' }}
                />
                <YAxis 
                  stroke="#e4e4e4"
                  tick={{ fill: '#e4e4e4' }}
                />
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
        </div>
      )}
    </div>
  );
};

export default SolveHub;