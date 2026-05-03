import { memo, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowSquareOut,
  Eye,
  Heart,
  ChatCircle,
  Pulse,
  Trophy,
  Medal,
} from "@phosphor-icons/react";
import WidgetFrame from "./WidgetFrame.jsx";

const SORTS = [
  { id: "views", label: "VIEWS", icon: Eye, getter: (r) => num(r.videoViewCount) || num(r.videoPlayCount) },
  { id: "likes", label: "LIKES", icon: Heart, getter: (r) => num(r.likesCount) },
  { id: "comments", label: "COMMENTS", icon: ChatCircle, getter: (r) => num(r.commentsCount) },
  { id: "engagement", label: "ENGAGEMENT", icon: Pulse, getter: (r) => num(r.likesCount) + num(r.commentsCount) },
];

// Podium tints for rank 1/2/3 — color does the talking, no labels.
const PODIUM = {
  1: {
    bg: "#1f1a08",
    border: "#fbbf24",
    rule: "#fbbf24",
    accent: "#fbbf24",
  },
  2: {
    bg: "#1c1c1c",
    border: "#cbd5e1",
    rule: "#cbd5e1",
    accent: "#cbd5e1",
  },
  3: {
    bg: "#1d150c",
    border: "#d97706",
    rule: "#d97706",
    accent: "#d97706",
  },
};

function Top10ReelsGrid({ rows = [], missing = false }) {
  const [sortId, setSortId] = useState("views");
  const sort = SORTS.find((s) => s.id === sortId);

  const top = useMemo(() => {
    return [...rows]
      .map((r, i) => ({ ...r, _idx: i }))
      .sort((a, b) => sort.getter(b) - sort.getter(a))
      .slice(0, 10);
  }, [rows, sort]);

  return (
    <WidgetFrame name="TOP 10 REELS" type="RANKED">
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 10 }}>
        <div
          style={{
            display: "flex",
            gap: 1,
            background: "var(--tac-border)",
            border: "1px solid var(--tac-border)",
          }}
        >
          {SORTS.map((s) => {
            const active = s.id === sortId;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSortId(s.id)}
                style={{
                  flex: 1,
                  background: active ? "var(--tac-bg)" : "var(--tac-surface2)",
                  border: "none",
                  borderTop: active ? "2px solid #4f8dfe" : "2px solid transparent",
                  color: active ? "var(--tac-fg)" : "var(--tac-mute)",
                  padding: "8px 10px",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "color 120ms",
                }}
              >
                <Icon size={11} weight="regular" />
                {s.label}
              </button>
            );
          })}
        </div>

        {missing ? (
          <div
            style={{
              display: "grid",
              placeItems: "center",
              padding: 32,
              background: "var(--tac-surface2)",
              border: "1px dashed var(--tac-border)",
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              color: "#ef4444",
              letterSpacing: "0.06em",
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            // MISSING REQUIRED COLUMNS
            <br />
            <span style={{ color: "var(--tac-mute)" }}>
              top-10 ranking needs view + url columns
            </span>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 1,
              background: "var(--tac-border)",
            }}
          >
            <AnimatePresence initial={false}>
              {top.map((reel, idx) => (
                <ReelCard
                  key={reel.shortCode || reel.id || reel._idx}
                  reel={reel}
                  rank={idx + 1}
                  sort={sort}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </WidgetFrame>
  );
}

const ReelCard = memo(function ReelCard({ reel, rank, sort }) {
  const url = reelUrl(reel);
  const primary = sort.getter(reel);
  const PrimaryIcon = sort.icon;
  const podium = PODIUM[rank];

  const views = num(reel.videoViewCount) || num(reel.videoPlayCount);
  const likes = num(reel.likesCount);
  const comments = num(reel.commentsCount);
  const duration = num(reel.videoDuration);
  const caption = (reel.caption || "").trim().replace(/\s+/g, " ");
  const captionShort = caption.length > 110 ? caption.slice(0, 109) + "…" : caption;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
      style={{
        background: podium ? podium.bg : "var(--tac-surface)",
        padding: 12,
        display: "grid",
        gridTemplateRows: "auto auto auto",
        gap: 10,
        position: "relative",
        minHeight: 150,
        borderTop: podium ? `2px solid ${podium.border}` : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <RankBadge rank={rank} podium={podium} />
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open reel"
            style={{
              color: "var(--tac-mute)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              letterSpacing: "0.1em",
              textDecoration: "none",
              border: "1px solid var(--tac-border)",
              padding: "2px 6px",
              transition: "border-color 120ms, color 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#4f8dfe";
              e.currentTarget.style.color = "var(--tac-fg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--tac-border)";
              e.currentTarget.style.color = "var(--tac-mute)";
            }}
          >
            OPEN
            <ArrowSquareOut size={9} weight="regular" />
          </a>
        ) : (
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              color: "var(--tac-dim)",
              border: "1px solid var(--tac-border)",
              padding: "2px 6px",
            }}
          >
            NO URL
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          paddingBottom: 8,
          borderBottom: `1px solid ${podium ? podium.rule : "var(--tac-border)"}`,
        }}
      >
        <PrimaryIcon
          size={12}
          weight="regular"
          color={podium ? podium.accent : "#4f8dfe"}
        />
        <span
          className="tac-display"
          style={{ fontSize: 22, color: podium ? podium.accent : "var(--tac-fg)" }}
        >
          {fmt(primary)}
        </span>
        <span
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9,
            color: "var(--tac-mute)",
            letterSpacing: "0.1em",
            marginLeft: "auto",
          }}
        >
          {sort.label}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 9,
        }}
      >
        <Stat icon={Eye} value={views} label="VWS" active={sort.id === "views"} accent={podium?.accent} />
        <Stat icon={Heart} value={likes} label="LKS" active={sort.id === "likes"} accent={podium?.accent} />
        <Stat icon={ChatCircle} value={comments} label="CMT" active={sort.id === "comments"} accent={podium?.accent} />
        <Stat
          icon={null}
          value={duration ? `${duration.toFixed(0)}s` : "—"}
          label="DUR"
          isText
        />
      </div>

      <div
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10,
          color: "var(--tac-mute)",
          lineHeight: 1.45,
          paddingTop: 6,
          borderTop: "1px solid var(--tac-border)",
          minHeight: 38,
        }}
        title={caption}
      >
        {captionShort || <span style={{ color: "var(--tac-dim)" }}>(no caption)</span>}
      </div>
    </motion.div>
  );
});

