import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X as XIcon,
  Check,
  Dna,
  Upload,
} from "@phosphor-icons/react";
import { useCsv } from "../state/CsvContext.jsx";
import { rowHandle } from "../../lib/datasetClassifier.js";

// Same vibrant palette as CreatorTabs so the modal's creator chips match the
// per-view tab colors operators see elsewhere.
const CREATOR_HUES = [
  "#EC4899",
  "#A855F7",
  "#6366F1",
  "#3B82F6",
  "#F97316",
  "var(--tac-warning)",
  "var(--tac-danger)",
  "#D946EF",
  "#7C3AED",
  "#F43F5E",
];

// Sentinel for the in-modal "show every creator" filter. Lowercase + leading
// underscores so it can never collide with a real creator handle.
const ALL_CREATORS = "__all__";

export default function CreateVariationModal({ open, onClose, onCreated, slotsAvailable }) {
  const {
    rows,
    runVariation,
    filename,
    creators,
    selectedHandle,
    setSelectedHandle,
    variations,
  } = useCsv();

  const multiCreator = creators.length > 1;

  // `ranked` is computed off the unfiltered `rows` so each item carries a
  // stable `rowIdx` — selections survive creator-filter and search changes.
  // Creator metadata is attached up front so the row renderer doesn't have
  // to recompute the badge color/handle on every keystroke.
  const ranked = useMemo(() => {
    return rows
      .map((r, idx) => {
        const handle = rowHandle(r) || "unknown";
        const creatorIdx = creators.findIndex((c) => c.handle === handle);
        const creator =
          creatorIdx >= 0
            ? creators[creatorIdx]
            : { handle, displayHandle: handle, count: 0 };
        return {
          row: r,
          rowIdx: idx,
          creator,
          creatorIdx: creatorIdx >= 0 ? creatorIdx : 0,
          views: num(r.videoViewCount) || num(r.videoPlayCount),
          likes: num(r.likesCount),
          comments: num(r.commentsCount),
          engagement: num(r.likesCount) + num(r.commentsCount),
        };
      })
      .sort((a, b) => b.views - a.views);
  }, [rows, creators]);

  const [creatorFilter, setCreatorFilter] = useState(ALL_CREATORS);
  const [selectedIdxs, setSelectedIdxs] = useState(() => new Set());
  const [count, setCount] = useState(3);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [dna, setDna] = useState(null); // { filename, text, size } | null
  const [dnaError, setDnaError] = useState("");

  useEffect(() => {
    if (!open) return;
    setCreatorFilter(multiCreator ? ALL_CREATORS : creators[0]?.handle || ALL_CREATORS);
    setSelectedIdxs(new Set());
    setCount(3);
    setName("");
    setSearch("");
    setDna(null);
    setDnaError("");
  }, [open, multiCreator, creators]);

  // clamp count to [1,5] in case state was set elsewhere
  useEffect(() => {
    if (count > 5) setCount(5);
    if (count < 1) setCount(1);
  }, [count]);

  if (rows.length === 0) return null;

  // Display filter — search + creator. Selection state lives on `rowIdx`
  // which is stable across both, so toggling either of these never wipes
  // a pick the user already made.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ranked.filter((item) => {
      if (creatorFilter !== ALL_CREATORS && item.creator.handle !== creatorFilter)
        return false;
      if (!q) return true;
      const cap = String(item.row.caption || "").toLowerCase();
      const url = String(item.row.url || "").toLowerCase();
      return cap.includes(q) || url.includes(q);
    });
  }, [ranked, search, creatorFilter]);

  const selectedRanked = useMemo(
    () => ranked.filter((item) => selectedIdxs.has(item.rowIdx)),
    [ranked, selectedIdxs]
  );

  const selectedCount = selectedIdxs.size;
  const hiddenSelected = selectedRanked.filter((s) => {
    if (creatorFilter !== ALL_CREATORS && s.creator.handle !== creatorFilter) return true;
    const q = search.trim().toLowerCase();
    if (!q) return false;
    const cap = String(s.row.caption || "").toLowerCase();
    const url = String(s.row.url || "").toLowerCase();
    return !(cap.includes(q) || url.includes(q));
  }).length;

  const isBatch = selectedCount > 1;
  // Cap the batch by free notepad slots so we never silently drop pages.
  const slotCap = Math.max(1, Number(slotsAvailable) || 1);
  const overSlotCap = selectedCount > slotCap;
  const canProceed = selectedCount >= 1 && !overSlotCap;

  const toggleSelected = (rowIdx) => {
    setSelectedIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(rowIdx)) next.delete(rowIdx);
      else next.add(rowIdx);
      return next;
    });
  };

  const clearSelection = () => setSelectedIdxs(new Set());
  const selectVisibleTop = (n) => {
    setSelectedIdxs((prev) => {
      const next = new Set(prev);
      visible.slice(0, n).forEach((item) => next.add(item.rowIdx));
      return next;
    });
  };

  const fire = () => {
    if (!canProceed) return;
    // For batches, promote the most-represented creator to the global
    // selection so the Scripts view drops the operator on a tab that has
    // at least one of their fresh pages.
    const tally = {};
    selectedRanked.forEach((s) => {
      tally[s.creator.handle] = (tally[s.creator.handle] || 0) + 1;
    });
    const winnerHandle = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (winnerHandle && winnerHandle !== selectedHandle) {
      setSelectedHandle(winnerHandle);
    }

    const userName = name.trim();
    let lastId = null;
    selectedRanked.forEach((item, idx) => {
      // Single pick → honor the operator's name. Batch → always auto-name
      // (creator handle + shortcode) so each page is identifiable in the
      // notepad sidebar without having to open it.
      const pageName = isBatch
        ? autoNameFromItem(item)
        : userName || untitledFromSelected(item);
      const id = runVariation({
        name: pageName,
        sourceVideo: item.row,
        count,
        dnaText: dna?.text || null,
        dnaFilename: dna?.filename || null,
      });
      if (idx === 0) lastId = id;
    });
    onCreated?.(lastId);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bd"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(10,10,10,0.78)",
              zIndex: 40,
            }}
          />
          <motion.div
            key="mod"
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 26 }}
            role="dialog"
            aria-label="Create script variation"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 41,
              display: "grid",
              placeItems: "center",
              padding: 24,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                pointerEvents: "auto",
                background: "var(--tac-surface)",
                border: "1px solid var(--tac-border)",
                borderRadius: 12,
                width: "min(720px, 100%)",
                maxHeight: "calc(100dvh - 80px)",
                display: "grid",
                gridTemplateRows: "auto 1fr auto",
                fontFamily:
                  '"Inter", ui-sans-serif, system-ui, sans-serif',
                position: "relative",
                boxShadow: "0 24px 60px -20px rgba(0, 0, 0, 0.6)",
              }}
            >
              <header
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid var(--tac-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div className="tac-section-title" style={{ fontSize: 17 }}>
                    Create scripts
                  </div>
                  <div className="tac-section-copy">
                    {isBatch
                      ? `${selectedCount} reels selected — generate ${count} script${count === 1 ? "" : "s"} from each.`
                      : "Choose a source reel and generate record-ready script variations."}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="tac-btn"
                  style={{ padding: 6 }}
                >
                  <XIcon size={14} weight="regular" />
                </button>
              </header>

              <ConfigBody
                visible={visible}
                fullCount={ranked.length}
                selectedIdxs={selectedIdxs}
                toggleSelected={toggleSelected}
                clearSelection={clearSelection}
                selectVisibleTop={selectVisibleTop}
                selectedCount={selectedCount}
                hiddenSelected={hiddenSelected}
                isBatch={isBatch}
                count={count}
                setCount={setCount}
                name={name}
                setName={setName}
                search={search}
                setSearch={setSearch}
                filename={filename}
                dna={dna}
                setDna={setDna}
                dnaError={dnaError}
                setDnaError={setDnaError}
                creators={creators}
                creatorFilter={creatorFilter}
                setCreatorFilter={setCreatorFilter}
                multiCreator={multiCreator}
                slotCap={slotCap}
                overSlotCap={overSlotCap}
              />

              <footer
                style={{
                  padding: "14px 20px",
                  borderTop: "1px solid var(--tac-border)",
                  background: "var(--tac-surface2)",
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: overSlotCap ? "var(--tac-danger)" : "var(--tac-mute)",
                  }}
                >
                  {overSlotCap
                    ? `${selectedCount} picked — only ${slotCap} session slot${slotCap > 1 ? "s" : ""} free`
                    : selectedCount === 0
                    ? "Pick at least one reel to continue"
                    : isBatch
                    ? `${selectedCount} reels selected — one session per reel`
                    : `Ready to generate ${count} script${count === 1 ? "" : "s"}`}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={onClose}
                    className="tac-btn"
                    style={{ padding: "8px 14px", fontSize: 13 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={fire}
                    disabled={!canProceed}
                    className="tac-btn tac-btn-accent"
                    style={{
                      padding: "8px 18px",
                      fontSize: 13,
                      opacity: canProceed ? 1 : 0.4,
                      cursor: canProceed ? "pointer" : "not-allowed",
                    }}
                  >
                    Generate scripts
                  </button>
                </div>
              </footer>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ConfigBody({
  visible,
  fullCount,
  selectedIdxs,
  toggleSelected,
  clearSelection,
  selectVisibleTop,
  selectedCount,
  hiddenSelected,
  isBatch,
  count,
  setCount,
  name,
  setName,
  search,
  setSearch,
  dna,
  setDna,
  dnaError,
  setDnaError,
  creators,
  creatorFilter,
  setCreatorFilter,
  multiCreator,
  slotCap,
  overSlotCap,
}) {
  // Multi-select source picker. Step order: page name → reels (with the
  // creator filter chips inline at the top) → variation count → DNA. Batches
  // auto-name each spawned page so the operator skips step 01 when picking
  // 2+ reels — the input gets disabled with an explanatory hint instead of
  // hidden so the layout stays stable.
  const nameDisabled = isBatch;
  return (
    <div
      style={{
        padding: "20px 22px",
        overflowY: "auto",
        display: "grid",
        gap: 22,
      }}
    >
      <Section
        step={1}
        label="Choose source reels"
        sub={
          multiCreator
            ? "Click rows to toggle. Filter by creator if needed."
            : "Click rows to toggle. Multi-select supported."
        }
      >
        {multiCreator && (
          <CreatorFilterChips
            creators={creators}
            value={creatorFilter}
            onChange={setCreatorFilter}
          />
        )}

        <input
          className="tac-input"
          placeholder="Search caption or URL"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            fontSize: 13,
            padding: "8px 12px",
            margin: "10px 0 8px",
          }}
        />

        <div
          style={{
            border: "1px solid var(--tac-border)",
            borderRadius: 8,
            background: "var(--tac-surface-inner)",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {visible.length === 0 && (
            <div
              style={{
                padding: 20,
                color: "var(--tac-mute)",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              No reels match this filter.
            </div>
          )}
          {visible.slice(0, 80).map((item, i) => (
            <SourceRow
              key={item.rowIdx}
              item={item}
              rank={i + 1}
              selected={selectedIdxs.has(item.rowIdx)}
              showCreator={multiCreator}
              onClick={() => toggleSelected(item.rowIdx)}
            />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginTop: 8,
            fontSize: 12,
            color: "var(--tac-mute)",
            flexWrap: "wrap",
          }}
        >
          <span>
            {visible.length} of {fullCount} reels · sorted by views
          </span>
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                color: overSlotCap
                  ? "var(--tac-danger)"
                  : selectedCount > 0
                  ? "var(--tac-accent)"
                  : "var(--tac-mute)",
                fontWeight: 500,
              }}
            >
              {selectedCount} selected
            </span>
            {hiddenSelected > 0 && (
              <span style={{ color: "var(--tac-mute)" }}>
                · {hiddenSelected} hidden
              </span>
            )}
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="tac-btn"
                style={{ padding: "3px 10px", fontSize: 12 }}
              >
                Clear
              </button>
            )}
            {visible.length > 0 && selectedCount < Math.min(slotCap, visible.length) && (
              <button
                type="button"
                onClick={() => selectVisibleTop(Math.min(slotCap, visible.length, 5))}
                title="Add the top reels in this view"
                className="tac-btn"
                style={{ padding: "3px 10px", fontSize: 12 }}
              >
                + Top {Math.min(slotCap, visible.length, 5)}
              </button>
            )}
          </span>
        </div>

        {overSlotCap && (
          <div className="tac-error-banner" style={{ marginTop: 8 }}>
            {selectedCount - slotCap} pick{selectedCount - slotCap > 1 ? "s" : ""} over the available session slots. Remove a page or trim the selection.
          </div>
        )}
      </Section>

      <Section
        step={2}
        label="Choose script count"
        sub={
          isBatch
            ? `Generate this many scripts from each of the ${selectedCount} selected reels.`
            : "Generate 1–5 script options from this reel."
        }
      >
        <CountChips value={count} onChange={setCount} />
      </Section>

      <Section
        step={3}
        label="Add brand voice"
        sub="Optional. Upload a brief so scripts match your tone, style, and constraints."
      >
        <DnaUpload
          dna={dna}
          setDna={setDna}
          dnaError={dnaError}
          setDnaError={setDnaError}
        />
      </Section>
    </div>
  );
}

// Filter chips with a leading ALL pill — shared style with the cross-app
// CreatorTabs widget but localized to the modal so picking a creator here
// doesn't tug the global selectedHandle. Selection is filter-only; rows from
// hidden creators stay selected if the operator already toggled them.
function CreatorFilterChips({ creators, value, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
      }}
    >
      <FilterChip
        label="All creators"
        count={creators.reduce((s, c) => s + (c.count || 0), 0)}
        active={value === ALL_CREATORS}
        hue="var(--tac-accent)"
        onClick={() => onChange(ALL_CREATORS)}
      />
      {creators.map((c, idx) => {
        const hue = CREATOR_HUES[idx % CREATOR_HUES.length];
        return (
          <FilterChip
            key={c.handle}
            label={`@${c.displayHandle || c.handle}`}
            count={c.count}
            active={value === c.handle}
            hue={hue}
            onClick={() => onChange(c.handle)}
          />
        );
      })}
    </div>
  );
}

