import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongo";
import { Session } from "@/lib/db";

export async function GET() {
  const db = await dbConnect();
  if (!db) return NextResponse.json({ offline: true, stats: null });

  const sessions = await Session.find({}).sort({ startedAt: -1 }).lean();
  const totalSessions = sessions.length;
  if (totalSessions === 0) {
    return NextResponse.json({ offline: false, stats: null });
  }

  const totalScreenOn = sessions.reduce((s, x) => s + x.screenOnSec, 0);
  const totalAttention = sessions.reduce((s, x) => s + x.attentionSec, 0);
  const avgFocus =
    sessions.reduce((s, x) => s + x.focusScore, 0) / totalSessions;
  const totalGlances = sessions.reduce((s, x) => s + x.glanceCount, 0);
  const totalDistractions = sessions.reduce(
    (s, x) => s + x.distractionCount,
    0
  );

  return NextResponse.json({
    offline: false,
    stats: {
      totalSessions,
      totalScreenOnSec: totalScreenOn,
      totalAttentionSec: totalAttention,
      attentionRatio: totalScreenOn > 0 ? totalAttention / totalScreenOn : 0,
      avgFocusScore: Math.round(avgFocus),
      totalGlances,
      totalDistractions,
    },
  });
}
