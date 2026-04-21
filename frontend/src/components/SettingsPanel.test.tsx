import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsPanel from './SettingsPanel';

const setTheme = vi.fn();
const setInspectionEnabled = vi.fn();
const setSoundEnabled = vi.fn();
const setHoldMs = vi.fn();
const setEnabled = vi.fn();
const setMode = vi.fn();
const setShowHintFacelets = vi.fn();

let settingsState = {
  theme: 'dark' as 'dark' | 'light' | 'system',
  inspectionEnabled: true,
  soundEnabled: false,
  holdMs: 550,
};

let previewState = {
  enabled: true,
  mode: '3D' as '3D' | '2D',
  showHintFacelets: false,
};

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    ...settingsState,
    setTheme,
    setInspectionEnabled,
    setSoundEnabled,
    setHoldMs,
  }),
}));

vi.mock('../hooks/useScramblePreviewSettings', () => ({
  default: () => ({
    ...previewState,
    setEnabled,
    setMode,
    setShowHintFacelets,
  }),
}));

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsState = { theme: 'dark', inspectionEnabled: true, soundEnabled: false, holdMs: 550 };
    previewState = { enabled: true, mode: '3D', showHintFacelets: false };
  });

  it('renders the three settings rows when preview is enabled', () => {
    render(<SettingsPanel />);
    expect(screen.getByText(/theme/i)).toBeInTheDocument();
    expect(screen.getByText(/3d scramble preview/i)).toBeInTheDocument();
    expect(screen.getByText(/view mode/i)).toBeInTheDocument();
  });

  it('hides the view mode row when preview is disabled', () => {
    previewState.enabled = false;
    render(<SettingsPanel />);
    expect(screen.queryByText(/view mode/i)).not.toBeInTheDocument();
  });

  it('calls setTheme when a theme option is clicked', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('toggles preview enabled when the switch is clicked', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('switch', { name: /3d scramble preview/i }));
    expect(setEnabled).toHaveBeenCalledWith(false);
  });

  it('calls setPreviewMode when a mode button is clicked', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: '2D' }));
    expect(setMode).toHaveBeenCalledWith('2D');
  });

  it('marks the active theme and mode buttons with aria-pressed', () => {
    settingsState.theme = 'light';
    previewState.mode = '2D';
    render(<SettingsPanel />);
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '2D' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles inspection switch', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('switch', { name: 'Inspection' }));
    expect(setInspectionEnabled).toHaveBeenCalledWith(false);
  });

  it('moves the hold-to-start slider', () => {
    render(<SettingsPanel />);
    const slider = screen.getByLabelText('Hold-to-start delay milliseconds');
    fireEvent.change(slider, { target: { value: '0' } });
    expect(setHoldMs).toHaveBeenCalledWith(0);
  });

  it('selects System theme', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'System' }));
    expect(setTheme).toHaveBeenCalledWith('system');
  });
});
