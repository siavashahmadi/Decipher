import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { useDismissOnOutsideClick } from './useDismissOnOutsideClick';
import { fireEvent } from '@testing-library/react';

describe('useDismissOnOutsideClick', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls onClose when pointerdown fires outside the ref element', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      useDismissOnOutsideClick(ref, onClose);
      return ref;
    });

    const div = document.createElement('div');
    document.body.appendChild(div);
    Object.defineProperty(result.current, 'current', { value: div, writable: true });

    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);

    document.body.removeChild(div);
  });

  it('does not call onClose when pointerdown fires inside the ref element', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      useDismissOnOutsideClick(ref, onClose);
      return ref;
    });

    const div = document.createElement('div');
    document.body.appendChild(div);
    Object.defineProperty(result.current, 'current', { value: div, writable: true });

    fireEvent.pointerDown(div);
    expect(onClose).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      useDismissOnOutsideClick(ref, onClose);
      return ref;
    });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose for non-Escape keys', () => {
    const onClose = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      useDismissOnOutsideClick(ref, onClose);
      return ref;
    });

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Space' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not register listeners when enabled is false', () => {
    const docAddSpy = vi.spyOn(document, 'addEventListener');
    const winAddSpy = vi.spyOn(window, 'addEventListener');
    const onClose = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      useDismissOnOutsideClick(ref, onClose, false);
      return ref;
    });

    expect(docAddSpy).not.toHaveBeenCalled();
    expect(winAddSpy).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes pointerdown listener from document on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const onClose = vi.fn();
    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      useDismissOnOutsideClick(ref, onClose);
      return ref;
    });

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
  });

  it('removes keydown listener from document on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const onClose = vi.fn();
    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      useDismissOnOutsideClick(ref, onClose);
      return ref;
    });

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('removes listeners when enabled switches to false', () => {
    const docRemoveSpy = vi.spyOn(document, 'removeEventListener');
    const onClose = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => {
        const ref = useRef<HTMLDivElement>(null);
        useDismissOnOutsideClick(ref, onClose, enabled);
        return ref;
      },
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });
    expect(docRemoveSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(docRemoveSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('registers listeners when enabled switches from false to true', () => {
    const docAddSpy = vi.spyOn(document, 'addEventListener');
    const onClose = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => {
        const ref = useRef<HTMLDivElement>(null);
        useDismissOnOutsideClick(ref, onClose, enabled);
        return ref;
      },
      { initialProps: { enabled: false } },
    );

    docAddSpy.mockClear();
    rerender({ enabled: true });
    expect(docAddSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(docAddSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
