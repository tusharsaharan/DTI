"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import { LocalSession } from "@/lib/client-storage";
import { fmtDuration, fmtPct } from "@/lib/metrics";
import { STATE_META } from "@/lib/types";
import SessionCharts from "@/components/SessionCharts";

export default function ReportPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [session, setSession] = useState<LocalSession | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Try server
      try {
        const res = await fetch(`/api/sessions/${id}`);
        if (!cancelled && res.ok) {
          const json = await res.json();
          setSession(json.session);
          setLoading(false);
          return;
        }
      } catch {}
      // Fall back to local
      if (!cancelled) {
        const local = getLocalSession(id);
        if (local) setSession(local);
        else setNotFound(true);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto mt-24 max-w-md text-center text-slate-400">
        <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        Loading report…
      </div>
    );
  }

  if (notFound || !session) {
    return (
      <div className="mx-auto mt-24 max-w-md text-center">
        <h1 className="text-xl font-bold text-slate-200">Report not found</h1>
        <p className="mt-2 text-sm text-slate-400">
          This report doesn&apos;t exist or was recorded on another device.
        </p>
        <Link href="/dashboard" className="btn-ghost mt-6">
          Go to dashboard
        </Link>
      </div>
    );
  }

  return <ReportBody session={session} shareId={id} />;
}

function getLocalSession(id: string): LocalSession | null {
  try {
    const raw = localStorage.getItem("ta_local_sessions");
    if (!raw) return null;
    const arr = JSON.parse(raw) as LocalSession[];
    return arr.find((s) => s.shareId === id || s.id === id) ?? null;
  } catch {
    return null;
  }
}

