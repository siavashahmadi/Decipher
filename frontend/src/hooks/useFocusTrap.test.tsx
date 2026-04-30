import { useRef, type ReactElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useFocusTrap } from './useFocusTrap';

const TestModal = ({ enabled = true }: { enabled?: boolean }): ReactElement => {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, enabled);
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      <button>first</button>
      <button>middle</button>
      <button>last</button>
    </div>
  );
};

describe('useFocusTrap', () => {
  it('moves focus to the first focusable on mount', () => {
    render(<TestModal />);
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('wraps Tab from the last focusable to the first', () => {
    render(<TestModal />);
    const last = screen.getByText('last');
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('wraps Shift+Tab from the first focusable to the last', () => {
    render(<TestModal />);
    const first = screen.getByText('first');
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('last'));
  });

  it('restores focus to the previously-active element on unmount', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'open';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(<TestModal />);
    expect(document.activeElement).not.toBe(trigger);
    unmount();
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it('does nothing when enabled is false', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    render(<TestModal enabled={false} />);
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});
