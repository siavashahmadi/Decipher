import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import SolveDetailModal from './SolveDetailModal';
import { makeSolve } from '../test-utils/makeSolve';

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => vi.fn()),
}));

const mkSolve = (overrides: Parameters<typeof makeSolve>[0] = {}) =>
  makeSolve({ time: 23.45, scramble: "R U R' U' F2", created_at: '2026-04-12T15:30:00.000Z', ...overrides });

const five = [
  mkSolve({ id: '1', time: 21.10 }),
  mkSolve({ id: '2', time: 23.45 }),
  mkSolve({ id: '3', time: 19.87 }),
  mkSolve({ id: '4', time: 25.02 }),
  mkSolve({ id: '5', time: 22.18 }),
];

describe('SolveDetailModal', () => {
  it('renders the focused solve time large', () => {
    render(<SolveDetailModal solve={five[2]} window={five} index={2}
      onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByTestId('solve-detail-time').textContent).toBe('19.87');
  });

  it('renders the ±2 ao5 window with the focused solve marked', () => {
    render(<SolveDetailModal solve={five[2]} window={five} index={2}
      onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    const focused = screen.getByTestId('ao5-focused');
    expect(focused.textContent).toBe('19.87');
    // ao5 = drop fastest (19.87) and slowest (25.02), mean of 21.10, 23.45, 22.18 = 22.243...
    expect(screen.getByTestId('ao5-value').textContent).toBe('22.24');
  });

  it('falls back gracefully when fewer than 5 surrounding solves exist', () => {
    render(<SolveDetailModal solve={five[0]} window={five.slice(0, 2)} index={0}
      onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByTestId('ao5-value').textContent).toBe('-');
  });

  it('toggles +2 and DNF', () => {
    const onUpdate = vi.fn();
    render(<SolveDetailModal solve={five[2]} window={five} index={2}
      onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+2' }));
    expect(onUpdate).toHaveBeenCalledWith({ ...five[2], plus_two: true });
    fireEvent.click(screen.getByRole('button', { name: 'DNF' }));
    expect(onUpdate).toHaveBeenCalledWith({ ...five[2], dnf: true });
  });

  it('calls onDelete then onClose when Delete clicked', () => {
    const onClose = vi.fn();
    const onDelete = vi.fn();
    render(<SolveDetailModal solve={five[2]} window={five} index={2}
      onClose={onClose} onUpdate={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith(five[2]);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<SolveDetailModal solve={five[2]} window={five} index={2}
      onClose={onClose} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('copies the scramble to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SolveDetailModal solve={five[2]} window={five} index={2}
      onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /copy scramble/i }));
    expect(writeText).toHaveBeenCalledWith("R U R' U' F2");
  });

  it('navigates to / with replay state and closes modal when "Use this scramble" clicked', () => {
    const navigate = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const onClose = vi.fn();
    render(<SolveDetailModal solve={five[2]} window={five} index={2}
      onClose={onClose} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /use this scramble/i }));
    expect(navigate).toHaveBeenCalledWith('/', {
      state: { replayScramble: "R U R' U' F2", replayPuzzle: '333' },
    });
    expect(onClose).toHaveBeenCalled();
  });
});
