"use client";

import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import { CalibrationModel } from "./calibration";
import {
  classifyFrame,
  DEFAULT_BASELINE,
  FiringCheck,
  PoseBaseline,
  ClassifierThresholds,
} from "./classifier";
import { extractFeatures, gazeFromBlendshapes } from "./features";
import {
  DEFAULT_COUPLING,
  ResolvedCoupling,
  resolveCoupling,
  SweepSample,
} from "./coupling";
import { FrameSample } from "./types";

const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/models/face_landmarker.task";

export type Sensitivity = "relaxed" | "balanced" | "sharp";

/**
 * Head-rotation hard caps in landmark-ratio units (~±45°): beyond
 * these the eyes physically cannot counter-rotate far enough to
 * fixate the screen, so it is AWAY regardless of eye direction.
 * Constant across sensitivities — a physical limit, not a preference.
 */
const YAW_HARD_CAP = 0.5;
const PITCH_HARD_CAP = 0.45;

/**
 * Gaze-deviation thresholds differ by source because their numeric
 * scales differ: trained blendshape scores reach 0.5–0.8 for genuine
 * off-screen looks; iris-geometry ratios are physically capped ~±0.6.
 * Y (vertical) is lower than X (horizontal): the eye's vertical travel
 * is smaller, so down-looks (e.g. at a phone) read weaker.
 *
 * Coupling slopes (eye-in-head change per unit head rotation while
 * fixating) are physical user properties, not sensitivity knobs, so
 * they are shared: blendshape (−1.7, +0.9 — Y channel is up-positive)
 * and geometry (−3.0, −1.6, image-space). The guided sweep replaces
 * them with learned per-user values when its quality gates pass.
 */
export interface TrackerThresholds {
  eyeClosedEnter: number;
  eyeClosedExit: number;
  gazeDevBlendshapeX: number;
  gazeDevBlendshapeY: number;
  gazeDevGeometryX: number;
  gazeDevGeometryY: number;
}

const SENSITIVITY_THRESHOLDS: Record<Sensitivity, TrackerThresholds> = {
  relaxed: {
    eyeClosedEnter: 0.45,
    eyeClosedExit: 0.6,
    gazeDevBlendshapeX: 0.55,
    gazeDevBlendshapeY: 0.42,
    gazeDevGeometryX: 0.85,
    gazeDevGeometryY: 0.65,
  },
  balanced: {
    eyeClosedEnter: 0.45,
    eyeClosedExit: 0.6,
    gazeDevBlendshapeX: 0.38,
    gazeDevBlendshapeY: 0.28,
    gazeDevGeometryX: 0.65,
    gazeDevGeometryY: 0.5,
  },
  sharp: {
    eyeClosedEnter: 0.4,
    eyeClosedExit: 0.55,
    gazeDevBlendshapeX: 0.26,
    gazeDevBlendshapeY: 0.2,
    gazeDevGeometryX: 0.5,
    gazeDevGeometryY: 0.4,
  },
};

/** Frames a gaze-away must persist before it can switch state
 *  (~3 frames ≈ 0.2–0.4s at typical webcam FPS) */
const GAZE_DWELL_FRAMES = 3;

/** Duration of the guided head-sweep window that learns the user's
 *  eye–head coupling (runs right after the posture baseline). */
const SWEEP_MS = 6000;

export interface TrackerStatus {
  ready: boolean;
  error: string | null;
  loading: boolean;
}

export interface LiveExtras {
  eyeOpenness: number;
  gazeX: number;
  gazeY: number;
  gazeSource: "blendshape" | "geometry";
  /** Iris-geometry channel, for the debug panel */
  gazeGeoX: number;
  gazeGeoY: number;
  yawRatio: number;
  pitchRatio: number;
  facePresent: boolean;
  baselineCaptured: boolean;
  /** Posture baseline captured AND coupling sweep finished — the
   *  signal the session page gates metric recording on. */
  couplingReady: boolean;
  /** The coupling sweep window is active right now (banner prompt) */
  learningCoupling: boolean;
  /** Combined screen-gaze deviation (eye dev minus compensation) */
  combinedX: number;
  combinedY: number;
  /** Signed head deviations from baseline */
  headDevX: number;
  headDevY: number;
  /** Effective coupling slopes for the active gaze source */
  couplingInfo: {
    x: number;
    y: number;
    learnedX: boolean;
    learnedY: boolean;
  };
  fps: number;
  dev: {
    yaw: number;
    pitch: number;
    gaze: number;
    gazeX: number;
    gazeY: number;
  };
  thresholds: ClassifierThresholds;
  firing: FiringCheck;
}

