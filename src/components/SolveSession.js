import React, { useState, useCallback, useEffect } from 'react';
import Timer from './Timer';
import Scramble from './Scramble';
import Header from './Header';
import SolveLog from './SolveLog';
import './SolveSession.css';

const SolveSession = () => {
  const [isSolving, setIsSolving] = useState(false);
  const [solveCount, setSolveCount] = useState(0);
  const [type, setType] = useState('333'); // Default puzzle type is 3x3
  const [solves, setSolves] = useState([]);

  const handleSolveStart = useCallback(() => {
    setIsSolving(true);
  }, []);

  const handleSolveComplete = useCallback((time) => {
    setIsSolving(false);
    setSolveCount(prev => prev + 1);
    setSolves(prev => [{ time }, ...prev]); // save solve time to state or send to a server
    console.log(`Solve completed in ${time} seconds`);
  }, []);

  const handleTypeChange = (event) => {
    setType(event.target.value);
  };

  const resetTimer = useCallback(() => {
    setSolveCount(0);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === "Space") {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="solve-session">
      <Header type={type} handleTypeChange={handleTypeChange} resetTimer={resetTimer} />
      <div className="main-content">
        <div className="timer-section">
          <Timer 
            onSolveStart={handleSolveStart}
            onSolveComplete={handleSolveComplete}
            isSolving={isSolving}
          />
        </div>
        <div className="mid-section">
          <div className="left-section">
            <Scramble key={solveCount} type={type} />
          </div>
          <div className="right-section">
            <SolveLog solves={solves} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SolveSession;
