import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import StatsPage from './Stats';
import api from '../services/api';
import { buildCsv, downloadCsv } from '../utils/exportCsv';
import { getGuestSolves } from '../services/guestStorage';
import { renderWithProviders } from '../test-utils/renderWithProviders';
import type { Solve } from '../types';

// Helper: read the current URL search via useLocation so the test asserts
// what react-router actually saw.
const LocationSpy = ({ onChange }: { onChange: (search: string) => void }) => {
  const loc = useLocation();
  onChange(loc.search);
  return null;
};

vi.mock('../services/api');
vi.mock('../services/auth', async () => {
  const { mockSupabaseAuthQuiet } = await import('../test-utils/mockSupabaseAuth');
  return mockSupabaseAuthQuiet();
});
vi.mock('../services/guestStorage', () => ({
  getGuestSolves: vi.fn(() => []),
  getAllGuestSolves: vi.fn(() => []),
}));
vi.mock('../utils/exportCsv', () => ({
  buildCsv: vi.fn(() => 'csv-body'),
  downloadCsv: vi.fn(),
}));

const solves: Solve[] = [
  { id: '1', puzzle_type: '333', time: 10, dnf: false, plus_two: false, scramble: '', created_at: '2026-04-19T00:00:00Z' },
  { id: '2', puzzle_type: '333', time: 12, dnf: false, plus_two: false, scramble: '', created_at: '2026-04-18T00:00:00Z' },
  { id: '3', puzzle_type: '333', time: 15, dnf: false, plus_two: false, scramble: '', created_at: '2026-04-17T00:00:00Z' },
  { id: '4', puzzle_type: '333', time: 8,  dnf: false, plus_two: false, scramble: '', created_at: '2026-04-16T00:00:00Z' },
  { id: '5', puzzle_type: '333', time: 11, dnf: false, plus_two: false, scramble: '', created_at: '2026-04-15T00:00:00Z' },
];

describe('StatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getSolves as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ solves, next_cursor: null });
    (api.getPersonalBests as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    // Default-isGuest path under the quiet supabase mock; feed the same
    // dataset through getGuestSolves so the page renders something stable.
    (getGuestSolves as unknown as ReturnType<typeof vi.fn>).mockReturnValue(solves);
  });

  it('renders summary, charts, and heatmap with fetched solves', async () => {
    renderWithProviders(<StatsPage />, { initialEntries: ['/stats'] });
    await waitFor(() => expect(screen.getByText('Scramble history')).toBeInTheDocument());
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Times')).toBeInTheDocument();
    expect(screen.getByText('Distribution')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
  });

  it('renders the correct best-single and solve count from fetched solves', async () => {
    renderWithProviders(<StatsPage />, { initialEntries: ['/stats'] });
    await waitFor(() => expect(screen.getByText('Scramble history')).toBeInTheDocument());

    // 5 valid out of 5 total; best single is 8.00 (out of 8/10/11/12/15).
    // Anchor on the summary labels so the assertions don't collide with the
    // same value rendered elsewhere on the page (e.g. the scramble history).
    const labelOf = (text: string): HTMLElement => {
      const span = screen.getByText(text);
      const value = span.parentElement?.querySelector('b');
      if (!value) throw new Error(`No <b> sibling for label "${text}"`);
      return value as HTMLElement;
    };
    expect(labelOf('Solves')).toHaveTextContent('5/5');
    expect(labelOf('Best single')).toHaveTextContent('8.00');
  });

  it('Export CSV passes the currently-filtered solves to downloadCsv', async () => {
    renderWithProviders(<StatsPage />, { initialEntries: ['/stats'] });
    await waitFor(() => expect(screen.getByText('Scramble history')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Export filtered solves to CSV/ }));

    const buildMock = buildCsv as unknown as ReturnType<typeof vi.fn>;
    const downloadMock = downloadCsv as unknown as ReturnType<typeof vi.fn>;
    expect(buildMock).toHaveBeenCalledTimes(1);
    // Default preset is unfiltered, so all 5 solves flow into the CSV builder.
    expect(buildMock.mock.calls[0]![0]).toHaveLength(5);
    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(downloadMock.mock.calls[0]![1]).toBe('csv-body');
    // Filename matches the puzzle slug and is dated.
    expect(downloadMock.mock.calls[0]![0]).toMatch(/^decipher-333-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('updates the URL puzzle param when a different puzzle is selected', async () => {
    let lastSearch = '';
    renderWithProviders(
      <>
        <StatsPage />
        <LocationSpy onChange={(s) => { lastSearch = s; }} />
      </>,
      { initialEntries: ['/stats?puzzle=333'] },
    );
    await waitFor(() => expect(screen.getByText('Scramble history')).toBeInTheDocument());
    expect(lastSearch).toBe('?puzzle=333');

    // The Header on desktop renders one button per puzzle. On the test
    // viewport (jsdom defaults), useMatchMedia is false so the desktop
    // button row renders.
    const button2x2 = screen.getByRole('button', { name: '2x2' });
    fireEvent.click(button2x2);

    await waitFor(() => expect(lastSearch).toBe('?puzzle=222'));
  });

  it('disables the Export button when no solves match the filter', async () => {
    (getGuestSolves as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
    renderWithProviders(<StatsPage />, { initialEntries: ['/stats'] });
    await waitFor(() => expect(screen.getByText('Scramble history')).toBeInTheDocument());

    const btn = screen.getByRole('button', { name: /Export filtered solves to CSV/ });
    expect(btn).toBeDisabled();
  });
});
