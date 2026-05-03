import { Trophy, Medal, Award, Flame, TrendingUp, Eye, Heart, MessageCircle, ExternalLink, Sparkles } from "lucide-react";
import { engagement, views } from "../lib/insights.js";

// Vibrant gradient colors used for ranks 4-10 (rainbow progression)
const RANK_HUES = [
  ["#F97316", "#EF4444"], // 4 — orange→red
  ["#EF4444", "#F43F5E"], // 5 — red→rose
  ["#F43F5E", "#EC4899"], // 6 — rose→pink
  ["#EC4899", "#D946EF"], // 7 — pink→fuchsia
  ["#D946EF", "#A855F7"], // 8 — fuchsia→purple
  ["#A855F7", "#7C3AED"], // 9 — purple→violet
  ["#7C3AED", "#6366F1"], // 10 — violet→indigo
];

function reelUrl(row) {
  if (row?.url) return row.url;
  if (row?.shortCode) return `https://www.instagram.com/reel/${row.shortCode}/`;
  return null;
}

function captionTitle(row, max = 64) {
  const c = (row.caption || "").trim().replace(/\s+/g, " ");
  if (!c) return "(no caption)";
  return c.length > max ? c.slice(0, max - 1) + "…" : c;
}

function formatCompact(n) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Compute z-score against the dataset to detect "above-curve" reels
function detectAchievements(rows) {
  const allViews = rows.map(views).filter((v) => v > 0);
  if (allViews.length < 3) return new Map();
  const mean = allViews.reduce((s, v) => s + v, 0) / allViews.length;
  const variance =
    allViews.reduce((s, v) => s + (v - mean) ** 2, 0) / allViews.length;
  const std = Math.sqrt(variance);
  const allEng = rows.map(engagement).filter((v) => v > 0);
  const meanEng = allEng.length
    ? allEng.reduce((s, v) => s + v, 0) / allEng.length
    : 0;

  const map = new Map();
  for (const r of rows) {
    const v = views(r);
    const e = engagement(r);
    const badges = [];
    if (std > 0 && v > mean + std) {
      badges.push({ key: "above-curve", label: "Above curve" });
    }
    if (v >= mean * 3) {
      badges.push({ key: "viral", label: "Viral" });
    }
    if (meanEng > 0 && e >= meanEng * 2.5) {
      badges.push({ key: "high-engagement", label: "High engagement" });
    }
    if (badges.length) map.set(r, badges);
  }
  return map;
}

const BADGE_ICONS = {
  "above-curve": TrendingUp,
  viral: Flame,
  "high-engagement": Sparkles,
};
const BADGE_COLORS = {
  "above-curve": "#A855F7",
  viral: "#EF4444",
  "high-engagement": "#FBBF24",
};

const MEDAL_RANKS = [
  { rank: 1, cls: "medal-gold", icon: Trophy, label: "GOLD" },
  { rank: 2, cls: "medal-silver", icon: Medal, label: "SILVER" },
  { rank: 3, cls: "medal-bronze", icon: Award, label: "BRONZE" },
];

