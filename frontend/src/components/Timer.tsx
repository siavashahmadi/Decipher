import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatTime } from '../utils/formatTime';
import './Timer.css';

// UX-1: WCA Inspection Timer
// State machine: 'idle' | 'ready' | 'inspection' | 'running'
// phaseRef drives keyboard logic (avoids stale closure); phase state drives rendering.

type Phase = 'idle' | 'ready' | 'inspection' | 'running';

interface TimerProps {
  onSolveComplete: (time: number, inspectionOverran: boolean) => void;
}

const Timer = ({ onSolveComplete }: TimerProps): React.ReactElement => {
  const [time, setTime] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [inspectionCount, setInspectionCount] = useState(15);

  const phaseRef = useRef<Phase>('idle');
  const timeRef = useRef(0);
  const inspectionStartRef = useRef<number | null>(null);
  const inspectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearIntervals = () => {
    if (inspectionIntervalRef.current !== null) {
      clearInterval(inspectionIntervalRef.current);
      inspectionIntervalRef.current = null;
    }
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  useEffect(() => clearIntervals, []);

  const startInspection = useCallback(() => {
    inspectionStartRef.current = Date.now();
    setInspectionCount(15);
    inspectionIntervalRef.current = setInterval(() => {
      const start = inspectionStartRef.current;
      if (start === null) return;
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, Math.ceil((15000 - elapsed) / 1000));
      setInspectionCount(remaining);
    }, 100);
    phaseRef.current = 'inspection';
    setPhase('inspection');
  }, []);

  const startRunning = useCallback(() => {
    if (inspectionIntervalRef.current !== null) {
      clearInterval(inspectionIntervalRef.current);
      inspectionIntervalRef.current = null;
    }
    setTime(0);
    timeRef.current = 0;
    timerIntervalRef.current = setInterval(() => {
      setTime(prev => {
        const next = prev + 10;
        timeRef.current = next;
        return next;
      });
    }, 10);
    phaseRef.current = 'running';
    setPhase('running');
  }, []);

  const finishSolve = useCallback(() => {
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    const inspectionElapsed = inspectionStartRef.current
      ? Date.now() - inspectionStartRef.current
      : 0;
    const inspectionOverran = inspectionElapsed > 15000;
    phaseRef.current = 'idle';
    setPhase('idle');
    onSolveComplete(timeRef.current / 1000, inspectionOverran);
  }, [onSolveComplete]);

  const resetTimer = useCallback(() => {
    clearIntervals();
    setTime(0);
    setInspectionCount(15);
    timeRef.current = 0;
    inspectionStartRef.current = null;
    phaseRef.current = 'idle';
    setPhase('idle');
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      if (event.repeat) return;
      event.preventDefault();
      const p = phaseRef.current;
      if (p === 'idle') {
        setTime(0);
        timeRef.current = 0;
        phaseRef.current = 'ready';
        setPhase('ready');
      } else if (p === 'inspection') {
        startRunning();
      } else if (p === 'running') {
        finishSolve();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      if (phaseRef.current === 'ready') {
        startInspection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startInspection, startRunning, finishSolve]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const p = phaseRef.current;
    if (p === 'idle') {
      setTime(0);
      timeRef.current = 0;
      phaseRef.current = 'ready';
      setPhase('ready');
    } else if (p === 'inspection') {
      startRunning();
    } else if (p === 'running') {
      finishSolve();
    }
  }, [startRunning, finishSolve]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (phaseRef.current === 'ready') {
      startInspection();
    }
  }, [startInspection]);

  const isWarning = phase === 'inspection' && inspectionCount <= 3;

  const timerClass = [
    phase === 'ready' ? 'ready' : '',
    phase === 'running' ? 'running' : '',
    phase === 'inspection' && !isWarning ? 'inspection' : '',
    isWarning ? 'inspection-warning' : '',
  ].filter(Boolean).join(' ');

  return (
    <div>
      <div
        id="timer"
        className={timerClass}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {phase === 'inspection' ? inspectionCount : formatTime(time / 1000)}
      </div>
      <button onClick={resetTimer}>Reset Timer</button>
    </div>
  );
};

export default Timer;
