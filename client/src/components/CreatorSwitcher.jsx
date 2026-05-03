import { Users } from "lucide-react";

// Vibrant rainbow palette for creator pill borders
const CREATOR_HUES = [
  "#EC4899", // pink
  "#A855F7", // purple
  "#6366F1", // indigo
  "#3B82F6", // blue
  "#F97316", // orange
  "#FBBF24", // amber
  "#EF4444", // red
  "#D946EF", // fuchsia
  "#7C3AED", // violet
  "#F43F5E", // rose
];

export default function CreatorSwitcher({
  creators,
  selectedHandle,
  onSelect,
}) {
  if (!creators || creators.length === 0) return null;
  const single = creators.length === 1;

  return (
    <div className="panel p-3 md:p-4 mb-5 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-400 font-semibold shrink-0">
        <Users size={12} className="text-vibe-purple" />
        {single ? "Creator" : `${creators.length} creators detected`}
      </div>
      <div className="flex flex-wrap gap-2">
        {creators.map((c, idx) => {
          const active = c.handle === selectedHandle;
          const hue = CREATOR_HUES[idx % CREATOR_HUES.length];
          return (
            <button
              key={c.handle}
              type="button"
              onClick={() => onSelect(c.handle)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all"
              style={
                active
                  ? {
                      background: `${hue}1f`,
                      border: `1px solid ${hue}aa`,
                      color: "#fff",
                      boxShadow: `0 6px 16px -8px ${hue}80`,
                    }
                  : {
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "#cbd5e1",
                    }
              }
              aria-pressed={active}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: hue, boxShadow: active ? `0 0 8px ${hue}` : "none" }}
              />
              <span className="font-mono text-xs">
                @{c.displayHandle || c.handle}
              </span>
              <span
                className="text-[11px] px-1.5 py-0.5 rounded font-mono"
                style={{
                  background: active ? `${hue}33` : "rgba(255,255,255,0.05)",
                  color: active ? "#fff" : "#94a3b8",
                }}
              >
                {c.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
