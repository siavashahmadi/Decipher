import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SharedSolve from './SharedSolve';
import api from '../services/api';

vi.mock('../services/api', () => ({
  default: { getSharedSolve: vi.fn() },
  __esModule: true,
}));

const mockGetSharedSolve = api.getSharedSolve as unknown as ReturnType<typeof vi.fn>;

const renderAtToken = (token: string) =>
  render(
    <MemoryRouter initialEntries={[`/s/${token}`]}>
      <Routes>
        <Route path="/s/:token" element={<SharedSolve />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SharedSolve', () => {
  it('shows the loading placeholder until the API resolves, then renders the solve', async () => {
    mockGetSharedSolve.mockResolvedValue({
      id: 'abc',
      puzzle_type: '333',
      time: 9.87,
      dnf: false,
      plus_two: false,
      scramble: "R U R'",
      created_at: '2026-04-20T00:00:00Z',
    });
    renderAtToken('tok123');
    expect(screen.getByText(/Loading/)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('9.87')).toBeInTheDocument());
    expect(screen.getByText('333')).toBeInTheDocument();
    expect(screen.getByText("R U R'")).toBeInTheDocument();
  });

  it('shows the error card when the API rejects', async () => {
    mockGetSharedSolve.mockRejectedValue(new Error('404 not found'));
    renderAtToken('badtoken');

    await waitFor(() =>
      expect(
        screen.getByText('This link is invalid or the solve was removed.'),
      ).toBeInTheDocument(),
    );
  });

  it('does not throw when the API resolves after unmount', async () => {
    let resolve!: (v: unknown) => void;
    mockGetSharedSolve.mockReturnValue(new Promise(r => { resolve = r; }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderAtToken('tok-unmount');
    cleanup();
    resolve({
      id: 'abc',
      puzzle_type: '333',
      time: 9.87,
      dnf: false,
      plus_two: false,
      scramble: '',
      created_at: '2026-04-20T00:00:00Z',
    });
    await new Promise<void>(r => setTimeout(r, 0));

    // A leaked setState on an unmounted component would log a React warning;
    // the cancelled flag should keep that from happening.
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('copies the scramble and flips the button label, reverting after 1500ms', async () => {
    mockGetSharedSolve.mockResolvedValue({
      id: 'abc',
      puzzle_type: '333',
      time: 9.87,
      dnf: false,
      plus_two: false,
      scramble: "R U R' U'",
      created_at: '2026-04-20T00:00:00Z',
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    renderAtToken('tok123');
    const btn = await screen.findByRole('button', { name: 'Copy scramble' });

    // Fake timers only for the 1500ms reset window. Activate after the
    // initial fetch has resolved so waitFor above could use real time.
    vi.useFakeTimers({ shouldAdvanceTime: false });

    fireEvent.click(btn);
    await vi.advanceTimersByTimeAsync(0); // flush microtasks under fake timers

    expect(writeText).toHaveBeenCalledWith("R U R' U'");
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(1500);
    expect(screen.getByRole('button', { name: 'Copy scramble' })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('handles a clipboard rejection silently without flipping the label', async () => {
    mockGetSharedSolve.mockResolvedValue({
      id: 'abc',
      puzzle_type: '333',
      time: 9.87,
      dnf: false,
      plus_two: false,
      scramble: "R U R'",
      created_at: '2026-04-20T00:00:00Z',
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      writable: true,
      configurable: true,
    });

    renderAtToken('tok123');
    const btn = await screen.findByRole('button', { name: 'Copy scramble' });
    fireEvent.click(btn);
    // Let the rejected clipboard promise settle.
    await new Promise<void>(r => setTimeout(r, 0));

    expect(screen.getByRole('button', { name: 'Copy scramble' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
  });
});
