import {
  Calendar,
  CalendarDays,
  CalendarRange,
  Infinity as InfinityIcon,
  HelpCircle,
  Film,
  Image as ImageIcon,
  Layers as LayersIcon,
} from "lucide-react";
import { classifyContentMix, formatRange } from "../lib/datasetClassifier.js";

const BADGE_CONFIG = {
  WEEKLY: { icon: Calendar, color: "#F39C12", label: "WEEKLY" },
  MONTHLY: { icon: CalendarDays, color: "#3498DB", label: "MONTHLY" },
  QUARTERLY: { icon: CalendarRange, color: "#9B59B6", label: "QUARTERLY" },
  "ALL TIME": { icon: InfinityIcon, color: "#C9A84C", label: "ALL TIME" },
  UNKNOWN: { icon: HelpCircle, color: "#8892A4", label: "UNKNOWN" },
};

const MIX_CONFIG = {
  "ALL REELS": { icon: Film, color: "#2ECC71" },
  MIXED: { icon: LayersIcon, color: "#3498DB" },
  "POSTS ONLY": { icon: ImageIcon, color: "#F39C12" },
  UNKNOWN: { icon: HelpCircle, color: "#8892A4" },
};

export default function DatasetBadge({ classification, posts }) {
  const config = BADGE_CONFIG[classification.type] || BADGE_CONFIG.UNKNOWN;
  const Icon = config.icon;
  const mix = classifyContentMix(posts);
  const mixConfig = MIX_CONFIG[mix] || MIX_CONFIG.UNKNOWN;
  const MixIcon = mixConfig.icon;

  return (
    <div className="flex flex-wrap items-center gap-3 mt-3">
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-semibold tracking-wider uppercase"
        style={{
          color: config.color,
          borderColor: `${config.color}55`,
          backgroundColor: `${config.color}15`,
        }}
      >
        <Icon size={14} strokeWidth={2.2} />
        <span>{config.label}</span>
        {classification.span > 0 && (
          <span className="opacity-60 font-normal normal-case ml-1">
            · {classification.span}d span
          </span>
        )}
      </div>

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

      {classification.oldest && (
        <div className="text-[11px] text-slate-400 font-mono">
          {formatRange(classification.oldest, classification.newest)}
        </div>
      )}

      {posts?.length > 0 && (
        <div className="text-[11px] text-slate-400 font-mono">
          {posts.length} post{posts.length === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
