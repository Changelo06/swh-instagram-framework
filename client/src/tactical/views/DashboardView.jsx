import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadSimple,
  Crosshair,
  Warning,
  PencilSimple,
  Check,
} from "@phosphor-icons/react";
import { useCsv, STAGE } from "../state/CsvContext.jsx";
import {
  aggregateStats,
  uploadCadence,
  views,
  engagementRate,
} from "../../lib/insights.js";
import { classifyDataset } from "../../lib/datasetClassifier.js";
import SparklineCard from "../widgets/SparklineCard.jsx";
import LiveTimeline from "../widgets/LiveTimeline.jsx";
import CommandInput from "../widgets/CommandInput.jsx";
import SkeletonGrid from "../widgets/SkeletonGrid.jsx";
import Top10ReelsGrid from "../widgets/Top10ReelsGrid.jsx";
import ScatterPlot from "../widgets/ScatterPlot.jsx";
import ValidationGate from "../widgets/ValidationGate.jsx";

export default function DashboardView() {
  const { stage, error } = useCsv();

  return (
    <div
      style={{
        position: "relative",
        minHeight: "calc(100dvh - 44px)",
      }}
    >
      <AnimatePresence mode="wait">
        {(stage === STAGE.IDLE || stage === STAGE.ERROR) && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <UploadIdle error={error} />
          </motion.div>
        )}

        {(stage === STAGE.PARSING || stage === STAGE.VALIDATING) && (
          <motion.div
            key="parsing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <SkeletonGrid />
          </motion.div>
        )}

        {stage === STAGE.READY && (
          <motion.div
            key="live"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <LiveGrid />
          </motion.div>
        )}
      </AnimatePresence>

      <ValidationGate />
    </div>
  );
}

