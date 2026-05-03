import Reveal from "../components/Reveal.jsx";

export default function VoiceManifesto() {
  return (
    <section className="relative bg-navy-950/60 border-y border-gold-500/10 overflow-hidden">
      <div className="absolute inset-0 hero-field opacity-60 pointer-events-none" />
      <div className="relative max-w-4xl mx-auto px-6 py-24 md:py-32 text-center">
        <Reveal>
          <div className="eyebrow mb-6">Voice preservation</div>
          <blockquote className="font-serif italic leading-[1.25] text-slate-100 text-3xl md:text-5xl tracking-tight">
            <span className="text-gold-400 not-italic font-serif text-5xl md:text-6xl leading-none mr-2 align-top">
              “
            </span>
            The engine refuses to invent any phrase, structure, or pattern that
            doesn't already live somewhere in your data.{" "}
            <span className="text-slate-400">
              Voice preservation isn't a feature — it's the whole rule.
            </span>
          </blockquote>
          <div className="mt-10 inline-flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-gold-500 font-semibold">
            <span className="w-8 h-px bg-gold-500/60" />
            Every claim has receipts
            <span className="w-8 h-px bg-gold-500/60" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
