import Link from "next/link";

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-24 pb-20 sm:px-6">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% -10%, rgba(34,211,238,0.15), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="chip mx-auto border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            DTI Project · On-device eye tracking
          </p>
          <h1 className="mt-6 text-5xl font-black leading-tight text-slate-100 sm:text-6xl">
            Your screen time is{" "}
            <span className="bg-gradient-to-r from-cyan-400 to-emerald-300 bg-clip-text text-transparent">
              lying
            </span>{" "}
            to you.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            Screen-time reports count every screen-on second as
            &quot;usage&quot; — even the 11-second glance at the clock. What
            if your report knew the difference between{" "}
            <em>looking</em> and <em>watching</em>? TrueAttention uses your
            front camera, entirely on-device, to measure{" "}
            <strong className="text-slate-200">real attention</strong>.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link href="/session" className="btn-primary text-base">
              Try a live session
            </Link>
            <Link href="/how-it-works" className="btn-ghost text-base">
              How it works
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Requires a webcam · Nothing is ever uploaded · Works in Chrome /
            Edge
          </p>
        </div>
      </section>

      {/* The problem */}
      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          <ProblemCard
            emoji="🕐"
            title="The glance"
            body="You look at your phone to check the time. 11 seconds. Your screen-time report logs 11 seconds of 'usage.' Multiply by 40 glances a day."
          />
          <ProblemCard
            emoji="📱"
            title="The zombie stream"
            body="A video keeps playing while you make coffee. The meter happily ticks away. You weren't there. It doesn't know."
          />
          <ProblemCard
            emoji="🪞"
            title="The guilt machine"
            body="A number you can't trust becomes the number you judge yourself by. A bad metric is worse than no metric."
          />
        </div>
      </section>

      {/* Comparison */}
      <section className="border-t border-white/5 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold text-slate-100">
            Two ways to count the same hour
          </h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="card p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Today: screen-on time
              </p>
              <p className="mt-4 font-mono text-5xl font-black text-slate-400">
                60:00
              </p>
              <p className="mt-2 text-sm text-slate-500">
                One flat number. A glance, a deep-dive, a forgotten tab — all
                identical.
              </p>
              <div className="mt-6 h-3 rounded-full bg-slate-700" />
            </div>
            <div className="card border-cyan-500/30 p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">
                TrueAttention: attention time
              </p>
              <p className="mt-4 font-mono text-5xl font-black text-cyan-300">
                33:12
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Of that hour: 33 minutes of true attention, 21 glances, 4
                distractions, 12 minutes of eyes elsewhere.
              </p>
              <div className="mt-6 flex h-3 gap-1 overflow-hidden rounded-full">
                <div className="w-[55%] rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400" />
                <div className="w-[18%] rounded-full bg-amber-400" />
                <div className="w-[27%] rounded-full bg-slate-700" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pipeline teaser */}
      <section className="border-t border-white/5 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-3xl font-bold text-slate-100">
            Built from first principles
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["1", "See", "A 478-point face mesh tracks your head pose, iris position and blinks 30× a second."],
              ["2", "Calibrate", "A 9-point least-squares fit maps your gaze to exact screen coordinates."],
              ["3", "Classify", "A state machine with hysteresis labels every moment: attentive, away, closed, absent."],
              ["4", "Report", "The gap between screen-on time and attention time — the lie — quantified."],
            ].map(([n, t, d]) => (
              <div key={n} className="card p-6 text-left">
                <span className="font-mono text-xs text-cyan-400">STEP {n}</span>
                <h3 className="mt-2 font-bold text-slate-100">{t}</h3>
                <p className="mt-2 text-sm text-slate-400">{d}</p>
              </div>
            ))}
          </div>
          <Link href="/session" className="btn-primary mt-10">
            See it live →
          </Link>
        </div>
      </section>
    </div>
  );
}

function ProblemCard({
  emoji,
  title,
  body,
}: {
  emoji: string;
  title: string;
  body: string;
}) {
  return (
    <div className="card p-6">
      <div className="text-3xl">{emoji}</div>
      <h3 className="mt-3 font-bold text-slate-100">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}
