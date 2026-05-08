import { Users, Stack } from "@phosphor-icons/react";
import { useCsv, ALL_HANDLE } from "../state/CsvContext.jsx";

// Vibrant rainbow palette — one accent per creator slot. Matches the legacy
// CreatorSwitcher palette so colors stay consistent across UIs.
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

const ALL_HUE = "#4f8dfe";

// Tabbed creator filter. Renders one tab per detected creator (using the
// original-case OwnerUsername from the CSV) and an optional "ALL" tab that
// merges every creator's rows into a unified dataset view.
//
// Returns null when only one (or zero) creators are present — the tab strip
// only carries weight on multi-creator uploads.
export default function CreatorTabs({
  allowAll = false,
  allLabel = "ALL CREATORS",
  label,
}) {
  const { creators, selectedHandle, setSelectedHandle, perCreator } = useCsv();

  if (!creators || creators.length < 2) return null;

  const totalRows = creators.reduce((sum, c) => sum + (c.count || 0), 0);
  const headerLabel =
    label || (allowAll ? "FILTER // CREATORS" : "VIEWING //");

  return (
    <div
      style={{
        background: "var(--tac-surface2)",
        borderBottom: "1px solid var(--tac-border)",
        padding: "10px 16px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 9,
          color: "var(--tac-mute)",
          letterSpacing: "0.18em",
          fontWeight: 600,
        }}
      >
        <Users size={11} weight="regular" color={ALL_HUE} />
        {headerLabel}
      </span>

      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 9,
          color: "var(--tac-dim)",
          letterSpacing: "0.1em",
        }}
      >
        {creators.length} DETECTED · {totalRows.toLocaleString()} ROWS
      </span>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginLeft: "auto",
        }}
      >
        {allowAll && (
          <CreatorTab
            active={selectedHandle === ALL_HANDLE}
            hue={ALL_HUE}
            label={allLabel}
            count={totalRows}
            Icon={Stack}
            onClick={() => setSelectedHandle(ALL_HANDLE)}
          />
        )}
        {creators.map((c, idx) => {
          const hue = CREATOR_HUES[idx % CREATOR_HUES.length];
          const active = c.handle === selectedHandle;
          const alias = perCreator?.[c.handle]?.alias;
          const display = alias || c.displayHandle || c.handle;
          return (
            <CreatorTab
              key={c.handle}
              active={active}
              hue={hue}
              label={`@${display}`}
              count={c.count}
              onClick={() => setSelectedHandle(c.handle)}
            />
          );
        })}
      </div>
    </div>
  );
}

function CreatorTab({ active, hue, label, count, Icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 12px",
        background: active ? `${hue}1f` : "var(--tac-bg)",
        border: `1px solid ${active ? hue : "var(--tac-border)"}`,
        color: active ? "var(--tac-fg)" : "var(--tac-mute)",
        cursor: "pointer",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
        letterSpacing: "0.04em",
        transition:
          "background 120ms, border-color 120ms, color 120ms, box-shadow 120ms",
        boxShadow: active ? `0 4px 14px -8px ${hue}` : "none",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = hue;
          e.currentTarget.style.color = "var(--tac-fg)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = "var(--tac-border)";
          e.currentTarget.style.color = "var(--tac-mute)";
        }
      }}
    >
      {Icon ? (
        <Icon size={11} weight="regular" color={hue} />
      ) : (
        <span
          style={{
            width: 6,
            height: 6,
            background: hue,
            boxShadow: active ? `0 0 8px ${hue}` : "none",
          }}
        />
      )}
      <span style={{ fontWeight: active ? 600 : 500 }}>{label}</span>
      <span
        style={{
          fontSize: 9,
          color: active ? "var(--tac-fg)" : "var(--tac-dim)",
          background: active ? `${hue}33` : "var(--tac-surface)",
          padding: "1px 6px",
          letterSpacing: "0.06em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count.toLocaleString()}
      </span>
    </button>
  );
}
