import { Users, Stack } from "@phosphor-icons/react";
import { useCsv, ALL_HANDLE } from "../state/CsvContext.jsx";

// Tabbed creator filter. Renders one tab per detected creator (using the
// original-case OwnerUsername from the CSV) and an optional "All" tab that
// merges every creator's rows into a unified dataset view.
//
// Returns null when only one (or zero) creators are present — the tab strip
// only carries weight on multi-creator uploads.
export default function CreatorTabs({
  allowAll = false,
  allLabel = "All creators",
  label,
}) {
  const { creators, selectedHandle, setSelectedHandle, perCreator } = useCsv();

  if (!creators || creators.length < 2) return null;

  const totalRows = creators.reduce((sum, c) => sum + (c.count || 0), 0);
  const headerLabel = label || (allowAll ? "Creators" : "Viewing");

  return (
    <div
      style={{
        background: "var(--tac-bg)",
        borderTop: "1px solid var(--tac-border)",
        borderBottom: "1px solid var(--tac-border)",
        padding: "10px 24px",
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
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
          fontSize: 12,
          color: "var(--tac-mute)",
          fontWeight: 500,
        }}
      >
        <Users size={13} weight="regular" />
        {headerLabel}
      </span>

      <span
        style={{
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
          fontSize: 12,
          color: "var(--tac-dim)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {creators.length} detected · {totalRows.toLocaleString()} rows
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
            label={allLabel}
            count={totalRows}
            Icon={Stack}
            onClick={() => setSelectedHandle(ALL_HANDLE)}
          />
        )}
        {creators.map((c) => {
          const active = c.handle === selectedHandle;
          const alias = perCreator?.[c.handle]?.alias;
          const display = alias || c.displayHandle || c.handle;
          return (
            <CreatorTab
              key={c.handle}
              active={active}
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

function CreatorTab({ active, label, count, Icon, onClick }) {
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
        background: active ? "var(--tac-surface2)" : "transparent",
        border: `1px solid ${active ? "var(--tac-accent)" : "var(--tac-border)"}`,
        borderRadius: 9999,
        color: active ? "var(--tac-fg)" : "var(--tac-mute)",
        cursor: "pointer",
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 13,
        transition:
          "background 120ms, border-color 120ms, color 120ms",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = "var(--tac-mute)";
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
      {Icon && (
        <Icon
          size={12}
          weight="regular"
          color={active ? "var(--tac-accent)" : "var(--tac-mute)"}
        />
      )}
      <span style={{ fontWeight: active ? 500 : 400 }}>{label}</span>
      <span
        style={{
          fontSize: 11,
          color: active ? "var(--tac-mute)" : "var(--tac-dim)",
          background: active ? "var(--tac-surface)" : "var(--tac-surface2)",
          borderRadius: 9999,
          padding: "1px 8px",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count.toLocaleString()}
      </span>
    </button>
  );
}
