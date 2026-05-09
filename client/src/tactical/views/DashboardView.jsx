import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crosshair,
  Warning,
  PencilSimple,
  Check,
  Robot,
  Play,
  FilmReel,
  User as UserIcon,
  Eye,
  ChartLineUp,
  Pulse,
} from "@phosphor-icons/react";
import { useCsv, STAGE, ALL_HANDLE } from "../state/CsvContext.jsx";
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
import CreatorTabs from "../widgets/CreatorTabs.jsx";
import PerformanceIntelligence from "../widgets/PerformanceIntelligence.jsx";
import ApifyRunPanel from "../widgets/ApifyRunPanel.jsx";

// localStorage keys for the ScrapeIdle form. Apify + Groq tokens are now
// configured via server/.env, so the dashboard only persists form state
// (URLs, time window, results limit, mode).
const PROFILE_FORM_KEY = "swh-dash-profile-form";
const REEL_FORM_KEY = "swh-dash-reel-form";
const MODE_KEY = "swh-dash-mode";
const LEGACY_CONFIG_KEY = "swh-apify-config"; // migrated away on mount
const LEGACY_APIFY_TOKEN_KEY = "swh-apify-token"; // wiped on mount
const LEGACY_GROQ_TOKEN_KEY = "swh-groq-token"; // wiped on mount

const TIME_WINDOWS = [
  { id: "WEEKLY", label: "Weekly", days: 7, hint: "Last 7 days" },
  { id: "MONTHLY", label: "Monthly", days: 30, hint: "Last 30 days" },
  { id: "YEARLY", label: "Yearly", days: 365, hint: "Last 365 days" },
];

function dateForWindow(windowId) {
  const win = TIME_WINDOWS.find((w) => w.id === windowId) || TIME_WINDOWS[1];
  const d = new Date(Date.now() - win.days * 86400000);
  return d.toISOString().slice(0, 10);
}

export default function DashboardView() {
  const { stage, error } = useCsv();

  // One-time migration: legacy slots are obsolete now that:
  //  - Apify config moved off the dedicated page
  //  - Apify + Groq tokens are server env vars, not browser-stored
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(LEGACY_CONFIG_KEY);
    window.localStorage.removeItem(LEGACY_APIFY_TOKEN_KEY);
    window.localStorage.removeItem(LEGACY_GROQ_TOKEN_KEY);
  }, []);

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
            <ScrapeIdle error={error} />
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

