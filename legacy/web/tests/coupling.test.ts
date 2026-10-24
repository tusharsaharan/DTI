import { describe, expect, it } from "vitest";
import {
  fitAxis,
  pearson,
  resolveCoupling,
  DEFAULT_COUPLING,
  DEFAULT_GATES,
  SweepSample,
} from "../lib/coupling";
import {
  classifyFrame,
  DEFAULT_BASELINE,
  DEFAULT_THRESHOLDS,
} from "../lib/classifier";

const base = {
  facePresent: true,
  eyeOpenness: 0.9,
  yawRatio: 0,
  pitchRatio: 0.44,
  gazeX: 0,
  gazeY: 0,
  gazeSource: "blendshape" as const,
};

/** Default thresholds: blendshape coupling (−1.7, +0.9), caps 0.5/0.45 */
const th = DEFAULT_THRESHOLDS;

// ------------------------------------------------------------------
// fitAxis (OLS with gates)
// ------------------------------------------------------------------

describe("fitAxis", () => {
  const gates = { ...DEFAULT_GATES, minSamples: 10 };

  function makeSweep(
    n: number,
    slope: number,
    noise = 0.01
  ): [number, number][] {
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const head = -0.15 + (0.3 * i) / (n - 1); // sweep −0.15..+0.15
      const eye = slope * head + (Math.random() - 0.5) * noise;
      pairs.push([head, eye]);
    }
    return pairs;
  }

  it("recovers a clean compensation slope", () => {
    const fit = fitAxis(makeSweep(60, -1.7, 0), gates);
    expect(fit).not.toBeNull();
    expect(fit!.slope).toBeCloseTo(-1.7, 1);
    expect(fit!.r2).toBeGreaterThan(0.95);
  });

  it("recovers a positive slope (inverted blendshape Y convention)", () => {
    const fit = fitAxis(makeSweep(60, 0.9, 0), gates);
    expect(fit!.slope).toBeCloseTo(0.9, 1);
  });

  it("rejects too few samples", () => {
    expect(fitAxis(makeSweep(5, -1.7), gates)).toBeNull();
  });

  it("rejects a still head (no variance to learn from)", () => {
    const flat: [number, number][] = Array.from({ length: 60 }, () => [
      0.001,
      -0.001,
    ]);
    expect(fitAxis(flat, gates)).toBeNull();
  });

  it("rejects uncorrelated data", () => {
    const junk: [number, number][] = Array.from({ length: 60 }, () => [
      Math.random() * 0.2 - 0.1,
      Math.random() * 0.2 - 0.1,
    ]);
    expect(fitAxis(junk, gates)).toBeNull();
  });

  it("rejects slopes outside the physical clamp", () => {
    expect(fitAxis(makeSweep(60, 10), gates)).toBeNull();
  });

  it("rejects near-zero slope (eyes following head, no compensation)", () => {
    expect(fitAxis(makeSweep(60, 0.05), gates)).toBeNull();
  });
});

// ------------------------------------------------------------------
// pearson
// ------------------------------------------------------------------

describe("pearson", () => {
  it("identifies positively correlated channels", () => {
    const xs = Array.from({ length: 40 }, (_, i) => Math.sin(i / 5));
    const ys = xs.map((x) => 2 * x + 0.01);
    expect(pearson(xs, ys)!).toBeGreaterThan(0.95);
  });

  it("identifies negatively correlated channels", () => {
    const xs = Array.from({ length: 40 }, (_, i) => Math.sin(i / 5));
    const ys = xs.map((x) => -2 * x + 0.01);
    expect(pearson(xs, ys)!).toBeLessThan(-0.95);
  });

  it("returns null on constant series", () => {
    expect(pearson(new Array(40).fill(0.1), new Array(40).fill(0.2))).toBeNull();
  });

  it("returns null when too short", () => {
    const xs = [1, 2, 3];
    expect(pearson(xs, xs)).toBeNull();
  });
});

// ------------------------------------------------------------------
// resolveCoupling
// ------------------------------------------------------------------

