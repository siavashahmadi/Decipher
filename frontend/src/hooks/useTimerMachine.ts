import { useState, useEffect, useCallback, useRef, type RefObject } from 'react';
import type React from 'react';
import { formatTime } from '../utils/formatTime';
import {
  beep,
  INSPECTION_START_HZ,
  INSPECTION_START_MS,
  INSPECTION_8S_WARNING_HZ,
  INSPECTION_8S_WARNING_MS,
  INSPECTION_12S_WARNING_HZ,
  INSPECTION_12S_WARNING_MS,
} from '../utils/sound';
import {
  INSPECTION_LIMIT_MS,
  INSPECTION_PLUS_TWO_MS,
} from '../utils/inspectionConstants';
import { tickInspection } from '../utils/inspectionTick';
import { useSettings } from './useSettings';

export type Phase = 'idle' | 'ready' | 'inspection' | 'armed' | 'running';

interface PenaltyFlags {
  plusTwo: boolean;
  dnf: boolean;
}

interface TimerMachineProps {
  onSolveComplete: (time: number, flags: PenaltyFlags) => void;
}

export interface TimerMachine {
  phase: Phase;
  time: number;
  inspectionCount: number;
  inspectionBadge: '+2' | null;
  holdMet: boolean;
  flashYellow: boolean;
  isWarning: boolean;
  isHoldReady: boolean;
  timerDivRef: RefObject<HTMLDivElement>;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  resetTimer: () => void;
}

