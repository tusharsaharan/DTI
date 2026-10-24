/**
 * Pure, convention-free feature extraction from MediaPipe face landmarks.
 * Every signal is a ratio of landmark distances in image space.
 *
 * Landmark indices (MediaPipe face mesh, 478-point with iris):
 *  - Eye corners: 33 (left outer), 133 (left inner),
 *                 362 (right inner), 263 (right outer)
 *  - Eyelids:    159 (left upper), 145 (left lower),
 *                 386 (right upper), 374 (right lower)
 *  - Iris:       468 (left center), 473 (right center)
 *  - Nose tip: 1, chin: 199, forehead: 10
 */

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

export interface FrameFeatures {
  facePresent: boolean;
  /** 0..1, 1 = wide open */
  eyeOpenness: number;
  /** Nose-tip horizontal offset from interocular midpoint / eye span. ~0 facing camera. */
  yawRatio: number;
  /** Nose-tip height within eye-line→chin span. ~0.4–0.5 when level. */
  pitchRatio: number;
  /** Iris horizontal position within the EYE-CORNER box: -1..1, ~0 centered */
  gazeX: number;
  /** Iris vertical position within the eyelid box: -1..1, ~0 centered */
  gazeY: number;
}

export const LEFT_EYE_OUTER = 33;
export const LEFT_EYE_INNER = 133;
export const RIGHT_EYE_INNER = 362;
export const RIGHT_EYE_OUTER = 263;
export const LEFT_LID_TOP = 159;
export const LEFT_LID_BOTTOM = 145;
export const RIGHT_LID_TOP = 386;
export const RIGHT_LID_BOTTOM = 374;
export const LEFT_IRIS = 468;
export const RIGHT_IRIS = 473;
export const NOSE_TIP = 1;
export const CHIN = 199;

/** Minimum eye-corner span (in landmark units) for a usable frame */
const MIN_SPAN = 0.01;

export function extractFeatures(
  face: Landmark[],
  blinkScore?: number
): FrameFeatures {
  const lOuter = face[LEFT_EYE_OUTER];
  const lInner = face[LEFT_EYE_INNER];
  const rInner = face[RIGHT_EYE_INNER];
  const rOuter = face[RIGHT_EYE_OUTER];
  const nose = face[NOSE_TIP];
  const chin = face[CHIN];

  const midX = (lInner.x + rInner.x) / 2;
  const midY = (lInner.y + rInner.y) / 2;

  // Scale: outer eye-corner distance (stable under distance zoom)
  const eyeSpan = Math.max(
    Math.abs(rOuter.x - lOuter.x),
    Math.abs(rOuter.y - lOuter.y),
    MIN_SPAN
  );

  // YAW: nose-tip horizontal offset from interocular midpoint, in eye-spans
  const yawRatio = (nose.x - midX) / eyeSpan;

  // PITCH: nose-tip height within eye-line→chin span
  const chinSpan = Math.max(chin.y - midY, MIN_SPAN);
  const pitchRatio = (nose.y - midY) / chinSpan;

  // Eye openness: eyelid aperture in eye-spans, or blendshape if provided
  let eyeOpenness: number;
  if (typeof blinkScore === "number" && isFinite(blinkScore)) {
    eyeOpenness = Math.max(0, Math.min(1, 1 - blinkScore));
  } else {
    const apL = Math.abs(face[LEFT_LID_BOTTOM].y - face[LEFT_LID_TOP].y);
    const apR = Math.abs(face[RIGHT_LID_BOTTOM].y - face[RIGHT_LID_TOP].y);
    // Typical open-eye aperture ≈ 0.25 eye-spans; normalize so ~0.25 → ~0.8
    eyeOpenness = Math.max(0, Math.min(1, ((apL + apR) / 2 / eyeSpan) * 3.2));
  }

  // IRIS GAZE: iris center within the eye-corner/eyelid box.
  // The reference frame is the EYE, not the iris itself — the center of
  // a box normalized by its own edges is constant zero by definition.
  const gaze = irisGaze(face);

  return {
    facePresent: true,
    eyeOpenness,
    yawRatio,
    pitchRatio,
    gazeX: gaze.x,
    gazeY: gaze.y,
  };
}

/**
 * Iris position inside each eye's landmark box, -1..1 per axis, both
 * eyes averaged.
 *
 * CRITICAL: each eye's box is oriented consistently in IMAGE space
 * (min→max on each axis). The naive "inner vs outer corner" ordering
 * gives the two eyes opposite x-orientations (the outer corner is at
 * lower x for one eye and higher x for the other), so their offsets
 * cancel when averaged — the gaze signal reads ~0 for every
 * direction. Normalizing min→max makes both eyes share the same
 * positive axis (+x = image right), so a real eye movement produces
 * same-signed offsets in both eyes and the average survives.
 * Baseline subtraction in the classifier cancels any mirroring.
 */
