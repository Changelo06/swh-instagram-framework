import { PenLine } from "lucide-react";

export default function ScriptStepper({ value, onChange, disabled }) {
  const setVal = (n) => onChange(Math.max(1, Math.min(5, n)));

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <label className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-slate-300 font-semibold">
            <PenLine size={14} className="text-gold-400" />
            Script Variations
          </label>
          <p className="text-[11px] text-slate-500 mt-0.5">Default: 3 · Max: 5</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setVal(value - 1)}
            disabled={disabled || value <= 1}
            className="w-8 h-8 rounded-md border border-gold-500/30 text-gold-400 hover:bg-gold-500/10 disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
            aria-label="decrease"
          >
            −
          </button>

          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                aria-hidden
                className="w-2.5 h-2.5 rounded-full transition-colors"
                style={{
                  backgroundColor: n <= value ? "#d4af37" : "#1d3a60",
                  boxShadow: n <= value ? "0 0 6px rgba(212,175,55,0.45)" : "none",
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setVal(value + 1)}
            disabled={disabled || value >= 5}
            className="w-8 h-8 rounded-md border border-gold-500/30 text-gold-400 hover:bg-gold-500/10 disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
            aria-label="increase"
          >
            +
          </button>

          <span className="text-sm text-gold-400 font-mono w-20 text-right">
            {value} script{value > 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
