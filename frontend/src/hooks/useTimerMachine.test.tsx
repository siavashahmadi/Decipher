import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useTimerMachine } from './useTimerMachine';

const settingsState = {
  theme: 'dark' as 'dark' | 'light' | 'system',
  inspectionEnabled: true,
  soundEnabled: false,
  holdMs: 300,
};

vi.mock('./useSettings', () => ({
  useSettings: () => ({
    ...settingsState,
    effectiveTheme: 'dark' as const,
    setTheme: vi.fn(),
    setInspectionEnabled: vi.fn(),
    setSoundEnabled: vi.fn(),
    setHoldMs: vi.fn(),
  }),
}));

vi.mock('../utils/sound', () => ({
  beep: vi.fn(),
  setSoundEnabled: vi.fn(),
  INSPECTION_START_HZ: 880,
  INSPECTION_START_MS: 80,
  INSPECTION_8S_WARNING_HZ: 440,
  INSPECTION_8S_WARNING_MS: 100,
  INSPECTION_12S_WARNING_HZ: 660,
  INSPECTION_12S_WARNING_MS: 150,
}));

import { beep } from '../utils/sound';

interface HarnessProps {
  onSolveComplete: ReturnType<typeof vi.fn>;
}

function Harness({ onSolveComplete }: HarnessProps) {
  const m = useTimerMachine({ onSolveComplete });
  return (
    <div>
      <div data-testid="phase">{m.phase}</div>
      <div data-testid="inspection-count">{m.inspectionCount}</div>
      <div data-testid="inspection-badge">{m.inspectionBadge ?? ''}</div>
      <div data-testid="hold-met">{String(m.holdMet)}</div>
      <div data-testid="flash-yellow">{String(m.flashYellow)}</div>
      <div data-testid="is-warning">{String(m.isWarning)}</div>
      <div data-testid="is-hold-ready">{String(m.isHoldReady)}</div>
    </div>
  );
}

