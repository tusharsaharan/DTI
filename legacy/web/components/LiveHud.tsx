"use client";

import { useState } from "react";
import { LiveExtras, Sensitivity } from "@/lib/tracker";
import { AttentionState, STATE_META } from "@/lib/types";
import { fmtDuration, fmtPct } from "@/lib/metrics";

const SENSITIVITIES: { key: Sensitivity; label: string; hint: string }[] = [
  { key: "relaxed", label: "Relaxed", hint: "only big moves count as away" },
  { key: "balanced", label: "Balanced", hint: "default" },
  { key: "sharp", label: "Sharp", hint: "catches subtle look-aways" },
];

export default function LiveHud({
  elapsed,
  state,
  confidence,
  extras,
  metrics,
  onEnd,
  sensitivity,
  onSensitivityChange,
}: {
  elapsed: number;
  state: AttentionState;
  confidence: number;
  extras: LiveExtras | null;
  metrics: {
    attentionMs: number;
    screenOnMs: number;
    glanceCount: number;
    distractionCount: number;
  };
  onEnd: () => void;
  sensitivity: Sensitivity;
  onSensitivityChange: (s: Sensitivity) => void;
}) {
  const [showDebug, setShowDebug] = useState(false);
  const attPct =
    metrics.screenOnMs > 0 ? metrics.attentionMs / metrics.screenOnMs : 0;
  const meta = STATE_META[state];

  return (
    <div className="sticky top-20 z-30 mb-6">
      <div className="card p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <div className="col-span-2 sm:col-span-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Status
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: meta.color, boxShadow: `0 0 12px ${meta.color}` }}
              />
              <span className="font-semibold" style={{ color: meta.color }}>
                {meta.label}
              </span>
            </div>
            {extras && !extras.baselineCaptured && extras.facePresent && (
              <p className="mt-0.5 text-[10px] text-cyan-400/80">
                learning your pose…
              </p>
            )}
            {extras && extras.learningCoupling && (
              <p className="mt-0.5 text-[10px] text-cyan-400/80">
                learning your eye–head coupling…
              </p>
            )}
            {extras && !extras.facePresent && (
              <p className="mt-0.5 text-[10px] text-red-400/80">
                no face detected
              </p>
            )}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Elapsed
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-slate-100">
              {fmtDuration(elapsed)}
            </p>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Phone says
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-slate-400">
              {fmtDuration(elapsed)}
            </p>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Real attention
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-cyan-300">
              {fmtDuration(metrics.attentionMs)}
            </p>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Attention
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-emerald-300">
              {fmtPct(attPct)}
            </p>
          </div>

          <div className="col-span-2 flex items-end justify-between gap-4 sm:col-span-1">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Glances
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-amber-300">
                {metrics.glanceCount}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Distract
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-violet-300">
                {metrics.distractionCount}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-700"
            style={{ width: `${attPct * 100}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={onEnd} className="btn-primary !px-4 !py-2 text-sm">
            End session & see report
          </button>

          <div className="flex overflow-hidden rounded-xl border border-white/15">
            {SENSITIVITIES.map((s) => (
              <button
                key={s.key}
                title={s.hint}
                onClick={() => onSensitivityChange(s.key)}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  sensitivity === s.key
                    ? "bg-cyan-500 text-ink-950"
                    : "text-slate-400 hover:bg-white/5"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowDebug(!showDebug)}
            className="text-xs text-slate-500 underline hover:text-slate-300"
          >
            {showDebug ? "Hide signals" : "Show signals"}
          </button>
        </div>

        {showDebug && extras && (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-[11px] text-slate-300">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-slate-500">firing:</span>
              <span
                className={`chip ${
                  extras.firing === "none"
                    ? "border-emerald-500/40 text-emerald-300"
                    : extras.firing === "no_face"
                      ? "border-red-500/40 text-red-300"
                      : "border-amber-500/40 text-amber-300"
                }`}
              >
                {extras.firing === "none"
                  ? "— nothing (attentive) —"
                  : extras.firing === "blink"
                    ? "BLINK / eyes closed"
                    : extras.firing === "yaw"
                      ? "HEAD YAW (turned too far to fixate)"
                      : extras.firing === "pitch"
                        ? "HEAD PITCH (tilted too far to fixate)"
                        : extras.firing === "gaze"
                          ? "EYES OFF SCREEN (combined gaze)"
                          : "NO FACE"}
              </span>
              <span className="text-slate-600">
                gaze src: {extras.gazeSource}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <DebugVal
                label={`comb X dev / ${extras.thresholds.gazeDevX.toFixed(2)}`}
                value={extras.dev.gazeX}
                warnAbs={extras.thresholds.gazeDevX}
              />
              <DebugVal
                label={`comb Y dev / ${extras.thresholds.gazeDevY.toFixed(2)}`}
                value={extras.dev.gazeY}
                warnAbs={extras.thresholds.gazeDevY}
              />
              <DebugVal
                label={`head yaw dev / cap ${extras.thresholds.yawHardCap.toFixed(2)}`}
                value={extras.dev.yaw}
                warnAbs={extras.thresholds.yawHardCap}
              />
              <DebugVal
                label={`head pitch dev / cap ${extras.thresholds.pitchHardCap.toFixed(2)}`}
                value={extras.dev.pitch}
                warnAbs={extras.thresholds.pitchHardCap}
              />
              <DebugVal
                label={`eye open / enter ${extras.thresholds.eyeClosedEnter.toFixed(2)} exit ${extras.thresholds.eyeClosedExit.toFixed(2)}`}
                value={extras.eyeOpenness}
                warnBelow={extras.thresholds.eyeClosedEnter}
              />
              <DebugVal label="comb X (signed)" value={extras.combinedX} />
              <DebugVal label="comb Y (signed)" value={extras.combinedY} />
              <DebugVal label="head yaw dev (signed)" value={extras.headDevX} />
              <div>
                <p className="text-slate-500">coupling sX</p>
                <p className="text-slate-300">
                  {extras.couplingInfo.x.toFixed(2)}
                  {extras.couplingInfo.learnedX ? " *" : ""}
                </p>
              </div>
              <div>
                <p className="text-slate-500">coupling sY</p>
                <p className="text-slate-300">
                  {extras.couplingInfo.y.toFixed(2)}
                  {extras.couplingInfo.learnedY ? " *" : ""}
                </p>
              </div>
              <DebugVal label="gaze X (active)" value={extras.gazeX} />
              <DebugVal label="gaze Y (active)" value={extras.gazeY} />
              <DebugVal label="gaze X (iris)" value={extras.gazeGeoX} />
              <DebugVal label="gaze Y (iris)" value={extras.gazeGeoY} />
              <DebugVal label="conf" value={confidence} />
              <DebugVal label="fps" value={extras.fps} warnBelow={10} />
              <div>
                <p className="text-slate-500">baseline</p>
                <p className={extras.baselineCaptured ? "text-emerald-400" : "text-amber-400"}>
                  {extras.baselineCaptured ? "captured" : "learning…"}
                </p>
              </div>
              <div>
                <p className="text-slate-500">face</p>
                <p className={extras.facePresent ? "text-emerald-400" : "text-red-400"}>
                  {extras.facePresent ? "yes" : "NO"}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-slate-600">
              comb = eye dev − coupling · head dev (eye–head compensation
              cancelled; * = learned from your head sweep). Head caps are
              physical limits beyond which the eyes cannot reach the screen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DebugVal({
  label,
  value,
  warnAbs,
  warnBelow,
  warnAbsDev,
  base,
}: {
  label: string;
  value: number;
  warnAbs?: number;
  warnBelow?: number;
  warnAbsDev?: number;
  base?: number;
}) {
  let bad = false;
  if (warnAbs !== undefined) bad = Math.abs(value) > warnAbs;
  if (warnBelow !== undefined) bad = value < warnBelow;
  if (warnAbsDev !== undefined && base !== undefined)
    bad = Math.abs(value - base) > warnAbsDev;
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className={bad ? "text-red-400" : "text-emerald-400"}>
        {Number.isFinite(value) ? value.toFixed(3) : "—"}
      </p>
    </div>
  );
}
