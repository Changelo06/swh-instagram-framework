import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import Reveal from "../components/Reveal.jsx";
import SectionHeader from "../components/SectionHeader.jsx";
import { faq } from "../data/faq.js";

export default function Faq() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faq" className="relative max-w-4xl mx-auto px-6 py-20 md:py-28">
      <SectionHeader
        eyebrow="FAQ"
        title="The questions creators ask first."
        lede="If you don't see what you're looking for, the sample report above will probably answer it."
        align="center"
        className="mb-14 mx-auto"
      />

      <div className="space-y-2">
        {faq.map((item, i) => {
          const open = openIndex === i;
          return (
            <Reveal
              key={item.q}
              className={`card overflow-hidden transition-colors ${
                open ? "border-gold-500/40" : ""
              }`}
            >
              <button
                onClick={() => setOpenIndex(open ? -1 : i)}
                className="w-full text-left px-5 py-4 md:px-6 md:py-5 flex items-center justify-between gap-4 min-h-[56px]"
                aria-expanded={open}
              >
                <span className="font-serif text-lg md:text-xl text-slate-100 leading-snug">
                  {item.q}
                </span>
                <span
                  className={`shrink-0 w-8 h-8 rounded-full grid place-items-center border transition-colors ${
                    open
                      ? "bg-gold-500 text-navy-950 border-gold-400"
                      : "border-gold-500/30 text-gold-400 hover:border-gold-500/60"
                  }`}
                  aria-hidden
                >
                  {open ? <Minus size={14} /> : <Plus size={14} />}
                </span>
              </button>
              {open && (
                <div className="px-5 md:px-6 pb-5 md:pb-6 -mt-1">
                  <p className="text-sm md:text-[15px] text-slate-300 leading-[1.7] max-w-3xl">
                    {item.a}
                  </p>
                </div>
              )}
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
