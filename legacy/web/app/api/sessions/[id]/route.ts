import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongo";
import { Session, ISessionDoc } from "@/lib/db";
import type { FilterQuery } from "mongoose";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = await dbConnect();
  if (!db) return NextResponse.json({ error: "offline" }, { status: 503 });
  const { id } = params;
  const query: FilterQuery<ISessionDoc> = {
    $or: [{ _id: isValidId(id) ? id : null }, { shareId: id }],
  };
  const doc = await Session.findOne(query).lean<ISessionDoc>();
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    session: {
      id: doc._id.toString(),
      shareId: doc.shareId,
      type: doc.type,
      startedAt: new Date(doc.startedAt).getTime(),
      endedAt: new Date(doc.endedAt).getTime(),
      screenOnSec: doc.screenOnSec,
      attentionSec: doc.attentionSec,
      glanceSec: doc.glanceSec,
      attentionRatio: doc.attentionRatio,
      focusScore: doc.focusScore,
      blinkCount: doc.blinkCount,
      glanceCount: doc.glanceCount,
      distractionCount: doc.distractionCount,
      longestStreakSec: doc.longestStreakSec,
      minuteBuckets: doc.minuteBuckets,
      episodes: doc.episodes,
      calibration: doc.calibration,
      deviceLabel: doc.deviceLabel,
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = await dbConnect();
  if (!db) return NextResponse.json({ error: "offline" }, { status: 503 });
  const { id } = params;
  const filter = isValidId(id)
    ? { $or: [{ _id: id }, { shareId: id }] }
    : { shareId: id };
  const res = await Session.deleteOne(filter);
  if (res.deletedCount === 0)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

function isValidId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}
