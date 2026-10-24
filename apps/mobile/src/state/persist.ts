import Storage from 'expo-sqlite/kv-store';
import { featureOrder, type FeatureKey } from '@attune/design-tokens';
import { getState, setState, subscribe, initialState } from './store';
import { getAttuneNative } from '../../modules/attune-native';

const KEY = 'attune.settings.v1';

interface Saved {
  onboarded: boolean;
  enabled: Partial<Record<FeatureKey, boolean>>;
}

let started = false;
let suppressPersist = false;

function snapshot(): Saved {
  const s = getState();
  return {
    onboarded: s.onboarded,
    enabled: Object.fromEntries(featureOrder.map((k) => [k, s.features[k].enabled])),
  };
}

/** Load persisted settings once, then keep saving changes. Safe to call repeatedly. */
export async function hydrate(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const raw = await Storage.getItemAsync(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Saved;
      setState((s) => ({
        onboarded: !!saved.onboarded,
        features: Object.fromEntries(
          featureOrder.map((k) => [k, { ...s.features[k], enabled: saved.enabled?.[k] ?? s.features[k].enabled }]),
        ) as typeof s.features,
      }));
    }
  } catch {
    // Corrupt or unavailable storage: continue with defaults.
  }
  setState({ hydrated: true });
  let last = JSON.stringify(snapshot());
  subscribe(() => {
    if (suppressPersist) return;
    const next = JSON.stringify(snapshot());
    if (next === last) return;
    last = next;
    Storage.setItemAsync(KEY, next).catch(() => {});
  });
}

export function completeOnboarding() {
  setState({ onboarded: true });
}

/** Forget everything stored on this device and reset settings. */
export async function wipeAll() {
  const native = getAttuneNative();
  if (native) {
    await Promise.allSettled([
      native.clearHistory('all'),
      native.clearKeyboardLearning(),
      native.clearAmbientConfig(),
      native.stopService('attention'),
      native.stopService('ambient'),
      native.applyDnd(false, true, true),
      native.setNotificationAdaptationEnabled(false),
    ]);
  }
  try {
    await Storage.removeItemAsync(KEY);
  } catch {}
  suppressPersist = true;
  try {
    setState({ ...initialState, hydrated: true });
  } finally {
    suppressPersist = false;
  }
}