/**
 * LiveAttentionTracker converts FaceLandmarker results into
 * FrameSamples.
 *
 * Attention state comes ONLY from: face presence · eye openness
 * (Schmitt trigger) · head rotation beyond a physical hard cap ·
 * the COMBINED screen-gaze deviation (eye direction minus the
 * eye–head compensation expected while fixating the screen).
 * "Head turned away but eyeballs on screen" cancels to ~0 and stays
 * ON; "head still, eyes away" and "head and eyes turning together"
 * both fire AWAY.
 * Calibration affects NOTHING here — it powers the report's
 * calibration stat only.
 */
export class LiveAttentionTracker {
  private landmarker: FaceLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private rafId = 0;
  private running = false;
  private lastVideoTime = -1;

  // Smoothing — both gaze channels smoothed independently so the
  // active one never mixes scales.
  private smoothEye = 1;
  private smoothYaw = 0;
  private smoothPitch = 0.44;
  private smoothBsX: number | null = null;
  private smoothBsY: number | null = null;
  private smoothGeoX = 0;
  private smoothGeoY = 0;
  private smoothInit = false;

  // Personal baseline (~2.5s), per gaze channel
  baseline: PoseBaseline = { ...DEFAULT_BASELINE };
  private baselineGeo = { x: 0, y: 0 };
  private baselineYawSamples: number[] = [];
  private baselinePitchSamples: number[] = [];
  private baselineBsX: number[] = [];
  private baselineBsY: number[] = [];
  private baselineGeoX: number[] = [];
  private baselineGeoY: number[] = [];
  private baselineCaptured = false;
  private baselineCapturedT = 0;
  private sessionStartT = 0;

  // Eye–head coupling sweep
  private sweepBs: SweepSample[] = [];
  private sweepGeo: SweepSample[] = [];
  private crossBsX: number[] = [];
  private crossBsY: number[] = [];
  private crossGeoX: number[] = [];
  private crossGeoY: number[] = [];
  private coupling: ResolvedCoupling | null = null;
  private couplingResolved = false;

  // Blink counting (raw, for the metric; independent of Schmitt state)
  private eyeWasClosed = false;
  private eyeClosedSince = 0;
  blinkCount = 0;

  // Schmitt state for EYES_CLOSED classification
  private eyesClassifiedClosed = false;

  // State hysteresis
  private pendingState: FrameSample["state"] | null = null;
  private pendingCount = 0;
  private state: FrameSample["state"] = "NO_FACE";
  private lastSwitchT = 0;

  // Gaze dwell: consecutive frames where gaze-dev fires
  private gazeAwayFrames = 0;
  private gazeFiring = false;

  // FPS counter
  private frameTimes: number[] = [];

  sensitivity: Sensitivity = "balanced";
  calibration: CalibrationModel | null = null;
  onSample: ((s: FrameSample, extras: LiveExtras) => void) | null = null;

