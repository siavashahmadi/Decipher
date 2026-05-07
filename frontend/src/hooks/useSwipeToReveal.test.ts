import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipeToReveal } from './useSwipeToReveal';

const createTouch = (x: number, y: number): Touch =>
  ({ clientX: x, clientY: y, identifier: 0 }) as Touch;

const touchEvent = (type: string, x: number, y: number): TouchEvent => {
  const touch = createTouch(x, y);
  return new TouchEvent(type, {
    touches: type === 'touchend' ? [] : [touch],
    changedTouches: [touch],
  });
};

describe('useSwipeToReveal', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('returns revealed: true when swiped left past threshold', () => {
    const { result } = renderHook(() => useSwipeToReveal());

    act(() => {
      result.current.ref(container);
    });

    act(() => {
      container.dispatchEvent(touchEvent('touchstart', 300, 100));
    });
    act(() => {
      container.dispatchEvent(touchEvent('touchmove', 220, 100));
    });
    act(() => {
      container.dispatchEvent(touchEvent('touchend', 220, 100));
    });

    expect(result.current.revealed).toBe(true);
  });

  it('returns revealed: false when swipe delta is below threshold (snap-back)', () => {
    const { result } = renderHook(() => useSwipeToReveal());

    act(() => {
      result.current.ref(container);
    });

    act(() => {
      container.dispatchEvent(touchEvent('touchstart', 300, 100));
    });
    act(() => {
      container.dispatchEvent(touchEvent('touchmove', 270, 100));
    });
    act(() => {
      container.dispatchEvent(touchEvent('touchend', 270, 100));
    });

    expect(result.current.revealed).toBe(false);
  });

  it('does not trigger when vertical swipe exceeds horizontal', () => {
    const { result } = renderHook(() => useSwipeToReveal());

    act(() => {
      result.current.ref(container);
    });

    act(() => {
      container.dispatchEvent(touchEvent('touchstart', 300, 100));
    });
    act(() => {
      container.dispatchEvent(touchEvent('touchmove', 260, 250));
    });
    act(() => {
      container.dispatchEvent(touchEvent('touchend', 260, 250));
    });

    expect(result.current.revealed).toBe(false);
  });

  it('provides offsetX tracking during swipe', () => {
    const { result } = renderHook(() => useSwipeToReveal());

    act(() => {
      result.current.ref(container);
    });

    act(() => {
      container.dispatchEvent(touchEvent('touchstart', 300, 100));
    });
    act(() => {
      container.dispatchEvent(touchEvent('touchmove', 250, 100));
    });

    expect(result.current.offsetX).toBe(-50);
  });

  it('resets when reset is called', () => {
    const { result } = renderHook(() => useSwipeToReveal());

    act(() => {
      result.current.ref(container);
    });

    act(() => {
      container.dispatchEvent(touchEvent('touchstart', 300, 100));
    });
    act(() => {
      container.dispatchEvent(touchEvent('touchmove', 220, 100));
    });
    act(() => {
      container.dispatchEvent(touchEvent('touchend', 220, 100));
    });

    expect(result.current.revealed).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.revealed).toBe(false);
    expect(result.current.offsetX).toBe(0);
  });
});