beforeEach(() => {
  settingsState.inspectionEnabled = true;
  settingsState.holdMs = 300;
  vi.useFakeTimers({
    toFake: [
      'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const spaceDown = () => { fireEvent.keyDown(window, { code: 'Space' }); };
const spaceUp = () => { fireEvent.keyUp(window, { code: 'Space' }); };
const escape = () => { fireEvent.keyDown(window, { code: 'Escape' }); };
const advance = async (ms: number) => {
  await act(async () => { vi.advanceTimersByTime(ms); });
};

const phase = () => screen.getByTestId('phase').textContent ?? '';
const inspectionCount = () => screen.getByTestId('inspection-count').textContent ?? '';
const badge = () => screen.getByTestId('inspection-badge').textContent ?? '';
const flashYellow = () => screen.getByTestId('flash-yellow').textContent === 'true';
const isWarning = () => screen.getByTestId('is-warning').textContent === 'true';
const isHoldReady = () => screen.getByTestId('is-hold-ready').textContent === 'true';

describe('useTimerMachine', () => {
  describe('phase transitions', () => {
    it('starts in idle phase', () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      expect(phase()).toBe('idle');
    });

    it('idle → ready on space keydown', () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      expect(phase()).toBe('ready');
    });

    it('ready → idle on keyup before hold met', async () => {
      const onComplete = vi.fn();
      render(<Harness onSolveComplete={onComplete} />);
      spaceDown();
      await advance(100);
      spaceUp();
      expect(phase()).toBe('idle');
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('ready → inspection on keyup after hold met (inspection enabled)', async () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      expect(phase()).toBe('inspection');
    });

    it('ready → running on keyup after hold met (inspection disabled)', async () => {
      settingsState.inspectionEnabled = false;
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      expect(phase()).toBe('running');
    });

    it('inspection → armed on space keydown', async () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      spaceDown();
      expect(phase()).toBe('armed');
    });

    it('armed → inspection on keyup before hold met', async () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      spaceDown();
      await advance(100);
      spaceUp();
      expect(phase()).toBe('inspection');
    });

    it('armed → running on keyup after hold met', async () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      spaceDown();
      await advance(400);
      spaceUp();
      expect(phase()).toBe('running');
    });

    it('running → idle on space keydown', async () => {
      const onComplete = vi.fn();
      render(<Harness onSolveComplete={onComplete} />);
      spaceDown();
      await advance(400);
      spaceUp();
      spaceDown();
      await advance(400);
      spaceUp();
      await advance(1000);
      spaceDown();
      expect(phase()).toBe('idle');
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('hold-met flag', () => {
    it('holdMet becomes true after holdMs delay', async () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      expect(isHoldReady()).toBe(false);
      await advance(400);
      expect(isHoldReady()).toBe(true);
    });

    it('holdMet resets on press release', async () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      expect(isHoldReady()).toBe(true);
      spaceUp();
      expect(isHoldReady()).toBe(false);
    });

    it('holdMs=0 sets holdMet immediately', () => {
      settingsState.holdMs = 0;
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      expect(isHoldReady()).toBe(true);
    });
  });

  describe('inspection countdown', () => {
    it('inspection count starts at 15', async () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      expect(inspectionCount()).toBe('15');
    });

    it('inspection count decrements over time', async () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      await advance(3000);
      expect(inspectionCount()).toBe('12');
    });

    it('shows +2 badge after 15s elapsed', async () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      await advance(15500);
      expect(badge()).toBe('+2');
    });

    it('auto-DNF at 17s+ fires callback with time=0, dnf=true', async () => {
      const onComplete = vi.fn();
      render(<Harness onSolveComplete={onComplete} />);
      spaceDown();
      await advance(400);
      spaceUp();
      await advance(17500);
      expect(onComplete).toHaveBeenCalledWith(0, { plusTwo: false, dnf: true });
      expect(phase()).toBe('idle');
    });

    it('inspection resets badge and count after auto-DNF', async () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      await advance(17500);
      expect(badge()).toBe('');
      expect(inspectionCount()).toBe('15');
    });
  });

  describe('+2 penalty', () => {
    it('starting solve between 15s and 17s marks +2', async () => {
      const onComplete = vi.fn();
      render(<Harness onSolveComplete={onComplete} />);
      spaceDown();
      await advance(400);
      spaceUp();
      await advance(15500);
      spaceDown();
      await advance(400);
      spaceUp();
      await advance(500);
      spaceDown();
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete.mock.calls[0][1]).toEqual({ plusTwo: true, dnf: false });
    });
  });

  describe('isWarning flag', () => {
    it('isWarning becomes true when inspectionCount reaches 3', async () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      expect(isWarning()).toBe(false);
      await advance(12500);
      expect(isWarning()).toBe(true);
    });

    it('isWarning false at count=4', async () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      await advance(11500);
      expect(isWarning()).toBe(false);
    });
  });

  describe('audio warnings', () => {
    it('fires beep at 8s elapsed (warning7)', async () => {
      const beepMock = vi.mocked(beep);
      beepMock.mockClear();
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      beepMock.mockClear();
      await advance(8250);
      const calls8 = beepMock.mock.calls.filter(c => c[0] === 440);
      expect(calls8.length).toBe(1);
    });

    it('fires beep at 12s elapsed (warning3)', async () => {
      const beepMock = vi.mocked(beep);
      beepMock.mockClear();
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      beepMock.mockClear();
      await advance(12250);
      const calls12 = beepMock.mock.calls.filter(c => c[0] === 660);
      expect(calls12.length).toBe(1);
    });

    it('8s warning fires only once per inspection', async () => {
      const beepMock = vi.mocked(beep);
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      beepMock.mockClear();
      await advance(8250);
      await advance(2000);
      const calls8 = beepMock.mock.calls.filter(c => c[0] === 440);
      expect(calls8.length).toBe(1);
    });
  });

  describe('flashYellow', () => {
    it('flashYellow becomes true at 8s warning then clears after 200ms', async () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      // Advance to just past the 8s tick (8000ms elapsed in inspection).
      // The interval fires every 250ms; at exactly 8000ms the 8s warning fires.
      // At 8001ms elapsed flashYellow is true; 200ms later it clears.
      await advance(8001);
      expect(flashYellow()).toBe(true);
      await advance(200);
      expect(flashYellow()).toBe(false);
    });
  });

  describe('Escape key', () => {
    it('Escape from ready → idle', () => {
      const onComplete = vi.fn();
      render(<Harness onSolveComplete={onComplete} />);
      spaceDown();
      escape();
      expect(phase()).toBe('idle');
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('Escape from inspection → idle', async () => {
      render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      escape();
      expect(phase()).toBe('idle');
    });

    it('Escape from running → idle without recording solve', async () => {
      const onComplete = vi.fn();
      render(<Harness onSolveComplete={onComplete} />);
      spaceDown();
      await advance(400);
      spaceUp();
      spaceDown();
      await advance(400);
      spaceUp();
      await advance(2000);
      escape();
      expect(onComplete).not.toHaveBeenCalled();
      expect(phase()).toBe('idle');
    });

    it('Escape from idle is a no-op', () => {
      const onComplete = vi.fn();
      render(<Harness onSolveComplete={onComplete} />);
      escape();
      expect(phase()).toBe('idle');
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe('time rounding', () => {
    it('recorded time is rounded to 10ms', async () => {
      const onComplete = vi.fn();
      render(<Harness onSolveComplete={onComplete} />);
      spaceDown();
      await advance(400);
      spaceUp();
      spaceDown();
      await advance(400);
      spaceUp();
      await advance(5237);
      spaceDown();
      const timeSec = onComplete.mock.calls[0][0] as number;
      expect(Math.round(timeSec * 1000) % 10).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('cleans up listeners and timers on unmount without errors', async () => {
      const { unmount } = render(<Harness onSolveComplete={vi.fn()} />);
      spaceDown();
      await advance(400);
      spaceUp();
      expect(() => unmount()).not.toThrow();
    });
  });
});
