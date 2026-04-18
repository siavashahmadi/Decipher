import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatTime } from '../utils/formatTime';
import './Timer.css';

type Phase = 'idle' | 'ready' | 'inspection' | 'armed' | 'running';

const HOLD_MS = 550;

interface PenaltyFlags {
  plusTwo: boolean;
  dnf: boolean;
}

interface TimerProps {
  onSolveComplete: (time: number, flags: PenaltyFlags) => void;
}

const Timer = ({ onSolveComplete }: TimerProps): React.ReactElement => {
  const [time, setTime] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [inspectionCount, setInspectionCount] = useState(15);
  const [holdMet, setHoldMet] = useState(false);

  const phaseRef = useRef<Phase>('idle');
  const timeRef = useRef(0);
  const inspectionStartRef = useRef<number | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const holdMetRef = useRef(false);
  const holdMetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const penaltyFlagsRef = useRef<PenaltyFlags>({ plusTwo: false, dnf: false });
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
    if (holdMetTimeoutRef.current !== null) {
      clearTimeout(holdMetTimeoutRef.current);
      holdMetTimeoutRef.current = null;
    }
  };

  useEffect(() => clearIntervals, []);

  const beginHold = useCallback(() => {
    holdStartRef.current = Date.now();
    holdMetRef.current = false;
    setHoldMet(false);
    if (holdMetTimeoutRef.current !== null) clearTimeout(holdMetTimeoutRef.current);
    holdMetTimeoutRef.current = setTimeout(() => {
      holdMetRef.current = true;
      setHoldMet(true);
    }, HOLD_MS);
  }, []);

  const clearHold = useCallback(() => {
    holdStartRef.current = null;
    holdMetRef.current = false;
    setHoldMet(false);
    if (holdMetTimeoutRef.current !== null) {
      clearTimeout(holdMetTimeoutRef.current);
      holdMetTimeoutRef.current = null;
    }
  }, []);

  const startInspection = useCallback(() => {
    inspectionStartRef.current = Date.now();
    setInspectionCount(15);
    inspectionIntervalRef.current = setInterval(() => {
      const start = inspectionStartRef.current;
      if (start === null) return;
      const elapsed = Date.now() - start;
      const remaining = Math.ceil((15000 - elapsed) / 1000);
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
    const inspectionElapsed = inspectionStartRef.current
      ? Date.now() - inspectionStartRef.current
      : 0;
    if (inspectionElapsed > 17000) {
      penaltyFlagsRef.current = { plusTwo: false, dnf: true };
    } else if (inspectionElapsed > 15000) {
      penaltyFlagsRef.current = { plusTwo: true, dnf: false };
    } else {
      penaltyFlagsRef.current = { plusTwo: false, dnf: false };
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
    phaseRef.current = 'idle';
    setPhase('idle');
    onSolveComplete(timeRef.current / 1000, penaltyFlagsRef.current);
    penaltyFlagsRef.current = { plusTwo: false, dnf: false };
  }, [onSolveComplete]);

  const cancelToIdle = useCallback(() => {
    clearIntervals();
    setTime(0);
    setInspectionCount(15);
    timeRef.current = 0;
    inspectionStartRef.current = null;
    penaltyFlagsRef.current = { plusTwo: false, dnf: false };
    clearHold();
    phaseRef.current = 'idle';
    setPhase('idle');
  }, [clearHold]);

  const resetTimer = useCallback(() => {
    cancelToIdle();
  }, [cancelToIdle]);

  const onPressDown = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'idle') {
      setTime(0);
      timeRef.current = 0;
      beginHold();
      phaseRef.current = 'ready';
      setPhase('ready');
    } else if (p === 'inspection') {
      beginHold();
      phaseRef.current = 'armed';
      setPhase('armed');
    } else if (p === 'running') {
      finishSolve();
    }
  }, [beginHold, finishSolve]);

  const onPressUp = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'ready') {
      const met = holdMetRef.current;
      clearHold();
      if (met) startInspection();
      else {
        phaseRef.current = 'idle';
        setPhase('idle');
      }
    } else if (p === 'armed') {
      const met = holdMetRef.current;
      clearHold();
      if (met) startRunning();
      else {
        phaseRef.current = 'inspection';
        setPhase('inspection');
      }
    }
  }, [clearHold, startInspection, startRunning]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        const p = phaseRef.current;
        if (p === 'ready' || p === 'inspection' || p === 'armed') {
          event.preventDefault();
          cancelToIdle();
        }
        return;
      }
      if (event.code !== 'Space') return;
      if (event.repeat) return;
      event.preventDefault();
      onPressDown();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      onPressUp();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onPressDown, onPressUp, cancelToIdle]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    onPressDown();
  }, [onPressDown]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    onPressUp();
  }, [onPressUp]);

  const isWarning = phase === 'inspection' && inspectionCount <= 3 && inspectionCount > 0;
  const isHoldReady = (phase === 'ready' || phase === 'armed') && holdMet;

  const timerClass = [
    phase === 'ready' ? 'ready' : '',
    phase === 'armed' ? 'armed' : '',
    isHoldReady ? 'hold-met' : '',
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
        {phase === 'inspection' || phase === 'armed' ? inspectionCount : formatTime(time / 1000)}
      </div>
      <button onClick={resetTimer}>Reset Timer</button>
    </div>
  );
};

export default Timer;
