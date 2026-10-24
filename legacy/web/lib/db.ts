import mongoose, { Schema, models, model } from "mongoose";

export interface ISessionDoc {
  _id: mongoose.Types.ObjectId;
  shareId: string;
  type: string;
  startedAt: Date;
  endedAt: Date;
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
  episodes: {
    state: string;
    start: number;
    durationMs: number;
  }[];
  calibration: { version: number; quality: number };
  deviceLabel: string;
  createdAt: Date;
}

const SessionSchema = new Schema<ISessionDoc>(
  {
    shareId: { type: String, required: true, unique: true, index: true },
    type: { type: String, default: "reading" },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    screenOnSec: { type: Number, required: true },
    attentionSec: { type: Number, required: true },
    glanceSec: { type: Number, default: 0 },
    attentionRatio: { type: Number, required: true },
    focusScore: { type: Number, required: true },
    blinkCount: { type: Number, default: 0 },
    glanceCount: { type: Number, default: 0 },
    distractionCount: { type: Number, default: 0 },
    longestStreakSec: { type: Number, default: 0 },
    minuteBuckets: [
      {
        _id: false,
        min: Number,
        onSec: Number,
        attnSec: Number,
      },
    ],
    episodes: [
      {
        _id: false,
        state: String,
        start: Number,
        durationMs: Number,
      },
    ],
    calibration: { version: Number, quality: Number },
    deviceLabel: { type: String, default: "" },
    createdAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);

export const Session =
  models.Session ?? model<ISessionDoc>("Session", SessionSchema);
