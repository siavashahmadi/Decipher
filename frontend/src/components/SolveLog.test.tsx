import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SolveLog from './SolveLog';
import type { Solve } from '../types';

const makeSolves = (n: number): Solve[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    user_id: 'u',
    puzzle_type: '333',
    time: 10000 + i * 100,
    dnf: false,
    plus_two: false,
    scramble: '',
    created_at: new Date(2026, 0, 1 + i).toISOString(),
  }));

const baseProps = {
  onSolveUpdate: vi.fn(),
  onSolveDelete: vi.fn(),
  onSolveClick: vi.fn(),
  onReset: vi.fn(),
  onLoadMore: vi.fn(),
  hasMore: false,
  isLoadingMore: false,
};

// JSDOM has no layout; the virtualizer falls back to its initial
// overscan so we cannot assert on which specific rows are mounted.
// These cases verify the surrounding chrome and that large-list mounts
// do not throw. Visual coverage of scroll behavior belongs in browser
// smoke testing.
describe('SolveLog', () => {
  it('renders the four stat labels with no solves', () => {
    render(<SolveLog solves={[]} {...baseProps} />);
    expect(screen.getByText('Ao5')).toBeInTheDocument();
    expect(screen.getByText('Ao12')).toBeInTheDocument();
    expect(screen.getByText('Mean')).toBeInTheDocument();
    expect(screen.getByText('Best')).toBeInTheDocument();
  });

  it('mounts with 50 solves without throwing', () => {
    const solves = makeSolves(50);
    expect(() => render(<SolveLog solves={solves} {...baseProps} />)).not.toThrow();
  });

  it('mounts with 5000 solves without throwing', () => {
    const solves = makeSolves(5000);
    expect(() => render(<SolveLog solves={solves} {...baseProps} />)).not.toThrow();
  });

  it('shows Load More when hasMore is true and hides when false', () => {
    const solves = makeSolves(10);
    const { rerender } = render(
      <SolveLog solves={solves} {...baseProps} hasMore={true} />
    );
    expect(screen.getByText('Load More')).toBeInTheDocument();
    rerender(<SolveLog solves={solves} {...baseProps} hasMore={false} />);
    expect(screen.queryByText('Load More')).toBeNull();
  });

  it('renders Clear view only when there is at least one solve', () => {
    const { rerender } = render(<SolveLog solves={[]} {...baseProps} />);
    expect(screen.queryByText('Clear view')).toBeNull();
    rerender(<SolveLog solves={makeSolves(3)} {...baseProps} />);
    expect(screen.getByText('Clear view')).toBeInTheDocument();
  });
});
