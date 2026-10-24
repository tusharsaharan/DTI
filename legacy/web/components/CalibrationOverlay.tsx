"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LiveAttentionTracker, LiveExtras } from "@/lib/tracker";
import {
  CalibrationModel,
  CalibrationObservation,
  fitCalibration,
} from "@/lib/calibration";

const POINTS = 9;
const TARGET_MS = 1200; // dwell time per point
const COLLECT_INTERVAL_MS = 60; // sample every 60ms while dwelling

/**
 * 9-point calibration overlay. A dot moves to each corner/mid/center;
 * user follows it with their eyes; we collect feature rows and fit the
 * least-squares gaze mapping.
 *
 * Tracker must be initialized with camera already running; we subscribe
 * to its onSample stream while active.
 */
export default function CalibrationOverlay({
  tracker,
  onComplete,
}: {
  tracker: LiveAttentionTracker;
  onComplete: (model: CalibrationModel | null) => void;
}) {
  const [idx, setIdx] = useState(-1); // -1 = intro
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const obsRef = useRef<CalibrationObservation[]>([]);
  const extrasRef = useRef<LiveExtras | null>(null);
  const collectingRef = useRef(false);
  const [quality, setQuality] = useState<number | null>(null);

  // Screen coords of the 9 targets (percentages)
  const targets = useMemo(
    () => [
      { x: 10, y: 12 }, { x: 50, y: 10 }, { x: 90, y: 12 },
      { x: 8, y: 50 }, { x: 50, y: 50 }, { x: 92, y: 50 },
      { x: 10, y: 88 }, { x: 50, y: 92 }, { x: 90, y: 88 },
    ],
    []
  );

  // Subscribe to tracker samples to keep extrasRef fresh
  useEffect(() => {
    const prev = tracker.onSample;
    tracker.onSample = (s, extras) => {
      prev?.(s, extras);
      extrasRef.current = extras;
    };
    return () => {
      tracker.onSample = prev;
    };
  }, [tracker]);

  // Collect samples while a point is active
  useEffect(() => {
    if (idx < 0 || idx >= POINTS) return;
    const target = targets[idx];
    const px = (target.x / 100) * window.innerWidth;
    const py = (target.y / 100) * window.innerHeight;

    let elapsed = 0;
    collectingRef.current = true;
    const iv = setInterval(() => {
      const ex = extrasRef.current;
      if (ex?.facePresent) {
        obsRef.current.push({
          headYaw: ex.yawRatio,
          headPitch: ex.pitchRatio,
          gazeX: ex.gazeX,
          gazeY: ex.gazeY,
          screenX: px,
          screenY: py,
        });
      }
      elapsed += COLLECT_INTERVAL_MS;
      setProgress(Math.min(1, elapsed / TARGET_MS));
      if (elapsed >= TARGET_MS) {
        clearInterval(iv);
        collectingRef.current = false;
        if (idx + 1 >= POINTS) {
          finish();
        } else {
          setIdx(idx + 1);
          setProgress(0);
        }
      }
    }, COLLECT_INTERVAL_MS);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const finish = () => {
    setStatus("Fitting calibration…");
    const obs = obsRef.current.filter((o) => Number.isFinite(o.headYaw));
    if (obs.length < 18) {
      // Not enough data — proceed without calibration (head-pose only)
      onComplete(null);
      return;
    }
    const model = fitCalibration(obs, window.innerWidth, window.innerHeight);
    setQuality(model.quality);
    setStatus(
      `Calibration done — quality ${(model.quality * 100).toFixed(0)}%.`
    );
    setTimeout(() => onComplete(model), 600);
  };

  if (idx === -1) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-950/95 p-4">
        <div className="card max-w-md p-8 text-center">
          <h2 className="text-xl font-bold text-slate-100">
            Eye calibration
          </h2>
          <p className="mt-3 text-sm text-slate-400">
            A dot will appear at 9 positions. Keep your head comfortable and
            still — follow the dot with your <strong>eyes only</strong>. Takes
            about 30 seconds.
          </p>
          <button
            className="btn-primary mt-6 w-full"
            onClick={() => {
              tracker.resetBaseline();
              setIdx(0);
              tracker.start();
            }}
          >
            Start calibration
          </button>
          <button
            className="mt-3 w-full text-sm text-slate-500 underline hover:text-slate-300"
            onClick={() => onComplete(null)}
          >
            Skip (less accurate head-pose-only mode)
          </button>
        </div>
      </div>
    );
  }

  const target = targets[Math.min(idx, POINTS - 1)];
  return (
    <div className="fixed inset-0 z-[60] bg-ink-950/95">
      {/* Progress dots */}
      <div className="absolute left-1/2 top-8 z-10 flex -translate-x-1/2 gap-2">
        {targets.map((_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full transition ${
              i < idx ? "bg-cyan-400" : i === idx ? "bg-cyan-300 scale-125" : "bg-white/20"
            }`}
          />
        ))}
      </div>
      <div className="absolute left-1/2 top-14 z-10 -translate-x-1/2 text-sm text-slate-400">
        {status || "Follow the dot with your eyes — head still"}
      </div>

      {/* Target */}
      <div
        className="absolute transition-all duration-500"
        style={{
          left: `${target.x}%`,
          top: `${target.y}%`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div className="relative grid h-16 w-16 place-items-center">
          <span className="absolute h-16 w-16 animate-ping rounded-full bg-cyan-500/20" />
          <span className="h-4 w-4 rounded-full bg-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.9)]" />
        </div>
        {/* Progress ring */}
        <svg className="absolute inset-0 -rotate-90" width="64" height="64">
          <circle
            cx="32" cy="32" r="29"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="2" fill="none"
          />
          <circle
            cx="32" cy="32" r="29"
            stroke="#22d3ee"
            strokeWidth="2" fill="none"
            strokeDasharray={2 * Math.PI * 29}
            strokeDashoffset={2 * Math.PI * 29 * (1 - progress)}
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
