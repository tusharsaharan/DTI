"use client";

import Link from "next/link";

export default function SessionComplete({
  shareId,
  savedTo,
  onNewSession,
}: {
  shareId: string;
  savedTo: "server" | "local";
  onNewSession: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Session saved</h1>
        <p className="mt-2 text-sm text-slate-400">
          {savedTo === "server"
            ? "Your report is ready and synced."
            : "Saved locally on this device (offline). It will sync when the server is reachable."}
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href={shareId ? `/report/${shareId}` : "/dashboard"}
            className="btn-primary w-full"
          >
            View your attention report →
          </Link>
          <Link href="/dashboard" className="btn-ghost w-full">
            Go to dashboard
          </Link>
          <button
            onClick={onNewSession}
            className="text-sm text-slate-500 underline hover:text-slate-300"
          >
            Start another session
          </button>
        </div>
      </div>
    </div>
  );
}
