import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  // Do not throw at import time on the server — routes handle null gracefully
  // and fall back to client localStorage. We warn loudly in dev.
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "MONGODB_URI is not set — API will operate in local-only mode."
    );
  }
}

let cached = (global as any).mongooseCache || { conn: null, promise: null };
(global as any).mongooseCache = cached;

export async function dbConnect(): Promise<typeof mongoose | null> {
  if (!MONGODB_URI) return null;
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, { dbName: "trueattention" })
      .then((m) => m)
      .catch((err) => {
        cached.promise = null;
        console.error("MongoDB connection failed:", err?.message);
        return null;
      });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
