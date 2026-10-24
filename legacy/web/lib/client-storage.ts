"use client";

import type { SessionInput } from "./validation";

const QUEUE_KEY = "ta_session_queue";
const LOCAL_KEY = "ta_local_sessions";

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full — drop silently
  }
}

/**
 * Save a session with the server-first, local-fallback strategy.
 * Mirrors everything into localStorage; if the POST succeeds we keep
 * only the server copy flag.
 */
export async function saveSession(
  input: SessionInput
): Promise<{ saved: "server" | "local"; id?: string; shareId?: string }> {
  const shareId = genShareId();
  const payload = { ...input, shareId };

  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json = await res.json();
    return { saved: "server", id: json.id, shareId: json.shareId };
  } catch {
    // Offline fallback: queue locally
    const local = readJSON<
      (SessionInput & { shareId: string; id: string; localOnly: boolean })[]
    >(LOCAL_KEY);
    const arr = local ?? [];
    const id = `local_${Date.now()}`;
    arr.unshift({ ...payload, id, localOnly: true });
    writeJSON(LOCAL_KEY, arr.slice(0, 100));
    const q = readJSON<(SessionInput & { shareId: string })[]>(QUEUE_KEY);
    writeJSON(QUEUE_KEY, [...(q ?? []), payload]);
    return { saved: "local", id, shareId };
  }
}

export function genShareId(): string {
  return (
    Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8)
  ).slice(0, 10);
}

export interface LocalSession {
  id: string;
  shareId: string;
  localOnly?: boolean;
  type: string;
  startedAt: number;
  endedAt: number;
  screenOnSec: number;
  attentionSec: number;
  glanceSec: number;
  attentionRatio: number;
  focusScore: number;
  blinkCount: number;
  glanceCount: number;
  distractionCount: number;
  longestStreakSec: number;
  minuteBuckets: { min: number; onSec: number; attnSec: number }[];
  episodes: { state: string; start: number; durationMs: number }[];
  calibration?: { version: number; quality: number };
  deviceLabel?: string;
}

export function getLocalSessions(): LocalSession[] {
  return readJSON<LocalSession[]>(LOCAL_KEY) ?? [];
}

/**
 * Combined list of sessions: server + local (local-only ones not on server).
 */
export async function listSessions(): Promise<LocalSession[]> {
  let server: LocalSession[] = [];
  try {
    const res = await fetch("/api/sessions?limit=100", { cache: "no-store" });
    if (res.ok) server = (await res.json()).sessions ?? [];
  } catch {
    // offline
  }
  const local = getLocalSessions().filter((s) => s.localOnly);
  const merged = [...server, ...local];
  merged.sort((a, b) => b.startedAt - a.startedAt);
  return merged;
}

export async function flushQueue(): Promise<number> {
  const q = readJSON<(SessionInput & { shareId: string })[]>(QUEUE_KEY);
  if (!q || q.length === 0) return 0;
  let sent = 0;
  const remaining: typeof q = [];
  for (const item of q) {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (res.ok) sent++;
      else remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  writeJSON(QUEUE_KEY, remaining);
  return sent;
}
