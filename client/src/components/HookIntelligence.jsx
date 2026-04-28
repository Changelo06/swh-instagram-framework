import { Anchor, TrendingUp, AlertTriangle } from "lucide-react";
import {
  parseHookGaps,
  parseHookIntelligence,
  parseHookRetires,
} from "../lib/frameworkParser.js";

const PERF_COLORS = {
  HIGH: "#2ECC71",
  MEDIUM: "#F39C12",
  LOW: "#E74C3C",
};

export default function HookIntelligence({ part2Md }) {
  const hooks = parseHookIntelligence(part2Md);
  const gaps = parseHookGaps(part2Md);
  const retires = parseHookRetires(part2Md);

  if (!hooks && !gaps && !retires) return null;

  return (
    <div className="space-y-6 my-6">
      {hooks && hooks.length > 0 && (
        <section>
          <SectionHeader icon={Anchor} label="Hook Intelligence" subtitle="Active patterns from top posts" />
          <div className="grid md:grid-cols-2 gap-4">
            {hooks.map((h, i) => (
              <HookCard key={i} hook={h} />
            ))}
          </div>
        </section>
      )}

      {gaps && gaps.length > 0 && (
        <section>
          <SectionHeader
            icon={TrendingUp}
            label="Hook Gap Opportunities"
            subtitle="Untapped patterns in this niche"
            accent="#2ECC71"
          />
          <div className="grid md:grid-cols-2 gap-4">
            {gaps.map((g, i) => (
              <GapCard key={i} gap={g} />
            ))}
          </div>
        </section>
      )}

      {retires && retires.length > 0 && (
        <section>
          <SectionHeader
            icon={AlertTriangle}
            label="Hook Patterns to Retire"
            subtitle="Underperformers — drop or rework"
            accent="#F59E0B"
          />
          <div className="grid md:grid-cols-2 gap-4">
            {retires.map((r, i) => (
              <RetireCard key={i} retire={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeader({ icon: Icon, label, subtitle, accent }) {
  const color = accent || "#d4af37";
  return (
    <div className="flex items-center gap-3 mb-3">
      <div
        className="w-8 h-8 rounded-md grid place-items-center"
        style={{ backgroundColor: `${color}20`, color }}
      >
        <Icon size={16} strokeWidth={2.2} />
      </div>
      <div>
        <div className="font-serif text-lg" style={{ color }}>
          {label}
        </div>
        {subtitle && <div className="text-xs text-slate-400">{subtitle}</div>}
      </div>
    </div>
  );
}

function HookCard({ hook }) {
  const perfColor = PERF_COLORS[hook.performance] || "#8892A4";
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="font-mono text-[11px] tracking-widest text-gold-400 uppercase">
          {hook.type}
        </div>
        {hook.performance && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ color: perfColor, backgroundColor: `${perfColor}20`, border: `1px solid ${perfColor}55` }}
          >
            {hook.performance}
          </span>
        )}
      </div>

      <div className="space-y-2 text-xs text-slate-300">
        {hook.usedInTopPosts != null && (
          <Row label="Top posts" value={`${hook.usedInTopPosts}`} />
        )}
        {hook.structure && <Row label="Structure" value={hook.structure} mono />}
        {hook.template && <Row label="Template" value={hook.template} mono />}
      </div>

      {hook.examples?.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gold-500/10">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Examples</div>
          <ul className="space-y-1.5 text-xs">
            {hook.examples.map((ex, i) => (
              <li key={i} className="flex items-start justify-between gap-3">
                <span className="text-slate-200 italic">"{ex.text}"</span>
                {ex.views != null && (
                  <span className="text-gold-400 font-mono shrink-0">
                    {ex.views.toLocaleString()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GapCard({ gap }) {
  return (
    <div className="card p-5 border-emerald-500/20">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="font-mono text-[11px] tracking-widest text-emerald-300 uppercase">
          {gap.type}
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-emerald-300 border border-emerald-400/40 bg-emerald-500/10">
          UNTAPPED
        </span>
      </div>
      {gap.reason && <p className="text-xs text-slate-300 leading-relaxed mb-2">{gap.reason}</p>}
      {gap.example && (
        <div className="mt-2 p-2 rounded bg-navy-800/60 border border-emerald-500/10 text-xs italic text-slate-200">
          "{gap.example}"
        </div>
      )}
    </div>
  );
}

function RetireCard({ retire }) {
  return (
    <div className="card p-5 border-amber-500/20">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="font-mono text-[11px] tracking-widest text-amber-300 uppercase">
          {retire.type}
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-amber-300 border border-amber-400/40 bg-amber-500/10">
          RETIRE
        </span>
      </div>
      {retire.evidence && (
        <p className="text-xs text-slate-300 leading-relaxed">{retire.evidence}</p>
      )}
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex gap-2">
      <span className="text-slate-500 shrink-0 w-[68px]">{label}</span>
      <span className={mono ? "text-slate-200 font-mono" : "text-slate-200"}>{value}</span>
    </div>
  );
}