function FilterChip({ label, count, active, hue, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        background: active ? `${hue}1f` : "var(--tac-surface2)",
        border: `1px solid ${active ? hue : "var(--tac-border)"}`,
        borderRadius: 999,
        color: active ? "var(--tac-fg)" : "var(--tac-mute)",
        cursor: "pointer",
        fontSize: 12,
        transition: "background 120ms, border-color 120ms, color 120ms",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: hue,
        }}
      />
      <span style={{ fontWeight: active ? 600 : 500 }}>{label}</span>
      <span
        style={{
          fontSize: 11,
          color: "var(--tac-mute)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function DnaUpload({ dna, setDna, dnaError, setDnaError }) {
  const inputRef = useRef(null);
  const MAX_BYTES = 200_000; // 200KB — DNA briefs should stay tight

  const onPick = () => inputRef.current?.click();

  const onFile = async (file) => {
    if (!file) return;
    setDnaError("");
    if (!/\.(md|markdown|txt|json)$/i.test(file.name)) {
      setDnaError("only .md / .txt / .json accepted");
      return;
    }
    if (file.size > MAX_BYTES) {
      setDnaError(`file too large (${fmtBytes(file.size)} > ${fmtBytes(MAX_BYTES)})`);
      return;
    }
    const text = await file.text();
    setDna({ filename: file.name, text, size: file.size });
  };

  if (dna) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          background: "var(--tac-surface2)",
          border: "1px solid var(--tac-border)",
          borderRadius: 8,
        }}
      >
        <Dna size={18} weight="regular" color="var(--tac-accent)" />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              color: "var(--tac-fg)",
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={dna.filename}
          >
            {dna.filename}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--tac-mute)",
              marginTop: 2,
            }}
          >
            {fmtBytes(dna.size)} · {dna.text.split(/\s+/).length} tokens · loaded
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDna(null)}
          aria-label="Remove brand voice brief"
          className="tac-btn"
          style={{ padding: "5px 12px", fontSize: 12 }}
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button
        type="button"
        onClick={onPick}
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          background: "var(--tac-surface2)",
          border: "1px solid var(--tac-border)",
          borderRadius: 8,
          color: "var(--tac-mute)",
          cursor: "pointer",
          textAlign: "left",
          fontFamily:
            '"Inter", ui-sans-serif, system-ui, sans-serif',
          fontSize: 13,
          transition: "border-color 120ms, color 120ms, background 120ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--tac-accent)";
          e.currentTarget.style.color = "var(--tac-fg)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--tac-border)";
          e.currentTarget.style.color = "var(--tac-mute)";
        }}
      >
        <Upload size={16} weight="regular" color="var(--tac-accent)" />
        <div>
          <div style={{ color: "var(--tac-fg)", fontWeight: 600 }}>
            Upload a brand voice brief
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--tac-mute)",
              marginTop: 2,
            }}
          >
            Voice, style, offers, constraints. Up to 200KB.
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            color: "var(--tac-dim)",
            letterSpacing: "0.05em",
          }}
        >
          .md  ·  .txt  ·  .json
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown,.txt,.json,text/markdown,text/plain,application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {dnaError && (
        <div style={{ fontSize: 12, color: "var(--tac-danger)" }}>
          {dnaError}
        </div>
      )}
    </div>
  );
}

function fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function SourceRow({ item, rank, selected, showCreator, onClick }) {
  const cap = String(item.row.caption || "").trim().replace(/\s+/g, " ");
  const creatorHue = CREATOR_HUES[item.creatorIdx % CREATOR_HUES.length];
  const creatorLabel = item.creator?.displayHandle || item.creator?.handle || "";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        width: "100%",
        textAlign: "left",
        background: selected ? "var(--tac-surface2)" : "transparent",
        borderLeft: selected
          ? `3px solid ${creatorHue}`
          : "3px solid transparent",
        borderTop: rank === 1 ? "none" : "1px solid var(--tac-border)",
        padding: "10px 14px",
        display: "grid",
        gridTemplateColumns: "20px 28px 1fr auto",
        gap: 12,
        alignItems: "center",
        color: selected ? "var(--tac-fg)" : "var(--tac-mute)",
        cursor: "pointer",
        fontFamily:
          '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 13,
        transition: "background 120ms, color 120ms",
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          border: `1.5px solid ${selected ? creatorHue : "var(--tac-border-strong)"}`,
          background: selected ? creatorHue : "transparent",
          borderRadius: 4,
          display: "grid",
          placeItems: "center",
          color: "var(--tac-bg)",
          flexShrink: 0,
        }}
        aria-hidden
      >
        {selected && <Check size={10} weight="bold" />}
      </span>
      <span
        style={{
          color: "var(--tac-mute)",
          fontVariantNumeric: "tabular-nums",
          fontSize: 12,
        }}
      >
        {String(rank).padStart(2, "0")}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--tac-fg)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontWeight: 500,
          }}
          title={cap}
        >
          {showCreator && creatorLabel && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: creatorHue,
                background: `${creatorHue}1f`,
                padding: "2px 8px",
                borderRadius: 999,
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: creatorHue,
                }}
              />
              @{creatorLabel}
            </span>
          )}
          {cap || <span style={{ color: "var(--tac-dim)" }}>(no caption)</span>}
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            color: "var(--tac-mute)",
            marginTop: 4,
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>{fmt(item.views)} views</span>
          <span style={{ color: "var(--tac-dim)" }}>·</span>
          <span>{fmt(item.likes)} likes</span>
          <span style={{ color: "var(--tac-dim)" }}>·</span>
          <span>{fmt(item.comments)} comments</span>
        </div>
      </div>
    </button>
  );
}