function UploadIdle({ error }) {
  const inputRef = useRef(null);
  const { ingest } = useCsv();
  const [drag, setDrag] = useState(false);

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) ingest(file);
  };

  return (
    <section
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: 1,
        background: "var(--tac-border)",
        minHeight: "calc(100dvh - 44px)",
      }}
    >
      <header
        style={{
          background: "var(--tac-bg)",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div className="tac-label">SECTION D-01 / DASHBOARD</div>
          <h1
            className="tac-display"
            style={{ fontSize: 32, color: "var(--tac-fg)", marginTop: 4 }}
          >
            AWAITING INPUT
          </h1>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10,
            color: "var(--tac-mute)",
            letterSpacing: "0.1em",
          }}
        >
          <span>STATE / IDLE</span>
          <span style={{ color: "#4f8dfe" }}>·</span>
          <span>PIPELINE / READY</span>
        </div>
      </header>

      <div
        style={{
          background: "var(--tac-bg)",
          display: "grid",
          placeItems: "center",
          padding: 32,
        }}
      >
        <motion.div
          layoutId="upload-zone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className="tac-frame"
          style={{
            cursor: "pointer",
            maxWidth: 720,
            width: "100%",
            background: drag ? "var(--tac-surface)" : "var(--tac-surface2)",
            borderColor: drag ? "#4f8dfe" : "var(--tac-border)",
            transition: "background 120ms, border-color 120ms",
          }}
        >
          <span className="tac-frame-corner-bl" />
          <span className="tac-frame-corner-br" />

          <div
            style={{
              display: "grid",
              placeItems: "center",
              gap: 18,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                border: "1px solid var(--tac-border)",
                display: "grid",
                placeItems: "center",
                position: "relative",
              }}
            >
              <UploadSimple size={22} weight="regular" color="#4f8dfe" />
              <Crosshair
                size={11}
                weight="regular"
                color="#4f8dfe"
                style={{ position: "absolute", top: -6, left: -6 }}
              />
              <Crosshair
                size={11}
                weight="regular"
                color="#4f8dfe"
                style={{ position: "absolute", bottom: -6, right: -6 }}
              />
            </div>

            <div>
              <div
                className="tac-display"
                style={{ fontSize: 22, color: "var(--tac-fg)", marginBottom: 8 }}
              >
                INJECT CSV PAYLOAD
              </div>
              <div
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 11,
                  color: "var(--tac-mute)",
                  letterSpacing: "0.04em",
                  lineHeight: 1.6,
                }}
              >
                drag .csv onto this zone &nbsp;//&nbsp; click to browse
                <br />
                schema validates before reveal &nbsp;//&nbsp; missing columns flagged inline
              </div>
            </div>

            <div
              style={{
                display: "inline-flex",
                gap: 8,
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 9,
                color: "var(--tac-mute)",
                letterSpacing: "0.18em",
              }}
            >
              <span>[ .CSV ]</span>
              <span>[ ≤ 50MB ]</span>
              <span>[ SCHEMA-CHECK ]</span>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) ingest(f);
              e.target.value = "";
            }}
          />
        </motion.div>

        {error && (
          <div className="tac-error-banner" style={{ marginTop: 24, maxWidth: 720, width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Warning size={14} weight="regular" color="#ef4444" />
              <span style={{ color: "#ef4444", fontWeight: 500 }}>PARSE_ERROR //</span>
              <span>{error}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function LiveGrid() {
  const {
    rows,
    filename,
    selectedCreator,
    validation,
    setCreatorAlias,
    perCreator,
  } = useCsv();

  const missing = useMemo(() => {
    const set = new Set();
    if (validation) {
      for (const layer of validation.layers) {
        if (!layer.pass) set.add(layer.id);
      }
    }
    return set;
  }, [validation]);

  const stats = useMemo(() => aggregateStats(rows), [rows]);
  const cadence = useMemo(() => uploadCadence(rows), [rows]);
  const dateInfo = useMemo(() => classifyDataset(rows), [rows]);

  const viewSeries = useMemo(
    () =>
      rows
        .slice(0, 60)
        .map(views)
        .reverse()
        .filter((v) => v >= 0),
    [rows]
  );

  const engSeries = useMemo(
    () =>
      rows
        .slice(0, 60)
        .map((r) => Number(engagementRate(r).toFixed(2)))
        .reverse(),
    [rows]
  );

  const cadenceEvents = cadence.map((c) => ({
    label: c.day.slice(0, 2).toUpperCase(),
    value: c.posts,
  }));

  const creatorAlias =
    selectedCreator && perCreator?.[selectedCreator.handle]?.alias;
  const baseHandle = selectedCreator
    ? selectedCreator.displayHandle || selectedCreator.handle
    : "unattributed";
  const handleLabel = creatorAlias || baseHandle;

  return (
    <section
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: 1,
        background: "var(--tac-border)",
        minHeight: "calc(100dvh - 44px)",
      }}
    >
      <header
        style={{
          background: "var(--tac-bg)",
          padding: "16px 24px",
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div>
          <div className="tac-label">SECTION D-01 / DASHBOARD</div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 14,
              marginTop: 4,
              flexWrap: "wrap",
            }}
          >
            <EditableHandle
              value={handleLabel}
              fallback={baseHandle}
              hasAlias={!!creatorAlias}
              onChange={(next) =>
                selectedCreator &&
                setCreatorAlias(selectedCreator.handle, next)
              }
              disabled={!selectedCreator}
            />
            <span
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                color: "var(--tac-mute)",
              }}
              title={filename}
            >
              {filename}
            </span>
          </div>
        </div>

        <MustHaves
          totalPosts={rows.length}
          oldest={dateInfo.oldest}
          newest={dateInfo.newest}
          spanDays={dateInfo.span}
          datasetType={dateInfo.type}
          missingTimestamp={missing.has("timestamp")}
        />
      </header>

      <div
        style={{
          padding: 1,
          background: "var(--tac-border)",
          display: "grid",
          gap: 1,
          gridTemplateColumns: "1fr",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr",
            gap: 1,
            background: "var(--tac-border)",
          }}
        >
          <SparklineCard
            name="AVG VIEWS / POST"
            kpi={missing.has("views") ? "MISSING" : stats.avgViews}
            delta={missing.has("views") ? null : computeDelta(viewSeries)}
            series={missing.has("views") ? [] : viewSeries}
          />
          <SparklineCard
            name="MEDIAN VIEWS"
            kpi={missing.has("views") ? "MISSING" : stats.medianViews}
            series={missing.has("views") ? [] : viewSeries}
          />
          <SparklineCard
            name="ENGAGEMENT %"
            kpi={
              missing.has("likes") || missing.has("comments")
                ? "MISSING"
                : `${stats.avgEngRate}`
            }
            unit={
              missing.has("likes") || missing.has("comments") ? "" : "%"
            }
            delta={
              missing.has("likes") || missing.has("comments")
                ? null
                : computeDelta(engSeries)
            }
            series={
              missing.has("likes") || missing.has("comments") ? [] : engSeries
            }
          />
        </div>

        <div style={{ background: "var(--tac-surface)" }}>
          <Top10ReelsGrid
            rows={rows}
            missing={missing.has("views") || missing.has("url")}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "7fr 3fr",
            gap: 1,
            background: "var(--tac-border)",
          }}
        >
          <ScatterPlot
            rows={rows}
            missing={
              missing.has("views") ||
              missing.has("likes") ||
              missing.has("comments")
            }
          />
          <LiveTimeline name="UPLOAD CADENCE / DOW" events={cadenceEvents} />
        </div>

        <div style={{ background: "var(--tac-border)" }}>
          <CommandInput name="QUERY_BUS" />
        </div>
      </div>
    </section>
  );
}

