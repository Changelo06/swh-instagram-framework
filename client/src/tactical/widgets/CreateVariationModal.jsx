import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X as XIcon,
  Crosshair,
  Eye,
  Heart,
  ChatCircle,
  ArrowSquareOut,
  Sparkle,
  Lightning,
  Check,
  Dna,
  Upload,
  Microphone,
  CheckCircle,
  Users,
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
  "#FBBF24",
  "#EF4444",
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
  const [phase, setPhase] = useState("config"); // config | preconfirm
  const [search, setSearch] = useState("");
  const [dna, setDna] = useState(null); // { filename, text, size } | null
  const [dnaError, setDnaError] = useState("");

  useEffect(() => {
    if (!open) return;
    setCreatorFilter(multiCreator ? ALL_CREATORS : creators[0]?.handle || ALL_CREATORS);
    setSelectedIdxs(new Set());
    setCount(3);
    setName("");
    setPhase("config");
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

  const proceed = () => setPhase("preconfirm");
  const back = () => setPhase("config");

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
                background: "var(--tac-surface2)",
                border: "1px solid var(--tac-border)",
                width: "min(720px, 100%)",
                maxHeight: "calc(100dvh - 80px)",
                display: "grid",
                gridTemplateRows: "auto 1fr auto",
                fontFamily: '"JetBrains Mono", monospace',
                position: "relative",
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
                  <div className="tac-label">
                    SCRIPT FORGE /{" "}
                    {isBatch ? `BATCH × ${selectedCount}` : "NEW PAGE"}
                  </div>
                  <div
                    className="tac-display"
                    style={{ fontSize: 18, color: "var(--tac-fg)", marginTop: 4 }}
                  >
                    {phase === "config" ? "FORGE VARIATION" : "PRE-CONFIRM"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--tac-border)",
                    color: "var(--tac-mute)",
                    padding: 6,
                    cursor: "pointer",
                    transition: "color 120ms, border-color 120ms",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--tac-fg)";
                    e.currentTarget.style.borderColor = "#4f8dfe";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--tac-mute)";
                    e.currentTarget.style.borderColor = "var(--tac-border)";
                  }}
                >
                  <XIcon size={13} weight="regular" />
                </button>
              </header>

              {phase === "config" ? (
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
              ) : (
                <PreconfirmBody
                  selectedRanked={selectedRanked}
                  count={count}
                  isBatch={isBatch}
                  name={name}
                  filename={filename}
                  dna={dna}
                  multiCreator={multiCreator}
                />
              )}

              <footer
                style={{
                  padding: "12px 20px",
                  borderTop: "1px solid var(--tac-border)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                {phase === "config" ? (
                  <>
                    <span
                      style={{
                        fontSize: 9,
                        color: overSlotCap
                          ? "#ef4444"
                          : selectedCount === 0
                          ? "var(--tac-mute)"
                          : "#4f8dfe",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {overSlotCap
                        ? `// ${selectedCount} picked · only ${slotCap} notepad slot${slotCap > 1 ? "s" : ""} free`
                        : selectedCount === 0
                        ? "// pick at least one reel — click rows to toggle"
                        : isBatch
                        ? `BATCH READY · ${selectedCount} pages will spawn`
                        : "READY · click PRE-CONFIRM"}
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={onClose}
                        className="tac-btn"
                        style={{ padding: "8px 14px", fontSize: 11 }}
                      >
                        CANCEL
                      </button>
                      <button
                        type="button"
                        onClick={proceed}
                        disabled={!canProceed}
                        className="tac-btn tac-btn-accent"
                        style={{
                          padding: "8px 16px",
                          fontSize: 11,
                          opacity: canProceed ? 1 : 0.4,
                          cursor: canProceed ? "pointer" : "not-allowed",
                        }}
                      >
                        PRE-CONFIRM
                        <Check size={11} weight="bold" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span
                      style={{
                        fontSize: 9,
                        color: "#fbbf24",
                        letterSpacing: "0.1em",
                      }}
                    >
                      // confirm to dispatch run · stream begins immediately
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={back}
                        className="tac-btn"
                        style={{ padding: "8px 14px", fontSize: 11 }}
                      >
                        ← EDIT
                      </button>
                      <button
                        type="button"
                        onClick={fire}
                        className="tac-btn tac-btn-accent"
                        style={{ padding: "8px 16px", fontSize: 11 }}
                      >
                        {isBatch ? `FIRE × ${selectedCount}` : "FIRE RUN"}
                        <Sparkle size={11} weight="fill" />
                      </button>
                    </div>
                  </>
                )}
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
        padding: "16px 20px",
        overflowY: "auto",
        display: "grid",
        gap: 16,
      }}
    >
      <Section
        label="01 / PAGE NAME"
        sub={
          nameDisabled
            ? "auto-named per page in batch mode"
            : "optional · leave blank for auto-naming"
        }
      >
        <input
          className="tac-input"
          placeholder={
            nameDisabled
              ? "auto: {CREATOR}_{SHORTCODE}"
              : "e.g. MORNING_HOOKS_v1"
          }
          value={nameDisabled ? "" : name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          disabled={nameDisabled}
          maxLength={40}
          style={{
            fontSize: 11,
            padding: "8px 10px",
            letterSpacing: "0.04em",
            opacity: nameDisabled ? 0.5 : 1,
          }}
        />
      </Section>

      <Section
        label="02 / SOURCE REELS"
        sub={
          multiCreator
            ? "click rows to toggle · ALL creators by default"
            : "click rows to toggle · multi-select supported"
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
          placeholder="search caption or url..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            fontSize: 11,
            padding: "6px 10px",
            margin: "8px 0 6px",
          }}
        />

        <div
          style={{
            border: "1px solid var(--tac-border)",
            background: "var(--tac-bg)",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {visible.length === 0 && (
            <div
              style={{
                padding: 16,
                color: "var(--tac-dim)",
                fontSize: 10,
                textAlign: "center",
              }}
            >
              // no rows match the current filter
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
            marginTop: 6,
            fontSize: 9,
            color: "var(--tac-dim)",
            letterSpacing: "0.04em",
            flexWrap: "wrap",
          }}
        >
          <span>
            {visible.length} of {fullCount} visible · sorted by views desc
          </span>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <span
              style={{
                color: overSlotCap ? "#ef4444" : selectedCount > 0 ? "#4f8dfe" : "var(--tac-dim)",
                fontWeight: 600,
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
                style={{
                  background: "transparent",
                  border: "1px solid var(--tac-border)",
                  color: "var(--tac-mute)",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 9,
                  letterSpacing: "0.06em",
                  padding: "1px 6px",
                  cursor: "pointer",
                }}
              >
                CLEAR
              </button>
            )}
            {visible.length > 0 && selectedCount < Math.min(slotCap, visible.length) && (
              <button
                type="button"
                onClick={() => selectVisibleTop(Math.min(slotCap, visible.length, 5))}
                title="Add the top reels in the current view to the batch"
                style={{
                  background: "transparent",
                  border: "1px solid var(--tac-border)",
                  color: "#4f8dfe",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 9,
                  letterSpacing: "0.06em",
                  padding: "1px 6px",
                  cursor: "pointer",
                }}
              >
                + TOP {Math.min(slotCap, visible.length, 5)}
              </button>
            )}
          </span>
        </div>

        {overSlotCap && (
          <div
            style={{
              marginTop: 6,
              padding: "8px 10px",
              background: "#1f1212",
              border: "1px solid #ef4444",
              color: "#ef4444",
              fontSize: 10,
              letterSpacing: "0.04em",
              lineHeight: 1.5,
            }}
          >
            // {selectedCount - slotCap} pick{selectedCount - slotCap > 1 ? "s" : ""} over notepad capacity. Remove pages or trim selection.
          </div>
        )}
      </Section>

      <Section
        label="03 / VARIATION COUNT"
        sub={
          isBatch
            ? `applies to all ${selectedCount} pages in the batch`
            : "how many script blueprints to generate"
        }
      >
        <CountChips value={count} onChange={setCount} />
      </Section>

      <Section
        label="04 / DNA OVERRIDE"
        sub="optional · upload .md / .txt / .json to reshape variations"
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
        padding: 6,
        background: "rgba(79, 141, 254, 0.06)",
        border: "1px dashed #4f8dfe",
      }}
    >
      <FilterChip
        label="ALL"
        count={creators.reduce((s, c) => s + (c.count || 0), 0)}
        active={value === ALL_CREATORS}
        hue="#4f8dfe"
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
        padding: "4px 10px",
        background: active ? `${hue}1f` : "var(--tac-bg)",
        border: `1px solid ${active ? hue : "var(--tac-border)"}`,
        color: active ? "var(--tac-fg)" : "var(--tac-mute)",
        cursor: "pointer",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 10,
        letterSpacing: "0.04em",
        transition: "background 120ms, border-color 120ms, color 120ms",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          background: hue,
        }}
      />
      <span style={{ fontWeight: active ? 600 : 500 }}>{label}</span>
      <span
        style={{
          fontSize: 8,
          color: active ? "var(--tac-fg)" : "var(--tac-dim)",
          background: active ? `${hue}33` : "var(--tac-surface)",
          padding: "1px 5px",
          letterSpacing: "0.06em",
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
          padding: "10px 12px",
          background: "rgba(79, 141, 254, 0.06)",
          border: "1px dashed #4f8dfe",
        }}
      >
        <Dna size={16} weight="regular" color="#4f8dfe" />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--tac-fg)",
              fontWeight: 600,
              letterSpacing: "0.04em",
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
              fontSize: 9,
              color: "var(--tac-mute)",
              marginTop: 2,
              letterSpacing: "0.06em",
            }}
          >
            {fmtBytes(dna.size)} · {dna.text.split(/\s+/).length} tokens · loaded
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDna(null)}
          aria-label="Remove DNA"
          style={{
            background: "transparent",
            border: "1px solid var(--tac-border)",
            color: "var(--tac-mute)",
            padding: "3px 8px",
            cursor: "pointer",
            fontSize: 9,
            letterSpacing: "0.1em",
            fontFamily: '"JetBrains Mono", monospace',
            transition: "color 120ms, border-color 120ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--tac-fg)";
            e.currentTarget.style.borderColor = "#ef4444";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--tac-mute)";
            e.currentTarget.style.borderColor = "var(--tac-border)";
          }}
        >
          REMOVE
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 6,
      }}
    >
      <button
        type="button"
        onClick={onPick}
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          background: "var(--tac-bg)",
          border: "1px dashed var(--tac-border)",
          color: "var(--tac-mute)",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 11,
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
        <Upload size={14} weight="regular" color="#4f8dfe" />
        <div>
          <div style={{ color: "var(--tac-fg)", fontWeight: 600 }}>
            Upload DNA brief
          </div>
          <div
            style={{
              fontSize: 9,
              color: "var(--tac-mute)",
              marginTop: 2,
              letterSpacing: "0.04em",
            }}
          >
            voice / style / constraints · max 200KB · funnel into variation
            context window
          </div>
        </div>
        <span
          style={{
            fontSize: 9,
            color: "var(--tac-dim)",
            letterSpacing: "0.1em",
          }}
        >
          .MD .TXT .JSON
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
        <div
          style={{
            fontSize: 10,
            color: "#ef4444",
            letterSpacing: "0.04em",
          }}
        >
          // {dnaError}
        </div>
      )}
      <div
        style={{
          fontSize: 9,
          color: "var(--tac-dim)",
          letterSpacing: "0.04em",
          lineHeight: 1.6,
        }}
      >
        // when a DNA brief is attached, the source video&apos;s emotional
        weights + creator dna are funneled into a variation context window
        and reshaped against your uploaded voice. without it, variations
        clone the source style as-is.
      </div>
    </div>
  );
}

function fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function PreconfirmBody({ selectedRanked, count, isBatch, name, filename, dna, multiCreator }) {
  if (!selectedRanked || selectedRanked.length === 0) return null;
  const single = selectedRanked[0];
  // Per-creator tally for the batch summary line. Stable hue from the
  // creator's index in the global creators array (already attached to each
  // ranked item) so the dot color matches what the operator saw on the row.
  const creatorTally = selectedRanked.reduce((acc, s) => {
    const key = s.creator.handle;
    if (!acc[key]) acc[key] = { creator: s.creator, idx: s.creatorIdx, count: 0 };
    acc[key].count++;
    return acc;
  }, {});

  return (
    <div
      style={{
        padding: "20px",
        overflowY: "auto",
        display: "grid",
        gap: 14,
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          background: "var(--tac-bg)",
          border: "1px solid var(--tac-border)",
          borderLeft: "3px solid #fbbf24",
          color: "var(--tac-fg)",
          fontSize: 11,
          lineHeight: 1.6,
        }}
      >
        {isBatch ? (
          <>
            Forge will dispatch{" "}
            <span style={{ color: "#4f8dfe" }}>{selectedRanked.length} parallel runs</span>{" "}
            to /api/analyze · scripts-only — one streaming page per selected reel.
          </>
        ) : (
          <>
            Forge will dispatch a streaming run to{" "}
            <span style={{ color: "#4f8dfe" }}>/api/analyze · scripts-only</span>{" "}
            with the selected source video at the head of the payload.
          </>
        )}
        <br />
        <span style={{ color: "var(--tac-mute)" }}>
          // streaming starts immediately on FIRE — you can stop each page
          mid-run from its tab.
        </span>
      </div>

      <div style={{ display: "grid", gap: 1, background: "var(--tac-border)" }}>
        <KV
          k={isBatch ? "PAGES" : "PAGE NAME"}
          v={
            isBatch
              ? `${selectedRanked.length} pages · auto-named per reel`
              : name.trim() || autoNameFromItem(single)
          }
          accent
        />
        {multiCreator && (
          <KV
            k="CREATORS"
            v={
              <span
                style={{
                  display: "inline-flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {Object.values(creatorTally).map((t) => {
                  const hue = CREATOR_HUES[t.idx % CREATOR_HUES.length];
                  return (
                    <span
                      key={t.creator.handle}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 11,
                      }}
                    >
                      <span
                        style={{ width: 6, height: 6, background: hue }}
                      />
                      <span style={{ color: "var(--tac-fg)" }}>
                        @{t.creator.displayHandle || t.creator.handle}
                      </span>
                      <span style={{ color: "var(--tac-mute)" }}>· {t.count}</span>
                    </span>
                  );
                })}
              </span>
            }
          />
        )}
        <KV
          k="VARIATIONS / PAGE"
          v={`${count} blueprint${count > 1 ? "s" : ""} × ${selectedRanked.length} page${selectedRanked.length > 1 ? "s" : ""} = ${count * selectedRanked.length} total`}
        />
        <KV k="DATASET" v={filename || "—"} />
        <KV
          k="DNA OVERRIDE"
          v={
            dna ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#4f8dfe",
                }}
              >
                <Dna size={11} weight="regular" />
                {dna.filename} · {fmtBytes(dna.size)}
              </span>
            ) : (
              <span style={{ color: "var(--tac-mute)" }}>none · clone source style as-is</span>
            )
          }
        />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div
          style={{
            fontSize: 9,
            color: "#4f8dfe",
            letterSpacing: "0.18em",
            fontWeight: 600,
          }}
        >
          {isBatch ? `BATCH MANIFEST · ${selectedRanked.length}` : "SOURCE REEL"}
        </div>
        <div
          style={{
            border: "1px solid var(--tac-border)",
            background: "var(--tac-bg)",
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {selectedRanked.map((item, i) => {
            const hue = CREATOR_HUES[item.creatorIdx % CREATOR_HUES.length];
            const cap = String(item.row.caption || "").trim().replace(/\s+/g, " ");
            return (
              <div
                key={item.rowIdx}
                style={{
                  padding: "8px 12px",
                  borderBottom:
                    i === selectedRanked.length - 1
                      ? "none"
                      : "1px solid var(--tac-surface)",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 10,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    color: "var(--tac-fg)",
                    fontWeight: 600,
                  }}
                >
                  <span style={{ width: 5, height: 5, background: hue }} />
                  @{item.creator.displayHandle || item.creator.handle}
                </span>
                <span
                  style={{
                    color: "var(--tac-mute)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                  }}
                  title={cap || item.row.url}
                >
                  {cap || (item.row.url ? shortenUrl(item.row.url) : "(no caption)")}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    gap: 8,
                    color: "var(--tac-dim)",
                    fontSize: 9,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <Stat icon={Eye} label="VWS" value={fmt(item.views)} />
                  <Stat icon={Heart} label="LKS" value={fmt(item.likes)} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SourceRow({ item, rank, selected, showCreator, onClick }) {
  const cap = String(item.row.caption || "").trim().replace(/\s+/g, " ");
  const url = item.row.url || "";
  const hasAudio = !!item.row._audioUrl;
  const hasTranscript = !!(
    item.row["reel-transcript"] && String(item.row["reel-transcript"]).trim()
  );
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
        background: selected ? "var(--tac-surface)" : "transparent",
        borderLeft: selected
          ? `2px solid ${creatorHue}`
          : "2px solid transparent",
        borderTop: rank === 1 ? "none" : "1px solid var(--tac-surface)",
        border: rank === 1 ? "2px solid transparent" : undefined,
        boxShadow: selected ? `inset 0 0 0 1px ${creatorHue}33` : "none",
        padding: "10px 12px",
        display: "grid",
        gridTemplateColumns: "20px 32px 1fr auto",
        gap: 10,
        alignItems: "center",
        color: selected ? "var(--tac-fg)" : "var(--tac-mute)",
        cursor: "pointer",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 10,
        transition: "background 120ms, color 120ms",
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          border: `1px solid ${selected ? creatorHue : "var(--tac-border)"}`,
          background: selected ? creatorHue : "transparent",
          display: "grid",
          placeItems: "center",
          color: "var(--tac-bg)",
          flexShrink: 0,
        }}
        aria-hidden
      >
        {selected && <Check size={9} weight="bold" />}
      </span>
      <span
        style={{
          color: "var(--tac-dim)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        #{String(rank).padStart(2, "0")}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "var(--tac-fg)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={cap}
        >
          {showCreator && creatorLabel && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 8,
                color: creatorHue,
                border: `1px solid ${creatorHue}`,
                padding: "0 4px",
                letterSpacing: "0.08em",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              <span style={{ width: 4, height: 4, background: creatorHue }} />
              @{creatorLabel}
            </span>
          )}
          {hasTranscript ? (
            <span
              title="Groq transcript already captured"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 8,
                color: "#4AF626",
                border: "1px solid #4AF626",
                padding: "0 4px",
                letterSpacing: "0.1em",
                fontWeight: 700,
              }}
            >
              <CheckCircle size={8} weight="fill" />
              CACHED
            </span>
          ) : hasAudio ? (
            <span
              title="Has audio URL — Groq Whisper will transcribe on RUN"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 8,
                color: "#4f8dfe",
                border: "1px solid #4f8dfe",
                padding: "0 4px",
                letterSpacing: "0.1em",
                fontWeight: 700,
              }}
            >
              <Microphone size={8} weight="regular" />
              MIC
            </span>
          ) : (
            <span
              title="No audio URL detected — analysis runs on caption only"
              style={{
                fontSize: 8,
                color: "var(--tac-dim)",
                border: "1px solid var(--tac-border)",
                padding: "0 4px",
                letterSpacing: "0.1em",
              }}
            >
              NO AUDIO
            </span>
          )}
          {cap || <span style={{ color: "var(--tac-dim)" }}>(no caption)</span>}
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            color: "var(--tac-mute)",
            marginTop: 3,
            fontSize: 9,
          }}
        >
          <Stat icon={Eye} label="VWS" value={fmt(item.views)} />
          <Stat icon={Heart} label="LKS" value={fmt(item.likes)} />
          <Stat icon={ChatCircle} label="CMT" value={fmt(item.comments)} />
        </div>
      </div>
      {url && (
        <span
          style={{
            color: "var(--tac-dim)",
            fontSize: 9,
            border: "1px solid var(--tac-border)",
            padding: "2px 6px",
            letterSpacing: "0.08em",
          }}
        >
          {shortenUrl(url)}
        </span>
      )}
    </button>
  );
}

