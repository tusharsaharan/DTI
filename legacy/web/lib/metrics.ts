import {
  AttentionEpisode,
  AttentionState,
  BLINK_MS,
  DISTRACTION_MS,
  FOCUS_WEIGHTS,
  GLANCE_MS,
  SessionMetrics,
} from "./types";

/**
 * Collapse a stream of state samples into contiguous episodes.
 * Samples must be ordered by time. Zero-duration states are ignored.
 */
export function toEpisodes(
  samples: { t: number; state: AttentionState }[]
): AttentionEpisode[] {
  const episodes: AttentionEpisode[] = [];
  if (samples.length === 0) return episodes;

  let current: { state: AttentionState; start: number; end: number } = {
    state: samples[0].state,
    start: samples[0].t,
    end: samples[0].t,
  };

  for (let i = 1; i < samples.length; i++) {
    const s = samples[i];
    if (s.state === current.state) {
      current.end = s.t;
    } else {
      if (current.end > current.start) {
        episodes.push({
          state: current.state,
          start: current.start,
          durationMs: current.end - current.start,
        });
      }
      current = { state: s.state, start: s.t, end: s.t };
    }
  }
  if (current.end > current.start) {
    episodes.push({
      state: current.state,
      start: current.start,
      durationMs: current.end - current.start,
    });
  }
  return episodes;
}

/**
 * Final metrics from episodes + blinks.
 *
 * - screenOnMs: everything except NO_FACE — this is what a phone
 *   screen-time report would have counted (page open, screen on).
 *   (NO_FACE with page open still lies even harder on phones, but we
 *   are conservative and only count moments where the user plausibly
 *   could see the screen.)
 * - attentionMs: ON-time minus glance time — real, sustained attention.
 * - glanceMs: ON-episodes < GLANCE_MS (still counted by screen-time reports).
 */
export function computeMetrics(
  episodes: AttentionEpisode[],
  blinkCount: number,
  endT: number
): SessionMetrics {
  const totalMs = Math.max(0, endT);
  const stateMs = (state: AttentionState) =>
    episodes
      .filter((e) => e.state === state)
      .reduce((sum, e) => sum + e.durationMs, 0);

  const onEpisodes = episodes.filter((e) => e.state === "ON");
  const glanceEpisodes = onEpisodes.filter((e) => e.durationMs < GLANCE_MS);
  const attentionEpisodes = onEpisodes.filter(
    (e) => e.durationMs >= GLANCE_MS
  );

  const onMs = stateMs("ON");
  const awayMs = stateMs("AWAY");
  const closedMs = stateMs("EYES_CLOSED");
  const noFaceMs = stateMs("NO_FACE");

  const screenOnMs = onMs + awayMs + closedMs;
  const attentionMs = attentionEpisodes.reduce((s, e) => s + e.durationMs, 0);
  const glanceMs = glanceEpisodes.reduce((s, e) => s + e.durationMs, 0);

  const attentionRatio = screenOnMs > 0 ? attentionMs / screenOnMs : 0;

  const longestAttentionStreakMs = attentionEpisodes.reduce(
    (max, e) => Math.max(max, e.durationMs),
    0
  );

  // Anti-glance component: 1.0 when no glances, decays as glances pile up.
  // 12+ glances in ~5 min floors it near zero.
  const minutes = Math.max(totalMs / 60000, 0.25);
  const glancesPerMinute = glanceEpisodes.length / minutes;
  const antiGlance = Math.max(0, 1 - glancesPerMinute / 6);

  // Streak component: 5+ uninterrupted minutes of attention = full credit.
  const streakComponent = Math.min(
    1,
    longestAttentionStreakMs / (5 * 60 * 1000)
  );

  const focusScore = Math.round(
    100 *
      (FOCUS_WEIGHTS.attentionRatio * attentionRatio +
        FOCUS_WEIGHTS.streak * streakComponent +
        FOCUS_WEIGHTS.antiGlance * antiGlance)
  );

  const distractionCount = episodes.filter(
    (e) =>
      e.state !== "ON" &&
      e.state !== "NO_FACE" &&
      e.durationMs >= DISTRACTION_MS
  ).length;

  return {
    totalMs,
    screenOnMs,
    attentionMs,
    glanceMs,
    attentionRatio,
    focusScore,
    longestAttentionStreakMs,
    blinkCount,
    glanceCount: glanceEpisodes.length,
    distractionCount,
    episodes,
  };
}

export function fmtDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