function ReportBody({ session, shareId }: { session: LocalSession; shareId: string }) {
  const lieData = useMemo(
    () => [
      {
        name: "What your phone would say",
        minutes: +(session.screenOnSec / 60).toFixed(2),
        fill: "#475569",
      },
      {
        name: "Real attention (truth)",
        minutes: +(session.attentionSec / 60).toFixed(2),
        fill: "#22d3ee",
      },
    ],
    [session]
  );

  const lieGap = Math.max(0, session.screenOnSec - session.attentionSec);
  const liePct = session.screenOnSec > 0 ? lieGap / session.screenOnSec : 0;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(session, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trueattention-report-${shareId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const started = new Date(session.startedAt);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
            Attention report
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-100">
            Your screen time, on trial
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Session of {started.toLocaleString()} · {session.type} ·{" "}
            {session.deviceLabel || "web"}
          </p>
        </div>
        <div className="no-print flex gap-2">
          <button onClick={() => window.print()} className="btn-ghost !px-4 !py-2 text-sm">
            Print
          </button>
          <button onClick={exportJson} className="btn-ghost !px-4 !py-2 text-sm">
            Export JSON
          </button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
            }}
            className="btn-ghost !px-4 !py-2 text-sm"
          >
            Copy link
          </button>
        </div>
      </div>

      {/* The Lie */}
      <div className="card mb-6 p-6">
        <h2 className="text-lg font-bold text-slate-100">The lie, quantified</h2>
        <p className="mt-1 text-sm text-slate-400">
          A screen-time report would have counted every moment below as
          &quot;usage.&quot; Only one bar is true.
        </p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={lieData} layout="vertical" margin={{ left: 8, right: 40 }}>
              <XAxis type="number" unit=" min" stroke="#64748b" fontSize={12} />
              <YAxis
                type="category"
                dataKey="name"
                width={200}
                stroke="#64748b"
                fontSize={12}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{
                  background: "#0a0f1c",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                }}
                formatter={(v: number) => [`${v} min`, undefined]}
              />
              <Bar dataKey="minutes" radius={[0, 8, 8, 0]}>
                {lieData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Phone's claim"
            value={fmtDuration(session.screenOnSec * 1000)}
            sub="screen-on time"
            tone="muted"
          />
          <Stat
            label="Real attention"
            value={fmtDuration(session.attentionSec * 1000)}
            sub={`${fmtPct(session.attentionRatio)} of claim`}
            tone="cyan"
          />
          <Stat
            label="The gap (the lie)"
            value={fmtDuration(lieGap * 1000)}
            sub={`${fmtPct(liePct)} inflated usage`}
            tone="amber"
          />
        </div>
      </div>

      {/* Focus score + counters */}
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-6 text-center lg:col-span-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Focus score
          </p>
          <div className="mt-3 text-6xl font-black text-cyan-300">
            {session.focusScore}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            60% attention ratio · 20% longest streak · 20% glance resistance
          </p>
        </div>
        <div className="card grid grid-cols-2 gap-4 p-6 lg:col-span-2">
          <Stat label="Glances" value={`${session.glanceCount}`} sub="< 2s looks at screen" tone="amber" />
          <Stat label="Distractions" value={`${session.distractionCount}`} sub="≥ 2s away" tone="violet" />
          <Stat label="Longest streak" value={fmtDuration(session.longestStreakSec * 1000)} sub="unbroken attention" tone="emerald" />
          <Stat label="Blinks" value={`${session.blinkCount}`} sub="normal: 15–20/min" tone="slate" />
        </div>
      </div>

      <SessionCharts session={session} />

      {/* Timeline strip */}
      <TimelineStrip episodes={session.episodes} />

      {/* Episode log */}
      <EpisodeLog episodes={session.episodes} />

      <p className="mt-8 text-center text-xs text-slate-600">
        Report ID: {shareId} · Generated by TrueAttention · All processing
        happened on-device
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "cyan" | "amber" | "emerald" | "violet" | "slate" | "muted";
}) {
  const tones: Record<string, string> = {
    cyan: "text-cyan-300",
    amber: "text-amber-300",
    emerald: "text-emerald-300",
    violet: "text-violet-300",
    slate: "text-slate-200",
    muted: "text-slate-400",
  };
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function TimelineStrip({
  episodes,
}: {
  episodes: { state: string; start: number; durationMs: number }[];
}) {
  const total = episodes.reduce((s, e) => s + e.durationMs, 0);
  if (total === 0) return null;
  return (
    <div className="card mb-6 p-6">
      <h2 className="mb-4 text-lg font-bold text-slate-100">Attention timeline</h2>
      <div className="flex h-6 overflow-hidden rounded-lg">
        {episodes.map((e, i) => (
          <div
            key={i}
            title={`${STATE_META[e.state as keyof typeof STATE_META]?.label ?? e.state} · ${fmtDuration(e.durationMs)}`}
            style={{
              width: `${(e.durationMs / total) * 100}%`,
              background: STATE_META[e.state as keyof typeof STATE_META]?.color ?? "#888",
              opacity: e.state === "ON" ? 0.9 : 0.75,
            }}
            className="h-full transition-all"
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
        {(Object.keys(STATE_META) as (keyof typeof STATE_META)[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: STATE_META[k].color }}
            />
            {STATE_META[k].label}
          </span>
        ))}
      </div>
    </div>
  );
}

function EpisodeLog({
  episodes,
}: {
  episodes: { state: string; start: number; durationMs: number }[];
}) {
  const [showAll, setShowAll] = useState(false);
  const notable = episodes
    .filter((e) => e.state !== "ON")
    .sort((a, b) => b.durationMs - a.durationMs);
  const list = showAll ? notable : notable.slice(0, 8);
  if (notable.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-slate-400">
        Perfect session — no looks away recorded.
      </div>
    );
  }
  return (
    <div className="card p-6">
      <h2 className="mb-4 text-lg font-bold text-slate-100">
        Every moment your phone counted — but your eyes didn&apos;t
      </h2>
      <div className="space-y-2">
        {list.map((e, i) => {
          const meta = STATE_META[e.state as keyof typeof STATE_META];
          return (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-2.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: meta?.color }}
                />
                <span className="text-slate-300">{meta?.label ?? e.state}</span>
                <span className="text-slate-600">
                  at {fmtDuration(e.start)}
                </span>
              </span>
              <span className="font-mono text-slate-400">
                {fmtDuration(e.durationMs)}
              </span>
            </div>
          );
        })}
      </div>
      {notable.length > 8 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-4 text-sm text-cyan-400 underline hover:text-cyan-300"
        >
          {showAll ? "Show less" : `Show all ${notable.length} events`}
        </button>
      )}
    </div>
  );
}
