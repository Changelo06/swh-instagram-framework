import ResultCard from "../components/ResultCard.jsx";
import Reveal from "../components/Reveal.jsx";
import SectionHeader from "../components/SectionHeader.jsx";
import { results } from "../data/testimonials.js";

const OUTCOMES = [
  {
    title: "Hooks you can replicate tomorrow.",
    body: "Three script blueprints in your voice — beat-timed, mechanism-named, action-closed. Shoot today, post this week.",
  },
  {
    title: "Topics worth doubling on.",
    body: "Performance-by-theme ranking with median plays and save rates. The matrix that tells you where to spend the next 30 reels.",
  },
  {
    title: "Topics killing your reach.",
    body: "The themes diluting your channel — ranked, named, with the bottom-quartile evidence. Cut them with confidence.",
  },
];

export default function Outcomes() {
  const visibleResults = (results || []).filter((r) => r.stat);

  return (
    <section className="relative max-w-6xl mx-auto px-6 py-20 md:py-28">
      <SectionHeader
        eyebrow="What you walk away with"
        title="Three deliverables you can act on this week."
        lede="Not a 40-slide deck. Not a course. A short, evidence-cited system you can shoot from."
        className="mb-14 md:mb-16"
      />

      <div className="grid md:grid-cols-3 gap-5 mb-14">
        {OUTCOMES.map((o, i) => (
          <Reveal
            key={o.title}
            className="card p-6 md:p-8 flex flex-col gap-3 h-full"
          >
            <div className="font-mono text-[11px] text-gold-500/80">
              {String(i + 1).padStart(2, "0")} / 03
            </div>
            <h3 className="font-serif text-2xl text-slate-100 leading-snug">
              {o.title}
            </h3>
            <p className="text-sm text-slate-400 leading-[1.7]">{o.body}</p>
          </Reveal>
        ))}
      </div>

      {visibleResults.length > 0 && (
        <Reveal>
          <div className="gold-rule mb-10" />
          <div className="grid md:grid-cols-3 gap-5">
            {visibleResults.map((r) => (
              <ResultCard
                key={r.id}
                stat={r.stat}
                label={r.label}
                attribution={r.attribution}
              />
            ))}
          </div>
        </Reveal>
      )}
    </section>
  );
}
