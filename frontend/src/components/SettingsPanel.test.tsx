import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsPanel from './SettingsPanel';

const defaultProps = {
  theme: 'dark' as const,
  setTheme: vi.fn(),
  previewEnabled: true,
  setPreviewEnabled: vi.fn(),
  previewMode: '3D' as const,
  setPreviewMode: vi.fn(),
};

describe('SettingsPanel', () => {
  it('renders the three settings rows when preview is enabled', () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText(/theme/i)).toBeInTheDocument();
    expect(screen.getByText(/3d scramble preview/i)).toBeInTheDocument();
    expect(screen.getByText(/view mode/i)).toBeInTheDocument();
  });

  it('hides the view mode row when preview is disabled', () => {
    render(<SettingsPanel {...defaultProps} previewEnabled={false} />);
    expect(screen.queryByText(/view mode/i)).not.toBeInTheDocument();
  });

  it('calls setTheme when a theme option is clicked', () => {
    const setTheme = vi.fn();
    render(<SettingsPanel {...defaultProps} setTheme={setTheme} />);
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('toggles preview enabled when the switch is clicked', () => {
    const setPreviewEnabled = vi.fn();
    render(<SettingsPanel {...defaultProps} setPreviewEnabled={setPreviewEnabled} />);
    fireEvent.click(screen.getByRole('switch', { name: /3d scramble preview/i }));
    expect(setPreviewEnabled).toHaveBeenCalledWith(false);
  });

  it('calls setPreviewMode when a mode button is clicked', () => {
    const setPreviewMode = vi.fn();
    render(<SettingsPanel {...defaultProps} setPreviewMode={setPreviewMode} />);
    fireEvent.click(screen.getByRole('button', { name: '2D' }));
    expect(setPreviewMode).toHaveBeenCalledWith('2D');
  });

  it('marks the active theme and mode buttons with aria-pressed', () => {
    render(<SettingsPanel {...defaultProps} theme="light" previewMode="2D" />);
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '2D' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'false');
  });
});
