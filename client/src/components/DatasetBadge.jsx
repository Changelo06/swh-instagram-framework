import { Calendar, Film, Image as ImageIcon, Layers as LayersIcon, HelpCircle } from "lucide-react";
import { classifyContentMix } from "../lib/datasetClassifier.js";

const MIX_CONFIG = {
  "ALL REELS": { icon: Film, color: "#A855F7" },
  MIXED: { icon: LayersIcon, color: "#3B82F6" },
  "POSTS ONLY": { icon: ImageIcon, color: "#FBBF24" },
  UNKNOWN: { icon: HelpCircle, color: "#64748B" },
};

function fmtDate(d) {
  if (!d) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DatasetBadge({ classification, posts }) {
  const mix = classifyContentMix(posts);
  const mixConfig = MIX_CONFIG[mix] || MIX_CONFIG.UNKNOWN;
  const MixIcon = mixConfig.icon;

  return (
    <div className="flex flex-wrap items-center gap-3 mt-3">
      {classification?.oldest && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/10 bg-white/[0.02] text-[11px] text-slate-300 font-mono">
          <Calendar size={13} className="text-vibe-purple" strokeWidth={2.2} />
          <span className="text-slate-500 uppercase tracking-[0.18em] text-[9px] font-semibold">
            First post
          </span>
          <span className="text-slate-100">{fmtDate(classification.oldest)}</span>
        </div>
      )}

      {classification?.newest && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/10 bg-white/[0.02] text-[11px] text-slate-300 font-mono">
          <Calendar size={13} className="text-vibe-pink" strokeWidth={2.2} />
          <span className="text-slate-500 uppercase tracking-[0.18em] text-[9px] font-semibold">
            Latest post
          </span>
          <span className="text-slate-100">{fmtDate(classification.newest)}</span>
        </div>
      )}

      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-semibold tracking-wider uppercase"
        style={{
          color: mixConfig.color,
          borderColor: `${mixConfig.color}55`,
          backgroundColor: `${mixConfig.color}15`,
        }}
      >
        <MixIcon size={14} strokeWidth={2.2} />
        <span>{mix}</span>
      </div>

      {posts?.length > 0 && (
        <div className="text-[11px] text-slate-500 font-mono">
          {posts.length} post{posts.length === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