function MustHaves({
  totalPosts,
  oldest,
  newest,
  spanDays,
  datasetType,
  missingTimestamp,
}) {
  const fmtDate = (d) => {
    if (!d) return "—";
    return d.toISOString().slice(0, 10);
  };

  return (
    <div
      style={{
        justifySelf: "end",
        display: "grid",
        gap: 4,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "flex-end",
        }}
      >
        <span
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9,
            color: "#4f8dfe",
            letterSpacing: "0.18em",
          }}
        >
          [ MUST HAVES // NON-NEGOTIABLE ]
        </span>
        {datasetType && datasetType !== "UNKNOWN" && (
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              color: "#4AF626",
              letterSpacing: "0.12em",
              border: "1px solid var(--tac-border)",
              padding: "1px 6px",
            }}
          >
            {datasetType}
          </span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          gap: 1,
          background: "var(--tac-border)",
          border: "1px solid var(--tac-border)",
        }}
      >
        <Tile label="POSTS" value={totalPosts.toLocaleString()} accent />
        <Tile
          label="FIRST POST"
          value={missingTimestamp ? "MISSING" : fmtDate(oldest)}
          warn={missingTimestamp}
        />
        <Tile
          label="LATEST POST"
          value={missingTimestamp ? "MISSING" : fmtDate(newest)}
          warn={missingTimestamp}
        />
        <Tile
          label="SPAN"
          value={
            missingTimestamp
              ? "MISSING"
              : spanDays
              ? `${spanDays} DAYS`
              : "—"
          }
          warn={missingTimestamp}
        />
      </div>
    </div>
  );
}

function Tile({ label, value, accent, warn }) {
  return (
    <div
      style={{
        background: "var(--tac-surface2)",
        padding: "6px 12px",
        minWidth: 96,
        display: "grid",
        gap: 2,
      }}
    >
      <div
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 9,
          color: "var(--tac-mute)",
          letterSpacing: "0.1em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 12,
          color: warn ? "#ef4444" : accent ? "#4f8dfe" : "var(--tac-fg)",
          fontWeight: 600,
          letterSpacing: "0.04em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function computeDelta(series) {
  if (series.length < 2) return null;
  const half = Math.floor(series.length / 2);
  const a = series.slice(0, half).reduce((s, v) => s + v, 0) / Math.max(half, 1);
  const b = series.slice(half).reduce((s, v) => s + v, 0) / Math.max(series.length - half, 1);
  if (!a) return null;
  return Number((((b - a) / a) * 100).toFixed(1));
}

function EditableHandle({ value, fallback, hasAlias, onChange, disabled }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = (draft || "").trim().replace(/^@/, "");
    onChange?.(trimmed);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const clearAlias = () => {
    onChange?.("");
    setDraft(fallback);
    setEditing(false);
  };

  if (editing) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: 4,
          background: "rgba(79, 141, 254, 0.06)",
          border: "1px dashed #4f8dfe",
          padding: "2px 6px",
        }}
      >
        <span style={{ color: "#4f8dfe" }}>@</span>
        <input
          ref={inputRef}
          value={draft.replace(/^@/, "")}
          maxLength={48}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--tac-fg)",
            fontFamily: '"Archivo Black", Impact, sans-serif',
            fontSize: 22,
            textTransform: "uppercase",
            letterSpacing: "-0.04em",
            width: `${Math.max((draft.length || fallback.length || 4), 4) + 2}ch`,
            padding: 0,
          }}
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            commit();
          }}
          aria-label="Save name"
          style={{
            background: "transparent",
            border: "none",
            color: "#4f8dfe",
            cursor: "pointer",
            padding: 2,
            display: "grid",
            placeItems: "center",
          }}
        >
          <Check size={12} weight="bold" />
        </button>
      </span>
    );
  }

  return (
    <span
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && setEditing(true)}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      title={disabled ? undefined : "Click to rename"}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 6,
        cursor: disabled ? "default" : "text",
        padding: "2px 4px",
        marginLeft: -4,
        transition: "background 100ms",
      }}
      onMouseEnter={(e) => {
        if (!disabled)
          e.currentTarget.style.background = "rgba(79, 141, 254, 0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        className="tac-display"
        style={{ fontSize: 22, color: "var(--tac-fg)" }}
      >
        @{value}
      </span>
      {!disabled && (
        <PencilSimple
          size={11}
          weight="regular"
          color="var(--tac-dim)"
          style={{ alignSelf: "center" }}
        />
      )}
      {hasAlias && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            clearAlias();
          }}
          aria-label="Reset to original handle"
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9,
            color: "var(--tac-mute)",
            background: "transparent",
            border: "1px solid var(--tac-border)",
            padding: "1px 6px",
            cursor: "pointer",
            letterSpacing: "0.1em",
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
          RESET → @{fallback}
        </button>
      )}
    </span>
  );
}
