import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StatsPage from './Stats';
import api from '../services/api';
import { supabase } from '../services/auth';
import { SettingsProvider } from '../hooks/useSettings';
import { ScramblePreviewSettingsProvider } from '../hooks/useScramblePreviewSettings';
import type { Solve } from '../types';

vi.mock('../services/api');
vi.mock('../services/auth', () => ({ supabase: { auth: { getSession: vi.fn() } } }));
vi.mock('../services/guestStorage', () => ({ getGuestSolves: vi.fn(() => []) }));

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
    (supabase.auth.getSession as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ data: { session: { access_token: 'x' } } });
    (api.getSolves as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ solves, next_cursor: null });
    (api.getPersonalBests as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('renders summary, charts, and heatmap with fetched solves', async () => {
    render(
      <MemoryRouter initialEntries={['/stats']}>
        <SettingsProvider>
          <ScramblePreviewSettingsProvider>
            <StatsPage />
          </ScramblePreviewSettingsProvider>
        </SettingsProvider>
      </MemoryRouter>
    );
    // Best single = 8s -> "8.00". Wait for the fully loaded state before asserting chart headers.
    await waitFor(() => expect(screen.getByText('8.00')).toBeInTheDocument());
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Times')).toBeInTheDocument();
    expect(screen.getByText('Distribution')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
  });
});