function Section({ step, label, sub, children }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 4,
        }}
      >
        {step != null && (
          <span
            style={{
              display: "inline-grid",
              placeItems: "center",
              width: 22,
              height: 22,
              borderRadius: 999,
              background: "var(--tac-accent-soft)",
              color: "var(--tac-accent)",
              fontSize: 12,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              flexShrink: 0,
            }}
          >
            {step}
          </span>
        )}
        <span
          style={{
            fontSize: 14,
            color: "var(--tac-fg)",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      </div>
      {sub && (
        <div
          style={{
            fontSize: 12,
            color: "var(--tac-mute)",
            marginLeft: step != null ? 32 : 0,
            marginBottom: 10,
            lineHeight: 1.5,
          }}
        >
          {sub}
        </div>
      )}
      <div style={{ marginLeft: step != null ? 32 : 0 }}>{children}</div>
    </div>
  );
}

function CountChips({ value, onChange }) {
  const options = [1, 2, 3, 4, 5];
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 6,
      }}
    >
      {options.map((n) => {
        const active = n === value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            style={{
              minWidth: 38,
              height: 36,
              padding: "0 12px",
              background: active ? "var(--tac-accent)" : "var(--tac-surface2)",
              border: active
                ? "1px solid var(--tac-accent)"
                : "1px solid var(--tac-border)",
              borderRadius: 8,
              color: active ? "var(--tac-bg)" : "var(--tac-fg)",
              fontSize: 14,
              fontWeight: active ? 700 : 500,
              cursor: "pointer",
              transition: "color 100ms, border-color 100ms, background 100ms",
              fontVariantNumeric: "tabular-nums",
            }}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.borderColor = "var(--tac-accent)";
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.borderColor = "var(--tac-border)";
              }
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function untitledFromSelected(item) {
  if (!item) return "UNTITLED";
  const cap = String(item.row.caption || "").trim().split(/\s+/).slice(0, 4).join("_");
  const code = item.row.shortCode || "";
  return (cap || code || "UNTITLED").toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 28);
}

// Batch-friendly auto-name. Prefixes the page with the creator handle so the
// notepad sidebar stays readable when 5+ pages from different creators all
// land back-to-back. Falls back to the caption-only naming when the row
// somehow has no creator attached.
function autoNameFromItem(item) {
  if (!item) return "UNTITLED";
  const handle = item.creator?.displayHandle || item.creator?.handle || "";
  const code = item.row.shortCode || "";
  const cap = String(item.row.caption || "").trim().split(/\s+/).slice(0, 3).join("_");
  const tail = (code || cap || "UNTITLED")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 18);
  if (!handle) return tail || untitledFromSelected(item);
  const head = handle.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 14);
  return `${head}_${tail}`.slice(0, 32);
}
