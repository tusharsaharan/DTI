/**
 * Eye–head coupling: how much the eye-in-head direction changes per
 * unit of head rotation while the user keeps looking at the screen.
 *
 * Turn your head but keep your eyes on the screen and your eyeballs
 * counter-rotate (vestibulo-ocular compensation): the eye-in-head
 * signal moves OPPOSITE to the head signal in image space. The
 * classifier's combined gaze vector
 *
 *   combined = eyeDev − coupling · headDev
 *
 * cancels the two exactly when coupling equals the user's true
 * compensation slope, so "head turned, eyes compensating" reads as
 * on-screen instead of double-counting as away.
 *
 * Sign conventions per channel:
 *  - Iris geometry is image-space: gazeGeoX + = toward image-right,
 *    gazeGeoY + = iris low (looking down, image y grows downward).
 *    On BOTH axes genuine compensation is a NEGATIVE slope vs. the
 *    head deviation (head yaw + → eyes toward image-left; pitch-down
 *    + → eyes toward image-up).
 *  - Blendshape gazeY = eyeLookUp − eyeLookDown is UP-positive — the
 *    opposite vertical sign of geometry — so its compensation slope
 *    on Y is POSITIVE by construction. gazeX's sign relative to
 *    geometry depends on the model's Left/Right naming convention
 *    and is resolved empirically.
 *
 * The slopes are (a) learned from a short guided head sweep via OLS
 * with quality gates, and (b) cross-checked against the iris channel
 * by correlation, which also corrects default signs when learning
 * didn't produce usable data.
 */

/** One smoothed, baseline-relative observation during the sweep. */
export interface SweepSample {
  /** yawRatio − baseline.yawRatio (signed) */
  headX: number;
  /** gazeX − baseline.gazeX (signed, source-scale) */
  eyeX: number;
  /** pitchRatio − baseline.pitchRatio (signed) */
  headY: number;
  /** gazeY − baseline.gazeY (signed, source-scale) */
  eyeY: number;
}

export interface AxisFit {
  slope: number;
  r2: number;
  n: number;
  headStd: number;
}

export interface CouplingGates {
  /** Minimum sweep samples before a fit is even attempted */
  minSamples: number;
  /** Head must actually move (std of head dev) — else slope is noise */
  minHeadStd: number;
  /** Eye must follow the head linearly this well */
  minR2: number;
  /** |slope| below this ≈ eyes following the head, not compensating */
  minAbsSlope: number;
  /** Physical sanity clamp */
  maxAbsSlope: number;
}

export const DEFAULT_GATES: CouplingGates = {
  minSamples: 40,
  minHeadStd: 0.02,
  minR2: 0.5,
  minAbsSlope: 0.3,
  maxAbsSlope: 6,
};

/**
 * Default coupling slopes per gaze source.
 *
 * Geometry (image-space): negative on both axes (see header).
 * Blendshape X: assumes the model's eyeLook naming matches image
 * space (as combined in features.ts) → negative; the sweep/cross
 * check corrects it if the convention is inverted.
 * Blendshape Y: UP-positive channel, structurally opposite of
 * geometry → POSITIVE.
 *
 * Magnitudes: ~1.7 blendshape gaze-units of eye counter-rotation per
 * yaw-unit of head turn (ratio of the balanced gaze threshold 0.38 to
 * the yaw scale); vertical is weaker (the eye's vertical travel is
 * smaller). Geometry scale is larger because its normalized range is
 * physically capped ~±0.6.
 */
export const DEFAULT_COUPLING = {
  blendshape: { x: -1.7, y: 0.9 },
  geometry: { x: -3.0, y: -1.6 },
};

/**
 * OLS of eyeDev on headDev with quality gates. Returns null when the
 * data can't support a slope (too few samples, head didn't move, no
 * linear relationship, or slope outside physical plausibility).
 */
export function fitAxis(
  pairs: [number, number][],
  gates: CouplingGates = DEFAULT_GATES
): AxisFit | null {
  const n = pairs.length;
  if (n < gates.minSamples) return null;

  let mx = 0;
  let my = 0;
  for (const [x, y] of pairs) {
    mx += x;
    my += y;
  }
  mx /= n;
  my /= n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    const dx = x - mx;
    const dy = y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  const headStd = Math.sqrt(sxx / n);
  if (headStd < gates.minHeadStd) return null;
  if (sxx < 1e-12 || syy < 1e-12) return null;

  const slope = sxy / sxx;
  const r2 = (sxy * sxy) / (sxx * syy);
  if (r2 < gates.minR2) return null;
  if (Math.abs(slope) < gates.minAbsSlope) return null;
  if (Math.abs(slope) > gates.maxAbsSlope) return null;

  return { slope, r2, n, headStd };
}