  async init(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    let lastErr: unknown = null;
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        });
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("Failed to initialize face model");
  }

  async startCamera(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera API unavailable in this browser.");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    if (!this.video) throw new Error("Video element not initialized");
    this.video.srcObject = this.stream;
    await this.video.play();
    return this.stream;
  }

  /** Reset personal-baseline capture + coupling sweep (session start) */
  resetBaseline() {
    this.baselineYawSamples = [];
    this.baselinePitchSamples = [];
    this.baselineBsX = [];
    this.baselineBsY = [];
    this.baselineGeoX = [];
    this.baselineGeoY = [];
    this.baselineCaptured = false;
    this.baselineCapturedT = 0;
    this.baseline = { ...DEFAULT_BASELINE };
    this.baselineGeo = { x: 0, y: 0 };
    this.sweepBs = [];
    this.sweepGeo = [];
    this.crossBsX = [];
    this.crossBsY = [];
    this.crossGeoX = [];
    this.crossGeoY = [];
    this.coupling = null;
    this.couplingResolved = false;
    this.sessionStartT = performance.now();
  }

  setSensitivity(s: Sensitivity) {
    this.sensitivity = s;
  }

  thresholds(): TrackerThresholds {
    return SENSITIVITY_THRESHOLDS[this.sensitivity];
  }

  start() {
    if (!this.landmarker || !this.video) {
      throw new Error("Tracker not initialized");
    }
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  dispose() {
    this.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.landmarker?.close();
    this.landmarker = null;
  }

  private static median(arr: number[]): number {
    const s = [...arr].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  }

  private loop = () => {
    if (!this.running || !this.landmarker || !this.video) return;
    this.rafId = requestAnimationFrame(this.loop);

    const v = this.video;
    if (v.readyState < 2) return;
    if (this.lastVideoTime === v.currentTime) return;
    this.lastVideoTime = v.currentTime;

    let result;
    try {
      result = this.landmarker.detectForVideo(v, performance.now());
    } catch {
      return;
    }
    const t = performance.now();

    const face = result.faceLandmarks?.[0];
    const blend = result.faceBlendshapes?.[0];
    const facePresent = !!face && face.length >= 478;

    this.frameTimes.push(t);
    while (this.frameTimes.length > 60) this.frameTimes.shift();
    const fps =
      this.frameTimes.length > 1
        ? (this.frameTimes.length - 1) / ((t - this.frameTimes[0]) / 1000)
        : 0;

    let eyeOpenness = 0;
    let yawRatio = 0;
    let pitchRatio = 0.44;
    let gazeGeoX = 0;
    let gazeGeoY = 0;
    let bsRawX: number | null = null;
    let bsRawY: number | null = null;

    if (facePresent && face) {
      const cats = blend?.categories ?? [];
      const blinkScore = Math.max(
        ...cats
          .filter(
            (c) =>
              c.categoryName === "eyeBlinkLeft" ||
              c.categoryName === "eyeBlinkRight"
          )
          .map((c) => c.score),
        0
      );
      const feats = extractFeatures(face, blinkScore);
      eyeOpenness = feats.eyeOpenness;
      yawRatio = feats.yawRatio;
      pitchRatio = feats.pitchRatio;
      gazeGeoX = feats.gazeX;
      gazeGeoY = feats.gazeY;

      const bg = gazeFromBlendshapes(cats);
      if (bg) {
        bsRawX = bg.x;
        bsRawY = bg.y;
      }
    }

    if (
      !isFinite(eyeOpenness) || !isFinite(yawRatio) ||
      !isFinite(pitchRatio) || !isFinite(gazeGeoX) || !isFinite(gazeGeoY) ||
      (bsRawX !== null && (!isFinite(bsRawX) || !isFinite(bsRawY ?? NaN)))
    ) {
      return;
    }

    // Smoothing — heavier on gaze (suppresses reading saccades). Both
    // channels are smoothed independently; the active one never mixes
    // blendshape and geometry scales.
    if (!this.smoothInit || !facePresent) {
      this.smoothEye = eyeOpenness;
      this.smoothYaw = yawRatio;
      this.smoothPitch = pitchRatio;
      this.smoothGeoX = gazeGeoX;
      this.smoothGeoY = gazeGeoY;
      this.smoothBsX = bsRawX;
      this.smoothBsY = bsRawY;
      this.smoothInit = true;
    } else {
      const a = 0.35;
      this.smoothEye = a * eyeOpenness + (1 - a) * this.smoothEye;
      this.smoothYaw = a * yawRatio + (1 - a) * this.smoothYaw;
      this.smoothPitch = a * pitchRatio + (1 - a) * this.smoothPitch;
      this.smoothGeoX = a * gazeGeoX + (1 - a) * this.smoothGeoX;
      this.smoothGeoY = a * gazeGeoY + (1 - a) * this.smoothGeoY;
      if (bsRawX !== null && bsRawY !== null) {
        this.smoothBsX =
          this.smoothBsX === null
            ? bsRawX
            : a * bsRawX + (1 - a) * (this.smoothBsX as number);
        this.smoothBsY =
          this.smoothBsY === null
            ? bsRawY
            : a * bsRawY + (1 - a) * (this.smoothBsY as number);
      }
    }

    // Active gaze channel: blendshape when its smoothed values exist,
    // else iris geometry. Stable across single-frame dropouts.
    const useBs = this.smoothBsX !== null && this.smoothBsY !== null;
    const gazeSource: "blendshape" | "geometry" = useBs ? "blendshape" : "geometry";
    const gazeX = useBs ? (this.smoothBsX as number) : this.smoothGeoX;
    const gazeY = useBs ? (this.smoothBsY as number) : this.smoothGeoY;

    // Personal posture baseline (~2.5s of face-present frames),
    // captured per gaze channel.
    if (facePresent && !this.baselineCaptured) {
      this.baselineYawSamples.push(this.smoothYaw);
      this.baselinePitchSamples.push(this.smoothPitch);
      this.baselineGeoX.push(this.smoothGeoX);
      this.baselineGeoY.push(this.smoothGeoY);
      if (this.smoothBsX !== null && this.smoothBsY !== null) {
        this.baselineBsX.push(this.smoothBsX);
        this.baselineBsY.push(this.smoothBsY);
      }
      const elapsedMs = t - this.sessionStartT;
      if (
        this.baselineYawSamples.length >= 60 &&
        elapsedMs >= 2500
      ) {
        // Active-channel baseline: blendshape when it had enough
        // samples, else geometry (mirrors the active-source pick).
        const bsEnough = this.baselineBsX.length >= 30;
        this.baseline = {
          yawRatio: LiveAttentionTracker.median(this.baselineYawSamples),
          pitchRatio: LiveAttentionTracker.median(this.baselinePitchSamples),
          gazeX: bsEnough
            ? LiveAttentionTracker.median(this.baselineBsX)
            : LiveAttentionTracker.median(this.baselineGeoX),
          gazeY: bsEnough
            ? LiveAttentionTracker.median(this.baselineBsY)
            : LiveAttentionTracker.median(this.baselineGeoY),
        };
        this.baselineGeo = {
          x: LiveAttentionTracker.median(this.baselineGeoX),
          y: LiveAttentionTracker.median(this.baselineGeoY),
        };
        this.baselineCaptured = true;
        this.baselineCapturedT = t;
      }
    }

    // Eye–head coupling sweep: right after the baseline, collect
    // (head dev, eye dev) pairs per channel while the UI prompts the
    // user to slowly turn their head with eyes kept on the screen.
    if (
      facePresent &&
      this.baselineCaptured &&
      !this.couplingResolved &&
      t - this.baselineCapturedT < SWEEP_MS &&
      this.smoothEye > SENSITIVITY_THRESHOLDS[this.sensitivity].eyeClosedEnter
    ) {
      const headX = this.smoothYaw - this.baseline.yawRatio;
      const headY = this.smoothPitch - this.baseline.pitchRatio;
      this.sweepGeo.push({
        headX,
        headY,
        eyeX: this.smoothGeoX - this.baselineGeo.x,
        eyeY: this.smoothGeoY - this.baselineGeo.y,
      });
      if (this.smoothBsX !== null && this.smoothBsY !== null) {
        this.sweepBs.push({
          headX,
          headY,
          eyeX: (this.smoothBsX as number) - this.baseline.gazeX,
          eyeY: (this.smoothBsY as number) - this.baseline.gazeY,
        });
        // Same-frame parallel channel values for the sign cross-check
        this.crossBsX.push(this.smoothBsX as number);
        this.crossBsY.push(this.smoothBsY as number);
        this.crossGeoX.push(this.smoothGeoX);
        this.crossGeoY.push(this.smoothGeoY);
      }
    }

    // Sweep window over → resolve learned coupling (gates fall back
    // to structurally-correct defaults when the sweep was unusable).
    if (
      this.baselineCaptured &&
      !this.couplingResolved &&
      t - this.baselineCapturedT >= SWEEP_MS
    ) {
      this.coupling = resolveCoupling({
        bsSweep: this.sweepBs,
        geoSweep: this.sweepGeo,
        bsGazeX: this.crossBsX,
        geoGazeX: this.crossGeoX,
        bsGazeY: this.crossBsY,
        geoGazeY: this.crossGeoY,
      });
      this.couplingResolved = true;
    }

    // Blink counting (raw)
    const closedNow = eyeOpenness < this.thresholds().eyeClosedEnter;
    if (closedNow && !this.eyeWasClosed) {
      this.eyeClosedSince = t;
    } else if (!closedNow && this.eyeWasClosed) {
      if (t - this.eyeClosedSince < 250) this.blinkCount++;
    }
    this.eyeWasClosed = closedNow;

    // Per-source, per-axis gaze thresholds + effective coupling
    const th = this.thresholds();
    const gazeThresholds =
      gazeSource === "blendshape"
        ? {
            gazeDevX: th.gazeDevBlendshapeX,
            gazeDevY: th.gazeDevBlendshapeY,
          }
        : {
            gazeDevX: th.gazeDevGeometryX,
            gazeDevY: th.gazeDevGeometryY,
          };
    const defaultCoup =
      gazeSource === "blendshape"
        ? DEFAULT_COUPLING.blendshape
        : DEFAULT_COUPLING.geometry;
    const learnedCoup =
      gazeSource === "blendshape" ? this.coupling?.bs : this.coupling?.geo;
    const couplingX = learnedCoup ? learnedCoup.x.value : defaultCoup.x;
    const couplingY = learnedCoup ? learnedCoup.y.value : defaultCoup.y;
    const couplingLearnedX = learnedCoup ? learnedCoup.x.learned : false;
    const couplingLearnedY = learnedCoup ? learnedCoup.y.learned : false;

    const fullThresholds: ClassifierThresholds = {
      eyeClosedEnter: th.eyeClosedEnter,
      eyeClosedExit: th.eyeClosedExit,
      couplingX,
      couplingY,
      yawHardCap: YAW_HARD_CAP,
      pitchHardCap: PITCH_HARD_CAP,
      gazeDevX: gazeThresholds.gazeDevX,
      gazeDevY: gazeThresholds.gazeDevY,
    };

    // Classify (Schmitt state passed for eye-closure hysteresis)
    const { state, confidence, firing } = classifyFrame(
      {
        facePresent,
        eyeOpenness: this.smoothEye,
        yawRatio: this.smoothYaw,
        pitchRatio: this.smoothPitch,
        gazeX,
        gazeY,
        gazeSource,
      },
      this.baseline,
      fullThresholds,
      this.eyesClassifiedClosed
    );

    // Track Schmitt state for eyes
    this.eyesClassifiedClosed = state === "EYES_CLOSED";

    // Gaze dwell: only let the gaze check switch state after
    // GAZE_DWELL_FRAMES consecutive firing frames
    let effectiveState = state;
    let effectiveFiring = firing;
    if (firing === "gaze") {
      this.gazeAwayFrames++;
      if (this.gazeAwayFrames < GAZE_DWELL_FRAMES) {
        // Not yet sustained — treat as ON for now (if otherwise fine)
        effectiveState = this.state === "EYES_CLOSED" ? "EYES_CLOSED" : "ON";
        effectiveFiring = "none";
      } else {
        this.gazeFiring = true;
      }
    } else {
      this.gazeAwayFrames = 0;
      this.gazeFiring = false;
    }

    // Hysteresis on the final state
    const finalState = effectiveState;
    if (finalState !== this.state) {
      if (this.pendingState === finalState) {
        this.pendingCount++;
      } else {
        this.pendingState = finalState;
        this.pendingCount = 1;
      }
      if (this.pendingCount >= 3 && t - this.lastSwitchT > 150) {
        this.state = finalState;
        this.lastSwitchT = t;
        this.pendingState = null;
        this.pendingCount = 0;
      }
    } else {
      this.pendingState = null;
      this.pendingCount = 0;
    }

    const headDevX = this.smoothYaw - this.baseline.yawRatio;
    const headDevY = this.smoothPitch - this.baseline.pitchRatio;
    const combinedX = gazeX - this.baseline.gazeX - couplingX * headDevX;
    const combinedY = gazeY - this.baseline.gazeY - couplingY * headDevY;

    const dev = {
      yaw: Math.abs(headDevX),
      pitch: Math.abs(headDevY),
      gaze: Math.max(Math.abs(combinedX), Math.abs(combinedY)),
      gazeX: Math.abs(combinedX),
      gazeY: Math.abs(combinedY),
    };

    const sample: FrameSample = { t, state: this.state, confidence };
    this.onSample?.(sample, {
      eyeOpenness: this.smoothEye,
      gazeX,
      gazeY,
      gazeSource,
      gazeGeoX,
      gazeGeoY,
      yawRatio: this.smoothYaw,
      pitchRatio: this.smoothPitch,
      facePresent,
      baselineCaptured: this.baselineCaptured,
      couplingReady: this.baselineCaptured && this.couplingResolved,
      learningCoupling:
        this.baselineCaptured &&
        !this.couplingResolved &&
        t - this.baselineCapturedT < SWEEP_MS,
      combinedX,
      combinedY,
      headDevX,
      headDevY,
      couplingInfo: {
        x: couplingX,
        y: couplingY,
        learnedX: couplingLearnedX,
        learnedY: couplingLearnedY,
      },
      fps,
      dev,
      thresholds: fullThresholds,
      firing: effectiveFiring,
    });
  };
}