export default function Top10Reels({ rows }) {
  const top = [...rows]
    .sort((a, b) => engagement(b) - engagement(a))
    .slice(0, 10);
  if (top.length === 0) return null;

  const achievements = detectAchievements(rows);

  const podium = top.slice(0, 3);
  const rest = top.slice(3);

  return (
    <div className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-vibe-purple font-semibold mb-1">
            Top 10 reels
          </div>
          <div className="font-serif text-xl text-white">
            Ranked by engagement.{" "}
            <span className="text-slate-500 text-base font-normal">
              Click any tile to open the reel.
            </span>
          </div>
        </div>
        <Legend />
      </div>

      {podium.length > 0 && (
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          {podium.map((row, i) => (
            <MedalTile
              key={row.shortCode || row.url || i}
              row={row}
              meta={MEDAL_RANKS[i]}
              badges={achievements.get(row) || []}
            />
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {rest.map((row, i) => (
            <RankTile
              key={row.shortCode || row.url || i + 4}
              row={row}
              rank={i + 4}
              hues={RANK_HUES[i] || RANK_HUES[RANK_HUES.length - 1]}
              badges={achievements.get(row) || []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MedalTile({ row, meta, badges }) {
  const url = reelUrl(row);
  const v = views(row);
  const e = engagement(row);
  const Icon = meta.icon;

  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div
          className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-bold"
          style={{
            background: `linear-gradient(90deg, var(--medal-from), var(--medal-to))`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          <Icon size={14} strokeWidth={2.2} className="text-current" />
          #{meta.rank} · {meta.label}
        </div>
        {url && (
          <ExternalLink
            size={13}
            className="text-slate-500 group-hover:text-white transition-colors"
          />
        )}
      </div>

      <div className="font-serif text-base text-white leading-snug line-clamp-3 min-h-[3.6em]">
        {captionTitle(row, 110)}
      </div>

      <div className="flex items-center gap-3 text-[11px] text-slate-300 font-mono">
        <span className="inline-flex items-center gap-1">
          <Eye size={11} className="text-slate-500" />
          {formatCompact(v)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Heart size={11} className="text-slate-500" />
          {formatCompact(Number(row.likesCount) || 0)}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle size={11} className="text-slate-500" />
          {formatCompact(Number(row.commentsCount) || 0)}
        </span>
        <span className="ml-auto text-white/80 font-semibold">
          {formatCompact(e)} engagement
        </span>
      </div>

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {badges.map((b) => {
            const BIcon = BADGE_ICONS[b.key];
            return (
              <span
                key={b.key}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold"
                style={{
                  background: `${BADGE_COLORS[b.key]}20`,
                  color: BADGE_COLORS[b.key],
                  border: `1px solid ${BADGE_COLORS[b.key]}55`,
                }}
                title={b.label}
              >
                {BIcon && <BIcon size={9} strokeWidth={2.4} />}
                {b.label}
              </span>
            );
          })}
        </div>
      )}
    </>
  );

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className={`medal-tile ${meta.cls} group block`}
      >
        <div className="medal-tile-inner">{inner}</div>
      </a>
    );
  }
  return (
    <div className={`medal-tile ${meta.cls} group`}>
      <div className="medal-tile-inner">{inner}</div>
    </div>
  );
}

function RankTile({ row, rank, hues, badges }) {
  const url = reelUrl(row);
  const v = views(row);
  const e = engagement(row);
  const [from, to] = hues;

  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] uppercase tracking-[0.2em] font-bold"
          style={{
            background: `linear-gradient(90deg, ${from}, ${to})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          #{rank}
        </span>
        {url && <ExternalLink size={12} className="text-slate-600 group-hover:text-white transition-colors" />}
      </div>

      <div className="text-sm text-white leading-snug line-clamp-3 min-h-[3.6em]">
        {captionTitle(row, 90)}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
        <span className="inline-flex items-center gap-1">
          <Eye size={10} />
          {formatCompact(v)}
        </span>
        <span className="ml-auto font-semibold text-slate-200">
          {formatCompact(e)} eng.
        </span>
      </div>

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {badges.map((b) => {
            const BIcon = BADGE_ICONS[b.key];
            return (
              <span
                key={b.key}
                className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] uppercase tracking-wider font-semibold"
                style={{
                  background: `${BADGE_COLORS[b.key]}20`,
                  color: BADGE_COLORS[b.key],
                }}
                title={b.label}
              >
                {BIcon && <BIcon size={8} strokeWidth={2.4} />}
              </span>
            );
          })}
        </div>
      )}
    </>
  );

  const wrapStyle = {
    background: `linear-gradient(160deg, ${from}, ${to})`,
    boxShadow: `0 10px 24px -16px ${from}80`,
  };
  const wrapHoverStyle = {};

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="rank-tile group block"
        style={wrapStyle}
      >
        <div className="rank-tile-inner">{inner}</div>
      </a>
    );
  }
  return (
    <div className="rank-tile group" style={wrapStyle}>
      <div className="rank-tile-inner">{inner}</div>
    </div>
  );
}

function Legend() {
  const items = [
    { key: "above-curve", label: "Above curve" },
    { key: "viral", label: "Viral" },
    { key: "high-engagement", label: "High engagement" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((it) => {
        const Icon = BADGE_ICONS[it.key];
        return (
          <span
            key={it.key}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded"
            style={{
              background: `${BADGE_COLORS[it.key]}15`,
              color: BADGE_COLORS[it.key],
              border: `1px solid ${BADGE_COLORS[it.key]}40`,
            }}
          >
            <Icon size={10} strokeWidth={2.4} />
            {it.label}
          </span>
        );
      })}
    </div>
  );
}
