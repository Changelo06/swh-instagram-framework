import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crosshair,
  Warning,
  PencilSimple,
  Check,
  Robot,
  Play,
  ArrowRight,
  FilmReel,
  User as UserIcon,
} from "@phosphor-icons/react";
import { Link } from "react-router-dom";
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
import ApifyRunPanel from "../widgets/ApifyRunPanel.jsx";

// localStorage keys for the ScrapeIdle form. The shared token slots are read
// here on the dashboard but written from their respective pages: Apify on
// /app/apify and Groq from Settings.
const TOKEN_KEY = "swh-apify-token";
const GROQ_TOKEN_KEY = "swh-groq-token";
const PROFILE_FORM_KEY = "swh-dash-profile-form";
const REEL_FORM_KEY = "swh-dash-reel-form";
const MODE_KEY = "swh-dash-mode";
const LEGACY_CONFIG_KEY = "swh-apify-config"; // migrated away on mount

const TIME_WINDOWS = [
  { id: "WEEKLY", label: "WEEKLY", days: 7, hint: "last 7 days" },
  { id: "MONTHLY", label: "MONTHLY", days: 30, hint: "last 30 days" },
  { id: "YEARLY", label: "YEARLY", days: 365, hint: "last 365 days" },
];

function dateForWindow(windowId) {
  const win = TIME_WINDOWS.find((w) => w.id === windowId) || TIME_WINDOWS[1];
  const d = new Date(Date.now() - win.days * 86400000);
  return d.toISOString().slice(0, 10);
}

export default function DashboardView() {
  const { stage, error } = useCsv();

  // One-time migration: the legacy ApifyView config slot is now obsolete.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(LEGACY_CONFIG_KEY);
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
  // Re-detected on mount + every submit attempt so an Apify-page wipe is felt.
  const [tokenSet, setTokenSet] = useState(false);

  // Hydrate persisted form state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setTokenSet(!!window.localStorage.getItem(TOKEN_KEY));
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

  const refreshTokenSlot = () => {
    if (typeof window === "undefined") return false;
    const has = !!window.localStorage.getItem(TOKEN_KEY);
    setTokenSet(has);
    return has;
  };

  const onRunProfile = () => {
    if (!refreshTokenSlot()) return;
    if (profileUrls.length === 0) return;
    runApifyScrape({
      token: window.localStorage.getItem(TOKEN_KEY),
      groqToken: window.localStorage.getItem(GROQ_TOKEN_KEY) || "",
      urls: profileUrls,
      resultsLimit: Number(resultsLimit) || 50,
      onlyPostsNewerThan: dateForWindow(windowId),
    });
  };

  const onRunReel = () => {
    if (!refreshTokenSlot()) return;
    const url = reelUrl.trim();
    if (!url) return;
    runApifyScrape({
      token: window.localStorage.getItem(TOKEN_KEY),
      groqToken: window.localStorage.getItem(GROQ_TOKEN_KEY) || "",
      urls: [url],
      resultsLimit: 1,
    });
  };

  const profileReady = tokenSet && profileUrls.length > 0 && !isRunning;
  const reelReady = tokenSet && reelUrl.trim().length > 0 && !isRunning;

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
          gap: 16,
        }}
      >
        <div>
          <div className="tac-label">SECTION D-01 / DASHBOARD</div>
          <h1
            className="tac-display"
            style={{ fontSize: 28, color: "var(--tac-fg)", marginTop: 4 }}
          >
            AWAITING TARGET
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
          <span>SCRAPER / READY</span>
        </div>
      </header>

      <div
        style={{
          background: "var(--tac-bg)",
          display: "grid",
          placeItems: "start center",
          padding: "24px",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 720,
            display: "grid",
            gap: 18,
          }}
        >
          {!tokenSet && <TokenMissingBanner />}

          <ApifyRunPanel />

          <ModeToggle value={mode} onChange={setMode} disabled={isRunning} />

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
              tokenSet={tokenSet}
              isRunning={isRunning}
            />
          ) : (
            <ReelForm
              reelUrl={reelUrl}
              setReelUrl={setReelUrl}
              onRun={onRunReel}
              ready={reelReady}
              tokenSet={tokenSet}
              isRunning={isRunning}
            />
          )}

          {error && (
            <div className="tac-error-banner">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Warning size={14} weight="regular" color="#ef4444" />
                <span style={{ color: "#ef4444", fontWeight: 500 }}>
                  PARSE_ERROR //
                </span>
                <span>{error}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TokenMissingBanner() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 14,
        padding: "12px 14px",
        background: "rgba(251, 191, 36, 0.08)",
        border: "1px dashed #fbbf24",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
      }}
    >
      <Warning size={14} weight="regular" color="#fbbf24" />
      <div style={{ color: "var(--tac-fg)", lineHeight: 1.5 }}>
        Apify token not set.{" "}
        <span style={{ color: "var(--tac-mute)" }}>
          Drop one in on the Apify page before running.
        </span>
      </div>
      <Link
        to="/app/apify"
        style={{
          fontSize: 10,
          color: "#fbbf24",
          letterSpacing: "0.1em",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: "1px solid #fbbf24",
          padding: "6px 12px",
          fontWeight: 600,
        }}
      >
        SET TOKEN
        <ArrowRight size={11} weight="bold" />
      </Link>
    </div>
  );
}

