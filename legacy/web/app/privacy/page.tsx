import Link from "next/link";

export const metadata = {
  title: "Privacy — TrueAttention",
};

const FAQS: [string, string][] = [
  [
    "Is my camera feed uploaded anywhere?",
    "No. The video from your webcam is processed entirely inside your browser tab by a WebAssembly neural network that this site self-hosts. Frames are analyzed in memory and immediately discarded. No frame, image, or video ever leaves your device — there is no server-side component capable of receiving one.",
  ],
  [
    "What data is actually saved?",
    "Only anonymous numbers: the session's start/end time, seconds of screen-on vs attention, glance and distraction counts, blink count, and per-minute totals. Each session also gets a random 10-character share ID so you can open its report. No user accounts, no IP logging, no fingerprinting, no camera data.",
  ],
  [
    "Can you identify me from what's saved?",
    "No. There is nothing to identify — no video, no landmarks, no face geometry, no biometric template. The saved data could not be used to reconstruct your face or recognize you later.",
  ],
  [
    "Why does the site need my camera at all?",
    "The entire premise is measuring where your eyes are looking. That requires analyzing your face locally. The browser asks for your explicit permission, shows the camera indicator while active, and you can revoke access at any time from the camera icon in the address bar.",
  ],
  [
    "What if I'm offline or the server is down?",
    "Sessions save to your browser's local storage and sync to the database later. The attention tracking itself never needs the network after the page loads.",
  ],
  [
    "Is this the same as what phones could do?",
    "It's a working prototype of exactly that. Phone-grade front cameras and on-device neural engines are more than capable of this — the barrier is choice, not technology. This project exists to show what an honest screen-time report looks like.",
  ],
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-bold text-slate-100">
        Privacy &amp; FAQ
      </h1>
      <p className="mt-3 text-slate-400">
        A tool that watches your eyes only works if you can verify it
        isn&apos;t watching <em>you</em>.
      </p>

      <div className="card mt-8 border-emerald-500/20 bg-emerald-500/[0.04] p-6">
        <p className="text-sm leading-6 text-emerald-200">
          <strong>The short version:</strong> your camera feed never leaves
          your device. Only anonymous seconds-and-counts are stored. You can
          watch the network tab — after the page loads, attention tracking
          makes zero outbound requests.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        {FAQS.map(([q, a]) => (
          <details key={q} className="card group p-6">
            <summary className="cursor-pointer list-none font-semibold text-slate-100">
              <span className="mr-2 text-cyan-400 group-open:hidden">+</span>
              <span className="mr-2 hidden text-cyan-400 group-open:inline">−</span>
              {q}
            </summary>
            <p className="mt-3 text-sm leading-6 text-slate-400">{a}</p>
          </details>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Link href="/session" className="btn-primary">
          Try a session — verify it yourself
        </Link>
      </div>
    </div>
  );
}
