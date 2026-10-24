"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LocalSession } from "@/lib/client-storage";

/**
 * Minute-by-minute attention area chart + glance-seconds bar chart
 * for a single session.
 */
export default function SessionCharts({ session }: { session: LocalSession }) {
  const minutes = session.minuteBuckets.map((b) => ({
    minute: `${b.min}m`,
    attention: +(b.attnSec).toFixed(1),
    onScreen: +(b.onSec).toFixed(1),
    lie: +(b.onSec - b.attnSec).toFixed(1),
  }));

  if (minutes.length === 0) return null;

  const tooltipStyle = {
    background: "#0a0f1c",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    fontSize: 12,
  };

  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      <div className="card p-6">
        <h3 className="mb-4 text-sm font-bold text-slate-200">
          Attention per minute
        </h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={minutes}>
              <defs>
                <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="minute" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} domain={[0, 60]} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="attention"
                stroke="#22d3ee"
                fill="url(#attGrad)"
                strokeWidth={2}
                unit=" s"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="mb-4 text-sm font-bold text-slate-200">
          Inflation per minute (what the phone added)
        </h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={minutes}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="minute" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="lie" fill="#fbbf24" radius={[4, 4, 0, 0]} unit=" s" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
