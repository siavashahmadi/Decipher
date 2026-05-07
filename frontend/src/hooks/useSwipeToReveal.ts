import { useCallback, useRef, useState } from 'react';

interface SwipeToRevealResult {
  ref: (el: HTMLElement | null) => void;
  revealed: boolean;
  offsetX: number;
  reset: () => void;
}

const SWIPE_THRESHOLD = 70;

export const useSwipeToReveal = (threshold = SWIPE_THRESHOLD): SwipeToRevealResult => {
  const [revealed, setRevealed] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const locked = useRef<'horizontal' | 'vertical' | null>(null);
  const elRef = useRef<HTMLElement | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    tracking.current = true;
    locked.current = null;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!tracking.current) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;

    if (locked.current === null) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      locked.current = Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
    }

    if (locked.current === 'vertical') {
      tracking.current = false;
      setOffsetX(0);
      return;
    }

    const clamped = Math.min(0, dx);
    setOffsetX(clamped);
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!tracking.current) {
      setOffsetX(0);
      return;
    }
    tracking.current = false;

    const touch = e.changedTouches[0];
    if (!touch) {
      setOffsetX(0);
      return;
    }

    const dx = touch.clientX - startX.current;
    if (dx < -threshold) {
      setRevealed(true);
      setOffsetX(-threshold);
    } else {
      setRevealed(false);
      setOffsetX(0);
    }
    locked.current = null;
  }, [threshold]);

  const ref = useCallback((el: HTMLElement | null) => {
    if (elRef.current) {
      elRef.current.removeEventListener('touchstart', handleTouchStart);
      elRef.current.removeEventListener('touchmove', handleTouchMove);
      elRef.current.removeEventListener('touchend', handleTouchEnd);
    }
    elRef.current = el;
    if (el) {
      el.addEventListener('touchstart', handleTouchStart, { passive: true });
      el.addEventListener('touchmove', handleTouchMove, { passive: true });
      el.addEventListener('touchend', handleTouchEnd);
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const reset = useCallback(() => {
    setRevealed(false);
    setOffsetX(0);
    tracking.current = false;
    locked.current = null;
  }, []);

  return { ref, revealed, offsetX, reset };
};
