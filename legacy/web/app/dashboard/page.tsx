"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { listSessions, LocalSession, flushQueue, getLocalSessions } from "@/lib/client-storage";
import { fmtDuration, fmtPct } from "@/lib/metrics";

export default function DashboardPage() {
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const [dbOffline, setDbOffline] = useState(false);

  useEffect(() => {
    (async () => {
      const all = await listSessions();
      setSessions(all);
      setPendingSync(getLocalSessions().filter((s) => s.localOnly).length);
      setLoading(false);
    })();
  }, []);

  const refresh = async () => {
    setLoading(true);
    const all = await listSessions();
    setSessions(all);
    setPendingSync(getLocalSessions().filter((s) => s.localOnly).length);
    setLoading(false);
  };

  const handleFlush = async () => {
    setFlushing(true);
    await flushQueue();
    await refresh();
    setFlushing(false);
  };

  const totals = useMemo(() => {
    const screenOn = sessions.reduce((s, x) => s + x.screenOnSec, 0);
    const attention = sessions.reduce((s, x) => s + x.attentionSec, 0);
    const glances = sessions.reduce((s, x) => s + x.glanceCount, 0);
    const distractions = sessions.reduce((s, x) => s + x.distractionCount, 0);
    const avgFocus =
      sessions.length > 0
        ? Math.round(
            sessions.reduce((s, x) => s + x.focusScore, 0) / sessions.length
          )
        : 0;
    return {
      count: sessions.length,
      screenOn,
      attention,
      glances,
      distractions,
      avgFocus,
      ratio: screenOn > 0 ? attention / screenOn : 0,
      lieSec: Math.max(0, screenOn - attention),
    };
  }, [sessions]);

  const trendData = useMemo(
    () =>
      [...sessions]
        .reverse()
        .map((s, i) => ({
          i: `#${i + 1}`,
          focus: s.focusScore,
          attentionPct: Math.round(s.attentionRatio * 100),
          lieMin: +((s.screenOnSec - s.attentionSec) / 60).toFixed(1),
        })),
    [sessions]
  );

  const deleteSession = async (s: LocalSession) => {
    if (s.localOnly) {
      const rest = getLocalSessions().filter((x) => x.id !== s.id);
      localStorage.setItem("ta_local_sessions", JSON.stringify(rest));
    } else {
      try {
        await fetch(`/api/sessions/${s.id}`, { method: "DELETE" });
      } catch {}
    }
    await refresh();
  };

  if (loading) {
    return (
      <div className="mx-auto mt-24 max-w-md text-center text-slate-400">
        <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        Loading your history…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Your attention history vs. what screen time would have claimed
          </p>
        </div>
        <Link href="/session" className="btn-primary">
          New session
        </Link>
      </div>

      {pendingSync > 0 && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-300">
            {pendingSync} session{pendingSync > 1 ? "s" : ""} saved offline on
            this device — sync to make reports shareable.
          </p>
          <button
            onClick={handleFlush}
            disabled={flushing}
            className="btn-ghost !border-amber-500/40 !px-4 !py-2 text-sm !text-amber-300"
          >
            {flushing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="card mx-auto max-w-md p-10 text-center">
          <p className="text-slate-400">
            No sessions yet. Run your first Focus Session to see the truth
            about your screen time.
          </p>
          <Link href="/session" className="btn-primary mt-6">
            Start now
          </Link>
        </div>
      ) : (
        <>
          {/* Aggregate stats */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
            <StatCard label="Sessions" value={`${totals.count}`} />
            <StatCard
              label="Screen-on total"
              value={fmtDuration(totals.screenOn * 1000)}
              sub="the claim"
            />
            <StatCard
              label="Real attention"
              value={fmtDuration(totals.attention * 1000)}
              sub={fmtPct(totals.ratio)}
              accent="cyan"
            />
            <StatCard
              label="Total inflation"
              value={fmtDuration(totals.lieSec * 1000)}
              sub="the lie"
              accent="amber"
            />
            <StatCard
              label="Avg focus score"
              value={`${totals.avgFocus}`}
              accent="emerald"
            />
            <StatCard
              label="Glances / distractions"
              value={`${totals.glances} / ${totals.distractions}`}
              accent="violet"
            />
          </div>

          {/* Charts */}
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <h3 className="mb-4 text-sm font-bold text-slate-200">
                Focus score trend
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="focusGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="i" stroke="#64748b" fontSize={11} />
                    <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ stroke: "rgba(255,255,255,0.1)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="focus"
                      stroke="#34d399"
                      fill="url(#focusGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-6">
              <h3 className="mb-4 text-sm font-bold text-slate-200">
                Inflation per session (minutes the phone lied)
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="i" stroke="#64748b" fontSize={11} />
                    <YAxis unit=" min" stroke="#64748b" fontSize={11} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Bar dataKey="lieMin" radius={[4, 4, 0, 0]}>
                      {trendData.map((d, i) => (
                        <Cell key={i} fill={d.lieMin > 1.5 ? "#fbbf24" : "#64748b"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* History table */}
          <div className="card overflow-hidden">
            <div className="border-b border-white/10 px-6 py-4">
              <h3 className="text-sm font-bold text-slate-200">Session history</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3">When</th>
                    <th className="px-4 py-3">Phone says</th>
                    <th className="px-4 py-3">Truth</th>
                    <th className="px-4 py-3">Attention</th>
                    <th className="px-4 py-3">Focus</th>
                    <th className="px-4 py-3">Glances</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-white/5 transition hover:bg-white/[0.02]"
                    >
                      <td className="px-6 py-3 text-slate-400">
                        {new Date(s.startedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {fmtDuration(s.screenOnSec * 1000)}
                      </td>
                      <td className="px-4 py-3 font-mono text-cyan-300">
                        {fmtDuration(s.attentionSec * 1000)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`chip ${
                            s.attentionRatio > 0.7
                              ? "border-emerald-500/30 text-emerald-300"
                              : s.attentionRatio > 0.4
                                ? "border-amber-500/30 text-amber-300"
                                : "border-red-500/30 text-red-300"
                          }`}
                        >
                          {fmtPct(s.attentionRatio)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-200">
                        {s.focusScore}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {s.glanceCount}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/report/${s.shareId}`}
                          className="mr-3 text-cyan-400 hover:text-cyan-300"
                        >
                          Report
                        </Link>
                        <button
                          onClick={() => deleteSession(s)}
                          className="text-slate-600 hover:text-red-400"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {dbOffline && (
            <p className="mt-4 text-center text-xs text-slate-600">
              Server database unreachable — showing local data.
            </p>
          )}
        </>
      )}
    </div>
  );
}

const tooltipStyle = {
  background: "#0a0f1c",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  fontSize: 12,
};

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "cyan" | "amber" | "emerald" | "violet";
}) {
  const colors: Record<string, string> = {
    cyan: "text-cyan-300",
    amber: "text-amber-300",
    emerald: "text-emerald-300",
    violet: "text-violet-300",
  };
  return (
    <div className="card p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-xl font-bold ${
          accent ? colors[accent] : "text-slate-100"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
