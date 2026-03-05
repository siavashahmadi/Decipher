import React, { useState, useCallback, useEffect } from 'react';
import Timer from './Timer';
import Scramble from './Scramble';
import Header from './Header';
import SolveLog from './SolveLog';
import SolveHub from './SolveHub';
import './SolveSession.css';
import api from '../services/api.js';

const SolveSession = () => {
  const [isSolving, setIsSolving] = useState(false);
  const [solveCount, setSolveCount] = useState(0);
  const [puzzleType, setPuzzleType] = useState('333');
  const [solves, setSolves] = useState([]);

  useEffect(() => {
    const fetchSolves = async () => {
      try {
        const data = await api.getSolves(puzzleType);
        setSolves(data);
        setSolveCount(data.length);
      } catch (err) {
        console.error('Error fetching solves:', err);
      }
    };

    fetchSolves();
  }, [puzzleType]);

  const handleSolveStart = useCallback(() => {
    setIsSolving(true);
  }, []);

  const handleSolveComplete = useCallback(async (time) => {
    setIsSolving(false);
    setSolveCount(prev => prev + 1);

    const newSolve = {
      puzzle_type: puzzleType,
      time: time,
      dnf: false,
      plus_two: false,
      scramble: document.querySelector('.scramble-text')?.textContent || ''
    };

    try {
      const savedSolve = await api.createSolve(newSolve);
      if (savedSolve) {
        setSolves(prev => [savedSolve, ...prev]);
      }
    } catch (err) {
      console.error('API Error:', err);
    }
  }, [puzzleType]);

  const handleSolveUpdate = async (updatedSolve) => {
    try {
      const result = await api.updateSolve(updatedSolve.id, updatedSolve);
      setSolves(prev => prev.map(solve =>
        solve.id === result.id ? result : solve
      ));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSolveDelete = async (solveToDelete) => {
    try {
      await api.deleteSolve(solveToDelete.id);
      setSolves(prev => prev.filter(solve => solve.id !== solveToDelete.id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleTypeChange = (event) => {
    setPuzzleType(event.target.value);
  };

  const resetTimer = useCallback(() => {
    if (window.confirm('Are you sure you want to reset this session? All times will be deleted.')) {
      setSolveCount(0);
      setSolves([]);
    }
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
      <Header type={puzzleType} handleTypeChange={handleTypeChange} />
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
            <div className="scramble-wrapper">
              <Scramble
                key={`${puzzleType}-${solveCount}`}
                type={puzzleType}
              />
            </div>
            <div className="solve-hub-wrapper">
              <SolveHub
                solves={solves}
                type={puzzleType}
              />
            </div>
          </div>
          <div className="right-section">
            <SolveLog
              solves={solves}
              onSolveUpdate={handleSolveUpdate}
              onSolveDelete={handleSolveDelete}
              onReset={resetTimer}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SolveSession;