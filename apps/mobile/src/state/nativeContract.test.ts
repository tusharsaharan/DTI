import { describe, expect, it } from 'vitest';
import {
  normalizeEnvironment,
  normalizeNativeScore,
  normalizeNativeUrgency,
  normalizeRingVolume,
  normalizeSenderTier,
  notificationVerdict,
  permissionStatusFromNative,
} from './nativeContract';

describe('native contract normalization', () => {
  it('converts native 0..100 score and 0..50 urgency into UI fractions', () => {
    expect(normalizeNativeScore(75)).toBe(0.75);
    expect(normalizeNativeUrgency(25)).toBe(0.5);
    expect(normalizeNativeScore(500)).toBe(1);
    expect(normalizeNativeUrgency(-5)).toBe(0);
  });

  it('rejects malformed or out-of-range volume values', () => {
    expect(normalizeRingVolume(0.6)).toBe(0.6);
    expect(normalizeRingVolume(2)).toBe(1);
    expect(normalizeRingVolume('loud')).toBe(0);
  });

  it('keeps unknown native enum values honest', () => {
    expect(normalizeSenderTier('FAMILY')).toBe('family');
    expect(normalizeSenderTier('new_platform_tier')).toBe('unknown');
    expect(normalizeEnvironment('street')).toBe('street');
    expect(normalizeEnvironment(null)).toBe('unknown');
  });

  it('does not turn unavailable permission truth into denied', () => {
    expect(permissionStatusFromNative(true)).toBe('granted');
    expect(permissionStatusFromNative(false)).toBe('denied');
    expect(permissionStatusFromNative(undefined)).toBeUndefined();
  });

  it('maps native adaptation to the user-facing inbox verdict', () => {
    expect(notificationVerdict(0.9, 'CANCEL_TO_DIGEST')).toBe('digest');
    expect(notificationVerdict(0.9, 'REPOST_ATTUNE')).toBe('priority');
    expect(notificationVerdict(0.5, 'KEEP_ORIGINAL')).toBe('original');
  });
});
