import { useEffect, useRef } from 'react';

/**
 * The visible panel registers its main action (copy / export) so keyboard
 * shortcuts and VS Code commands can trigger it without knowing the panel.
 */
let primary: (() => void | Promise<void>) | null = null;

export function usePrimaryAction(fn: () => void | Promise<void>) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const call = () => ref.current();
    primary = call;
    return () => {
      if (primary === call) primary = null;
    };
  }, []);
}

export async function runPrimaryAction(): Promise<boolean> {
  if (!primary) return false;
  await primary();
  return true;
}
