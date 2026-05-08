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
import PerformanceIntelligence from "../widgets/PerformanceIntelligence.jsx";
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
          padding: "24px 24px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily:
                '"Inter", ui-sans-serif, system-ui, sans-serif',
              fontSize: 22,
              fontWeight: 600,
              color: "var(--tac-fg)",
              margin: 0,
            }}
          >
            Start a scrape
          </h1>
          <div
            style={{
              fontSize: 13,
              color: "var(--tac-mute)",
              marginTop: 4,
            }}
          >
            Pull Instagram posts via Apify and run them through the framework.
          </div>
        </div>
        <span className="tac-pill">Scraper ready</span>
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
                <Warning size={14} weight="regular" color="var(--tac-danger)" />
                <span style={{ color: "var(--tac-danger)", fontWeight: 500 }}>
                  Parse error
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
        padding: "12px 16px",
        background: "rgba(245, 158, 11, 0.08)",
        border: "1px solid rgba(245, 158, 11, 0.3)",
        borderRadius: 8,
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 13,
      }}
    >
      <Warning size={16} weight="regular" color="var(--tac-warning)" />
      <div style={{ color: "var(--tac-fg)", lineHeight: 1.5 }}>
        <span style={{ fontWeight: 500 }}>Apify token not set.</span>{" "}
        <span style={{ color: "var(--tac-mute)" }}>
          Add one on the Apify page before running.
        </span>
      </div>
      <Link
        to="/apify"
        className="tac-btn"
        style={{ fontSize: 12, padding: "6px 12px", textDecoration: "none" }}
      >
        Set token
        <ArrowRight size={12} weight="regular" />
      </Link>
    </div>
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
        tokenSet={tokenSet}
        isRunning={isRunning}
        label="Run scrape"
      />
    </div>
  );
}

function ReelForm({ reelUrl, setReelUrl, onRun, ready, tokenSet, isRunning }) {
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
        tokenSet={tokenSet}
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

function RunButton({ onClick, ready, tokenSet, isRunning, label }) {
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
      title={
        isRunning
          ? "Scrape already in flight"
          : !tokenSet
          ? "Set your Apify token first"
          : "Fire the scrape"
      }
    >
      {isRunning ? (
        <>
          <Robot size={15} weight="regular" />
          Scrape running…
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
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div>
          <div
            style={{
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

      <CreatorTabs label="Creators" />

      <div
        style={{
          padding: "16px 24px 24px",
          display: "grid",
          gap: 16,
          gridTemplateColumns: "1fr",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
          }}
        >
          <SparklineCard
            name="Avg views per post"
            kpi={missing.has("views") ? "MISSING" : stats.avgViews}
            delta={missing.has("views") ? null : computeDelta(viewSeries)}
            series={missing.has("views") ? [] : viewSeries}
          />
          <SparklineCard
            name="Median views"
            kpi={missing.has("views") ? "MISSING" : stats.medianViews}
            series={missing.has("views") ? [] : viewSeries}
          />
          <SparklineCard
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
              missing.has("likes") || missing.has("comments") ? [] : engSeries
            }
          />
        </div>

        <PerformanceIntelligence rows={rows} />

        <Top10ReelsGrid
          rows={rows}
          missing={missing.has("views") || missing.has("url")}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "7fr 3fr",
            gap: 16,
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
          <LiveTimeline name="Upload cadence" events={cadenceEvents} />
        </div>

        <CommandInput name="Query dataset" />
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
        gap: 8,
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
            fontFamily:
              '"Inter", ui-sans-serif, system-ui, sans-serif',
            fontSize: 12,
            color: "var(--tac-mute)",
            fontWeight: 500,
          }}
        >
          Dataset summary
        </span>
        {datasetType && datasetType !== "UNKNOWN" && (
          <span className="tac-pill tac-pill--ok">{datasetType.toLowerCase()}</span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Tile label="Posts" value={totalPosts.toLocaleString()} accent />
        <Tile
          label="First post"
          value={missingTimestamp ? "Missing" : fmtDate(oldest)}
          warn={missingTimestamp}
        />
        <Tile
          label="Latest post"
          value={missingTimestamp ? "Missing" : fmtDate(newest)}
          warn={missingTimestamp}
        />
        <Tile
          label="Span"
          value={
            missingTimestamp
              ? "Missing"
              : spanDays
              ? `${spanDays} days`
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
        background: "var(--tac-surface)",
        border: "1px solid var(--tac-border)",
        borderRadius: 8,
        padding: "8px 12px",
        minWidth: 96,
        display: "grid",
        gap: 2,
      }}
    >
      <div
        style={{
          fontFamily:
            '"Inter", ui-sans-serif, system-ui, sans-serif',
          fontSize: 11,
          color: "var(--tac-mute)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily:
            '"Inter", ui-sans-serif, system-ui, sans-serif',
          fontSize: 14,
          color: warn
            ? "var(--tac-danger)"
            : accent
            ? "var(--tac-accent)"
            : "var(--tac-fg)",
          fontWeight: 600,
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
