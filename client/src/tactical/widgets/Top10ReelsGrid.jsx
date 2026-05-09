import { memo, useMemo, useState } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import WidgetFrame from "./WidgetFrame.jsx";

const SORTS = [
  {
    id: "views",
    label: "Views",
    getter: (r) => num(r.videoViewCount) || num(r.videoPlayCount),
  },
  { id: "likes", label: "Likes", getter: (r) => num(r.likesCount) },
  {
    id: "comments",
    label: "Comments",
    getter: (r) => num(r.commentsCount),
  },
  {
    id: "engagement",
    label: "Engagement",
    getter: (r) => num(r.likesCount) + num(r.commentsCount),
  },
];

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
    <WidgetFrame
      name="Top 10 reels"
      action={
        <SortTabs sortId={sortId} onSortChange={setSortId} />
      }
    >
      {missing ? (
        <div
          className="tac-empty-grid"
          style={{
            display: "grid",
            placeItems: "center",
            padding: 32,
            border: "1px solid var(--tac-border)",
            borderRadius: 8,
            fontFamily:
              '"Inter", ui-sans-serif, system-ui, sans-serif',
            fontSize: 13,
            color: "var(--tac-danger)",
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          Required columns missing
          <br />
          <span style={{ color: "var(--tac-mute)", fontSize: 12 }}>
            Add view and URL columns to rank reels.
          </span>
        </div>
      ) : (
        <div className="tac-table-wrap">
        <table className="tac-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Caption</th>
              <th className="num" style={{ width: 90 }}>
                Views
              </th>
              <th className="num" style={{ width: 80 }}>
                Likes
              </th>
              <th className="num" style={{ width: 80 }}>
                Comments
              </th>
              <th className="num" style={{ width: 70 }}>
                Duration
              </th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {top.map((reel, idx) => (
              <ReelRow
                key={reel.shortCode || reel.id || reel._idx}
                reel={reel}
                rank={idx + 1}
                sortId={sortId}
              />
            ))}
          </tbody>
        </table>
        </div>
      )}
    </WidgetFrame>
  );
}

function SortTabs({ sortId, onSortChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {SORTS.map((s) => {
        const active = s.id === sortId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSortChange(s.id)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${
                active ? "var(--tac-accent)" : "transparent"
              }`,
              color: active ? "var(--tac-fg)" : "var(--tac-mute)",
              padding: "6px 10px",
              fontFamily:
                '"Inter", ui-sans-serif, system-ui, sans-serif',
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              cursor: "pointer",
              transition: "color 120ms, border-color 120ms",
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

const ReelRow = memo(function ReelRow({ reel, rank, sortId }) {
  const url = reelUrl(reel);
  const views = num(reel.videoViewCount) || num(reel.videoPlayCount);
  const likes = num(reel.likesCount);
  const comments = num(reel.commentsCount);
  const duration = num(reel.videoDuration);
  const caption = (reel.caption || "").trim().replace(/\s+/g, " ");
  const captionShort =
    caption.length > 80 ? caption.slice(0, 79) + "…" : caption;

  const isFirst = rank === 1;
  const cellStyle = (col) => ({
    color:
      sortId === col ? "var(--tac-accent)" : "var(--tac-fg)",
    fontWeight: sortId === col ? 600 : 400,
    background:
      sortId === col ? "var(--tac-accent-soft)" : "transparent",
  });

  return (
    <tr
      style={
        isFirst
          ? {
              boxShadow: "inset 3px 0 0 var(--tac-accent)",
            }
          : undefined
      }
    >
      <td
        className="num"
        style={{
          fontWeight: isFirst ? 600 : 500,
          color: isFirst ? "var(--tac-accent)" : "var(--tac-mute)",
          fontFamily:
            '"Inter", ui-sans-serif, system-ui, sans-serif',
        }}
      >
        {rank}
      </td>
      <td
        title={caption}
        style={{
          maxWidth: 360,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: caption ? "var(--tac-fg)" : "var(--tac-dim)",
        }}
      >
        {captionShort || "(no caption)"}
      </td>
      <td className="num" style={cellStyle("views")}>
        {fmt(views)}
      </td>
      <td className="num" style={cellStyle("likes")}>
        {fmt(likes)}
      </td>
      <td className="num" style={cellStyle("comments")}>
        {fmt(comments)}
      </td>
      <td className="num" style={{ color: "var(--tac-mute)" }}>
        {duration ? `${duration.toFixed(0)}s` : "—"}
      </td>
      <td style={{ textAlign: "right" }}>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open reel"
            title="Open reel"
            style={{
              display: "inline-grid",
              placeItems: "center",
              width: 26,
              height: 26,
              color: "var(--tac-mute)",
              textDecoration: "none",
              borderRadius: 6,
              transition: "color 120ms, background 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--tac-accent)";
              e.currentTarget.style.background = "var(--tac-surface2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--tac-mute)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <ArrowSquareOut size={13} weight="regular" />
          </a>
        )}
      </td>
    </tr>
  );
});

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
