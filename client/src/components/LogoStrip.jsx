const MONOGRAMS = ["S", "M", "K", "R"];

export default function LogoStrip({ items = MONOGRAMS }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 md:gap-10 items-center justify-items-center opacity-60">
      {items.map((mark, idx) => (
        <div
          key={`${mark}-${idx}`}
          className="font-serif text-3xl md:text-4xl tracking-[0.2em] text-slate-400 select-none"
          aria-hidden
        >
          {mark}
        </div>
      ))}
    </div>
  );
}
