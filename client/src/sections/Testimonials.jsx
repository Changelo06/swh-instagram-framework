import TestimonialCard from "../components/TestimonialCard.jsx";
import Reveal from "../components/Reveal.jsx";
import SectionHeader from "../components/SectionHeader.jsx";
import { testimonials } from "../data/testimonials.js";

export default function Testimonials() {
  if (!testimonials || testimonials.length === 0) return null;

  return (
    <section className="relative bg-navy-950/40 border-y border-gold-500/10">
      <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <SectionHeader
          eyebrow="Field reports"
          title="What creators say after the first run."
          lede="The kind of feedback that comes back — most often about something the engine surfaced that they couldn't see in their own work."
          align="center"
          className="mb-14 md:mb-16 mx-auto"
        />

        <div className="grid md:grid-cols-3 gap-5">
          {testimonials.map((t) => (
            <Reveal
              key={t.id}
              className={t.featured ? "md:col-span-3" : ""}
            >
              <TestimonialCard
                quote={t.quote}
                name={t.name}
                handle={t.handle}
                followers={t.followers}
                initials={t.initials}
                featured={t.featured}
              />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
