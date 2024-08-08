import React, { useState, useEffect, useCallback } from 'react';
import './Timer.css';

const Timer = ({ onSolveStart, onSolveComplete }) => {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const formatTime = (ms) => {
    const pad = (n, z = 2) => ('00' + n).slice(-z);
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / 1000 / 60) % 60);
    const milliseconds = Math.floor(ms % 1000);
    return `${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`;
  };

  const startTimer = useCallback(() => {
    setIsRunning(true);
    setIsReady(false);
    onSolveStart();
  }, [onSolveStart]);

  const stopTimer = useCallback(() => {
    setIsRunning(false);
    onSolveComplete(time / 1000);
  }, [onSolveComplete, time]);

  const resetTimer = useCallback(() => {
    setTime(0);
    setIsRunning(false);
    setIsReady(false);
  }, []);

  useEffect(() => {
    let interval;
    if (isRunning) {
      interval = setInterval(() => {
        setTime((prevTime) => prevTime + 10);
      }, 10);
    } else if (!isRunning) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === "Space" && !isRunning) {
        event.preventDefault();
        setIsReady(true);
        setTime(0); // Reset the time when preparing for a new solve
      }
    };

    const handleKeyUp = (event) => {
      if (event.code === "Space") {
        event.preventDefault();
        if (isReady && !isRunning) {
          startTimer();
        } else if (isRunning) {
          stopTimer();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isReady, isRunning, startTimer, stopTimer]);

  return (
    <div>
      <div id="timer" className={isReady ? 'ready' : isRunning ? 'running' : ''}>
        {formatTime(time)}
      </div>
      <button onClick={resetTimer}>Reset Timer</button>
    </div>
  );
};

export default Timer;
