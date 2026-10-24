import { describe, expect, it } from "vitest";
import { gazeFromBlendshapes } from "../lib/features";
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

function bs(overrides: Record<string, number>) {
  const neutral: Record<string, number> = {
    eyeLookInLeft: 0.1, eyeLookOutLeft: 0.1,
    eyeLookInRight: 0.1, eyeLookOutRight: 0.1,
    eyeLookUpLeft: 0.1, eyeLookDownLeft: 0.1,
    eyeLookUpRight: 0.1, eyeLookDownRight: 0.1,
  };
  return Object.entries({ ...neutral, ...overrides }).map(
    ([categoryName, score]) => ({ categoryName, score })
  );
}

describe("gazeFromBlendshapes", () => {
  it("neutral gaze ≈ 0", () => {
    const g = gazeFromBlendshapes(bs({}))!;
    expect(Math.abs(g.x)).toBeLessThan(0.05);
    expect(Math.abs(g.y)).toBeLessThan(0.05);
  });

  it("strong look in direction A: positive x", () => {
    // lIn + rOut high → direction A
    const g = gazeFromBlendshapes(
      bs({ eyeLookInLeft: 0.7, eyeLookOutRight: 0.7 })
    )!;
    expect(g.x).toBeGreaterThan(0.5);
  });

  it("strong look in direction B: negative x (opposite)", () => {
    const g = gazeFromBlendshapes(
      bs({ eyeLookOutLeft: 0.7, eyeLookInRight: 0.7 })
    )!;
    expect(g.x).toBeLessThan(-0.5);
  });

  it("looking up: positive y", () => {
    const g = gazeFromBlendshapes(
      bs({ eyeLookUpLeft: 0.7, eyeLookUpRight: 0.7 })
    )!;
    expect(g.y).toBeGreaterThan(0.5);
  });

  it("looking down: negative y", () => {
    const g = gazeFromBlendshapes(
      bs({ eyeLookDownLeft: 0.7, eyeLookDownRight: 0.7 })
    )!;
    expect(g.y).toBeLessThan(-0.5);
  });

  it("returns null when any eyeLook category is missing", () => {
    expect(
      gazeFromBlendshapes([{ categoryName: "eyeLookInLeft", score: 0.5 }])
    ).toBeNull();
  });

  it("in-screen reading scan (~0.25) stays under off-screen look (~0.7)", () => {
    const reading = gazeFromBlendshapes(
      bs({ eyeLookInLeft: 0.25, eyeLookOutRight: 0.25 })
    )!;
    const off = gazeFromBlendshapes(
      bs({ eyeLookInLeft: 0.7, eyeLookOutRight: 0.7 })
    )!;
    expect(Math.abs(reading.x)).toBeLessThan(0.4);
    expect(Math.abs(off.x)).toBeGreaterThan(0.5);
  });
});

describe("EYES_CLOSED Schmitt trigger", () => {
  it("soft closure (0.42 < enter 0.45) → EYES_CLOSED", () => {
    const r = classifyFrame({ ...base, eyeOpenness: 0.42 });
    expect(r.state).toBe("EYES_CLOSED");
    expect(r.firing).toBe("blink");
  });

  it("boundary hover 0.5 stays OPEN when previously open (enter=0.45)", () => {
    const r = classifyFrame({ ...base, eyeOpenness: 0.5 });
    expect(r.state).toBe("ON");
  });

  it("once closed, reopening requires > exit threshold (0.6)", () => {
    // Currently closed; openness rises to 0.55 — still closed (hysteresis)
    const stillClosed = classifyFrame(
      { ...base, eyeOpenness: 0.55 },
      DEFAULT_BASELINE,
      DEFAULT_THRESHOLDS,
      true
    );
    expect(stillClosed.state).toBe("EYES_CLOSED");
    // Above 0.6 → open again
    const open = classifyFrame(
      { ...base, eyeOpenness: 0.65 },
      DEFAULT_BASELINE,
      DEFAULT_THRESHOLDS,
      true
    );
    expect(open.state).toBe("ON");
  });

  it("when open, mild squint at 0.55 is NOT closed", () => {
    const r = classifyFrame({ ...base, eyeOpenness: 0.55 });
    expect(r.state).toBe("ON");
  });

  it("deep closure well below threshold is closed from either side", () => {
    const r = classifyFrame(
      { ...base, eyeOpenness: 0.05 },
      DEFAULT_BASELINE,
      DEFAULT_THRESHOLDS,
      true
    );
    expect(r.state).toBe("EYES_CLOSED");
  });
});

describe("classifier firing diagnostics", () => {
  it("reports yaw firing only beyond the hard cap", () => {
    const r = classifyFrame({ ...base, yawRatio: 0.8 });
    expect(r.state).toBe("AWAY");
    expect(r.firing).toBe("yaw");
  });

  it("reports gaze firing for off-screen eyes with head still", () => {
    const r = classifyFrame({ ...base, gazeX: 0.8 });
    expect(r.state).toBe("AWAY");
    expect(r.firing).toBe("gaze");
  });

  it("blink takes precedence over head turn", () => {
    const r = classifyFrame({ ...base, eyeOpenness: 0.1, yawRatio: 0.5 });
    expect(r.state).toBe("EYES_CLOSED");
    expect(r.firing).toBe("blink");
  });
});

describe("elliptical gaze boundary (per-axis thresholds)", () => {
  const th = { ...DEFAULT_THRESHOLDS, gazeDevX: 0.38, gazeDevY: 0.28 };

  it("pure horizontal look-away fires", () => {
    const r = classifyFrame(
      { ...base, gazeX: 0.5 },
      DEFAULT_BASELINE,
      th
    );
    expect(r.state).toBe("AWAY");
  });

  it("pure vertical look-away fires at lower deviation than X", () => {
    const r = classifyFrame(
      { ...base, gazeY: -0.4 }, // looking down, e.g. at a phone
      DEFAULT_BASELINE,
      th
    );
    expect(r.state).toBe("AWAY");
    expect(r.firing).toBe("gaze");
  });

  it("DIAGONAL glance (partial X + partial Y) fires — regression test", () => {
    // Down-and-left at a phone: 0.28 on X (under X threshold) plus
    // 0.22 on Y (under Y threshold) — max()-based check misses this;
    // elliptical: (0.28/0.38)² + (0.22/0.28)² = 0.54 + 0.62 = 1.16 > 1
    const r = classifyFrame(
      { ...base, gazeX: 0.28, gazeY: 0.22 },
      DEFAULT_BASELINE,
      th
    );
    expect(r.state).toBe("AWAY");
    expect(r.firing).toBe("gaze");
  });

  it("small combined reading jitter stays ON", () => {
    // (0.15/0.38)² + (0.12/0.28)² = 0.16 + 0.18 = 0.34 < 1
    const r = classifyFrame(
      { ...base, gazeX: 0.15, gazeY: 0.12 },
      DEFAULT_BASELINE,
      th
    );
    expect(r.state).toBe("ON");
  });

  it("in-screen scan near one axis edge stays ON", () => {
    // 0.3 on X alone: (0.3/0.38)² = 0.62 < 1
    const r = classifyFrame(
      { ...base, gazeX: 0.3 },
      DEFAULT_BASELINE,
      th
    );
    expect(r.state).toBe("ON");
  });
});