export function useTimerMachine({ onSolveComplete }: TimerMachineProps): TimerMachine {
  const [time, setTime] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [inspectionCount, setInspectionCount] = useState(15);
  const [inspectionBadge, setInspectionBadge] = useState<'+2' | null>(null);
  const [holdMet, setHoldMet] = useState(false);
  const [flashYellow, setFlashYellow] = useState(false);

  const { holdMs, inspectionEnabled } = useSettings();
  const holdMsRef = useRef(holdMs);
  const inspectionEnabledRef = useRef(inspectionEnabled);
  useEffect(() => { holdMsRef.current = holdMs; }, [holdMs]);
  useEffect(() => { inspectionEnabledRef.current = inspectionEnabled; }, [inspectionEnabled]);

  const phaseRef = useRef<Phase>('idle');
  const timerDivRef = useRef<HTMLDivElement>(null);
  const inspectionStartRef = useRef<number | null>(null);
  const holdMetRef = useRef(false);
  const holdMetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const penaltyFlagsRef = useRef<PenaltyFlags>({ plusTwo: false, dnf: false });
  const inspectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRafRef = useRef<number | null>(null);
  const timerStartRef = useRef<number>(0);
  const warning7FiredRef = useRef(false);
  const warning3FiredRef = useRef(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShownSecondRef = useRef<number | null>(null);

  const clearIntervals = () => {
    if (inspectionIntervalRef.current !== null) {
      clearInterval(inspectionIntervalRef.current);
      inspectionIntervalRef.current = null;
    }
    if (timerRafRef.current !== null) {
      cancelAnimationFrame(timerRafRef.current);
      timerRafRef.current = null;
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
    holdMetRef.current = false;
    setHoldMet(false);
    if (holdMetTimeoutRef.current !== null) clearTimeout(holdMetTimeoutRef.current);
    const delay = holdMsRef.current;
    if (delay === 0) {
      holdMetRef.current = true;
      setHoldMet(true);
    } else {
      holdMetTimeoutRef.current = setTimeout(() => {
        holdMetRef.current = true;
        setHoldMet(true);
      }, delay);
    }
  }, []);

  const clearHold = useCallback(() => {
    holdMetRef.current = false;
    setHoldMet(false);
    if (holdMetTimeoutRef.current !== null) {
      clearTimeout(holdMetTimeoutRef.current);
      holdMetTimeoutRef.current = null;
    }
  }, []);

  const startInspection = useCallback(() => {
    beep(INSPECTION_START_HZ, INSPECTION_START_MS);
    inspectionStartRef.current = Date.now();
    warning7FiredRef.current = false;
    warning3FiredRef.current = false;
    setFlashYellow(false);
    if (flashTimeoutRef.current !== null) {
      clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }
    setInspectionCount(15);
    lastShownSecondRef.current = 15;
    setInspectionBadge(null);
    inspectionIntervalRef.current = setInterval(() => {
      const start = inspectionStartRef.current;
      if (start === null) return;
      const elapsed = Date.now() - start;
      const result = tickInspection(elapsed, lastShownSecondRef.current);

      if (result.kind === 'expired') {
        if (inspectionIntervalRef.current !== null) {
          clearInterval(inspectionIntervalRef.current);
          inspectionIntervalRef.current = null;
        }
        if (flashTimeoutRef.current !== null) {
          clearTimeout(flashTimeoutRef.current);
          flashTimeoutRef.current = null;
        }
        penaltyFlagsRef.current = { plusTwo: false, dnf: true };
        inspectionStartRef.current = null;
        warning7FiredRef.current = false;
        warning3FiredRef.current = false;
        setFlashYellow(false);
        setInspectionBadge(null);
        setInspectionCount(15);
        phaseRef.current = 'idle';
        setPhase('idle');
        onSolveComplete(0, { plusTwo: false, dnf: true });
        penaltyFlagsRef.current = { plusTwo: false, dnf: false };
        return;
      }

      if (result.remainingSecond !== lastShownSecondRef.current) {
        lastShownSecondRef.current = result.remainingSecond;
        setInspectionCount(result.remainingSecond);
      }

      if (result.kind === 'plus_two') {
        setInspectionBadge('+2');
      } else {
        setInspectionBadge(null);

        if (result.warning === 8 && !warning7FiredRef.current) {
          warning7FiredRef.current = true;
          beep(INSPECTION_8S_WARNING_HZ, INSPECTION_8S_WARNING_MS);
          setFlashYellow(true);
          if (flashTimeoutRef.current !== null) clearTimeout(flashTimeoutRef.current);
          flashTimeoutRef.current = setTimeout(() => setFlashYellow(false), 200);
        }

        if (result.warning === 12 && !warning3FiredRef.current) {
          warning3FiredRef.current = true;
          beep(INSPECTION_12S_WARNING_HZ, INSPECTION_12S_WARNING_MS);
        }
      }
    }, 250);
    phaseRef.current = 'inspection';
    setPhase('inspection');
  }, [onSolveComplete]);

  const startRunning = useCallback(() => {
    if (inspectionIntervalRef.current !== null) {
      clearInterval(inspectionIntervalRef.current);
      inspectionIntervalRef.current = null;
    }
    const inspectionElapsed = inspectionStartRef.current
      ? Date.now() - inspectionStartRef.current
      : 0;
    if (inspectionElapsed > INSPECTION_PLUS_TWO_MS) {
      penaltyFlagsRef.current = { plusTwo: false, dnf: true };
    } else if (inspectionElapsed > INSPECTION_LIMIT_MS) {
      penaltyFlagsRef.current = { plusTwo: true, dnf: false };
    } else {
      penaltyFlagsRef.current = { plusTwo: false, dnf: false };
    }
    setTime(0);
    timerStartRef.current = performance.now();
    const tick = () => {
      const elapsed = performance.now() - timerStartRef.current;
      const rounded = Math.floor(elapsed / 10) * 10;
      if (timerDivRef.current) {
        timerDivRef.current.textContent = formatTime(rounded / 1000);
      }
      timerRafRef.current = requestAnimationFrame(tick);
    };
    timerRafRef.current = requestAnimationFrame(tick);
    phaseRef.current = 'running';
    setPhase('running');
  }, []);

  const finishSolve = useCallback(() => {
    if (timerRafRef.current !== null) {
      cancelAnimationFrame(timerRafRef.current);
      timerRafRef.current = null;
    }
    const finalMs = performance.now() - timerStartRef.current;
    const rounded = Math.floor(finalMs / 10) * 10;
    setTime(rounded);
    phaseRef.current = 'idle';
    setPhase('idle');
    onSolveComplete(rounded / 1000, penaltyFlagsRef.current);
    penaltyFlagsRef.current = { plusTwo: false, dnf: false };
  }, [onSolveComplete]);

  const cancelToIdle = useCallback(() => {
    clearIntervals();
    setTime(0);
    setInspectionCount(15);
    setInspectionBadge(null);
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
      if (!met) {
        phaseRef.current = 'idle';
        setPhase('idle');
        return;
      }
      if (inspectionEnabledRef.current) {
        startInspection();
      } else {
        startRunning();
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
        if (p === 'ready' || p === 'inspection' || p === 'armed' || p === 'running') {
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

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    onPressDown();
  }, [onPressDown]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    onPressUp();
  }, [onPressUp]);

  const isWarning = phase === 'inspection' && inspectionCount <= 3 && inspectionCount > 0;
  const isHoldReady = (phase === 'ready' || phase === 'armed') && holdMet;

  return {
    phase,
    time,
    inspectionCount,
    inspectionBadge,
    holdMet,
    flashYellow,
    isWarning,
    isHoldReady,
    timerDivRef,
    onTouchStart,
    onTouchEnd,
    resetTimer,
  };
}
