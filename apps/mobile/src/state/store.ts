import { useSyncExternalStore } from 'react';
import type { FeatureKey } from '@attune/design-tokens';
import type {
  AttentionDay,
  ContextSnapshot,
  FeatureStatus,
  FocusEvent,
  KeyboardStats,
  PermissionKey,
  PermissionStatus,
  RankedNotification,
  VolumeSample,
} from './types';

/**
 * App state. Starts empty: real values arrive from the native services (Phase 2+).
 * Screens must render a designed empty/"not connected" state for every slice.
 */
export interface AttuneState {
  /** True once persisted settings have been loaded. */
  hydrated: boolean;
  onboarded: boolean;
  permissions: Record<PermissionKey, PermissionStatus>;
  features: Record<FeatureKey, FeatureStatus>;
  context: ContextSnapshot | null;
  notifications: RankedNotification[];
  keyboard: KeyboardStats | null;
  focusLog: FocusEvent[];
  dndActive: boolean;
  attention: AttentionDay[];
  volume: VolumeSample[];
}

const allPermissions: PermissionKey[] = [
  'notificationAccess',
  'postNotifications',
  'dndPolicy',
  'usageAccess',
  'activityRecognition',
  'calendar',
  'location',
  'camera',
  'microphone',
  'batteryExemption',
  'keyboardEnabled',
];

const feature = (key: FeatureKey): FeatureStatus => ({
  key,
  enabled: false,
  mode: 'off',
  headline: 'Not set up yet',
  missing: [],
});

export const initialState: AttuneState = {
  hydrated: false,
  onboarded: false,
  permissions: Object.fromEntries(allPermissions.map((p) => [p, 'unknown'])) as AttuneState['permissions'],
  features: {
    notify: feature('notify'),
    keyboard: feature('keyboard'),
    focus: feature('focus'),
    attention: feature('attention'),
    volume: feature('volume'),
  },
  context: null,
  notifications: [],
  keyboard: null,
  focusLog: [],
  dndActive: false,
  attention: [],
  volume: [],
};

let state: AttuneState = initialState;
const listeners = new Set<() => void>();

export function getState(): AttuneState {
  return state;
}

export function setState(patch: Partial<AttuneState> | ((s: AttuneState) => Partial<AttuneState>)) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Select a slice; re-renders only when the selected value changes by reference. */
export function useAttune<T>(selector: (s: AttuneState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(initialState));
}
