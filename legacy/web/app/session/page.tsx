"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LiveAttentionTracker, LiveExtras, Sensitivity } from "@/lib/tracker";
import { CalibrationModel, fitCalibration, CalibrationObservation, isValidCalibrationModel } from "@/lib/calibration";
import { computeMetrics, fmtDuration, fmtPct, toEpisodes } from "@/lib/metrics";
import { AttentionState, FrameSample, GLANCE_MS, STATE_META } from "@/lib/types";
import { saveSession } from "@/lib/client-storage";
import ArticleContent from "@/components/ArticleContent";
import CalibrationOverlay from "@/components/CalibrationOverlay";
import LiveHud from "@/components/LiveHud";
import SessionComplete from "@/components/SessionComplete";

type Phase = "consent" | "loading" | "calibrating" | "running" | "saving" | "done";

const CALIBRATION_STORAGE_KEY = "ta_calibration_v2";
const SESSION_TYPE = "reading";
const MIN_SESSION_MS = 30 * 1000;
const MAX_SESSION_MS = 30 * 60 * 1000;

export default function SessionPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackerRef = useRef<LiveAttentionTracker | null>(null);
  const samplesRef = useRef<FrameSample[]>([]);
  const startedAtRef = useRef(0);
  const blinkCountRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("consent");
  const [error, setError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<AttentionState>("NO_FACE");
  const [liveConf, setLiveConf] = useState(0);
  const [liveExtras, setLiveExtras] = useState<LiveExtras | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [liveMetrics, setLiveMetrics] = useState({
    attentionMs: 0,
    screenOnMs: 0,
    glanceCount: 0,
    distractionCount: 0,
  });
  const [hasCalibration, setHasCalibration] = useState(false);
  const [savedInfo, setSavedInfo] = useState<{ shareId: string; saved: "server" | "local" } | null>(null);
  const [sensitivity, setSensitivity] = useState<Sensitivity>("balanced");

  // Restore calibration from localStorage (schema-validated: stale
  // models from older feature scales are ignored automatically)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
      if (raw && isValidCalibrationModel(JSON.parse(raw))) {
        setHasCalibration(true);
      }
    } catch {}
  }, []);

  const handleConsent = async () => {
    setError(null);
    setPhase("loading");
    try {
      const tracker = new LiveAttentionTracker();
      if (!videoRef.current) throw new Error("Video element missing");
      await tracker.init(videoRef.current);
      await tracker.startCamera();
      trackerRef.current = tracker;

      // wire sample handler — records only once the personal baseline
      // AND eye–head coupling are captured, so the learning windows
      // never pollute metrics
      tracker.onSample = (s, extras) => {
        if (phaseRef.current !== "running") return;
        if (!extras.couplingReady) {
          setLiveState(s.state);
          setLiveConf(s.confidence);
          setLiveExtras(extras);
          return;
        }
        samplesRef.current.push(s);
        if (samplesRef.current.length > 40000) {
          samplesRef.current = samplesRef.current.slice(-40000);
        }
        setLiveState(s.state);
        setLiveConf(s.confidence);
        setLiveExtras(extras);
      };

      const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
      const model = raw ? JSON.parse(raw) : null;
      if (hasCalibration && isValidCalibrationModel(model)) {
        tracker.calibration = model;
        beginRunning();
      } else {
        setPhase("calibrating");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /permission|denied|NotAllowed/i.test(msg)
          ? "Camera permission was denied. Enable it in your browser's address-bar camera icon, then try again."
          : msg
      );
      setPhase("consent");
    }
  };

  const phaseRef = useRef<Phase>("consent");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const beginRunning = () => {
    samplesRef.current = [];
    startedAtRef.current = performance.now();
    blinkCountRef.current = 0;
    setElapsed(0);
    setLiveMetrics({ attentionMs: 0, screenOnMs: 0, glanceCount: 0, distractionCount: 0 });
    setPhase("running");
    trackerRef.current?.resetBaseline();
    trackerRef.current?.setSensitivity(sensitivity);
    trackerRef.current?.start();
  };

  const changeSensitivity = (s: Sensitivity) => {
    setSensitivity(s);
    trackerRef.current?.setSensitivity(s);
  };

  // Elapsed ticker + live metrics recompute (cheap: every 1s)
  useEffect(() => {
    if (phase !== "running") return;
    const iv = setInterval(() => {
      const t = performance.now() - startedAtRef.current;
      setElapsed(t);
      if (t >= MAX_SESSION_MS) {
        endSession();
        return;
      }
      if (samplesRef.current.length === 0) {
        // still learning baseline — zero everything so far
        setLiveMetrics({ attentionMs: 0, screenOnMs: 0, glanceCount: 0, distractionCount: 0 });
        return;
      }
      const lastT = samplesRef.current[samplesRef.current.length - 1]?.t ?? 0;
      const episodes = toEpisodes(samplesRef.current);
      const m = computeMetrics(episodes, blinkCountRef.current, lastT);
      setLiveMetrics({
        attentionMs: m.attentionMs,
        screenOnMs: m.screenOnMs,
        glanceCount: m.glanceCount,
        distractionCount: m.distractionCount,
      });
      blinkCountRef.current = trackerRef.current?.blinkCount ?? 0;
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const calibrationDone = (model: CalibrationModel | null) => {
    if (model) {
      trackerRef.current!.calibration = model;
      try {
        localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(model));
      } catch {}
      setHasCalibration(true);
      beginRunning();
    } else {
      // skipped calibration — run in head-pose-only mode
      beginRunning();
    }
  };

  const endSession = async () => {
    const tracker = trackerRef.current;
    tracker?.stop();
    setPhase("saving");
    try {
      // Session duration = first→last recorded sample (excludes the
      // baseline-learning window, which records no samples)
      const samples = samplesRef.current;
      const firstT = samples[0]?.t ?? 0;
      const lastT = samples[samples.length - 1]?.t ?? 0;
      const t = Math.max(0, lastT - firstT);
      const episodes = toEpisodes(samples);
      const m = computeMetrics(episodes, tracker?.blinkCount ?? 0, t);

      if (t < MIN_SESSION_MS) {
        setError("Session too short to save. Try at least 30 seconds (after the ~3s posture learning).");
        setPhase("running");
        tracker?.start();
        return;
      }

      const minuteBuckets = buildMinuteBuckets(m.episodes);
      const result = await saveSession({
        type: SESSION_TYPE,
        startedAt: Date.now() - t,
        endedAt: Date.now(),
        screenOnSec: m.screenOnMs / 1000,
        attentionSec: m.attentionMs / 1000,
        glanceSec: m.glanceMs / 1000,
        attentionRatio: m.attentionRatio,
        focusScore: m.focusScore,
        blinkCount: m.blinkCount,
        glanceCount: m.glanceCount,
        distractionCount: m.distractionCount,
        longestStreakSec: m.longestAttentionStreakMs / 1000,
        minuteBuckets,
        episodes: m.episodes,
        calibration: tracker?.calibration
          ? { version: tracker.calibration.schema, quality: tracker.calibration.quality }
          : undefined,
        deviceLabel: getDeviceLabel(),
      });
      setSavedInfo({ shareId: result.shareId ?? "", saved: result.saved });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("running");
    }
  };

  const cleanup = () => {
    trackerRef.current?.dispose();
    trackerRef.current = null;
  };
  useEffect(() => cleanup, []);

  const learning = phase === "running" && liveExtras && !liveExtras.couplingReady;
  const dim = phase === "running" && liveState !== "ON" && !learning;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Hidden video + tracker */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
        autoPlay
      />

      {phase === "consent" && (
        <ConsentScreen error={error} onStart={handleConsent} hasCalibration={hasCalibration} />
      )}

      {phase === "loading" && (
        <div className="mx-auto mt-24 max-w-md text-center">
          <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <h2 className="text-xl font-semibold text-slate-200">
            Loading attention engine…
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Downloading the on-device face mesh model (3.6 MB, self-hosted) and
            starting your camera. Nothing is uploaded.
          </p>
          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
      )}

      {phase === "calibrating" && trackerRef.current && (
        <CalibrationOverlay
          tracker={trackerRef.current}
          onComplete={calibrationDone}
        />
      )}

      {phase === "running" && (
        <div className="relative">
          {/* Dim overlay when not attentive */}
          <div
            className={`pointer-events-none fixed inset-0 z-40 bg-ink-950 transition-opacity duration-300 ${
              dim ? "opacity-70" : "opacity-0"
            }`}
          />
          <div
            className={`fixed left-1/2 top-20 z-50 -translate-x-1/2 transition-opacity duration-300 ${
              dim ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <div className="card px-6 py-4 text-center shadow-2xl">
              <p className="text-lg font-bold" style={{ color: STATE_META[liveState].color }}>
                {STATE_META[liveState].label}
              </p>
              <p className="text-xs text-slate-400">{STATE_META[liveState].description}</p>
            </div>
          </div>

          {/* Learning banners: posture baseline, then coupling sweep */}
          {learning && liveExtras && !liveExtras.baselineCaptured && (
            <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2">
              <div className="card border-cyan-500/40 px-6 py-4 text-center shadow-2xl">
                <p className="font-bold text-cyan-300">
                  Look at the screen naturally — learning your posture…
                </p>
                <p className="text-xs text-slate-400">
                  Sit the way you&apos;ll sit for the session (~3 seconds)
                </p>
              </div>
            </div>
          )}
          {learning && liveExtras?.learningCoupling && (
            <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2">
              <div className="card border-cyan-500/40 px-6 py-4 text-center shadow-2xl">
                <p className="font-bold text-cyan-300">
                  Learning your eye–head coupling — slowly turn your head
                  left, then right, then nod once.
                </p>
                <p className="text-xs text-slate-400">
                  Keep your <strong>eyes glued to this dot</strong> the whole
                  time (~6 seconds) — this teaches the tracker how your eyes
                  compensate when your head moves.
                </p>
              </div>
            </div>
          )}

          <LiveHud
            elapsed={elapsed}
            state={liveState}
            confidence={liveConf}
            extras={liveExtras}
            metrics={liveMetrics}
            onEnd={endSession}
            sensitivity={sensitivity}
            onSensitivityChange={changeSensitivity}
          />
          <ArticleContent />
        </div>
      )}

      {phase === "saving" && (
        <div className="mx-auto mt-24 max-w-md text-center">
          <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <p className="text-slate-300">Compiling your attention report…</p>
        </div>
      )}

      {phase === "done" && savedInfo && (
        <SessionComplete
          shareId={savedInfo.shareId}
          savedTo={savedInfo.saved}
          onNewSession={() => {
            setSavedInfo(null);
            setError(null);
            setPhase("consent");
            cleanup();
          }}
        />
      )}
    </div>
  );
}

function buildMinuteBuckets(episodes: { state: string; start: number; durationMs: number }[]) {
  const map = new Map<number, { onSec: number; attnSec: number }>();
  for (const e of episodes) {
    const min = Math.floor(e.start / 60000);
    const b = map.get(min) ?? { onSec: 0, attnSec: 0 };
    const sec = e.durationMs / 1000;
    b.onSec += sec;
    if (e.state === "ON" && e.durationMs >= GLANCE_MS) b.attnSec += sec;
    map.set(min, b);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([min, v]) => ({ min, ...v }));
}

function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  return "Unknown";
}

function ConsentScreen({
  error,
  onStart,
  hasCalibration,
}: {
  error: string | null;
  onStart: () => void;
  hasCalibration: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="card p-8">
        <h1 className="text-2xl font-bold text-slate-100">
          Start a Focus Session
        </h1>
        <p className="mt-3 text-slate-400">
          Read the article below while TrueAttention watches your eyes (on your
          device only). We&apos;ll compare what your screen-time report{" "}
          <em>would say</em> against what you actually paid attention to.
        </p>

        <ul className="mt-6 space-y-3 text-sm text-slate-300">
          <li className="flex gap-3">
            <Check /> Camera video is processed entirely in your browser —
            frames never leave your device.
          </li>
          <li className="flex gap-3">
            <Check /> Only anonymous numbers (attention seconds, glance
            counts) are saved.
          </li>
          <li className="flex gap-3">
            <Check /> {hasCalibration
              ? "You have a saved calibration — you'll go straight into the session. Look at the camera position you used last time."
              : "First run: a 30-second 9-point calibration teaches the tracker where your screen is."}
          </li>
          <li className="flex gap-3">
            <Check /> Best in normal indoor lighting. Glasses are fine.
          </li>
        </ul>

        {error && (
          <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <button className="btn-primary mt-8 w-full" onClick={onStart}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 10l4.55-2.27v8.54L15 14M3 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
          </svg>
          Enable camera & begin
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">
          You can revoke camera access anytime via the camera icon in the
          address bar.
        </p>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg className="mt-0.5 shrink-0 text-cyan-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
