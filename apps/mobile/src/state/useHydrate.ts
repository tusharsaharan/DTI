import { useEffect } from 'react';
import { hydrate } from './persist';
import { useAttune } from './store';
import { startNativeHydration } from './nativeHydration';

/** Loads persisted settings once; returns true when ready. */
export function useHydrate(): boolean {
  const hydrated = useAttune((s) => s.hydrated);

  useEffect(() => {
    hydrate();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    return startNativeHydration();
  }, [hydrated]);

  return hydrated;
}
