/**
 * Shapes of the data the Kotlin services will emit (Phase 2+).
 * UI reads only these types, so screens don't change when real services plug in.
 */
import type { FeatureKey } from '@attune/design-tokens';

export type PermissionKey =
  | 'notificationAccess'
  | 'postNotifications'
  | 'dndPolicy'
  | 'usageAccess'
  | 'activityRecognition'
  | 'calendar'
  | 'location'
  | 'camera'
  | 'microphone'
  | 'batteryExemption'
  | 'keyboardEnabled';

export type PermissionStatus = 'granted' | 'denied' | 'unknown';

/** Which quality tier a feature is running in, given the permissions it has (PLAN.md §6). */
export type FeatureMode = 'full' | 'reduced' | 'minimal' | 'off';

export interface FeatureStatus {
  key: FeatureKey;
  enabled: boolean;
  mode: FeatureMode;
  /** Short live line for the Today tile, e.g. "3 held back · 1 priority". */
  headline: string;
  missing: PermissionKey[];
}

// ── Context Engine (Idea 3 backbone) ──────────────────────────────────────────
export type Place = 'home' | 'college' | 'library' | 'work' | 'transit' | 'outside' | 'unknown';
export type Activity = 'still' | 'walking' | 'running' | 'vehicle' | 'cycling' | 'unknown';

export interface ContextSnapshot {
  at: number;
  place: Place;
  activity: Activity;
  /** Current calendar event title if inside one. */
  event: string | null;
  appCategory: string | null;
  noiseDb: number | null;
  environment: NoiseEnvironment | null;
  /** 0 = do not interrupt, 100 = fully available. */
  interruptibility: number;
  reasons: string[];
}

// ── 1 · Priority Inbox ────────────────────────────────────────────────────────
export type SenderTier = 'family' | 'close' | 'class' | 'work' | 'unknown';

export interface RankedNotification {
  id: string;
  app: string;
  appPackage: string;
  sender: string;
  conversation: string | null;
  text: string;
  postedAt: number;
  score: number; // 0..1
  tier: SenderTier;
  urgency: number; // 0..1 from NLP
  verdict: 'priority' | 'digest' | 'original';
  reasons: string[];
}

// ── 2 · Keyboard ──────────────────────────────────────────────────────────────
export interface KeyboardStats {
  wordsLearned: number;
  correctionsAvoided: number;
  keystrokesSaved: number;
  languageMix: { english: number; hinglish: number; other: number };
  federated: { joined: boolean; rounds: number; modelVersion: string | null; lastSync: number | null; epsilon: number | null };
}

// ── 3 · Smart Focus ───────────────────────────────────────────────────────────
export interface FocusEvent {
  id: string;
  at: number;
  action: 'dnd_on' | 'dnd_off' | 'let_through' | 'held';
  reason: string;
}

// ── 4 · True Screen Time ──────────────────────────────────────────────────────
export interface AppAttention {
  appPackage: string;
  app: string;
  screenOnMin: number;
  attendedMin: number;
  glanceMin: number;
  passiveMin: number;
}

export type AttentionSource = 'camera' | 'hybrid' | 'sensors' | 'usage';

export interface AttentionDay {
  date: string; // YYYY-MM-DD
  screenOnMin: number;
  attendedMin: number;
  glances: number;
  source: AttentionSource;
  apps: AppAttention[];
  /** 24 buckets, attended minutes per hour. */
  hourly: number[];
}

// ── 5 · Ambient Volume ────────────────────────────────────────────────────────
export type NoiseEnvironment = 'quiet' | 'conversation' | 'street' | 'transit' | 'music' | 'unknown';

export interface VolumeSample {
  at: number;
  db: number;
  environment: NoiseEnvironment;
  ringVolume: number; // 0..1
}