function Section({ label, sub, children }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: "#4f8dfe",
            letterSpacing: "0.18em",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        {sub && (
          <span style={{ fontSize: 9, color: "var(--tac-dim)" }}>{sub}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function CountChips({ value, onChange }) {
  const options = [1, 2, 3, 4, 5];
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: 6,
        background: "rgba(79, 141, 254, 0.06)",
        border: "1px dashed #4f8dfe",
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
              flex: 1,
              minWidth: 24,
              height: 28,
              background: active ? "#4f8dfe" : "transparent",
              border: active ? "1px solid #4f8dfe" : "1px solid var(--tac-border)",
              color: active ? "var(--tac-bg)" : "var(--tac-mute)",
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              fontWeight: active ? 700 : 500,
              cursor: "pointer",
              transition: "color 100ms, border-color 100ms, background 100ms",
              fontVariantNumeric: "tabular-nums",
            }}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.borderColor = "#4f8dfe";
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
            {n}
          </button>
        );
      })}
    </div>
  );
}

function KV({ k, v, accent }) {
  return (
    <div
      style={{
        background: "var(--tac-surface)",
        padding: "10px 14px",
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontSize: 9,
          color: "var(--tac-mute)",
          letterSpacing: "0.1em",
        }}
      >
        {k}
      </span>
      <span
        style={{
          fontSize: 11,
          color: accent ? "#4f8dfe" : "var(--tac-fg)",
          fontWeight: accent ? 600 : 400,
        }}
      >
        {v || "—"}
      </span>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      <Icon size={9} weight="regular" />
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span style={{ color: "var(--tac-dim)" }}>{label}</span>
    </span>
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

function shortenUrl(u) {
  try {
    const url = new URL(u);
    const tail = url.pathname.split("/").filter(Boolean).pop() || "";
    return tail ? `…/${tail.slice(0, 10)}` : url.host.replace("www.", "");
  } catch {
    return String(u).slice(0, 18);
  }
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