function ModeToggle({ value, onChange, disabled }) {
  const opts = [
    { id: "PROFILE", label: "PROFILE", sub: "scrape a creator", icon: UserIcon },
    { id: "REEL", label: "REEL", sub: "case-study one reel", icon: FilmReel },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 1,
        background: "var(--tac-border)",
        border: "1px solid var(--tac-border)",
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
              background: active ? "var(--tac-bg)" : "var(--tac-surface)",
              border: "none",
              borderTop: active
                ? "2px solid #4f8dfe"
                : "2px solid transparent",
              color: active ? "var(--tac-fg)" : "var(--tac-mute)",
              padding: "12px 16px",
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 12,
              cursor: disabled ? "not-allowed" : "pointer",
              display: "grid",
              gridTemplateColumns: "16px 1fr",
              gap: 12,
              alignItems: "center",
              textAlign: "left",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Icon size={14} weight="regular" color={active ? "#4f8dfe" : "var(--tac-mute)"} />
            <div>
              <div style={{ fontWeight: 600, letterSpacing: "0.04em" }}>
                {opt.label}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "var(--tac-mute)",
                  marginTop: 2,
                  letterSpacing: "0.06em",
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
  tokenSet,
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
        label="01 / CREATOR PROFILES"
        sub="one per line · profile URL or @handle"
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
            fontSize: 12,
            padding: "10px 12px",
            fontFamily: '"JetBrains Mono", monospace',
            resize: "vertical",
            minHeight: 96,
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 9,
            color: "var(--tac-dim)",
            marginTop: 4,
            letterSpacing: "0.06em",
          }}
        >
          <span>{urlCount} target{urlCount === 1 ? "" : "s"} detected</span>
          <span>multi-creator scrapes split into per-creator tabs after load</span>
        </div>
      </FormField>

      <FormField label="02 / TIME WINDOW" sub="filters posts newer than today − N days">
        <WindowToggle
          value={windowId}
          onChange={setWindowId}
          disabled={isRunning}
        />
      </FormField>

      <FormField label="03 / RESULTS / URL" sub="max posts per creator · 1 – 1000">
        <input
          type="number"
          min={1}
          max={1000}
          value={resultsLimit}
          onChange={(e) => setResultsLimit(e.target.value)}
          disabled={isRunning}
          className="tac-input"
          style={{
            fontSize: 12,
            padding: "10px 12px",
            fontFamily: '"JetBrains Mono", monospace',
            fontVariantNumeric: "tabular-nums",
            width: 160,
          }}
        />
      </FormField>

      <RunButton
        onClick={onRun}
        ready={ready}
        tokenSet={tokenSet}
        isRunning={isRunning}
        label="RUN SCRAPE"
      />
    </div>
  );
}

function ReelForm({ reelUrl, setReelUrl, onRun, ready, tokenSet, isRunning }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <FormField
        label="01 / REEL URL"
        sub="paste a public reel/post link · scrapes only that single reel"
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
            fontSize: 12,
            padding: "10px 12px",
            fontFamily: '"JetBrains Mono", monospace',
          }}
        />
        <div
          style={{
            fontSize: 9,
            color: "var(--tac-dim)",
            marginTop: 4,
            letterSpacing: "0.04em",
            lineHeight: 1.5,
          }}
        >
          accepts /reel/&#123;shortcode&#125;/ or /p/&#123;shortcode&#125;/ — not
          /&#123;handle&#125;/reels/ listing pages.
        </div>
      </FormField>

      <RunButton
        onClick={onRun}
        ready={ready}
        tokenSet={tokenSet}
        isRunning={isRunning}
        label="RUN CASE STUDY"
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
        gap: 1,
        background: "var(--tac-border)",
        border: "1px solid var(--tac-border)",
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
              background: active ? "var(--tac-bg)" : "var(--tac-surface)",
              border: "none",
              borderTop: active
                ? "2px solid #4f8dfe"
                : "2px solid transparent",
              color: active ? "var(--tac-fg)" : "var(--tac-mute)",
              padding: "10px 14px",
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              cursor: disabled ? "not-allowed" : "pointer",
              display: "grid",
              gap: 2,
              textAlign: "left",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <span
              style={{
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: active ? "#4f8dfe" : "var(--tac-mute)",
              }}
            >
              {w.label}
            </span>
            <span
              style={{
                fontSize: 9,
                color: "var(--tac-mute)",
                letterSpacing: "0.04em",
              }}
            >
              {w.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function RunButton({ onClick, ready, tokenSet, isRunning, label }) {
  const disabled = !ready;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tac-btn tac-btn-accent"
      style={{
        padding: "14px 18px",
        fontSize: 13,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        letterSpacing: "0.06em",
      }}
      title={
        isRunning
          ? "scrape already in flight"
          : !tokenSet
          ? "set your Apify token first"
          : "fire the scrape"
      }
    >
      {isRunning ? (
        <>
          <Robot size={14} weight="regular" />
          SCRAPE IN FLIGHT…
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
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "#4f8dfe",
            letterSpacing: "0.18em",
            fontWeight: 600,
            fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          {label}
        </span>
        {sub && (
          <span
            style={{
              fontSize: 9,
              color: "var(--tac-dim)",
              letterSpacing: "0.04em",
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            {sub}
          </span>
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
        gridTemplateRows: "auto auto 1fr",
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

      <CreatorTabs label="DASHBOARD // CREATOR" />

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
