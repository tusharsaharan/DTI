import { NativeModule, requireNativeModule } from 'expo-modules-core';

export type AttuneNativeStatus = Record<string, unknown>;

export type NotificationRankedEvent = {
  id: string;
  packageName: string;
  postedAtMs: number;
  score: number;
  baseScore: number;
  senderTier: string;
  urgencyScore: number;
  reasonCodes: string[];
  feedback: string;
  sender?: string | null;
  conversation?: string | null;
  text?: string | null;
  adaptation?: string;
  adaptationReason?: string;
  hasOpenOriginalFallback?: boolean;
};

export type AmbientSampleEvent = {
  atMs?: number;
  db: number;
  applied: boolean;
  targetVolume: number;
  reason: string;
  ringVolume?: number | null;
  environment?: string | null;
  source?: string | null;
  confidence?: number | null;
};

export type NativeHistoryRecord = Record<string, unknown>;

type AttuneNativeEvents = {
  onNotificationRanked(event: NotificationRankedEvent): void;
  onAmbientSample(event: AmbientSampleEvent): void;
  onAttentionFrame(event: { timestampMs: number }): void;
  onNativeStatusChanged(event: AttuneNativeStatus): void;
};

export declare class AttuneNativeModule extends NativeModule<AttuneNativeEvents> {
  getStatusSnapshot(): Promise<AttuneNativeStatus>;
  checkPermission(permission: string): Promise<boolean>;
  openSettings(setting: string): Promise<boolean>;
  getNotificationRecords(limit?: number): Promise<NotificationRankedEvent[]>;
  clearNotificationRecords(): Promise<boolean>;
  deleteNotificationRecord(id: string): Promise<boolean>;
  setNotificationAdaptationEnabled(enabled: boolean): Promise<boolean>;
  submitNotificationFeedback(id: string, feedback: string): Promise<boolean>;
  clearKeyboardLearning(): Promise<boolean>;
  getKeyboardSuggestions(prefix: string, limit?: number): Promise<Array<{ token: string; count: number }>>;
  getAmbientHistory(limit?: number): Promise<NativeHistoryRecord[]>;
  getAmbientConfig(): Promise<Record<string, unknown>>;
  setAmbientConfig(minVolumeFraction: number, maxVolumeFraction: number, leaveHeadphonesAlone: boolean): Promise<boolean>;
  clearAmbientConfig(): Promise<boolean>;
  getHistory(kind?: string, limit?: number): Promise<Record<string, unknown>>;
  clearAmbientHistory(): Promise<boolean>;
  clearHistory(kind?: string): Promise<boolean>;
  getInterruptibility(): Promise<Record<string, unknown>>;
  applyDnd(enabled: boolean, allowPrioritySenders?: boolean, allowRepeatCallers?: boolean): Promise<Record<string, unknown>>;
  startService(service: string): Promise<boolean>;
  stopService(service: string): Promise<boolean>;
}

let cachedModule: AttuneNativeModule | null | undefined;

/**
 * Native-only lookup. The UI can still render honest empty/unknown states in Expo Go,
 * web builds, and unsupported platforms instead of crashing during module evaluation.
 */
export function getAttuneNative(): AttuneNativeModule | null {
  if (cachedModule !== undefined) return cachedModule;
  try {
    cachedModule = requireNativeModule<AttuneNativeModule>('AttuneNative');
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}
