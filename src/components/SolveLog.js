import React from 'react';
import './SolveLog.css';

const SolveLog = ({ solves }) => {
  return (
    <div className="solve-log">
      <ul>
        {solves.slice().reverse().map((solve, index) => (
          <li key={index} className="solve-log-item">
            <span className="solve-number">{solves.length - index}.</span>
            <span className="solve-time">{solve.time}s</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SolveLog;
