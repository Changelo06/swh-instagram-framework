import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Layers, ChevronDown, ChevronUp } from "lucide-react";
import { parseReelStructure } from "../lib/frameworkParser.js";

const STAGE_PALETTE = {
  HOOK: "#d4af37",
  CTA: "#d4af37",
  CALLBACK: "#d4af37",
};

function stageColor(name) {
  if (STAGE_PALETTE[name]) return STAGE_PALETTE[name];
  return "#274d7a";
}

export default function ReelStructureBlueprint({ part3Md }) {
  const data = parseReelStructure(part3Md);
  if (!data) return null;
  const { stages, breakdowns } = data;

  return (
    <section className="my-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-md bg-gold-500/15 text-gold-400 grid place-items-center">
          <Layers size={16} strokeWidth={2.2} />
        </div>
        <div>
          <div className="font-serif text-lg gold-text">Reel Structure Blueprint</div>
          <div className="text-xs text-slate-400">Dominant section-by-section pipeline</div>
        </div>
      </div>

      <div className="card p-5 overflow-x-auto">
        <div className="flex items-stretch gap-2 min-w-max">
          {stages.map((s, i) => (
            <PipelineNode key={`${s.name}-${i}`} stage={s} isLast={i === stages.length - 1} />
          ))}
        </div>
      </div>

      {breakdowns?.length > 0 && (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-3 font-semibold">
            Top {breakdowns.length} Performance Breakdowns
          </div>
          <div className="space-y-3">
            {breakdowns.map((b, i) => (
              <BreakdownCard key={i} rank={i + 1} breakdown={b} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PipelineNode({ stage, isLast }) {
  const color = stageColor(stage.name);
  return (
    <div className="flex items-center">
      <div
        className="rounded-lg px-4 py-3 min-w-[112px] text-center border"
        style={{
          backgroundColor: `${color}1a`,
          borderColor: `${color}55`,
        }}
      >
        <div className="font-mono text-xs font-bold tracking-widest" style={{ color }}>
          {stage.name}
        </div>
        {stage.seconds != null && (
          <div className="text-[11px] text-slate-300 mt-1">{stage.seconds}s</div>
        )}
      </div>
      {!isLast && (
        <div className="px-1 text-gold-500/60 text-lg leading-none select-none">→</div>
      )}
    </div>
  );
}

function BreakdownCard({ rank, breakdown }) {
  const [open, setOpen] = useState(rank === 1);
  return (
    <div className="card p-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-serif text-2xl gold-text leading-none">#{rank}</span>
          <span className="text-sm text-slate-200 truncate">{breakdown.title}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {breakdown.views != null && (
            <span className="text-xs text-gold-400 font-mono">
              {breakdown.views.toLocaleString()} views
            </span>
          )}
          {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-gold-500/10 report report-compact">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{breakdown.body}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
