import { describe, expect, it } from "vitest";
import { toEpisodes, computeMetrics, fmtDuration } from "../lib/metrics";

const SEC = 1000;

function samples(seq: [string, number][]): { t: number; state: any }[] {
  // seq of [state, durationSec] — emits samples covering [start, start+dur]
  let t = 0;
  const out: { t: number; state: any }[] = [];
  for (const [state, dur] of seq) {
    const steps = Math.max(1, Math.round((dur * SEC) / 100));
    for (let i = 0; i <= steps; i++) {
      out.push({ t, state });
      t += 100;
    }
    t -= 100; // next episode starts at the boundary timestamp
  }
  return out;
}

describe("toEpisodes", () => {
  it("collapses contiguous same-state samples into episodes", () => {
    const eps = toEpisodes(samples([["ON", 3], ["AWAY", 2], ["ON", 4]]));
    expect(eps).toHaveLength(3);
    expect(eps[0]).toEqual({ state: "ON", start: 0, durationMs: 3000 });
    expect(eps[1]).toEqual({
      state: "AWAY",
      start: 3000,
      durationMs: 2000,
    });
    expect(eps[2]).toEqual({ state: "ON", start: 5000, durationMs: 4000 });
  });

  it("returns empty for no samples", () => {
    expect(toEpisodes([])).toEqual([]);
  });

  it("ignores zero-duration states", () => {
    expect(toEpisodes([{ t: 100, state: "ON" }])).toEqual([]);
  });
});

describe("computeMetrics", () => {
  it("perfect session: all ON, one long episode (>=5min earns full streak credit)", () => {
    const eps = toEpisodes(samples([["ON", 330]]));
    const m = computeMetrics(eps, 60, 330 * SEC);
    expect(m.screenOnMs).toBe(330 * SEC);
    expect(m.attentionMs).toBe(330 * SEC);
    expect(m.attentionRatio).toBeCloseTo(1);
    expect(m.glanceCount).toBe(0);
    expect(m.focusScore).toBe(100);
  });

  it("glance (<2s ON) counts as screen-on but NOT attention", () => {
    // 10 glances of 1s + 10s away + 30s real reading = 50s screen-on, 30s attention
    const seq: [string, number][] = [];
    for (let i = 0; i < 10; i++) {
      seq.push(["ON", 1]);
      seq.push(["AWAY", 1]);
    }
    seq.push(["ON", 30]);
    const eps = toEpisodes(samples(seq));
    const m = computeMetrics(eps, 5, 50 * SEC);
    expect(m.glanceCount).toBe(10);
    expect(m.screenOnMs).toBe(50 * SEC);
    expect(m.attentionMs).toBe(30 * SEC);
    // phone inflation = 10 glance seconds + 10 away seconds
    expect(m.screenOnMs - m.attentionMs).toBe(20 * SEC);
  });

  it("eyes-closed and away count as screen-on (phone would claim), not attention", () => {
    const eps = toEpisodes(
      samples([["ON", 10], ["EYES_CLOSED", 5], ["AWAY", 5], ["NO_FACE", 10]])
    );
    const m = computeMetrics(eps, 3, 30 * SEC);
    expect(m.screenOnMs).toBe(20 * SEC); // ON + closed + away
    expect(m.attentionMs).toBe(10 * SEC);
    expect(m.attentionRatio).toBeCloseTo(0.5);
  });

  it("NO_FACE is excluded from screen-on (conservative)", () => {
    const eps = toEpisodes(samples([["ON", 10], ["NO_FACE", 30]]));
    const m = computeMetrics(eps, 0, 40 * SEC);
    expect(m.screenOnMs).toBe(10 * SEC);
    expect(m.attentionRatio).toBeCloseTo(1);
  });

  it("distraction = non-ON episode >= 2s (excluding NO_FACE)", () => {
    const eps = toEpisodes(
      samples([["ON", 5], ["AWAY", 3], ["ON", 5], ["EYES_CLOSED", 2], ["ON", 5]])
    );
    const m = computeMetrics(eps, 2, 20 * SEC);
    expect(m.distractionCount).toBe(2);
  });

  it("focusScore between 0 and 100; chaotic session scores lower than focused one", () => {
    const chaoticSeq: [string, number][] = [];
    for (let i = 0; i < 20; i++) {
      chaoticSeq.push(["ON", 3]);
      chaoticSeq.push(["AWAY", 3]);
    }
    const chaotic = computeMetrics(
      toEpisodes(samples(chaoticSeq)), 10, 120 * SEC
    );
    const focused = computeMetrics(
      toEpisodes(samples([["ON", 330]])), 20, 330 * SEC
    );
    expect(chaotic.focusScore).toBeGreaterThan(0);
    expect(chaotic.focusScore).toBeLessThan(focused.focusScore);
    expect(focused.focusScore).toBe(100);
  });

  it("longest streak tracked correctly", () => {
    const eps = toEpisodes(
      samples([["ON", 5], ["AWAY", 1], ["ON", 12], ["AWAY", 1], ["ON", 3]])
    );
    const m = computeMetrics(eps, 0, 22 * SEC);
    expect(m.longestAttentionStreakMs).toBe(12 * SEC);
  });
});

describe("fmtDuration", () => {
  it("formats m:ss", () => {
    expect(fmtDuration(0)).toBe("0:00");
    expect(fmtDuration(59_999)).toBe("0:59");
    expect(fmtDuration(60_000)).toBe("1:00");
    expect(fmtDuration(167_000)).toBe("2:47");
  });
});
