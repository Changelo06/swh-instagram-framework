import LogoStrip from "../components/LogoStrip.jsx";
import Reveal from "../components/Reveal.jsx";

export default function ProofBar() {
  return (
    <section className="border-b border-gold-500/10 bg-navy-950/50">
      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16 grid md:grid-cols-12 gap-10 items-center">
        <Reveal className="md:col-span-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-gold-500 font-semibold mb-2">
            Built for
          </div>
          <p className="font-serif text-xl md:text-2xl text-slate-100 leading-snug">
            Creators doing $30K+/mo from content.
          </p>
          <p className="text-[12px] font-mono text-slate-500 mt-3">
            10-section report · 6 analysis layers · zero templates
          </p>
        </Reveal>

        <Reveal className="md:col-span-8">
          <LogoStrip />
        </Reveal>
      </div>
    </section>
  );
}
