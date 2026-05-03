import Reveal from "../components/Reveal.jsx";
import SectionHeader from "../components/SectionHeader.jsx";

const STEPS = [
  {
    title: "Upload your Sort Feed CSV.",
    body: "Drop the CSV exported from Apify's Instagram Sort Feed scraper. The engine parses captions, audio, plays, saves, timestamps in one pass.",
  },
  {
    title: "Six-layer analysis runs.",
    body: "Performance, language, hooks, structure, emotion, topics. The top 5 most-engaged reels are transcribed; every pattern requires at least three corroborating posts.",
  },
  {
    title: "Receive a 10-section custom framework.",
    body: "Live-streamed report — voice fingerprint, evidence-cited findings, three replicable script blueprints. Export to Markdown, PDF, or CSV.",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative bg-navy-950/40 border-y border-gold-500/10"
    >
      <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <SectionHeader
          eyebrow="How it works"
          title="Three steps. No templates. No black box."
          lede="The engine reads what you've already published, isolates the signal, and writes it back as a system."
          align="center"
          className="mb-14 md:mb-20 mx-auto"
        />

        <div className="grid md:grid-cols-3 gap-8 md:gap-6 relative">
          <div className="hidden md:block absolute left-[10%] right-[10%] top-[42px] h-px bg-gold-rule" />
          {STEPS.map((step, i) => (
            <Reveal
              key={step.title}
              className="relative flex flex-col items-start md:items-center text-left md:text-center px-2"
            >
              <div className="font-serif text-5xl text-gold-400 leading-none mb-4 bg-navy-950 px-3 relative z-10">
                {String(i + 1).padStart(2, "0")}
              </div>
              <h3 className="font-serif text-xl text-slate-100 leading-snug mb-2 max-w-xs">
                {step.title}
              </h3>
              <p className="text-sm text-slate-400 leading-[1.7] max-w-sm">
                {step.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
