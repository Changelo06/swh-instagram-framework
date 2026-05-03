import { Quote } from "lucide-react";

export default function TestimonialCard({
  quote,
  name,
  handle,
  followers,
  initials,
  featured = false,
}) {
  return (
    <figure
      className={`card p-6 md:p-8 flex flex-col gap-5 h-full ${
        featured ? "md:col-span-2 md:p-10" : ""
      }`}
    >
      <Quote className="w-7 h-7 text-gold-500/70" strokeWidth={1.5} />
      <blockquote
        className={`font-serif italic leading-[1.45] text-slate-100 ${
          featured ? "text-2xl md:text-3xl" : "text-xl"
        }`}
      >
        {quote}
      </blockquote>
      <figcaption className="mt-auto flex items-center gap-3 pt-4 border-t border-gold-500/10">
        <div className="w-10 h-10 rounded-full grid place-items-center font-serif text-sm text-gold-400 bg-navy-800 border border-gold-500/30">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-sm text-slate-100 font-semibold truncate">
            {name}
          </div>
          <div className="text-[11px] text-slate-400 font-mono truncate">
            {handle}
            {followers && (
              <>
                <span className="mx-1.5 text-slate-600">·</span>
                {followers}
              </>
            )}
          </div>
        </div>
      </figcaption>
    </figure>
  );
}
