import { ArrowRight, Eye } from "lucide-react";

export default function Hero({ onScrollToAnalyze, onOpenSample }) {
  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-gold-500/10"
    >
      <div className="absolute inset-0 hero-field pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-px bg-gold-rule" />

      <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-20 md:pt-28 md:pb-32">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-[10px] uppercase tracking-[0.22em] text-gold-400 font-semibold mb-6 animate-fade-rise">
            <span className="w-1.5 h-1.5 rounded-full bg-gold-500" />
            SWH Content Intelligence Engine
          </div>

          <h1
            className="font-serif font-bold leading-[1.05] tracking-tight text-slate-50 mb-6 animate-fade-rise"
            style={{
              fontSize: "clamp(2.5rem, 5.5vw, 4.5rem)",
              animationDelay: "80ms",
            }}
          >
            The framework hiding inside{" "}
            <span className="relative inline-block">
              <span className="gold-text">your last 90 posts.</span>
              <span className="absolute -bottom-1 left-0 right-0 h-[3px] bg-gold-rule rounded-full" />
            </span>
          </h1>

          <p
            className="text-lg md:text-xl text-slate-300 leading-[1.55] max-w-2xl mb-10 animate-fade-rise"
            style={{ animationDelay: "160ms" }}
          >
            Drop your Instagram Sort Feed CSV. The engine reverse-engineers
            <span className="text-slate-100">
              {" "}
              the hooks, voice, and structure
            </span>{" "}
            already working for you — never a template, never a guess. Every
            claim has receipts.
          </p>

          <div
            className="flex flex-col sm:flex-row gap-3 animate-fade-rise"
            style={{ animationDelay: "240ms" }}
          >
            <button
              onClick={onScrollToAnalyze}
              className="btn-gold text-base px-6 py-3 shadow-gold-glow"
            >
              Decode my profile
              <ArrowRight size={16} />
            </button>
            <button onClick={onOpenSample} className="btn-ghost text-base px-6 py-3">
              <Eye size={16} />
              See a sample report
            </button>
          </div>

          <div
            className="mt-10 grid grid-cols-3 gap-4 max-w-md animate-fade-rise"
            style={{ animationDelay: "320ms" }}
          >
            <HeroStat label="Sections" value="10" />
            <HeroStat label="Layers" value="6" />
            <HeroStat label="Templates" value="0" />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroStat({ label, value }) {
  return (
    <div>
      <div className="font-serif text-3xl text-gold-400 leading-none">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 mt-1">
        {label}
      </div>
    </div>
  );
}