// PROFILE: scrape one or more IG profile URLs across a time window.
// REEL: scrape a single reel URL for a focused case study.
// Both modes drive the same `runApifyScrape` and land on the same
// `_loadParsedDataset` flow that CSV upload used to hit.
function ScrapeIdle({ error }) {
  const { apifyRun, runApifyScrape } = useCsv();

  const [mode, setMode] = useState("PROFILE"); // 'PROFILE' | 'REEL'
  const [urlsText, setUrlsText] = useState("");
  const [windowId, setWindowId] = useState("MONTHLY");
  const [resultsLimit, setResultsLimit] = useState(50);
  const [reelUrl, setReelUrl] = useState("");

  // Hydrate persisted form state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.localStorage.getItem(MODE_KEY);
    if (m === "PROFILE" || m === "REEL") setMode(m);
    try {
      const raw = window.localStorage.getItem(PROFILE_FORM_KEY);
      if (raw) {
        const cfg = JSON.parse(raw);
        if (typeof cfg.urlsText === "string") setUrlsText(cfg.urlsText);
        if (typeof cfg.window === "string") setWindowId(cfg.window);
        if (Number.isFinite(Number(cfg.resultsLimit)))
          setResultsLimit(Number(cfg.resultsLimit));
      }
    } catch {}
    try {
      const raw = window.localStorage.getItem(REEL_FORM_KEY);
      if (raw) {
        const cfg = JSON.parse(raw);
        if (typeof cfg.reelUrl === "string") setReelUrl(cfg.reelUrl);
      }
    } catch {}
  }, []);

  // Persist on change. Token is *not* persisted here — that's owned by Apify view.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MODE_KEY, mode);
  }, [mode]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      PROFILE_FORM_KEY,
      JSON.stringify({ urlsText, window: windowId, resultsLimit })
    );
  }, [urlsText, windowId, resultsLimit]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(REEL_FORM_KEY, JSON.stringify({ reelUrl }));
  }, [reelUrl]);

  const profileUrls = useMemo(
    () =>
      urlsText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    [urlsText]
  );

  const isRunning = apifyRun?.status === "running";

  // Token resolution lives on the server now: /api/scrape pulls APIFY_TOKEN
  // and GROQ_API_KEY from env. The client just sends the form payload.
  const onRunProfile = () => {
    if (profileUrls.length === 0) return;
    runApifyScrape({
      urls: profileUrls,
      resultsLimit: Number(resultsLimit) || 50,
      onlyPostsNewerThan: dateForWindow(windowId),
    });
  };

  const onRunReel = () => {
    const url = reelUrl.trim();
    if (!url) return;
    runApifyScrape({
      urls: [url],
      resultsLimit: 1,
    });
  };

  const profileReady = profileUrls.length > 0 && !isRunning;
  const reelReady = reelUrl.trim().length > 0 && !isRunning;

  return (
    <section
      style={{
        background: "var(--tac-bg)",
        minHeight: "calc(100dvh - 44px)",
        display: "grid",
        placeItems: "start center",
        padding: "32px 24px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          display: "grid",
          gap: 20,
        }}
      >
        <ApifyRunPanel />

        <div>
          <h2
            style={{
              fontFamily:
                '"Inter", ui-sans-serif, system-ui, sans-serif',
              fontSize: 20,
              fontWeight: 600,
              color: "var(--tac-fg)",
              margin: "0 0 14px",
              letterSpacing: "-0.01em",
            }}
          >
            Begin scraping
          </h2>

          <ModeToggle
            value={mode}
            onChange={setMode}
            disabled={isRunning}
          />
        </div>

        {mode === "PROFILE" ? (
          <ProfileForm
            urlsText={urlsText}
            setUrlsText={setUrlsText}
            urlCount={profileUrls.length}
            windowId={windowId}
            setWindowId={setWindowId}
            resultsLimit={resultsLimit}
            setResultsLimit={setResultsLimit}
            onRun={onRunProfile}
            ready={profileReady}
            isRunning={isRunning}
          />
        ) : (
          <ReelForm
            reelUrl={reelUrl}
            setReelUrl={setReelUrl}
            onRun={onRunReel}
            ready={reelReady}
            isRunning={isRunning}
          />
        )}

        {error && (
          <div className="tac-error-banner">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Warning size={14} weight="regular" color="var(--tac-danger)" />
              <span style={{ color: "var(--tac-danger)", fontWeight: 500 }}>
                Parse error
              </span>
              <span>{error}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ModeToggle({ value, onChange, disabled }) {
  const opts = [
    {
      id: "PROFILE",
      label: "Profile scrape",
      sub: "Scrape a creator's recent posts",
      icon: UserIcon,
    },
    {
      id: "REEL",
      label: "Single reel",
      sub: "Case-study one specific reel",
      icon: FilmReel,
    },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
      }}
    >
      {opts.map((opt) => {
        const active = opt.id === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => !disabled && onChange(opt.id)}
            disabled={disabled}
            style={{
              background: active ? "var(--tac-surface2)" : "var(--tac-surface)",
              border: `1px solid ${active ? "var(--tac-accent)" : "var(--tac-border)"}`,
              borderRadius: 8,
              color: active ? "var(--tac-fg)" : "var(--tac-mute)",
              padding: "12px 14px",
              fontFamily:
                '"Inter", ui-sans-serif, system-ui, sans-serif',
              fontSize: 13,
              cursor: disabled ? "not-allowed" : "pointer",
              display: "grid",
              gridTemplateColumns: "16px 1fr",
              gap: 12,
              alignItems: "center",
              textAlign: "left",
              opacity: disabled ? 0.5 : 1,
              transition:
                "border-color 120ms, background 120ms, color 120ms",
            }}
          >
            <Icon
              size={15}
              weight="regular"
              color={active ? "var(--tac-accent)" : "var(--tac-mute)"}
            />
            <div>
              <div style={{ fontWeight: 500 }}>{opt.label}</div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--tac-mute)",
                  marginTop: 1,
                  fontWeight: 400,
                }}
              >
                {opt.sub}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ProfileForm({
  urlsText,
  setUrlsText,
  urlCount,
  windowId,
  setWindowId,
  resultsLimit,
  setResultsLimit,
  onRun,
  ready,
  isRunning,
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 14,
      }}
    >
      <FormField
        label="Creator profiles"
        sub="One per line · profile URL or @handle"
      >
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder={
            "https://www.instagram.com/hormozi/\n@chriswillx\nhttps://www.instagram.com/garyvee/"
          }
          spellCheck={false}
          autoComplete="off"
          disabled={isRunning}
          rows={4}
          className="tac-input"
          style={{
            fontSize: 13,
            padding: "10px 12px",
            fontFamily:
              '"JetBrains Mono", ui-monospace, monospace',
            resize: "vertical",
            minHeight: 96,
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: "var(--tac-mute)",
            marginTop: 4,
          }}
        >
          <span>
            {urlCount} target{urlCount === 1 ? "" : "s"} detected
          </span>
          <span>Multi-creator scrapes split into per-creator tabs after load</span>
        </div>
      </FormField>

      <FormField
        label="Time window"
        sub="Filters posts newer than today − N days"
      >
        <WindowToggle
          value={windowId}
          onChange={setWindowId}
          disabled={isRunning}
        />
      </FormField>

      <FormField
        label="Results per profile"
        sub="Max posts per creator · 1–1000"
      >
        <input
          type="number"
          min={1}
          max={1000}
          value={resultsLimit}
          onChange={(e) => setResultsLimit(e.target.value)}
          disabled={isRunning}
          className="tac-input"
          style={{
            fontSize: 13,
            padding: "10px 12px",
            fontVariantNumeric: "tabular-nums",
            width: 160,
          }}
        />
      </FormField>

      <RunButton
        onClick={onRun}
        ready={ready}
        isRunning={isRunning}
        label="Run scrape"
      />
    </div>
  );
}

