import { ArrowRight } from "lucide-react";
import Reveal from "../components/Reveal.jsx";

export default function FinalCta({ onScrollToAnalyze }) {
  return (
    <section className="relative bg-navy-950 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gold-rule" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gold-rule" />
      <div className="absolute inset-0 hero-field opacity-70 pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-6 py-24 md:py-32 text-center">
        <Reveal>
          <div className="eyebrow mb-6">Ready when you are</div>
          <h2
            className="font-serif font-bold leading-[1.05] tracking-tight text-slate-50 mb-6"
            style={{ fontSize: "clamp(2.25rem, 5vw, 3.75rem)" }}
          >
            Run your own framework.{" "}
            <span className="gold-text">Built from your data — not a template.</span>
          </h2>
          <p className="text-lg text-slate-300 leading-[1.55] max-w-2xl mx-auto mb-10">
            One CSV. Six layers. A custom 10-section system you can shoot from this week.
          </p>
          <button
            onClick={onScrollToAnalyze}
            className="btn-gold text-base px-7 py-3.5 shadow-gold-glow"
          >
            Decode my profile
            <ArrowRight size={16} />
          </button>
        </Reveal>
      </div>
    </section>
  );
}
