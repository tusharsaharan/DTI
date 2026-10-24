import { describe, expect, it } from "vitest";
import {
  classifyFrame,
  DEFAULT_BASELINE,
  DEFAULT_THRESHOLDS,
} from "../lib/classifier";
import {
  fitCalibration,
  predictGaze,
  CalibrationObservation,
} from "../lib/calibration";

const base = {
  facePresent: true,
  eyeOpenness: 0.9,
  yawRatio: 0,
  pitchRatio: 0.44,
  gazeX: 0,
  gazeY: 0,
  gazeSource: "blendshape" as const,
};

describe("classifyFrame (geometry-based)", () => {
  it("classifies neutral pose as ON", () => {
    expect(classifyFrame(base).state).toBe("ON");
  });

  it("no face -> NO_FACE", () => {
    expect(classifyFrame({ ...base, facePresent: false }).state).toBe(
      "NO_FACE"
    );
  });

  it("closed eyes -> EYES_CLOSED", () => {
    expect(classifyFrame({ ...base, eyeOpenness: 0.1 }).state).toBe(
      "EYES_CLOSED"
    );
  });

  it("head yaw deviation from baseline -> AWAY", () => {
    // yawRatio 0.35 ≈ nose pushed 35% of an eye-span sideways → real head turn
    expect(classifyFrame({ ...base, yawRatio: 0.35 }).state).toBe("AWAY");
    expect(classifyFrame({ ...base, yawRatio: -0.35 }).state).toBe("AWAY");
  });

  it("head pitch deviation from baseline -> AWAY", () => {
    expect(classifyFrame({ ...base, pitchRatio: 0.05 }).state).toBe("AWAY"); // chin-down nod
    expect(classifyFrame({ ...base, pitchRatio: 0.9 }).state).toBe("AWAY"); // chin-up
  });

  it("small natural jitter stays ON", () => {
    expect(
      classifyFrame({
        ...base,
        yawRatio: DEFAULT_BASELINE.yawRatio + 0.05,
        pitchRatio: DEFAULT_BASELINE.pitchRatio + 0.05,
        gazeX: 0.15,
        gazeY: 0.12,
      }).state
    ).toBe("ON");
  });

  it("classifies relative to PERSONAL baseline, not absolute zero", () => {
    // User sits with camera off to the side: neutral yawRatio is 0.2
    const baseline = { ...DEFAULT_BASELINE, yawRatio: 0.2 };
    // At their neutral pose → ON
    expect(
      classifyFrame({ ...base, yawRatio: 0.2 }, baseline).state
    ).toBe("ON");
    // Turned further away → AWAY
    expect(
      classifyFrame({ ...base, yawRatio: 0.45 }, baseline).state
    ).toBe("AWAY");
  });

  it("precedence: closed eyes beats head turn", () => {
    expect(
      classifyFrame({ ...base, eyeOpenness: 0.1, yawRatio: 0.4 }).state
    ).toBe("EYES_CLOSED");
  });
});

describe("fitCalibration / predictGaze", () => {
  const W = 1920;
  const H = 1080;

  function makeObs(): CalibrationObservation[] {
    const targets = [
      [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
      [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
      [0.1, 0.9], [0.5, 0.9], [0.9, 0.9],
    ];
    // Ground truth: gaze maps linearly to screen; yaw adds a bit
    const obs: CalibrationObservation[] = [];
    for (const [fx, fy] of targets) {
      const gx = (fx - 0.5) / 0.45;
      const gy = (fy - 0.5) / 0.45;
      const yaw = (fx - 0.5) * 0.3;
      for (let k = 0; k < 6; k++) {
        obs.push({
          headYaw: yaw,
          headPitch: 0.44,
          gazeX: gx,
          gazeY: gy,
          screenX: W * (0.5 + 0.45 * gx + 0.1 * yaw),
          screenY: H * (0.5 + 0.45 * gy),
        });
      }
    }
    return obs;
  }

  it("recovers a linear mapping from synthetic data", () => {
    const model = fitCalibration(makeObs(), W, H);
    expect(model.quality).toBeGreaterThan(0.8);

    const p1 = predictGaze(model, 0.12, 0.44, 0.9, 0);
    expect(p1.x / W).toBeGreaterThan(0.7);
    const p2 = predictGaze(model, -0.12, 0.44, -0.9, 0);
    expect(p2.x / W).toBeLessThan(0.3);
    const p3 = predictGaze(model, 0, 0.44, 0, 0);
    expect(Math.abs(p3.x / W - 0.5)).toBeLessThan(0.1);
    expect(Math.abs(p3.y / H - 0.5)).toBeLessThan(0.1);
  });

  it("handles noisy data without exploding", () => {
    const obs = makeObs().map((o) => ({
      ...o,
      gazeX: o.gazeX + (Math.random() - 0.5) * 0.1,
      gazeY: o.gazeY + (Math.random() - 0.5) * 0.1,
    }));
    const model = fitCalibration(obs, W, H);
    const p = predictGaze(model, 0, 0.44, 0, 0);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});
