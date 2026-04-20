import { useEffect, useRef } from 'react';

export type HotkeyHandler = (e: KeyboardEvent) => void;
export type HotkeyMap = Record<string, HotkeyHandler>;

const isEditableTarget = (t: EventTarget | null): boolean => {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (t.isContentEditable) return true;
  return false;
};

const buildKey = (e: KeyboardEvent): string => {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  parts.push(k);
  return parts.join('+');
};

const useHotkeys = (map: HotkeyMap, enabled: boolean = true): void => {
  const mapRef = useRef(map);
  useEffect(() => { mapRef.current = map; }, [map]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent): void => {
      if (isEditableTarget(e.target)) return;
      const combo = buildKey(e);
      const fn = mapRef.current[combo];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
};

export default useHotkeys;
