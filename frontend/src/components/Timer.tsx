import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatTime } from '../utils/formatTime';
import { beep } from '../utils/sound';
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
  const warning7FiredRef = useRef(false);
  const warning3FiredRef = useRef(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashYellow, setFlashYellow] = useState(false);

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
    if (flashTimeoutRef.current !== null) {
      clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
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
    warning7FiredRef.current = false;
    warning3FiredRef.current = false;
    setFlashYellow(false);
    if (flashTimeoutRef.current !== null) {
      clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }
    setInspectionCount(15);
    inspectionIntervalRef.current = setInterval(() => {
      const start = inspectionStartRef.current;
      if (start === null) return;
      const elapsed = Date.now() - start;
      const remaining = Math.ceil((15000 - elapsed) / 1000);
      setInspectionCount(remaining);
      if (elapsed >= 8000 && !warning7FiredRef.current) {
        warning7FiredRef.current = true;
        beep(440, 100);
        setFlashYellow(true);
        if (flashTimeoutRef.current !== null) clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = setTimeout(() => setFlashYellow(false), 200);
      }
      if (elapsed >= 12000 && !warning3FiredRef.current) {
        warning3FiredRef.current = true;
        beep(660, 150);
      }
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
    warning7FiredRef.current = false;
    warning3FiredRef.current = false;
    setFlashYellow(false);
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
    flashYellow ? 'flash-yellow' : '',
  ].filter(Boolean).join(' ');

  return (
    <div>
      <div
        id="timer"
        className={timerClass}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {phase === 'inspection' || phase === 'armed' ? (
          <span className="inspection-display">
            <span>{inspectionCount}</span>
            {inspectionCount <= 0 && (
              <span className="timer-badge">
                {(() => {
                  const start = inspectionStartRef.current;
                  const elapsed = start ? Date.now() - start : 0;
                  return elapsed > 17000 ? 'DNF' : '+2';
                })()}
              </span>
            )}
          </span>
        ) : (
          formatTime(time / 1000)
        )}
      </div>
      <button onClick={resetTimer}>Reset Timer</button>
    </div>
  );
};

export default Timer;
