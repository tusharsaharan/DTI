import type { FeatureKey } from '@attune/design-tokens';
import { getAttuneNative } from '../../modules/attune-native';
import { setState } from './store';

/** Keep platform actions in one place so screens never silently pretend a local toggle changed Android. */
export async function syncNativeFeature(feature: FeatureKey, enabled: boolean): Promise<boolean> {
  const native = getAttuneNative();
  if (!native) return false;

  if (feature === 'attention') {
    return enabled ? native.startService('attention') : native.stopService('attention');
  }
  if (feature === 'volume') {
    return enabled ? native.startService('ambient') : native.stopService('ambient');
  }
  if (feature === 'notify') {
    // Android controls listener access in Settings. This native gate lets the user turn Attune's
    // adaptation off without revoking the system-level listener permission.
    const configured = await native.setNotificationAdaptationEnabled(enabled);
    if (!enabled) return configured;
    const started = configured && (await native.startService('notification'));
    if (!started) await native.setNotificationAdaptationEnabled(false);
    return started;
  }
  if (feature === 'focus') {
    if (enabled) {
      const context = await native.getInterruptibility();
      if (context.shouldSuppress === true) {
        const result = await native.applyDnd(true, true, true);
        return result.applied === true;
      }
      return true;
    }
    const result = await native.applyDnd(false, true, true);
    return result.applied === true || result.reason === 'not_active_no_snapshot';
  }
  // Keyboard selection is deliberately user-mediated through Android settings.
  return true;
}

export async function toggleFeature(feature: FeatureKey, enabled: boolean): Promise<boolean> {
  let nativeReady = false;
  try {
    nativeReady = await syncNativeFeature(feature, enabled);
  } catch {
    nativeReady = false;
  }
  if (!nativeReady) return false;
  setState((state) => ({
    features: {
      ...state.features,
      [feature]: { ...state.features[feature], enabled, mode: enabled ? state.features[feature].mode : 'off' },
    },
  }));
  return nativeReady;
}