function Stat({ icon: Icon, value, label, active, isText, accent }) {
  const activeColor = accent || "#4f8dfe";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto auto",
        gap: 2,
        padding: 4,
        background: active ? "var(--tac-bg)" : "transparent",
        border: active ? `1px solid ${activeColor}` : "1px solid var(--tac-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          color: "var(--tac-dim)",
          letterSpacing: "0.1em",
        }}
      >
        {Icon && <Icon size={9} weight="regular" />}
        {label}
      </div>
      <div
        style={{
          color: active ? activeColor : "var(--tac-fg)",
          fontWeight: active ? 600 : 400,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {isText ? value : fmt(value)}
      </div>
    </div>
  );
}

function RankBadge({ rank, podium }) {
  if (podium) {
    const Icon = rank === 1 ? Trophy : Medal;
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 8px",
          background: podium.accent,
          color: "var(--tac-bg)",
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <Icon size={11} weight="fill" />#{rank}
      </span>
    );
  }
  return (
    <div
      style={{
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 10,
        color: "var(--tac-mute)",
        letterSpacing: "0.1em",
      }}
    >
      #{String(rank).padStart(2, "0")}
    </div>
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (typeof n === "string") return n;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function reelUrl(row) {
  if (row?.url) return row.url;
  if (row?.shortCode) return `https://www.instagram.com/reel/${row.shortCode}/`;
  return null;
}

export default memo(Top10ReelsGrid);