function ReelForm({ reelUrl, setReelUrl, onRun, ready, isRunning }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <FormField
        label="Reel URL"
        sub="Paste a public reel/post link · scrapes only that single reel"
      >
        <input
          type="url"
          value={reelUrl}
          onChange={(e) => setReelUrl(e.target.value)}
          placeholder="https://www.instagram.com/reel/DXz7Z6EyfdV/"
          spellCheck={false}
          autoComplete="off"
          disabled={isRunning}
          className="tac-input"
          style={{
            fontSize: 13,
            padding: "10px 12px",
            fontFamily:
              '"JetBrains Mono", ui-monospace, monospace',
          }}
        />
        <div
          style={{
            fontSize: 12,
            color: "var(--tac-mute)",
            marginTop: 4,
            lineHeight: 1.5,
          }}
        >
          Accepts /reel/&#123;shortcode&#125;/ or /p/&#123;shortcode&#125;/ — not
          /&#123;handle&#125;/reels/ listing pages.
        </div>
      </FormField>

      <RunButton
        onClick={onRun}
        ready={ready}
        isRunning={isRunning}
        label="Run case study"
      />
    </div>
  );
}

function WindowToggle({ value, onChange, disabled }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 8,
      }}
    >
      {TIME_WINDOWS.map((w) => {
        const active = w.id === value;
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => !disabled && onChange(w.id)}
            disabled={disabled}
            style={{
              background: active ? "var(--tac-surface2)" : "var(--tac-surface)",
              border: `1px solid ${active ? "var(--tac-accent)" : "var(--tac-border)"}`,
              borderRadius: 8,
              color: active ? "var(--tac-fg)" : "var(--tac-mute)",
              padding: "10px 14px",
              fontFamily:
                '"Inter", ui-sans-serif, system-ui, sans-serif',
              fontSize: 13,
              cursor: disabled ? "not-allowed" : "pointer",
              display: "grid",
              gap: 2,
              textAlign: "left",
              opacity: disabled ? 0.5 : 1,
              transition:
                "border-color 120ms, background 120ms, color 120ms",
            }}
          >
            <span
              style={{
                fontWeight: 500,
                color: active ? "var(--tac-fg)" : "var(--tac-mute)",
              }}
            >
              {w.label}
            </span>
            <span style={{ fontSize: 12, color: "var(--tac-mute)" }}>
              {w.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function RunButton({ onClick, ready, isRunning, label }) {
  const disabled = !ready;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tac-btn tac-btn-accent"
      style={{
        padding: "12px 18px",
        fontSize: 14,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
      title={isRunning ? "Scrape already in flight" : "Run scrape"}
    >
      {isRunning ? (
        <>
          <Robot size={15} weight="regular" />
          Scraping…
        </>
      ) : (
        <>
          <Play size={14} weight="fill" />
          {label}
        </>
      )}
    </button>
  );
}

function FormField({ label, sub, children }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: "var(--tac-fg)",
            fontWeight: 500,
          }}
        >
          {label}
        </span>
        {sub && (
          <span style={{ fontSize: 12, color: "var(--tac-mute)" }}>{sub}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function LiveGrid() {
  const {
    rows,
    filename,
    selectedCreator,
    selectedHandle,
    setSelectedHandle,
    creators,
    validation,
    setCreatorAlias,
    perCreator,
  } = useCsv();

  // Dashboard panels (KPIs, top reels, scatter) are per-creator — auto-bounce
  // out of the unified ALL view back to the first creator if the user lands
  // here after switching the dataset filter.
  useEffect(() => {
    if (selectedHandle === ALL_HANDLE && creators.length > 0) {
      setSelectedHandle(creators[0].handle);
    }
  }, [selectedHandle, creators, setSelectedHandle]);

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
    label: c.day.slice(0, 3),
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
        gridTemplateRows: "auto auto 1fr",
        gap: 0,
        background: "var(--tac-bg)",
        minHeight: "calc(100dvh - 44px)",
      }}
    >
      <header
        style={{
          background: "var(--tac-bg)",
          padding: "20px 24px 16px",
          display: "flex",
          alignItems: "baseline",
          gap: 14,
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
            fontFamily:
              '"Inter", ui-sans-serif, system-ui, sans-serif',
            fontSize: 12,
            color: "var(--tac-mute)",
          }}
          title={filename}
        >
          {filename}
        </span>
      </header>

      <CreatorTabs label="Creators" />

      <div
        style={{
          padding: "20px 24px 28px",
          display: "grid",
          gap: 28,
        }}
      >
        {/* Overview */}
        <section className="tac-section">
          <header className="tac-section-header">
            <div>
              <div className="tac-section-title">Overview</div>
              <div className="tac-section-copy">
                Headline performance metrics for this creator.
              </div>
            </div>
            <DatasetSummaryStrip
              totalPosts={rows.length}
              oldest={dateInfo.oldest}
              newest={dateInfo.newest}
              spanDays={dateInfo.span}
              datasetType={dateInfo.type}
              missingTimestamp={missing.has("timestamp")}
            />
          </header>
          <div className="tac-grid-hero">
            <SparklineCard
              accent
              icon={Eye}
              iconTone="accent"
              name="Avg views per post"
              kpi={missing.has("views") ? "MISSING" : stats.avgViews}
              delta={missing.has("views") ? null : computeDelta(viewSeries)}
              series={missing.has("views") ? [] : viewSeries}
            />
            <SparklineCard
              icon={ChartLineUp}
              iconTone="cyan"
              name="Median views"
              kpi={missing.has("views") ? "MISSING" : stats.medianViews}
              series={missing.has("views") ? [] : viewSeries}
            />
            <SparklineCard
              icon={Pulse}
              iconTone="purple"
              name="Engagement rate"
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
                missing.has("likes") || missing.has("comments")
                  ? []
                  : engSeries
              }
            />
          </div>
        </section>

        {/* Performance intelligence */}
        <section className="tac-section">
          <header className="tac-section-header">
            <div>
              <div className="tac-section-title">Performance intelligence</div>
              <div className="tac-section-copy">
                Distribution, consistency, and pruning signals from this dataset.
              </div>
            </div>
          </header>
          <PerformanceIntelligence rows={rows} hideHeader />
        </section>

        {/* Content breakdown */}
        <section className="tac-section">
          <header className="tac-section-header">
            <div>
              <div className="tac-section-title">Content breakdown</div>
              <div className="tac-section-copy">
                Top reels and how they cluster across the data.
              </div>
            </div>
          </header>
          <Top10ReelsGrid
            rows={rows}
            missing={missing.has("views") || missing.has("url")}
          />
          <div className="tac-grid-2-wide">
            <ScatterPlot
              rows={rows}
              missing={
                missing.has("views") ||
                missing.has("likes") ||
                missing.has("comments")
              }
            />
            <LiveTimeline name="Upload cadence" events={cadenceEvents} />
          </div>
        </section>

        {/* Operations */}
        <section className="tac-section">
          <header className="tac-section-header">
            <div>
              <div className="tac-section-title">Operations</div>
              <div className="tac-section-copy">
                Ad-hoc queries against the loaded dataset.
              </div>
            </div>
          </header>
          <CommandInput name="Query dataset" />
        </section>
      </div>
    </section>
  );
}

function DatasetSummaryStrip({
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

  const items = [
    {
      label: "Posts",
      value: totalPosts.toLocaleString(),
      tone: "accent",
    },
    {
      label: "First post",
      value: missingTimestamp ? "Missing" : fmtDate(oldest),
      tone: missingTimestamp ? "warn" : "default",
    },
    {
      label: "Latest post",
      value: missingTimestamp ? "Missing" : fmtDate(newest),
      tone: missingTimestamp ? "warn" : "default",
    },
    {
      label: "Span",
      value: missingTimestamp
        ? "Missing"
        : spanDays
        ? `${spanDays} days`
        : "—",
      tone: missingTimestamp ? "warn" : "default",
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
      }}
    >
      {datasetType && datasetType !== "UNKNOWN" && (
        <span className="tac-pill tac-pill--ok">
          {datasetType.toLowerCase()}
        </span>
      )}
      {items.map((it) => (
        <SummaryChip key={it.label} {...it} />
      ))}
    </div>
  );
}

function SummaryChip({ label, value, tone }) {
  const valueColor =
    tone === "accent"
      ? "var(--tac-accent)"
      : tone === "warn"
      ? "var(--tac-danger)"
      : "var(--tac-fg)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 6,
        padding: "4px 10px",
        background: "var(--tac-surface)",
        border: "1px solid var(--tac-border)",
        borderRadius: 9999,
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--tac-mute)" }}>{label}</span>
      <span
        style={{
          color: valueColor,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </span>
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
          background: "var(--tac-accent-soft)",
          border: "1px dashed var(--tac-accent)",
          padding: "2px 6px",
        }}
      >
        <span style={{ color: "var(--tac-accent)" }}>@</span>
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
            fontFamily:
              '"Inter", ui-sans-serif, system-ui, sans-serif',
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.01em",
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
            color: "var(--tac-accent)",
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
          e.currentTarget.style.background = "var(--tac-accent-soft)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: "var(--tac-fg)",
          lineHeight: 1.1,
        }}
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
          className="tac-btn"
          style={{ fontSize: 11, padding: "3px 8px" }}
        >
          Reset to @{fallback}
        </button>
      )}
    </span>
  );
}
