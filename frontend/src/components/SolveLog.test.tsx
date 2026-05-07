import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

const mockMatchMedia = (matches: boolean): (() => void) => {
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  return () => { window.matchMedia = original; };
};

// JSDOM has no layout; the virtualizer falls back to its initial
// overscan so we cannot assert on which specific rows are mounted.
// These cases verify the surrounding chrome and that large-list mounts
// do not throw. Visual coverage of scroll behavior belongs in browser
// smoke testing.
describe('SolveLog', () => {
  it('renders the four stat labels with no solves', async () => {
    const SolveLog = (await import('./SolveLog')).default;
    render(<SolveLog solves={[]} {...baseProps} />);
    expect(screen.getByText('Ao5')).toBeInTheDocument();
    expect(screen.getByText('Ao12')).toBeInTheDocument();
    expect(screen.getByText('Mean')).toBeInTheDocument();
    expect(screen.getByText('Best')).toBeInTheDocument();
  });

  it('mounts with 50 solves without throwing', async () => {
    const SolveLog = (await import('./SolveLog')).default;
    const solves = makeSolves(50);
    expect(() => render(<SolveLog solves={solves} {...baseProps} />)).not.toThrow();
  });

  it('mounts with 5000 solves without throwing', async () => {
    const SolveLog = (await import('./SolveLog')).default;
    const solves = makeSolves(5000);
    expect(() => render(<SolveLog solves={solves} {...baseProps} />)).not.toThrow();
  });

  it('shows Load More when hasMore is true and hides when false', async () => {
    const SolveLog = (await import('./SolveLog')).default;
    const solves = makeSolves(10);
    const { rerender } = render(
      <SolveLog solves={solves} {...baseProps} hasMore={true} />
    );
    expect(screen.getByText('Load More')).toBeInTheDocument();
    rerender(<SolveLog solves={solves} {...baseProps} hasMore={false} />);
    expect(screen.queryByText('Load More')).toBeNull();
  });

  it('renders Clear view only when there is at least one solve', async () => {
    const SolveLog = (await import('./SolveLog')).default;
    const { rerender } = render(<SolveLog solves={[]} {...baseProps} />);
    expect(screen.queryByText('Clear view')).toBeNull();
    rerender(<SolveLog solves={makeSolves(3)} {...baseProps} />);
    expect(screen.getByText('Clear view')).toBeInTheDocument();
  });
});

// Row-level tests need the virtualizer to actually produce items.
// JSDOM gives containers zero height, so the real virtualizer renders
// nothing. Mock it to return all items so we can test conditional
// rendering and event handlers.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, i) => ({
        index: i,
        start: i * opts.estimateSize(),
        size: opts.estimateSize(),
        key: i,
      })),
    getTotalSize: () => opts.count * opts.estimateSize(),
    measureElement: () => {},
  }),
}));

describe('SolveLog row rendering', () => {
  let restore: () => void;

  afterEach(() => {
    restore?.();
    vi.restoreAllMocks();
  });

  it('hides inline delete button at phone width (393px)', async () => {
    restore = mockMatchMedia(true);
    const SolveLog = (await import('./SolveLog')).default;
    const solves = makeSolves(3);
    render(<SolveLog solves={solves} {...baseProps} />);
    expect(screen.queryAllByTitle('Delete solve')).toHaveLength(0);
  });

  it('shows inline delete button at desktop width (1024px)', async () => {
    restore = mockMatchMedia(false);
    const SolveLog = (await import('./SolveLog')).default;
    const solves = makeSolves(3);
    render(<SolveLog solves={solves} {...baseProps} />);
    const deleteButtons = screen.getAllByTitle('Delete solve');
    expect(deleteButtons.length).toBeGreaterThan(0);
  });

  it('tapping the row body fires the onClick handler (SolveDetailModal)', async () => {
    restore = mockMatchMedia(false);
    const onClick = vi.fn();
    const SolveLog = (await import('./SolveLog')).default;
    const solves = makeSolves(3);
    render(<SolveLog solves={solves} {...baseProps} onSolveClick={onClick} />);
    const rowButtons = screen.getAllByLabelText(/Solve \d+ details/);
    const firstButton = rowButtons[0];
    if (firstButton) {
      fireEvent.click(firstButton);
    }
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
