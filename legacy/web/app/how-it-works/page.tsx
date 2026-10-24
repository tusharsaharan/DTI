import Link from "next/link";

export const metadata = {
  title: "How it works — TrueAttention",
};

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-bold text-slate-100">How it works</h1>
      <p className="mt-3 text-slate-400">
        TrueAttention measures what screen-time reports can&apos;t: whether
        your eyes were actually on the screen. Everything runs in your
        browser, on your machine.
      </p>

      <div className="mt-12 space-y-10">
        <Step n="01" title="Face mesh — 478 points, 30 times a second">
          <p>
            We use Google&apos;s MediaPipe Face Landmarker (the model is
            self-hosted on this site), which detects 478 landmarks on your
            face from ordinary webcam video — no infrared, no special
            hardware. Among those points are the contours of your eyes and
            the center of each iris, plus blendshape scores (like
            &quot;eyeBlinkLeft&quot;) and a 3D head-pose matrix.
          </p>
        </Step>

        <Step n="02" title="Features per frame">
          <p>
            Every frame, the tracker extracts four signals and smooths them
            over time (exponential smoothing) to suppress jitter:
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-6 text-slate-300">
            <li>
              <strong>Eye openness</strong> — 1 minus the blink blendshape;
              below a threshold means eyes closed.
            </li>
            <li>
              <strong>Eye direction</strong> — where your eyeballs point,
              from trained eyeLook blendshapes (iris position as fallback).
              This is the primary signal: it is what actually tells us
              where you&apos;re looking.
            </li>
            <li>
              <strong>Head yaw &amp; pitch</strong> — used to compensate the
              eye signal: turn your head while keeping eyes on screen and
              your eyeballs counter-rotate; we subtract exactly that
              compensation (a personal coupling slope learned from a
              6-second guided head sweep), so the <em>combined</em> gaze
              reads on-screen. Head rotation beyond ~±45° is a physical
              hard cap — eyes can&apos;t counter-rotate that far, so it&apos;s
              away regardless.
            </li>
          </ul>
          <p className="mt-3">
            Net effect: &quot;head turned away but eyeballs on screen&quot;
            counts as attentive; &quot;head still but eyes off screen&quot;
            and &quot;head and eyes moving together off screen&quot; both
            count as away.
          </p>
        </Step>

        <Step n="03" title="Calibration — least squares + a head sweep">
          <p>
            Before your first session, a dot travels to 9 screen positions.
            As you follow it with your eyes, we collect ~20 samples per point
            of (head pose, iris offset) → screen position. A ridge-regularized
            least-squares fit solves for the linear mapping from features to
            pixel coordinates — the same math a research eye tracker uses,
            running in ~100 lines of JavaScript. Quality of fit is reported as
            a 0–100% score.
          </p>
          <p className="mt-3">
            At the start of every session there&apos;s also a 6-second guided
            head sweep: turn your head left/right and nod once while keeping
            your eyes on a fixed point. A regression over those frames learns
            your personal eye–head coupling slope — how much your eyeballs
            counter-rotate per degree of head turn — which the classifier
            then subtracts so compensating eye movement is never mistaken
            for looking away.
          </p>
        </Step>

        <Step n="04" title="State machine with hysteresis">
          <p>
            Each frame is classified into one of four states —{" "}
            <State label="ON" /> <State label="AWAY" />{" "}
            <State label="EYES_CLOSED" /> <State label="NO_FACE" /> — in that
            order of precedence. To avoid flicker, a state must hold for 3
            consecutive frames (~150 ms) before it becomes official.
          </p>
        </Step>

        <Step n="05" title="Events &amp; metrics">
          <p>
            Contiguous same-state frames merge into episodes. Then:
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-6 text-slate-300">
            <li>
              An ON-episode under <strong>2 s</strong> is a{" "}
              <strong>glance</strong> — exactly what screen-time reports
              wrongly count as usage.
            </li>
            <li>
              A non-ON episode of <strong>≥ 2 s</strong> is a{" "}
              <strong>distraction</strong>.
            </li>
            <li>
              <strong>Screen-on time</strong> = everything except NO_FACE
              (what a phone would claim).{" "}
              <strong>Attention time</strong> = sustained ON-time only.
            </li>
            <li>
              <strong>Focus score</strong> (0–100) = 60% attention ratio + 20%
              longest streak + 20% glance resistance.
            </li>
          </ul>
        </Step>

        <Step n="06" title="What gets saved">
          <p>
            Only arithmetic. Sessions store seconds, counts, and episode
            boundaries — never video, never images, never landmarks. The
            camera feed is processed in-memory and discarded frame by frame.
            See the <Link href="/privacy" className="text-cyan-400 hover:underline">privacy page</Link> for
            the full story.
          </p>
        </Step>
      </div>

      <div className="card mt-14 p-6">
        <h2 className="font-bold text-slate-100">Honest limitations</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-6 text-sm text-slate-400">
          <li>
            Webcam gaze estimation is approximate (±10–15% of screen width) —
            it measures attention-vs-away reliably, not exact pixel gaze.
          </li>
          <li>
            Strong side lighting, very dark rooms, or sunglasses degrade
            accuracy; the HUD shows a low-confidence warning.
          </li>
          <li>
            We measure attention to <em>this screen</em> during a session —
            the same honest measurement a phone would need to ship.
          </li>
        </ul>
      </div>

      <div className="mt-10 text-center">
        <Link href="/session" className="btn-primary">
          Experience it yourself →
        </Link>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-6">
      <p className="font-mono text-sm text-cyan-400">{n}</p>
      <h2 className="mt-1 text-xl font-bold text-slate-100">{title}</h2>
      <div className="mt-3 space-y-3 text-slate-400">{children}</div>
    </section>
  );
}

function State({ label }: { label: string }) {
  return (
    <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-cyan-300">
      {label}
    </code>
  );
}
