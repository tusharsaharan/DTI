export type AttentionState = "ON" | "AWAY" | "EYES_CLOSED" | "NO_FACE";

export const ATTENTION_STATES: AttentionState[] = [
  "ON",
  "AWAY",
  "EYES_CLOSED",
  "NO_FACE",
];

export const STATE_META: Record<
  AttentionState,
  { label: string; color: string; description: string }
> = {
  ON: {
    label: "Attentive",
    color: "#34d399",
    description: "Eyes open, gaze on screen",
  },
  AWAY: {
    label: "Looking away",
    color: "#fbbf24",
    description: "Eyes off screen (head turned too far, or gaze elsewhere)",
  },
  EYES_CLOSED: {
    label: "Eyes closed",
    color: "#a78bfa",
    description: "Eyes shut for an extended moment",
  },
  NO_FACE: {
    label: "Not present",
    color: "#f87171",
    description: "No face detected in front of the screen",
  },
};

export interface FrameSample {
  /** Monotonic ms timestamp of the sample */
  t: number;
  state: AttentionState;
  /** Calibration quality signal: 0..1 confidence of the classifier */
  confidence: number;
}

export interface AttentionEpisode {
  state: AttentionState;
  /** Episode start (ms, session-relative) */
  start: number;
  /** Episode duration (ms) */
  durationMs: number;
}

export interface SessionMetrics {
  /** Total elapsed session time (ms) */
  totalMs: number;
  /** Time a screen-time report would count: any moment with the page open & tab focused (ms) */
  screenOnMs: number;
  /** Time genuinely attended: ON-state time, excluding short glances (ms) */
  attentionMs: number;
  /** ON-time belonging to glances (< GLANCE_MS) — counted by phone reports, not by us (ms) */
  glanceMs: number;
  attentionRatio: number;
  focusScore: number;
  longestAttentionStreakMs: number;
  blinkCount: number;
  glanceCount: number;
  distractionCount: number;
  episodes: AttentionEpisode[];
}

/** An ON-episode shorter than this is a "glance" (e.g. checking the clock) */
export const GLANCE_MS = 2000;
/** A non-ON episode at least this long is a "distraction" */
export const DISTRACTION_MS = 2000;
/** Eye-closure shorter than this is a blink, not "eyes closed" */
export const BLINK_MS = 250;

/** Focus score weights (tunable constants) */
export const FOCUS_WEIGHTS = {
  attentionRatio: 0.6,
  streak: 0.2,
  antiGlance: 0.2,
} as const;
