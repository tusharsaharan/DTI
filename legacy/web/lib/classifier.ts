import { AttentionState } from "./types";

/**
 * Frame-level inputs for classification. Gaze values are signed
 * directions — blendshape-scale when available (primary), iris-geometry
 * scale as fallback. The classifier only ever compares them against a
 * personal baseline, so absolute conventions cancel out.
 */
export interface FrameFeatures {
  facePresent: boolean;
  /** 0..1, 1 = wide open */
  eyeOpenness: number;
  /** Nose-tip horizontal offset from interocular midpoint / eye span */
  yawRatio: number;
  /** Nose-tip height within eye-line→chin span */
  pitchRatio: number;
  gazeX: number;
  gazeY: number;
  /** Which gaze source produced gazeX/gazeY (for diagnostics) */
  gazeSource: "blendshape" | "geometry";
}

export interface PoseBaseline {
  yawRatio: number;
  pitchRatio: number;
  gazeX: number;
  gazeY: number;
}

export const DEFAULT_BASELINE: PoseBaseline = {
  yawRatio: 0,
  pitchRatio: 0.44,
  gazeX: 0,
  gazeY: 0,
};

export interface ClassifierThresholds {
  /** Eye openness below this → EYES_CLOSED (enter) */
  eyeClosedEnter: number;
  /** Eye openness above this → eyes open again (exit; Schmitt hysteresis) */
  eyeClosedExit: number;
  /**
   * Eye-in-head change per unit head yaw while fixating the screen
   * (compensation slope). Combined screen-gaze deviation =
   * eyeDev − couplingX · headYawDev. Sign/scale are gaze-source
   * specific; the tracker sets them per source.
   */
  couplingX: number;
  /** Same, for pitch vs. gazeY */
  couplingY: number;
  /**
   * Hard caps: head yaw/pitch deviation beyond these is physically
   * incompatible with fixating the screen (eyes cannot counter-rotate
   * that far), so it is AWAY regardless of eye direction.
   */
  yawHardCap: number;
  pitchHardCap: number;
  /** Combined horizontal deviation beyond this → look-away */
  gazeDevX: number;
  /** Combined vertical deviation beyond this → look-away (lower than X) */
  gazeDevY: number;
}

export const DEFAULT_THRESHOLDS: ClassifierThresholds = {
  eyeClosedEnter: 0.45,
  eyeClosedExit: 0.6,
  // Blendshape-scale compensation slopes (see lib/coupling.ts): X
  // negative (image-space), Y positive (eyeLookUp channel is
  // up-positive, opposite of image-space geometry).
  couplingX: -1.7,
  couplingY: 0.9,
  yawHardCap: 0.5,
  pitchHardCap: 0.45,
  gazeDevX: 0.38,
  gazeDevY: 0.28,
};

/** Which check is currently firing (diagnostics for the debug panel) */
export type FiringCheck =
  | "none"
  | "blink"
  | "yaw"
  | "pitch"
  | "gaze"
  | "no_face";

/** Combined screen-space gaze deviation, both axes */
export function combinedGazeDev(
  f: FrameFeatures,
  baseline: PoseBaseline,
  t: Pick<ClassifierThresholds, "couplingX" | "couplingY">
): { x: number; y: number; headX: number; headY: number } {
  const headX = f.yawRatio - baseline.yawRatio;
  const headY = f.pitchRatio - baseline.pitchRatio;
  return {
    x: f.gazeX - baseline.gazeX - t.couplingX * headX,
    y: f.gazeY - baseline.gazeY - t.couplingY * headY,
    headX,
    headY,
  };
}

