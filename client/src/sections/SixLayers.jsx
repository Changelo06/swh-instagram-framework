import Reveal from "../components/Reveal.jsx";
import SectionHeader from "../components/SectionHeader.jsx";

const LAYERS = [
  {
    name: "Performance",
    surfaces: "Which reels actually compounded — and which signals predicted reach in your dataset.",
    rule: "metric: saves_per_1k_plays",
  },
  {
    name: "Language",
    surfaces: "Phrase clusters that recur across your top decile. The words your audience returns for.",
    rule: "min_instances: 5",
  },
  {
    name: "Hooks",
    surfaces: "Written and spoken hooks decomposed. Pattern-grouped, beat-timed, ranked by evidence.",
    rule: "split: caption + first_2s_audio",
  },
  {
    name: "Structure",
    surfaces: "The 4-beat architecture your top reels share — and the beat your weak reels skip.",
    rule: "beats: hook · tension · reframe · action",
  },
  {
    name: "Emotion",
    surfaces: "The emotional arc that lands recognition. Mapped against beats, never to a stock library.",
    rule: "arc: recognition → discomfort → relief → resolve",
  },
  {
    name: "Topics",
    surfaces: "Performance by theme. Which to double on, which dilute the channel, and where the gaps are.",
    rule: "min_examples_per_topic: 3",
  },
];

export default function SixLayers() {
  return (
    <section id="layers" className="relative max-w-6xl mx-auto px-6 py-20 md:py-28">
      <SectionHeader
        eyebrow="The six layers"
        title="Every report runs through the same six lenses."
        lede="No layer ships an opinion. Each one cites the posts and ratios behind every finding."
        className="mb-14 md:mb-20"
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {LAYERS.map((layer, i) => (
          <Reveal
            key={layer.name}
            className="card p-6 flex flex-col gap-3 h-full hover:border-gold-500/35 transition-colors"
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-serif text-2xl gold-text leading-none">
                {layer.name}
              </h3>
              <span className="font-mono text-[11px] text-slate-500">
                L{String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <p className="text-sm text-slate-300 leading-[1.6]">
              {layer.surfaces}
            </p>
            <div className="mt-auto pt-3 border-t border-gold-500/10 font-mono text-[11px] text-gold-400/90">
              {layer.rule}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
