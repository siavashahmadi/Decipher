import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Timer from './Timer';

const settingsState = {
  theme: 'dark' as 'dark' | 'light' | 'system',
  inspectionEnabled: true,
  soundEnabled: false,
  holdMs: 300,
};

vi.mock('../hooks/useSettings', () => ({
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

const spaceDown = (): void => { fireEvent.keyDown(window, { code: 'Space' }); };
const spaceUp = (): void => { fireEvent.keyUp(window, { code: 'Space' }); };
const escape = (): void => { fireEvent.keyDown(window, { code: 'Escape' }); };
const advance = async (ms: number): Promise<void> => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};
const timerClass = (): string => document.querySelector('#timer')?.className ?? '';

describe('Timer state machine', () => {
  it('idle → ready on space keydown', () => {
    render(<Timer onSolveComplete={vi.fn()} />);
    spaceDown();
    expect(timerClass()).toContain('ready');
  });

  it('ready → idle on keyup before hold met (no solve recorded)', async () => {
    const onComplete = vi.fn();
    render(<Timer onSolveComplete={onComplete} />);
    spaceDown();
    await advance(100);
    spaceUp();
    expect(timerClass()).not.toContain('ready');
    expect(timerClass()).not.toContain('inspection');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('ready → inspection on keyup after hold met', async () => {
    render(<Timer onSolveComplete={vi.fn()} />);
    spaceDown();
    await advance(400);
    spaceUp();
    expect(timerClass()).toContain('inspection');
  });

  it('ready → idle on Escape', () => {
    const onComplete = vi.fn();
    render(<Timer onSolveComplete={onComplete} />);
    spaceDown();
    escape();
    expect(timerClass()).not.toContain('ready');
    expect(timerClass()).not.toContain('inspection');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('inspection → armed on space keydown', async () => {
    render(<Timer onSolveComplete={vi.fn()} />);
    spaceDown();
    await advance(400);
    spaceUp();
    spaceDown();
    expect(timerClass()).toContain('armed');
  });

  it('armed → running on keyup after hold met (solve recorded on next press)', async () => {
    const onComplete = vi.fn();
    render(<Timer onSolveComplete={onComplete} />);
    spaceDown();
    await advance(400);
    spaceUp();
    spaceDown();
    await advance(400);
    spaceUp();
    expect(timerClass()).toContain('running');
    await advance(1000);
    spaceDown();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('inspection elapsed > 15s but < 17s marks +2', async () => {
    const onComplete = vi.fn();
    render(<Timer onSolveComplete={onComplete} />);
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
    expect(onComplete.mock.calls[0]![1]).toEqual({ plusTwo: true, dnf: false });
  });

  it('inspection elapsed > 17s auto-finalizes as DNF with time 0', async () => {
    const onComplete = vi.fn();
    render(<Timer onSolveComplete={onComplete} />);
    spaceDown();
    await advance(400);
    spaceUp();
    // Inspection interval ticks at 250ms cadence so auto-DNF fires
    // within ~250ms of the 17s mark; advance enough to span a tick.
    await advance(17500);
    expect(onComplete).toHaveBeenCalledWith(0, { plusTwo: false, dnf: true });
    expect(timerClass()).not.toContain('inspection');
    expect(timerClass()).not.toContain('running');
  });

  it('running → idle on space keydown; time is rounded to 10ms', async () => {
    const onComplete = vi.fn();
    render(<Timer onSolveComplete={onComplete} />);
    spaceDown();
    await advance(400);
    spaceUp();
    spaceDown();
    await advance(400);
    spaceUp();
    await advance(5237);
    spaceDown();
    expect(onComplete).toHaveBeenCalledTimes(1);
    const timeSec = onComplete.mock.calls[0]![0] as number;
    expect(Math.round(timeSec * 1000) % 10).toBe(0);
  });

  it('Escape from running cancels without recording', async () => {
    const onComplete = vi.fn();
    render(<Timer onSolveComplete={onComplete} />);
    spaceDown();
    await advance(400);
    spaceUp();
    spaceDown();
    await advance(400);
    spaceUp();
    await advance(2000);
    escape();
    expect(onComplete).not.toHaveBeenCalled();
    expect(timerClass()).not.toContain('running');
  });

  it('inspectionEnabled: false → idle → ready → running', async () => {
    settingsState.inspectionEnabled = false;
    render(<Timer onSolveComplete={vi.fn()} />);
    spaceDown();
    await advance(400);
    spaceUp();
    expect(timerClass()).toContain('running');
  });

  it('shows +2 badge once inspection passes 15s', async () => {
    render(<Timer onSolveComplete={vi.fn()} />);
    spaceDown();
    await advance(400);
    spaceUp();
    await advance(15500);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });
});