/**
 * Classify one frame into an attention state.
 *
 * Order of precedence:
 *  1. NO_FACE — no face in view
 *  2. EYES_CLOSED — eyes shut beyond the enter threshold (Schmitt:
 *     hysteresis between enter/exit prevents boundary flicker)
 *  3. AWAY — head rotated beyond the hard cap (eyes physically can
 *     not compensate back to screen), or the COMBINED screen-gaze
 *     deviation off the elliptical boundary. The combined vector
 *     subtracts eye–head compensation: "head turned, eyes on screen"
 *     cancels to ~0 and stays ON; "head still, eyes away" and "head
 *     AND eyes turning the same way" both fire.
 *  4. ON — present, eyes open, looking at the screen
 *
 * eyesCurrentlyClosed is the caller's persistent Schmitt state; pass
 * true if the previous frame(s) were already in EYES_CLOSED so a
 * re-open requires the higher exit threshold.
 */
export function classifyFrame(
  f: FrameFeatures,
  baseline: PoseBaseline = DEFAULT_BASELINE,
  t: ClassifierThresholds = DEFAULT_THRESHOLDS,
  eyesCurrentlyClosed = false
): { state: AttentionState; confidence: number; firing: FiringCheck } {
  if (!f.facePresent) {
    return { state: "NO_FACE", confidence: 1, firing: "no_face" };
  }

  // Schmitt trigger for eye closure
  const closedThreshold = eyesCurrentlyClosed
    ? t.eyeClosedExit
    : t.eyeClosedEnter;
  if (f.eyeOpenness < closedThreshold) {
    const margin = (closedThreshold - f.eyeOpenness) / closedThreshold;
    return {
      state: "EYES_CLOSED",
      confidence: 0.6 + 0.4 * Math.min(1, margin * 2),
      firing: "blink",
    };
  }

  // Head hard caps: beyond ~±45° of yaw (or the pitch equivalent) the
  // eyes cannot counter-rotate far enough to fixate the screen, so
  // this is AWAY no matter what the eyeballs read.
  const headX = f.yawRatio - baseline.yawRatio;
  const headY = f.pitchRatio - baseline.pitchRatio;
  if (Math.abs(headX) > t.yawHardCap) {
    return {
      state: "AWAY",
      confidence: Math.min(
        1,
        0.6 + 0.4 * (Math.abs(headX) / t.yawHardCap - 1)
      ),
      firing: "yaw",
    };
  }
  if (Math.abs(headY) > t.pitchHardCap) {
    return {
      state: "AWAY",
      confidence: Math.min(
        1,
        0.6 + 0.4 * (Math.abs(headY) / t.pitchHardCap - 1)
      ),
      firing: "pitch",
    };
  }

  // Combined screen-gaze deviation: eye deviation minus the eye–head
  // compensation expected while fixating. Elliptical boundary over
  // both axes — diagonal glances (e.g. down-and-left at a phone)
  // combine partial deviations on both axes and slip past a
  // max()-based check; a normalized squared sum catches them: fires
  // when (x/thx)² + (y/thy)² > 1. Vertical threshold is lower than
  // horizontal: the eye's vertical travel is smaller, so down-looks
  // read weaker and need a lower bar.
  const combX = f.gazeX - baseline.gazeX - t.couplingX * headX;
  const combY = f.gazeY - baseline.gazeY - t.couplingY * headY;
  const gazeExceed =
    (combX / t.gazeDevX) ** 2 + (combY / t.gazeDevY) ** 2;
  if (gazeExceed > 1) {
    const strength = Math.sqrt(gazeExceed) - 1;
    return {
      state: "AWAY",
      confidence: Math.min(1, 0.6 + 0.4 * Math.min(1, strength)),
      firing: "gaze",
    };
  }

  const eyeMargin = (f.eyeOpenness - t.eyeClosedEnter) / (1 - t.eyeClosedEnter);
  const headMargin = 1 - Math.max(
    Math.abs(headX) / t.yawHardCap,
    Math.abs(headY) / t.pitchHardCap
  );
  const gazeMargin = 1 - Math.sqrt(gazeExceed);
  const confidence =
    0.7 + 0.3 * Math.min(1, (eyeMargin + headMargin + gazeMargin) / 3);
  return { state: "ON", confidence, firing: "none" };
}
