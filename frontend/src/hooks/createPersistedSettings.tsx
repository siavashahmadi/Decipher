import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface PersistedConfig<T> {
  storageKey: string;
  defaults: T;
  parse: (raw: unknown) => Partial<T>;
}

interface HookResult<T> {
  value: T;
  update: (patch: Partial<T>) => void;
}

function readInitial<T>(storageKey: string, defaults: T, parse: (raw: unknown) => Partial<T>): T {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    return { ...defaults, ...parse(parsed) };
  } catch {
    return defaults;
  }
}

export function createPersistedSettings<T extends object>({
  storageKey,
  defaults,
  parse,
}: PersistedConfig<T>): { Provider: ({ children }: { children: ReactNode }) => JSX.Element; useHook: () => HookResult<T> } {
  const Context = createContext<HookResult<T> | null>(null);

  const Provider = ({ children }: { children: ReactNode }): JSX.Element => {
    const [value, setValue] = useState<T>(() => {
      if (typeof window === 'undefined') return defaults;
      return readInitial(storageKey, defaults, parse);
    });

    useEffect(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        // ignore in environments without localStorage (e.g., SSR or restricted contexts)
      }
    }, [value]);

    const update = (patch: Partial<T>): void => {
      setValue(prev => ({ ...prev, ...patch }));
    };

    return <Context.Provider value={{ value, update }}>{children}</Context.Provider>;
  };

  const useHook = (): HookResult<T> => {
    const ctx = useContext(Context);
    if (!ctx) throw new Error('useHook must be used within a createPersistedSettings Provider');
    return ctx;
  };

  return { Provider, useHook };
}
