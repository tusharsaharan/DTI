import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-white/10 px-4 py-10 text-center text-sm text-slate-500 sm:px-6">
      <p className="mb-2 font-medium text-slate-400">
        TrueAttention — DTI Project
      </p>
      <p className="mx-auto max-w-xl">
        All eye tracking runs locally in your browser. No video ever leaves
        your device. Built to prove that screen time is not attention time.
      </p>
      <div className="mt-4 flex justify-center gap-4">
        <Link href="/privacy" className="hover:text-slate-300">
          Privacy
        </Link>
        <Link href="/how-it-works" className="hover:text-slate-300">
          How it works
        </Link>
        <Link href="/session" className="hover:text-slate-300">
          Try a session
        </Link>
      </div>
    </footer>
  );
}
