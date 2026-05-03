import Reveal from "../components/Reveal.jsx";
import SectionHeader from "../components/SectionHeader.jsx";

const PROBLEMS = [
  {
    headline: "Templates flatten your voice.",
    body: "The fastest way to sound like everyone else is to start from a swipe file. Your audience came back for *your* phrasing — borrowed structure dilutes the only moat you have.",
  },
  {
    headline: "Generic advice ignores your data.",
    body: "“Hook hard. Add value. Close strong.” You already know. None of it tells you which of *your* hooks compounded saves, or which mechanism your top reels share.",
  },
  {
    headline: "Most analytics tell you what — never why.",
    body: "Plays, likes, save rate. Useful, until you ask: what is the underlying pattern? Why did this one hit and that one die? That answer lives in the structure, not the dashboard.",
  },
];

export default function ProblemFraming() {
  return (
    <section className="relative max-w-6xl mx-auto px-6 py-20 md:py-28">
      <SectionHeader
        eyebrow="The problem"
        title="You don't have an idea problem. You have an evidence problem."
        lede="Three reasons most content advice fails the creators who least need it — and why the engine refuses to repeat any of them."
        className="mb-12 md:mb-16"
      />

      <div className="grid md:grid-cols-3 gap-5">
        {PROBLEMS.map((p, i) => (
          <Reveal key={p.headline} className="card p-6 md:p-7 flex flex-col gap-3 h-full">
            <div className="font-mono text-[11px] text-gold-500/80">
              {String(i + 1).padStart(2, "0")}
            </div>
            <h3 className="font-serif text-xl md:text-2xl leading-snug text-slate-100">
              {p.headline}
            </h3>
            <p className="text-sm text-slate-400 leading-[1.7]">{p.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
