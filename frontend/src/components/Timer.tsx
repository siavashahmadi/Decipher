import React, { useMemo } from 'react';
import { formatTime } from '../utils/formatTime';
import { useTimerMachine } from '../hooks/useTimerMachine';
import './Timer.css';

interface PenaltyFlags {
  plusTwo: boolean;
  dnf: boolean;
}

interface TimerProps {
  onSolveComplete: (time: number, flags: PenaltyFlags) => void;
}

const Timer = ({ onSolveComplete }: TimerProps): React.ReactElement => {
  const machine = useTimerMachine({ onSolveComplete });

  const timerClass = useMemo(
    () => [
      machine.phase === 'ready' ? 'ready' : '',
      machine.phase === 'armed' ? 'armed' : '',
      machine.isHoldReady ? 'hold-met' : '',
      machine.phase === 'running' ? 'running' : '',
      machine.phase === 'inspection' && !machine.isWarning ? 'inspection' : '',
      machine.isWarning ? 'inspection-warning' : '',
      machine.flashYellow ? 'flash-yellow' : '',
    ].filter(Boolean).join(' '),
    [machine.phase, machine.isHoldReady, machine.isWarning, machine.flashYellow],
  );

  return (
    <div>
      <div
        id="timer"
        ref={machine.timerDivRef}
        className={timerClass}
        onTouchStart={machine.onTouchStart}
        onTouchEnd={machine.onTouchEnd}
      >
        {machine.phase === 'inspection' || machine.phase === 'armed' ? (
          <span className="inspection-display">
            <span>{machine.inspectionCount}</span>
            {machine.inspectionBadge && (
              <span
                className={`timer-badge ${machine.inspectionBadge === '+2' ? 'plus-two' : 'dnf'}`}
              >
                {machine.inspectionBadge}
              </span>
            )}
          </span>
        ) : (
          formatTime(machine.time / 1000)
        )}
      </div>
      <button onClick={machine.resetTimer}>Reset Timer</button>
    </div>
  );
};

export default Timer;
