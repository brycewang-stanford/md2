import { useEffect, useState } from 'react';

const PREFIX = 'md2:';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** useState persisted to localStorage (per browser, best effort). */
export function usePersistent<T>(key: string, fallback: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        /* quota / private mode */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [key, value]);
  return [value, setValue];
}
