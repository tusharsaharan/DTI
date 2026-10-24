import type { NoiseEnvironment, PermissionStatus, SenderTier } from './types';

export function normalizeNativeScore(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value / 100)) : 0;
}

export function normalizeNativeUrgency(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value / 50)) : 0;
}

export function normalizeRingVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function normalizeSenderTier(value: unknown): SenderTier {
  const normalized = String(value ?? 'unknown').toLowerCase();
  return ['family', 'close', 'class', 'work', 'unknown'].includes(normalized) ? (normalized as SenderTier) : 'unknown';
}

export function normalizeEnvironment(value: unknown): NoiseEnvironment {
  const normalized = String(value ?? 'unknown').toLowerCase();
  return ['quiet', 'conversation', 'street', 'transit', 'music'].includes(normalized)
    ? (normalized as NoiseEnvironment)
    : 'unknown';
}

export function permissionStatusFromNative(value: unknown): PermissionStatus | undefined {
  if (typeof value !== 'boolean') return undefined;
  return value ? 'granted' : 'denied';
}

export function notificationVerdict(score: number, adaptation: unknown): 'priority' | 'digest' | 'original' {
  if (adaptation === 'CANCEL_TO_DIGEST') return 'digest';
  if (adaptation === 'KEEP_ORIGINAL') return 'original';
  return score >= 0.6 ? 'priority' : 'digest';
}
