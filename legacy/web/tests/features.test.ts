import { describe, expect, it } from "vitest";
import {
  extractFeatures,
  irisGaze,
  syntheticFace,
  LEFT_IRIS,
  RIGHT_IRIS,
  NOSE_TIP,
  LEFT_EYE_INNER,
  LEFT_EYE_OUTER,
} from "../lib/features";

describe("extractFeatures — neutral synthetic face", () => {
  it("neutral face yields near-zero yaw/gaze and mid pitch", () => {
    const f = extractFeatures(syntheticFace());
    expect(Math.abs(f.yawRatio)).toBeLessThan(0.02);
    expect(f.gazeX).toBeCloseTo(0, 1);
    expect(f.gazeY).toBeCloseTo(0, 1);
    // nose at y=0.50, eye line 0.40, chin 0.70 → (0.50-0.40)/0.30 ≈ 0.33
    expect(f.pitchRatio).toBeGreaterThan(0.2);
    expect(f.pitchRatio).toBeLessThan(0.6);
    expect(f.eyeOpenness).toBeGreaterThan(0.3);
  });

  it("iris centered in own eye box is NOT always zero (Bug 2 regression)", () => {
    // Old bug: normalizing iris center by iris edges → constant 0.
    // New: iris moves within the eye-corner box and gazeX changes.
    const centered = extractFeatures(syntheticFace());
    const lookingRightImg = extractFeatures(
      syntheticFace({
        [LEFT_IRIS]: { x: 0.385, y: 0.40 },
        [RIGHT_IRIS]: { x: 0.585, y: 0.40 },
      })
    );
    // Iris shifted +0.035 within a 0.10-wide eye → +0.7 in normalized units
    expect(lookingRightImg.gazeX).toBeGreaterThan(0.5);
    expect(Math.abs(centered.gazeX)).toBeLessThan(0.1);
    // The old code would have produced gazeX === 0 for BOTH — assert they differ
    expect(Math.abs(lookingRightImg.gazeX - centered.gazeX)).toBeGreaterThan(0.4);
  });

  it("both eyes' iris offsets move together (same direction in image space)", () => {
    const g = irisGaze(
      syntheticFace({
        [LEFT_IRIS]: { x: 0.31, y: 0.40 },
        [RIGHT_IRIS]: { x: 0.51, y: 0.40 },
      })
    );
    // Both shifted -0.035 → negative (toward image-left)
    expect(g.x).toBeLessThan(-0.5);
  });

  it("head yaw: nose offset from interocular midpoint shifts yawRatio", () => {
    const neutral = extractFeatures(syntheticFace());
    const turned = extractFeatures(
      syntheticFace({ [NOSE_TIP]: { x: 0.52, y: 0.50 } })
    );
    // Nose pushed +0.07 in a 0.30 eye-span → +0.23
    expect(turned.yawRatio - neutral.yawRatio).toBeGreaterThan(0.2);
    expect(turned.yawRatio).toBeGreaterThan(0.2);
  });

  it("head pitch: nod moves nose within eye→chin span", () => {
    const neutral = extractFeatures(syntheticFace());
    const chinDown = extractFeatures(
      syntheticFace({ [NOSE_TIP]: { x: 0.45, y: 0.44 } })
    );
    // Nose closer to eye line → smaller pitchRatio
    expect(chinDown.pitchRatio).toBeLessThan(neutral.pitchRatio - 0.1);
  });

  it("closed eyes via eyelid aperture → low openness when blendshapes absent", () => {
    const closed = extractFeatures(
      syntheticFace({
        159: { y: 0.40 },
        145: { y: 0.402 },
        386: { y: 0.40 },
        374: { y: 0.402 },
      })
    );
    expect(closed.eyeOpenness).toBeLessThan(0.35);
  });

  it("blendshape blink score overrides landmark aperture", () => {
    const f = extractFeatures(syntheticFace(), 0.95);
    expect(f.eyeOpenness).toBeCloseTo(0.05, 1);
  });

  it("guards degenerate geometry (coincident corners)", () => {
    const degenerate = syntheticFace({
      [LEFT_EYE_OUTER]: { x: 0.40, y: 0.40 }, // same as inner
      [LEFT_EYE_INNER]: { x: 0.40, y: 0.40 },
    });
    const f = extractFeatures(degenerate);
    expect(Number.isFinite(f.yawRatio)).toBe(true);
    expect(Number.isFinite(f.gazeX)).toBe(true);
  });
});
