import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const focusables = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled'),
  );

/**
 * Trap keyboard focus inside `ref` while `enabled`. Focuses the first
 * focusable on mount; restores focus to the previously-active element on
 * unmount. Tab and Shift+Tab wrap inside the container.
 *
 * Pair with `aria-modal="true"` on the container element.
 */
export const useFocusTrap = (
  ref: RefObject<HTMLElement | null>,
  enabled: boolean = true,
): void => {
  useEffect(() => {
    if (!enabled) return;
    const root = ref.current;
    if (!root) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const initial = focusables(root);
    initial[0]?.focus();

    const handleKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      const current = focusables(root);
      if (current.length === 0) {
        e.preventDefault();
        return;
      }
      const first = current[0]!;
      const last = current[current.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener('keydown', handleKey);
    return () => {
      root.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus?.();
    };
  }, [ref, enabled]);
};
