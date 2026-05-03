import Reveal from "./Reveal.jsx";

export default function SectionHeader({
  eyebrow,
  title,
  lede,
  align = "left",
  className = "",
}) {
  const alignClasses =
    align === "center" ? "text-center mx-auto items-center" : "text-left";
  return (
    <Reveal
      className={`flex flex-col gap-4 max-w-3xl ${alignClasses} ${className}`}
    >
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      {title && (
        <h2 className="font-serif text-4xl md:text-5xl leading-[1.1] tracking-tight text-slate-50">
          {title}
        </h2>
      )}
      {lede && (
        <p className="text-lg text-slate-300 leading-[1.6] max-w-2xl">{lede}</p>
      )}
    </Reveal>
  );
}
