export default function ResultCard({ stat, label, attribution }) {
  if (!stat) return null;
  return (
    <div className="card p-6 md:p-8 flex flex-col gap-3 h-full">
      <div className="font-serif text-5xl md:text-6xl text-gold-400 leading-none tracking-tight">
        {stat}
      </div>
      <div className="text-sm text-slate-200 leading-relaxed">{label}</div>
      {attribution && (
        <div className="text-[11px] text-slate-500 font-mono mt-auto pt-3 border-t border-gold-500/10">
          {attribution}
        </div>
      )}
    </div>
  );
}
