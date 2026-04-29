import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetMakeSolveCounter } from './src/test-utils/makeSolve';

afterEach(() => {
  cleanup();
  resetMakeSolveCounter();
});

// jsdom does not ship a clipboard API. Provide a no-op writeText so tests
// that touch `navigator.clipboard` can spy on it without manual setup.
if (!('clipboard' in navigator)) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async (_text: string) => {} },
    writable: true,
    configurable: true,
  });
}

// Polyfill matchMedia for jsdom environment
const mockMatchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: mockMatchMedia,
});

// Polyfill ResizeObserver for jsdom (recharts ResponsiveContainer requires it)
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }).ResizeObserver = ResizeObserverPolyfill;
