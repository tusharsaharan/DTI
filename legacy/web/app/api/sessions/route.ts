import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongo";
import { Session, ISessionDoc } from "@/lib/db";
import { SessionInputSchema, SessionQuerySchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const db = await dbConnect();
  if (!db) {
    return NextResponse.json({ sessions: [], offline: true });
  }
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { limit } = SessionQuerySchema.parse(params);

  const sessions = await Session.find({})
    .sort({ startedAt: -1 })
    .limit(limit)
    .lean<ISessionDoc[]>();

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s._id.toString(),
      shareId: s.shareId,
      type: s.type,
      startedAt: new Date(s.startedAt).getTime(),
      endedAt: new Date(s.endedAt).getTime(),
      screenOnSec: s.screenOnSec,
      attentionSec: s.attentionSec,
      glanceSec: s.glanceSec,
      attentionRatio: s.attentionRatio,
      focusScore: s.focusScore,
      blinkCount: s.blinkCount,
      glanceCount: s.glanceCount,
      distractionCount: s.distractionCount,
      longestStreakSec: s.longestStreakSec,
      minuteBuckets: s.minuteBuckets,
      episodes: s.episodes,
      calibration: s.calibration,
      deviceLabel: s.deviceLabel,
    })),
    offline: false,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = SessionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid session payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const db = await dbConnect();
  if (!db) {
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 }
    );
  }
  const data = parsed.data;
  const doc = await Session.create({
    ...data,
    startedAt: new Date(data.startedAt),
    endedAt: new Date(data.endedAt),
    shareId: body?.shareId ?? "",
  });
  return NextResponse.json({ id: doc._id.toString(), shareId: doc.shareId });
}
