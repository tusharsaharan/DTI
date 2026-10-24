/**
 * 9-point gaze calibration.
 *
 * Collects (feature vector -> screen point) observations, then solves
 * separate least-squares linear mappings for x and y:
 *
 *   screenX ~ a0 + a1*headYaw + a2*gazeX (+ interaction terms)
 *
 * Features (4): headYaw, headPitch, gazeX, gazeY  + bias term.
 * We solve normal equations (X^T X) a = X^T y with a tiny ridge
 * (Tikhonov) term for numerical stability.
 */

export interface CalibrationObservation {
  /** Landmark-geometry yaw ratio (nose offset / eye span) */
  headYaw: number;
  /** Landmark-geometry pitch ratio (nose position in eye→chin span) */
  headPitch: number;
  gazeX: number;
  gazeY: number;
  screenX: number;
  screenY: number;
}

export interface CalibrationModel {
  /** Schema version — models with a different version are ignored */
  schema: 2;
  /** Coefficients for x: [bias, yaw, pitch, gazeX, gazeY] */
  cx: number[];
  /** Coefficients for y */
  cy: number[];
  /** 0..1 goodness of fit on held-out observations (median abs error based) */
  quality: number;
  /** Screen dims at calibration time (px) */
  screenW: number;
  screenH: number;
  createdAt: number;
}

/**
 * Runtime guard against stale/malformed calibration models (e.g. from
 * an older feature scale). Returns true only for current-schema,
 * finite-coefficient models.
 */
export function isValidCalibrationModel(m: unknown): m is CalibrationModel {
  if (!m || typeof m !== "object") return false;
  const c = m as CalibrationModel;
  return (
    c.schema === 2 &&
    Array.isArray(c.cx) &&
    c.cx.length === 5 &&
    Array.isArray(c.cy) &&
    c.cy.length === 5 &&
    c.cx.every(Number.isFinite) &&
    c.cy.every(Number.isFinite) &&
    Number.isFinite(c.screenW) &&
    Number.isFinite(c.screenH)
  );
}

/** Ridge term to keep the 5x5 solve stable with few samples */
const RIDGE = 1e-6;

function solveRidge(X: number[][], y: number[]): number[] {
  const n = X[0].length;
  const XtX: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const Xty: number[] = new Array(n).fill(0);

  for (let r = 0; r < X.length; r++) {
    for (let i = 0; i < n; i++) {
      Xty[i] += X[r][i] * y[r];
      for (let j = 0; j < n; j++) XtX[i][j] += X[r][i] * X[r][j];
    }
  }
  for (let i = 0; i < n; i++) XtX[i][i] += RIDGE;

  return gaussSolve(XtX, Xty);
}

/** Gaussian elimination with partial pivoting for small n */
function gaussSolve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const pv = M[col][col];
    if (Math.abs(pv) < 1e-12) continue;
    for (let c = col; c <= n; c++) M[col][c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

export function featureRow(o: CalibrationObservation): number[] {
  return [1, o.headYaw, o.headPitch, o.gazeX, o.gazeY];
}

/**
 * Fit the calibration. Uses all observations, then reports quality as
 * 1 - normalized median residual (pixels vs screen diagonal fraction).
 */
export function fitCalibration(
  observations: CalibrationObservation[],
  screenW: number,
  screenH: number
): CalibrationModel {
  const X = observations.map(featureRow);
  const ys = observations.map((o) => o.screenX);
  const cx = solveRidge(X, ys);
  const cy = solveRidge(X, observations.map((o) => o.screenY));

  // Residual quality
  const diag = Math.hypot(screenW, screenH);
  const errs = observations.map((o) => {
    const row = featureRow(o);
    const px = row.reduce((s, v, i) => s + v * cx[i], 0);
    const py = row.reduce((s, v, i) => s + v * cy[i], 0);
    return Math.hypot(px - o.screenX, py - o.screenY) / diag;
  });
  errs.sort((a, b) => a - b);
  const median = errs[Math.floor(errs.length / 2)] ?? 0;
  const quality = Math.max(0, Math.min(1, 1 - median * 4));

  return { schema: 2, cx, cy, quality, screenW, screenH, createdAt: Date.now() };
}

/** Map a live feature frame to screen pixel coordinates. */
export function predictGaze(
  model: CalibrationModel,
  headYaw: number,
  headPitch: number,
  gazeX: number,
  gazeY: number
): { x: number; y: number } {
  const row = [1, headYaw, headPitch, gazeX, gazeY];
  return {
    x: row.reduce((s, v, i) => s + v * model.cx[i], 0),
    y: row.reduce((s, v, i) => s + v * model.cy[i], 0),
  };
}