describe("resolveCoupling", () => {
  const gates = { ...DEFAULT_GATES, minSamples: 20, minHeadStd: 0.01 };

  function sweep(
    n: number,
    bsX: number,
    bsY: number,
    geoX: number,
    geoY: number,
    noise = 0.01
  ): { bsSweep: SweepSample[]; geoSweep: SweepSample[] } {
    const bsSweep: SweepSample[] = [];
    const geoSweep: SweepSample[] = [];
    for (let i = 0; i < n; i++) {
      const headX = -0.15 + (0.3 * i) / (n - 1);
      const headY = -0.1 + (0.2 * i) / (n - 1);
      const j = () => (Math.random() - 0.5) * noise;
      bsSweep.push({
        headX,
        headY,
        eyeX: bsX * headX + j(),
        eyeY: bsY * headY + j(),
      });
      geoSweep.push({
        headX,
        headY,
        eyeX: geoX * headX + j(),
        eyeY: geoY * headY + j(),
      });
    }
    return { bsSweep, geoSweep };
  }

  function crossChannels(
    n: number,
    sign: number,
    noise = 0.01
  ) {
    const bsGazeX: number[] = [];
    const geoGazeX: number[] = [];
    const bsGazeY: number[] = [];
    const geoGazeY: number[] = [];
    for (let i = 0; i < n; i++) {
      const g = Math.sin(i / 4);
      bsGazeX.push(g + (Math.random() - 0.5) * noise);
      geoGazeX.push(sign * g + (Math.random() - 0.5) * noise);
      // Y channels are structurally opposite (up-positive vs y-down)
      bsGazeY.push(g + (Math.random() - 0.5) * noise);
      geoGazeY.push(-g + (Math.random() - 0.5) * noise);
    }
    return { bsGazeX, geoGazeX, bsGazeY, geoGazeY };
  }

  it("learns both channels' slopes from a good sweep", () => {
    const { bsSweep, geoSweep } = sweep(80, -1.7, 0.9, -3.0, -1.6, 0);
    const cross = crossChannels(80, 1);
    const r = resolveCoupling({
      bsSweep,
      geoSweep,
      ...cross,
      gates,
    });
    expect(r.bs.x.value).toBeCloseTo(-1.7, 1);
    expect(r.bs.y.value).toBeCloseTo(0.9, 1);
    expect(r.geo.x.value).toBeCloseTo(-3.0, 1);
    expect(r.geo.y.value).toBeCloseTo(-1.6, 1);
    expect(r.bs.x.learned).toBe(true);
    expect(r.geo.x.learned).toBe(true);
  });

  it("falls back to defaults when there is no sweep data", () => {
    const cross = crossChannels(40, 1);
    const r = resolveCoupling({
      bsSweep: [],
      geoSweep: [],
      ...cross,
      gates,
    });
    expect(r.bs.x.value).toBeCloseTo(DEFAULT_COUPLING.blendshape.x);
    expect(r.bs.y.value).toBeCloseTo(DEFAULT_COUPLING.blendshape.y);
    expect(r.bs.x.learned).toBe(false);
  });

  it("corrects blendshape X sign when the cross-check shows inversion", () => {
    // Blendshape X channel inverted vs geometry: sweep slope would
    // come out positive; cross-correlation is strongly negative.
    const { bsSweep, geoSweep } = sweep(80, 1.7, 0.9, -3.0, -1.6, 0);
    const cross = crossChannels(80, -1);
    const r = resolveCoupling({ bsSweep, geoSweep, ...cross, gates });
    // Measured positive blendshape slope with inverted channel =
    // genuine compensation in the user's frame — accepted.
    expect(r.bs.x.value).toBeCloseTo(1.7, 1);
    expect(r.bs.x.learned).toBe(true);
  });

  it("rejects eyes-follow-head geometry slope, keeps defaults", () => {
    // Geometry slope positive = bad sweep (eyes turned with head)
    const { bsSweep, geoSweep } = sweep(80, -1.7, 0.9, 2.5, 1.5, 0);
    const cross = crossChannels(80, 1);
    const r = resolveCoupling({ bsSweep, geoSweep, ...cross, gates });
    expect(r.geo.x.value).toBeCloseTo(DEFAULT_COUPLING.geometry.x);
    expect(r.geo.x.learned).toBe(false);
  });

  it("derives blendshape coupling from geometry when blendshape sweep is missing", () => {
    const { bsSweep, geoSweep } = sweep(80, -1.7, 0.9, -3.0, -1.6, 0);
    const cross = crossChannels(80, 1);
    const r = resolveCoupling({
      bsSweep: [], // no blendshape sweep frames
      geoSweep,
      ...cross,
      gates,
    });
    // geo −3.0 scaled by |bs/geo default ratio| with positive rel sign
    // (channels positively correlated on X)
    expect(r.bs.x.learned).toBe(true);
    expect(Math.abs(r.bs.x.value)).toBeGreaterThan(0.5);
    expect(r.bs.x.value).toBeLessThan(0); // same sign as geometry
  });
});

