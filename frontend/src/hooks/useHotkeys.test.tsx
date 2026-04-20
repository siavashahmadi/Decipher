import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import useHotkeys, { HotkeyMap } from './useHotkeys';

const Harness = ({ map, enabled = true }: { map: HotkeyMap; enabled?: boolean }): JSX.Element => {
  useHotkeys(map, enabled);
  return <input data-testid="input" />;
};

describe('useHotkeys', () => {
  it('fires the matching handler on keydown', () => {
    const onTwo = vi.fn();
    render(<Harness map={{ '2': onTwo }} />);
    fireEvent.keyDown(window, { key: '2' });
    expect(onTwo).toHaveBeenCalled();
  });

  it('does NOT fire when an input is focused', () => {
    const onTwo = vi.fn();
    const { getByTestId } = render(<Harness map={{ '2': onTwo }} />);
    const input = getByTestId('input') as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: '2' });
    expect(onTwo).not.toHaveBeenCalled();
  });

  it('matches Shift+D distinctly from d', () => {
    const onD = vi.fn();
    const onShiftD = vi.fn();
    render(<Harness map={{ 'd': onD, 'Shift+d': onShiftD }} />);
    fireEvent.keyDown(window, { key: 'd' });
    fireEvent.keyDown(window, { key: 'D', shiftKey: true });
    expect(onD).toHaveBeenCalledTimes(1);
    expect(onShiftD).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    const onTwo = vi.fn();
    render(<Harness map={{ '2': onTwo }} enabled={false} />);
    fireEvent.keyDown(window, { key: '2' });
    expect(onTwo).not.toHaveBeenCalled();
  });
});
