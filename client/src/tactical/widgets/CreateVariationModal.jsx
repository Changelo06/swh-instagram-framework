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
} from "@phosphor-icons/react";
import { useCsv } from "../state/CsvContext.jsx";

export default function CreateVariationModal({ open, onClose, onCreated }) {
  const { rows, runVariation, filename } = useCsv();

  const ranked = useMemo(() => {
    return [...rows]
      .map((r, i) => ({
        row: r,
        idx: i,
        views: num(r.videoViewCount) || num(r.videoPlayCount),
        likes: num(r.likesCount),
        comments: num(r.commentsCount),
        engagement: num(r.likesCount) + num(r.commentsCount),
      }))
      .sort((a, b) => b.views - a.views);
  }, [rows]);

  const [selectedIdx, setSelectedIdx] = useState(null);
  const [count, setCount] = useState(3);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState("config"); // config | preconfirm
  const [search, setSearch] = useState("");
  const [dna, setDna] = useState(null); // { filename, text, size } | null
  const [dnaError, setDnaError] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedIdx(ranked[0]?.idx ?? null);
      setCount(3);
      setName("");
      setPhase("config");
      setSearch("");
      setDna(null);
      setDnaError("");
    }
  }, [open, ranked]);

  // clamp count to [1,5] in case state was set elsewhere
  useEffect(() => {
    if (count > 5) setCount(5);
    if (count < 1) setCount(1);
  }, [count]);

  if (!ranked.length) return null;

  const filtered = useMemo(() => {
    if (!search.trim()) return ranked;
    const q = search.toLowerCase();
    return ranked.filter((item) => {
      const cap = String(item.row.caption || "").toLowerCase();
      const url = String(item.row.url || "").toLowerCase();
      return cap.includes(q) || url.includes(q);
    });
  }, [ranked, search]);

  const selected = ranked.find((r) => r.idx === selectedIdx) || null;
  const isTopPick = selected && selected === ranked[0];

  const proceed = () => setPhase("preconfirm");
  const back = () => setPhase("config");

  const fire = () => {
    if (!selected) return;
    const id = runVariation({
      name: name.trim() || untitledFromSelected(selected),
      sourceVideo: selected.row,
      count,
      dnaText: dna?.text || null,
      dnaFilename: dna?.filename || null,
    });
    onCreated?.(id);
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
                  <div className="tac-label">SCRIPT FORGE / NEW PAGE</div>
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
                  ranked={filtered}
                  fullCount={ranked.length}
                  selectedIdx={selectedIdx}
                  setSelectedIdx={setSelectedIdx}
                  count={count}
                  setCount={setCount}
                  name={name}
                  setName={setName}
                  isTopPick={isTopPick}
                  search={search}
                  setSearch={setSearch}
                  filename={filename}
                  dna={dna}
                  setDna={setDna}
                  dnaError={dnaError}
                  setDnaError={setDnaError}
                />
              ) : (
                <PreconfirmBody
                  selected={selected}
                  count={count}
                  name={name || untitledFromSelected(selected)}
                  filename={filename}
                  dna={dna}
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
                    <span style={{ fontSize: 9, color: "var(--tac-mute)", letterSpacing: "0.1em" }}>
                      {selected ? "READY · click PRE-CONFIRM" : "// pick a source video"}
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
                        disabled={!selected}
                        className="tac-btn tac-btn-accent"
                        style={{
                          padding: "8px 16px",
                          fontSize: 11,
                          opacity: selected ? 1 : 0.4,
                          cursor: selected ? "pointer" : "not-allowed",
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
                        FIRE RUN
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
  ranked,
  fullCount,
  selectedIdx,
  setSelectedIdx,
  count,
  setCount,
  name,
  setName,
  isTopPick,
  search,
  setSearch,
  dna,
  setDna,
  dnaError,
  setDnaError,
}) {
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
        label="01 / SOURCE VIDEO"
        sub="default = highest-views reel · search to narrow"
      >
        <input
          className="tac-input"
          placeholder="search caption or url..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ fontSize: 11, padding: "6px 10px", marginBottom: 6 }}
        />
        <div
          style={{
            border: "1px solid var(--tac-border)",
            background: "var(--tac-bg)",
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {ranked.length === 0 && (
            <div
              style={{
                padding: 16,
                color: "var(--tac-dim)",
                fontSize: 10,
                textAlign: "center",
              }}
            >
              // no rows match search
            </div>
          )}
          {ranked.slice(0, 60).map((item, i) => (
            <SourceRow
              key={item.idx}
              item={item}
              rank={i + 1}
              selected={item.idx === selectedIdx}
              recommended={i === 0 && isTopPick}
              onClick={() => setSelectedIdx(item.idx)}
            />
          ))}
        </div>
        <div style={{ fontSize: 9, color: "var(--tac-dim)", marginTop: 6 }}>
          {ranked.length} of {fullCount} listed · sorted by views desc
        </div>
      </Section>

      <Section
        label="02 / VARIATION COUNT"
        sub="how many script blueprints to generate"
      >
        <CountChips value={count} onChange={setCount} />
      </Section>

      <Section
        label="03 / PAGE NAME"
        sub="optional · leave blank for auto-naming"
      >
        <input
          className="tac-input"
          placeholder="e.g. MORNING_HOOKS_v1"
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          maxLength={40}
          style={{
            fontSize: 11,
            padding: "8px 10px",
            letterSpacing: "0.04em",
          }}
        />
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

function PreconfirmBody({ selected, count, name, filename, dna }) {
  if (!selected) return null;
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
        Forge will dispatch a streaming run to{" "}
        <span style={{ color: "#4f8dfe" }}>/api/analyze · scripts-only</span>{" "}
        with the selected source video at the head of the payload.
        <br />
        <span style={{ color: "var(--tac-mute)" }}>
          // streaming starts immediately on FIRE — you can stop mid-run from
          the page.
        </span>
      </div>

      <div style={{ display: "grid", gap: 1, background: "var(--tac-border)" }}>
        <KV k="PAGE NAME" v={name} accent />
        <KV k="VARIATION COUNT" v={`${count} blueprint${count > 1 ? "s" : ""}`} />
        <KV
          k="SOURCE VIDEO"
          v={
            <a
              href={selected.row.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#4f8dfe",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {selected.row.url || `(no url) shortCode=${selected.row.shortCode}`}
              <ArrowSquareOut size={10} weight="regular" />
            </a>
          }
        />
        <KV
          k="VIDEO METRICS"
          v={
            <span style={{ display: "flex", gap: 12 }}>
              <Stat icon={Eye} label="VWS" value={fmt(selected.views)} />
              <Stat icon={Heart} label="LKS" value={fmt(selected.likes)} />
              <Stat
                icon={ChatCircle}
                label="CMT"
                value={fmt(selected.comments)}
              />
            </span>
          }
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

      {selected.row.caption && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--tac-bg)",
            border: "1px solid var(--tac-border)",
            color: "var(--tac-fg)",
            fontSize: 11,
            lineHeight: 1.6,
            maxHeight: 120,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: "var(--tac-mute)",
              letterSpacing: "0.1em",
              marginBottom: 4,
            }}
          >
            CAPTION
          </div>
          {String(selected.row.caption).trim()}
        </div>
      )}
    </div>
  );
}

function SourceRow({ item, rank, selected, recommended, onClick }) {
  const cap = String(item.row.caption || "").trim().replace(/\s+/g, " ");
  const url = item.row.url || "";
  const hasAudio = !!item.row._audioUrl;
  const hasTranscript = !!(
    item.row["reel-transcript"] && String(item.row["reel-transcript"]).trim()
  );
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        background: selected ? "var(--tac-surface)" : "transparent",
        borderLeft: selected
          ? "2px solid #4f8dfe"
          : "2px solid transparent",
        borderTop: rank === 1 ? "none" : "1px solid var(--tac-surface)",
        border: rank === 1 ? "2px solid transparent" : undefined,
        padding: "10px 12px",
        display: "grid",
        gridTemplateColumns: "32px 1fr auto",
        gap: 12,
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
          {recommended && (
            <span
              style={{
                fontSize: 8,
                color: "var(--tac-bg)",
                background: "#fbbf24",
                padding: "1px 4px",
                letterSpacing: "0.1em",
                fontWeight: 700,
              }}
            >
              TOP
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
