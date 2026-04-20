import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import ScrambleHistory from './ScrambleHistory';
import type { Solve } from '../../types';

vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: vi.fn() };
});

const mk = (id: string, scramble: string): Solve => ({
  id, puzzle_type: '333', time: 10, dnf: false, plus_two: false,
  scramble, created_at: '2026-01-01T00:00:00Z',
});

describe('ScrambleHistory', () => {
  it('renders up to 100 rows with truncated scrambles', () => {
    vi.mocked(useNavigate).mockReturnValue(vi.fn());
    const solves = Array.from({ length: 150 }, (_, i) => mk(`s${i}`, `R${i} U`));
    render(<MemoryRouter><ScrambleHistory solves={solves} /></MemoryRouter>);
    expect(screen.getAllByRole('button', { name: /replay/i })).toHaveLength(100);
  });

  it('replay navigates to / with scramble state', () => {
    const navigate = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const solves = [mk('a', 'F R U')];
    render(<MemoryRouter><ScrambleHistory solves={solves} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /replay/i }));
    expect(navigate).toHaveBeenCalledWith('/', {
      state: { replayScramble: 'F R U', replayPuzzle: '333' },
    });
  });

  it('renders an empty-state message when no solves', () => {
    vi.mocked(useNavigate).mockReturnValue(vi.fn());
    render(<MemoryRouter><ScrambleHistory solves={[]} /></MemoryRouter>);
    expect(screen.getByText(/no scrambles/i)).toBeInTheDocument();
  });
});
