import { z } from "zod";

export const EpisodeSchema = z.object({
  state: z.enum(["ON", "AWAY", "EYES_CLOSED", "NO_FACE"]),
  start: z.number().min(0),
  durationMs: z.number().min(0).max(10 * 60 * 60 * 1000),
});

export const SessionInputSchema = z.object({
  type: z.string().max(40).default("reading"),
  startedAt: z.number(),
  endedAt: z.number(),
  screenOnSec: z.number().min(0),
  attentionSec: z.number().min(0),
  glanceSec: z.number().min(0).default(0),
  attentionRatio: z.number().min(0).max(1),
  focusScore: z.number().min(0).max(100),
  blinkCount: z.number().min(0).default(0),
  glanceCount: z.number().min(0).default(0),
  distractionCount: z.number().min(0).default(0),
  longestStreakSec: z.number().min(0).default(0),
  minuteBuckets: z
    .array(
      z.object({
        min: z.number().min(0),
        onSec: z.number().min(0),
        attnSec: z.number().min(0),
      })
    )
    .max(600),
  episodes: z.array(EpisodeSchema).max(3000),
  calibration: z
    .object({ version: z.number(), quality: z.number() })
    .optional(),
  deviceLabel: z.string().max(120).default(""),
});

export type SessionInput = z.infer<typeof SessionInputSchema>;

export const SessionQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(30),
});