// ------------------------------------------------------------------
// classifyFrame — eyeball-first behavior (THE bug report)
// ------------------------------------------------------------------

describe("classifyFrame — eye–head compensation (eyeball-first)", () => {
  it("head turned away + eyes compensating to screen → ON (the bug report)", () => {
    // Head yaw dev +0.30 (way past the old 0.22 yaw threshold, well
    // under the 0.5 hard cap). Eyes counter-rotate opposite the head
    // at the learned slope: eyeDev = −1.7·0.30 = −0.51 in blendshape
    // units — exactly what the channel emits when the eyeballs fight
    // back to the screen. Combined = −0.51 − (−1.7·0.30) = 0.
    const r = classifyFrame(
      { ...base, yawRatio: 0.3, gazeX: -0.51 },
      DEFAULT_BASELINE,
      th
    );
    expect(r.state).toBe("ON");
    // And the mirror direction
    const r2 = classifyFrame(
      { ...base, yawRatio: -0.3, gazeX: 0.51 },
      DEFAULT_BASELINE,
      th
    );
    expect(r2.state).toBe("ON");
  });

  it("head pitched + eyes compensating → ON", () => {
    // Pitch dev +0.3. The blendshape Y channel is UP-positive, so
    // compensating eyes read POSITIVE with slope +0.9:
    // eyeDev = +0.9·0.3 = +0.27; combined = 0.27 − 0.9·0.3 = 0.
    const r = classifyFrame(
      { ...base, pitchRatio: 0.74, gazeY: 0.27 },
      DEFAULT_BASELINE,
      th
    );
    expect(r.state).toBe("ON");
  });

  it("head still + eyes off screen → AWAY (unchanged core case)", () => {
    expect(classifyFrame({ ...base, gazeX: 0.95 }, DEFAULT_BASELINE, th).state).toBe("AWAY");
    expect(classifyFrame({ ...base, gazeY: -0.95 }, DEFAULT_BASELINE, th).state).toBe("AWAY");
  });

  it("head AND eyes turning the same direction → AWAY, reinforced", () => {
    // Head yaw +0.3, eyes also drift +0.2 (not compensating): combined
    // = 0.2 + 1.7·0.3 = 0.71 — fires much harder than eye-only.
    const r = classifyFrame(
      { ...base, yawRatio: 0.3, gazeX: 0.2 },
      DEFAULT_BASELINE,
      th
    );
    expect(r.state).toBe("AWAY");
    expect(r.firing).toBe("gaze");
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("head yaw beyond the hard cap → AWAY regardless of eye direction", () => {
    // Eyes "perfectly compensating" numerically (eyeDev = −1.7·0.8),
    // but the head is rotated past ~45°: physically impossible to
    // fixate the screen.
    const r = classifyFrame(
      { ...base, yawRatio: 0.8, gazeX: -1.36 },
      DEFAULT_BASELINE,
      th
    );
    expect(r.state).toBe("AWAY");
    expect(r.firing).toBe("yaw");
  });

  it("head pitch beyond the hard cap → AWAY regardless of eye direction", () => {
    // Pitch dev −0.7, compensating eyeDev = +0.9·(−0.7) = −0.63
    const r = classifyFrame(
      { ...base, pitchRatio: 0.44 - 0.7, gazeY: -0.63 },
      DEFAULT_BASELINE,
      th
    );
    expect(r.state).toBe("AWAY");
    expect(r.firing).toBe("pitch");
  });

  it("moderate head turn with NON-compensating eyes → AWAY via combined gaze", () => {
    // The old test's case: yawRatio 0.35 with eyes neutral. Old code
    // fired "yaw"; new code fires "gaze" (combined dev = 0.595) —
    // same AWAY verdict, more accurate diagnostic.
    const r = classifyFrame(
      { ...base, yawRatio: 0.35 },
      DEFAULT_BASELINE,
      th
    );
    expect(r.state).toBe("AWAY");
    expect(r.firing).toBe("gaze");
  });

  it("small natural jitter stays ON", () => {
    expect(
      classifyFrame(
        {
          ...base,
          yawRatio: DEFAULT_BASELINE.yawRatio + 0.05,
          pitchRatio: DEFAULT_BASELINE.pitchRatio + 0.05,
          gazeX: 0.15,
          gazeY: 0.12,
        },
        DEFAULT_BASELINE,
        th
      ).state
    ).toBe("ON");
  });

  it("diagonal combined glance fires via the elliptical boundary", () => {
    // Down-and-left at a phone: partial combined devs on both axes
    const r = classifyFrame(
      { ...base, gazeX: 0.28, gazeY: 0.22 },
      DEFAULT_BASELINE,
      th
    );
    expect(r.state).toBe("AWAY");
    expect(r.firing).toBe("gaze");
  });

  it("works against a PERSONAL baseline, not absolute zero", () => {
    const baseline = { ...DEFAULT_BASELINE, yawRatio: 0.2, gazeX: 0.1 };
    // At their neutral pose → ON
    expect(
      classifyFrame(
        { ...base, yawRatio: 0.2, gazeX: 0.1 },
        baseline,
        th
      ).state
    ).toBe("ON");
    // Compensated turn from THEIR neutral: head dev +0.3, eyes
    // counter-rotate by −1.7·0.3 from THEIR gaze baseline
    // (0.1 − 0.51 = −0.41) → ON
    expect(
      classifyFrame(
        { ...base, yawRatio: 0.5, gazeX: -0.41 },
        baseline,
        th
      ).state
    ).toBe("ON");
    // Beyond the hard cap from THEIR neutral → AWAY
    expect(
      classifyFrame(
        { ...base, yawRatio: 0.85 },
        baseline,
        th
      ).state
    ).toBe("AWAY");
  });

  it("learned coupling slope exactly cancels the user's compensation", () => {
    // User's true slope measured at −1.2 (smaller than default):
    // head dev +0.35, their eyes compensate to eyeDev = −1.2·0.35 =
    // −0.42 → combined = −0.42 + 1.2·0.35 = 0 → ON
    const learned = { ...th, couplingX: -1.2 };
    expect(
      classifyFrame(
        { ...base, yawRatio: 0.35, gazeX: -0.42 },
        DEFAULT_BASELINE,
        learned
      ).state
    ).toBe("ON");
    // Under-compensating eyes (eyeDev −0.1): with the LEARNED slope
    // combined = 0.32 (still inside the boundary) but with the
    // DEFAULT slope combined = 0.495 → AWAY. The sweep learning is
    // load-bearing in both directions.
    expect(
      classifyFrame(
        { ...base, yawRatio: 0.35, gazeX: -0.1 },
        DEFAULT_BASELINE,
        learned
      ).state
    ).toBe("ON");
    expect(
      classifyFrame(
        { ...base, yawRatio: 0.35, gazeX: -0.1 },
        DEFAULT_BASELINE,
        th
      ).state
    ).toBe("AWAY");
  });

  it("precedence: closed eyes beats everything", () => {
    expect(
      classifyFrame(
        { ...base, eyeOpenness: 0.1, yawRatio: 0.8, gazeX: 1.5 },
        DEFAULT_BASELINE,
        th
      ).state
    ).toBe("EYES_CLOSED");
  });

  it("no face → NO_FACE", () => {
    expect(
      classifyFrame({ ...base, facePresent: false }, DEFAULT_BASELINE, th).state
    ).toBe("NO_FACE");
  });
});