/** Pearson correlation; null when either side lacks variance or data. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 30) return null;

  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx < 1e-12 || syy < 1e-12) return null;

  return sxy / Math.sqrt(sxx * syy);
}

export interface ResolvedAxis {
  value: number;
  learned: boolean;
}

export interface ResolvedCoupling {
  bs: { x: ResolvedAxis; y: ResolvedAxis };
  geo: { x: ResolvedAxis; y: ResolvedAxis };
  /** Blendshape-vs-iris correlation per axis (null = insufficient data) */
  crossX: number | null;
  crossY: number | null;
}

function axisPairs(s: SweepSample[], axis: "x" | "y"): [number, number][] {
  return s.map((p) =>
    axis === "x" ? [p.headX, p.eyeX] : [p.headY, p.eyeY]
  );
}

function resolveAxis(
  bsFit: AxisFit | null,
  geoFit: AxisFit | null,
  cross: number | null,
  defBs: number,
  defGeo: number
): { bs: ResolvedAxis; geo: ResolvedAxis } {
  // Geometry channel is image-space: genuine compensation is a
  // NEGATIVE slope on both axes. A positive one means the eyes
  // followed the head (bad sweep) — rejected.
  const geoSlope = geoFit !== null && geoFit.slope < 0 ? geoFit.slope : null;

  // Is the blendshape channel sign-inverted relative to geometry?
  // Strong negative correlation over the sweep says yes; strong
  // positive says no; insufficient data falls back to the structural
  // assumption encoded in the defaults' relative sign (Y is
  // inverted by construction; X assumes matching image-space).
  const structuralInverted = defBs * defGeo < 0;
  let inverted = structuralInverted;
  let crossApplied = false;
  if (cross !== null && Math.abs(cross) >= 0.5) {
    inverted = cross < 0;
    crossApplied = true;
  }

  // Compensation reads negative in blendshape units when the channel
  // shares geometry's sign, positive when inverted.
  const expectedSign = inverted ? 1 : -1;

  let bs: ResolvedAxis;
  if (bsFit !== null && Math.sign(bsFit.slope) === expectedSign) {
    bs = { value: bsFit.slope, learned: true };
  } else if (geoSlope !== null) {
    // Convert the trusted geometry slope into blendshape units:
    // magnitude via the default scale ratio, sign via the empirical
    // (or structural) relative channel sign.
    const relSign =
      crossApplied ? Math.sign(cross as number) : (structuralInverted ? -1 : 1);
    bs = { value: geoSlope * Math.abs(defBs / defGeo) * relSign, learned: true };
  } else {
    // Defaults; flip the default sign when the cross-check
    // contradicts the structural assumption.
    const flip = crossApplied && inverted !== structuralInverted;
    bs = { value: flip ? -defBs : defBs, learned: false };
  }

  const geo: ResolvedAxis = {
    value: geoSlope ?? defGeo,
    learned: geoSlope !== null,
  };
  return { bs, geo };
}

/**
 * Resolve effective coupling slopes for both gaze sources from sweep
 * data, blendshape-vs-iris correlation pairs, and defaults.
 *
 * bsGaze / geoGaze arrays are parallel: the two channels' smoothed
 * gaze values sampled on the same frames (used for the sign
 * cross-check).
 */
export function resolveCoupling(input: {
  bsSweep: SweepSample[];
  geoSweep: SweepSample[];
  bsGazeX: number[];
  geoGazeX: number[];
  bsGazeY: number[];
  geoGazeY: number[];
  gates?: CouplingGates;
}): ResolvedCoupling {
  const gates = input.gates ?? DEFAULT_GATES;

  const crossX = pearson(input.bsGazeX, input.geoGazeX);
  const crossY = pearson(input.bsGazeY, input.geoGazeY);

  const x = resolveAxis(
    fitAxis(axisPairs(input.bsSweep, "x"), gates),
    fitAxis(axisPairs(input.geoSweep, "x"), gates),
    crossX,
    DEFAULT_COUPLING.blendshape.x,
    DEFAULT_COUPLING.geometry.x
  );
  const y = resolveAxis(
    fitAxis(axisPairs(input.bsSweep, "y"), gates),
    fitAxis(axisPairs(input.geoSweep, "y"), gates),
    crossY,
    DEFAULT_COUPLING.blendshape.y,
    DEFAULT_COUPLING.geometry.y
  );

  return {
    bs: { x: x.bs, y: y.bs },
    geo: { x: x.geo, y: y.geo },
    crossX,
    crossY,
  };
}
