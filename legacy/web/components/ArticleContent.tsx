"use client";

export default function ArticleContent() {
  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
          Reading material
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-100">
          The Attention Economy Is Lying to You
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Read naturally. Glance away when you like — that&apos;s the point.
        </p>
      </header>

      <div className="space-y-5 text-[17px] leading-8 text-slate-300">
        <p>
          Every week, your phone delivers a solemn verdict: <em>6 hours 42
          minutes of screen time</em>. It arrives with a bar chart and a tone
          of quiet judgment. And it is wrong — not by a little, but
          fundamentally. It counts every second the screen was on as a second
          of &quot;usage.&quot;
        </p>
        <p>
          Consider what actually happens in those hours. You glance at your
          phone to check the time — eleven seconds, counted as usage. A
          notification pulls your eyes away mid-paragraph, but the timer keeps
          running. You leave a video playing while you make coffee. The
          screen-time report doesn&apos;t know the difference between
          <strong> presence</strong> and <strong>attention</strong>. To it, a
          glance and an hour of deep reading are identical.
        </p>
        <h2 className="pt-4 text-xl font-bold text-slate-100">
          Why the number matters
        </h2>
        <p>
          This wouldn&apos;t matter if the number were harmless. But it&apos;s
          the number millions of people use to judge themselves — to set
          limits, to feel guilty, to decide whether they have a
          &quot;problem.&quot; A metric that governs self-perception should
          measure the thing it claims to measure. Screen-on time is not that
          thing. Attention is.
        </p>
        <p>
          Researchers have known this for years. Labs have used eye trackers —
          the kind with infrared lights and chin rests — to tell exactly where
          a person is looking. The technology to distinguish a glance from a
          gaze has existed for a decade. What hasn&apos;t existed is the will
          to put it in a consumer device, because &quot;hours of usage&quot;
          is a metric the industry is comfortable with, and honesty about
          attention is not.
        </p>
        <h2 className="pt-4 text-xl font-bold text-slate-100">
          What a truthful number looks like
        </h2>
        <p>
          Imagine a report that said: <em>of the 5 hours your screen was on,
          your eyes were on it for 2 hours and 47 minutes. You glanced at it
          31 times. You left it playing unwatched for 40 minutes.</em> That
          number is harder to produce and harder to hide from. It converts a
          vague guilt into specific, actionable truth.
        </p>
        <p>
          That is what this experiment measures — right now, on this page.
          While you read, a face-mesh model in your browser is watching your
          eyes. It knows when you look away. It counts your glances. The
          report at the end compares what your phone would have said about
          this session against what actually happened in your attention.
        </p>
        <h2 className="pt-4 text-xl font-bold text-slate-100">
          The privacy question
        </h2>
        <p>
          Doing this honestly means doing it on-device. Your camera feed in
          this session never leaves your laptop: the neural network runs
          locally in your browser, converts what it sees into a single
          classification every fraction of a second — <em>on screen, looking
          away, eyes closed, not present</em> — and throws the pixels away
          instantly. What gets saved is arithmetic: seconds and counts. No
          video. No images. No audio.
        </p>
        <p>
          An honest attention metric, computed where no one can peek at it,
          changes the conversation from <em>&quot;how much did I use my
          screen?&quot;</em> to <em>&quot;how much did my screen use me?&quot;
          </em>. The first question is easy to answer and useless. The second
          is the one that matters.
        </p>
        <p className="pt-2 text-sm italic text-slate-500">
          You&apos;ve reached the end. Whenever you&apos;re ready, end the
          session to see your report.
        </p>
      </div>
    </article>
  );
}