export function irisGaze(face: Landmark[]): { x: number; y: number } {
  if (face.length < 478) return { x: 0, y: 0 };

  const box = (
    iris: Landmark,
    a: Landmark,
    b: Landmark,
    top: Landmark,
    bottom: Landmark
  ) => {
    const xMin = Math.min(a.x, b.x);
    const xMax = Math.max(a.x, b.x);
    const w = xMax - xMin;
    const h = bottom.y - top.y;
    return {
      x: w < 1e-5 ? 0 : ((iris.x - xMin) / w) * 2 - 1,
      y: Math.abs(h) < 1e-5 ? 0 : ((iris.y - top.y) / h) * 2 - 1,
    };
  };

  const l = box(
    face[LEFT_IRIS],
    face[LEFT_EYE_INNER],
    face[LEFT_EYE_OUTER],
    face[LEFT_LID_TOP],
    face[LEFT_LID_BOTTOM]
  );
  const r = box(
    face[RIGHT_IRIS],
    face[RIGHT_EYE_INNER],
    face[RIGHT_EYE_OUTER],
    face[RIGHT_LID_TOP],
    face[RIGHT_LID_BOTTOM]
  );

  return { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
}

// ------------------------------------------------------------------
// Blendshape gaze (PRIMARY eye-direction signal)
// ------------------------------------------------------------------

export interface BlendshapeCategory {
  categoryName: string;
  score: number;
}

/**
 * Gaze direction from the model's trained eyeLook* blendshapes.
 *
 * These are 0..1 scores per eye: eyeLookIn/eyeLookOut (toward/away from
 * the nose) and eyeLookUp/eyeLookDown. Unlike iris geometry — whose
 * normalized range is physically capped (~±0.6 even at full deflection)
 * — the trained scores reach 0.5–0.8 for genuine off-screen looks and
 * stay ≤0.3 for in-screen reading, giving clean threshold separation.
 *
 * Returns a signed, roughly -1..1 direction in the USER's frame:
 *   x > 0 → looking to their left, x < 0 → their right
 *   y > 0 → looking up,        y < 0 → looking down
 * (Signs are consistent per user; baseline subtraction in the
 * classifier absorbs any individual/model sign conventions.)
 */
export function gazeFromBlendshapes(
  categories: BlendshapeCategory[]
): { x: number; y: number } | null {
  const score = (name: string) =>
    categories.find((c) => c.categoryName === name)?.score;

  const lIn = score("eyeLookInLeft");
  const lOut = score("eyeLookOutLeft");
  const lUp = score("eyeLookUpLeft");
  const lDown = score("eyeLookDownLeft");
  const rIn = score("eyeLookInRight");
  const rOut = score("eyeLookOutRight");
  const rUp = score("eyeLookUpRight");
  const rDown = score("eyeLookDownRight");

  // Need both eyes' horizontal scores to combine; vertical optional-ish
  // but require all for a confident reading.
  if (
    lIn == null || lOut == null || rIn == null || rOut == null ||
    lUp == null || lDown == null || rUp == null || rDown == null
  ) {
    return null;
  }

  // Horizontal: "In" for the left eye and "Out" for the right eye both
  // mean the user looks to THEIR left (and vice versa) — in the model's
  // naming, Left/Right suffixes refer to the model's/viewer's side.
  // We combine opponent pairs and take the difference so neutral ≈ 0.
  const lookA = (lIn + rOut) / 2; // direction A
  const lookB = (lOut + rIn) / 2; // direction B (opposite of A)
  const x = lookA - lookB;

  const up = (lUp + rUp) / 2;
  const down = (lDown + rDown) / 2;
  const y = up - down;

  if (!isFinite(x) || !isFinite(y)) return null;
  return { x, y };
}

// ------------------------------------------------------------------
// Synthetic builders for tests and reasoning
// ------------------------------------------------------------------

/** Canonical neutral face: facing camera, eyes open, iris centered */
export function syntheticFace(overrides?: Partial<Record<number, Partial<Landmark>>>): Landmark[] {
  const f = new Array(478).fill(0).map((_, i) => {
    // Default: everything at origin; tests override what matters
    return { x: 0, y: 0 } as Landmark;
  });
  // Neutral geometry (image space, y grows downward)
  f[LEFT_EYE_OUTER] = { x: 0.30, y: 0.40 };
  f[LEFT_EYE_INNER] = { x: 0.40, y: 0.40 };
  f[RIGHT_EYE_INNER] = { x: 0.50, y: 0.40 };
  f[RIGHT_EYE_OUTER] = { x: 0.60, y: 0.40 };
  f[LEFT_LID_TOP] = { x: 0.35, y: 0.385 };
  f[LEFT_LID_BOTTOM] = { x: 0.35, y: 0.415 };
  f[RIGHT_LID_TOP] = { x: 0.55, y: 0.385 };
  f[RIGHT_LID_BOTTOM] = { x: 0.55, y: 0.415 };
  f[LEFT_IRIS] = { x: 0.35, y: 0.40 };
  f[RIGHT_IRIS] = { x: 0.55, y: 0.40 };
  f[NOSE_TIP] = { x: 0.45, y: 0.50 };
  f[CHIN] = { x: 0.45, y: 0.70 };

  if (overrides) {
    for (const [idx, lm] of Object.entries(overrides)) {
      f[Number(idx)] = { ...f[Number(idx)], ...lm };
    }
  }
  return f;
}
