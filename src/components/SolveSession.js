import React, { useState, useCallback, useEffect } from 'react';
import Timer from './Timer';
import Scramble from './Scramble';
import Header from './Header';
import SolveLog from './SolveLog';
import './SolveSession.css';

const SolveSession = () => {
  const [isSolving, setIsSolving] = useState(false);
  const [solveCount, setSolveCount] = useState(0);
  const [puzzleType, setPuzzleType] = useState('333');
  const [solves, setSolves] = useState([]);
  // const [currentScramble, setCurrentScramble] = useState('');

  // Load solves from localStorage on component mount
  useEffect(() => {
    const savedSolves = localStorage.getItem('ao5-solves');
    if (savedSolves) {
      setSolves(JSON.parse(savedSolves));
      setSolveCount(JSON.parse(savedSolves).length);
    }
  }, []);

  // Save solves to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('ao5-solves', JSON.stringify(solves));
  }, [solves]);

  const handleSolveStart = useCallback(() => {
    setIsSolving(true);
  }, []);

  // Modified this function to include id, dnf, and plus2
  const handleSolveComplete = useCallback((time) => {
    setIsSolving(false);
    setSolveCount(prev => prev + 1);
    
    // Create new solve with additional properties
    const newSolve = {
      id: Date.now(),  // Add this
      time: time,
      dnf: false,      // Add this
      plus2: false,    // Add this
    };
    
    setSolves(prev => [newSolve, ...prev]);
    console.log(`Solve completed in ${time} seconds`);
  }, []);

  // Add this new function
  const handleSolveUpdate = (updatedSolve) => {
    setSolves(prev => prev.map(solve => 
      solve.id === updatedSolve.id ? updatedSolve : solve
    ));
  };

  const handleTypeChange = (event) => {
    setPuzzleType(event.target.value);
  };

  const resetTimer = useCallback(() => {
    if (window.confirm('Are you sure you want to reset this session? All times will be deleted.')) {
      setSolveCount(0);
      setSolves([]); // This clears all the solve times
    }
  }, []);
  

  const handleSolveDelete = (solveToDelete) => {
    setSolves(prev => prev.filter(solve => solve.id !== solveToDelete.id));
  };

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
      <Header type={puzzleType} handleTypeChange={handleTypeChange} resetTimer={resetTimer} />
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
            <Scramble key={solveCount} type={puzzleType} />
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