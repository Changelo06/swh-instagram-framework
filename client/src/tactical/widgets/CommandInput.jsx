import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ArrowSquareOut, ArrowRight, X as XIcon } from "@phosphor-icons/react";
import WidgetFrame from "./WidgetFrame.jsx";
import { useCsv } from "../state/CsvContext.jsx";

const PLACEHOLDER_HINTS = [
  'top 10 likes',
  'avg views',
  'median engagement',
  'find handsworkout',
  '/help',
  'count caption containing morning',
  'top 5 by comments',
];

function CommandInput({ name = "QUERY_BUS" }) {
  const { rows } = useCsv();
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [hintIdx, setHintIdx] = useState(0);
  const [hintText, setHintText] = useState("");
  const [phase, setPhase] = useState("typing");
  const inputRef = useRef(null);

  useEffect(() => {
    if (text || result) return;
    let timer;
    const target = PLACEHOLDER_HINTS[hintIdx];
    if (phase === "typing") {
      if (hintText.length < target.length) {
        timer = setTimeout(
          () => setHintText(target.slice(0, hintText.length + 1)),
          36 + Math.random() * 30
        );
      } else {
        timer = setTimeout(() => setPhase("hold"), 1200);
      }
    } else if (phase === "hold") {
      timer = setTimeout(() => setPhase("clearing"), 800);
    } else if (phase === "clearing") {
      if (hintText.length > 0) {
        timer = setTimeout(() => setHintText(hintText.slice(0, -1)), 14);
      } else {
        timer = setTimeout(() => {
          setHintIdx((i) => (i + 1) % PLACEHOLDER_HINTS.length);
          setPhase("typing");
        }, 240);
      }
    }
    return () => clearTimeout(timer);
  }, [hintText, phase, hintIdx, text, result]);

  const submit = () => {
    const q = text.trim();
    if (!q) return;
    const parsed = runQuery(q, rows);
    setResult({ query: q, ...parsed });
  };

  const clear = () => {
    setText("");
    setResult(null);
    inputRef.current?.focus();
  };

  return (
    <WidgetFrame name={name} type="COMMAND">
      <div style={{ display: "grid", gap: 8 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          style={{
            background: "var(--tac-bg)",
            border: "1px solid var(--tac-border)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
          }}
        >
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              color: "#4f8dfe",
              fontWeight: 500,
            }}
          >
            {">"}
          </span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={!text ? hintText : ""}
            spellCheck={false}
            autoComplete="off"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--tac-fg)",
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              padding: 0,
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                clear();
              }
            }}
          />
          {result && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--tac-dim)",
                cursor: "pointer",
                padding: 2,
                display: "grid",
                placeItems: "center",
                transition: "color 120ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--tac-fg)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--tac-dim)")}
            >
              <XIcon size={11} weight="regular" />
            </button>
          )}
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Run query"
            style={{
              background: text.trim() ? "#4f8dfe" : "transparent",
              color: text.trim() ? "var(--tac-bg)" : "var(--tac-dim)",
              border: text.trim() ? "1px solid #4f8dfe" : "1px solid var(--tac-border)",
              cursor: text.trim() ? "pointer" : "not-allowed",
              padding: "3px 8px",
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 9,
              letterSpacing: "0.1em",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              transition: "color 120ms, background 120ms, border-color 120ms",
            }}
          >
            RUN
            <ArrowRight size={9} weight="bold" />
          </button>
        </form>

        <Footer result={result} rowCount={rows.length} />

        {result && <ResultPanel result={result} />}
      </div>
    </WidgetFrame>
  );
}

function Footer({ result, rowCount }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 9,
        color: "var(--tac-mute)",
        letterSpacing: "0.08em",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span
          className="tac-dot-status"
          style={{ background: result?.error ? "#ef4444" : "#4AF626" }}
        />
        {result?.error
          ? "QUERY ERROR"
          : result
          ? `RESULT // ${result.summary || "OK"}`
          : `IDLE // ${rowCount.toLocaleString()} ROWS IN BUS`}
      </span>
      <span style={{ color: "var(--tac-dim)" }}>
        // try: top N field · avg field · find TEXT · /help
      </span>
    </div>
  );
}

function ResultPanel({ result }) {
  if (result.error) {
    return (
      <div className="tac-error-banner" style={{ fontSize: 11 }}>
        // {result.error}
      </div>
    );
  }
  if (result.kind === "help") {
    return <HelpResult />;
  }
  if (result.kind === "stat") {
    return <StatResult result={result} />;
  }
  if (result.kind === "rows") {
    return <RowsResult result={result} />;
  }
  return null;
}

function StatResult({ result }) {
  return (
    <div
      style={{
        background: "var(--tac-surface2)",
        border: "1px solid var(--tac-border)",
        padding: "12px 14px",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        alignItems: "center",
        gap: 14,
      }}
    >
      <span className="tac-display" style={{ fontSize: 26, color: "#4f8dfe" }}>
        {fmt(result.value)}
      </span>
      <div>
        <div
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9,
            color: "var(--tac-mute)",
            letterSpacing: "0.1em",
          }}
        >
          {result.label}
        </div>
        {result.detail && (
          <div
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              color: "var(--tac-dim)",
              marginTop: 2,
            }}
          >
            {result.detail}
          </div>
        )}
      </div>
    </div>
  );
}

function RowsResult({ result }) {
  const cols = result.cols || ["metric", "views", "likes", "comments"];
  return (
    <div
      style={{
        background: "var(--tac-surface2)",
        border: "1px solid var(--tac-border)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "32px auto 1fr auto",
          gap: 8,
          padding: "6px 12px",
          background: "var(--tac-bg)",
          borderBottom: "1px solid var(--tac-border)",
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 9,
          color: "var(--tac-mute)",
          letterSpacing: "0.1em",
        }}
      >
        <span>#</span>
        <span>{result.metricLabel || "METRIC"}</span>
        <span>CAPTION</span>
        <span>LINK</span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {result.rows.slice(0, 10).map((r, i) => (
          <li
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "32px auto 1fr auto",
              gap: 8,
              padding: "8px 12px",
              borderBottom: "1px solid var(--tac-surface)",
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              alignItems: "center",
            }}
          >
            <span style={{ color: "var(--tac-dim)", fontVariantNumeric: "tabular-nums" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              style={{
                color: "#4f8dfe",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                minWidth: 60,
              }}
            >
              {fmt(r._metric)}
            </span>
            <span
              style={{
                color: "var(--tac-fg)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
              title={r.caption || ""}
            >
              {snippet(r.caption, 80) || (
                <span style={{ color: "var(--tac-dim)" }}>(no caption)</span>
              )}
            </span>
            {r._url ? (
              <a
                href={r._url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open reel"
                style={{
                  color: "var(--tac-mute)",
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  textDecoration: "none",
                  border: "1px solid var(--tac-border)",
                  padding: "2px 6px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
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
                OPEN
                <ArrowSquareOut size={9} weight="regular" />
              </a>
            ) : (
              <span style={{ color: "var(--tac-dim)", fontSize: 9 }}>—</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HelpResult() {
  const rows = [
    ["top N field", "rank top N reels by field (views/likes/comments/engagement/duration)"],
    ["avg field", "average value of field across all rows"],
    ["median field", "median value of field"],
    ["sum field", "sum of field across all rows"],
    ["count where COND", "count rows where COND (e.g. likes > 1000)"],
    ["find TEXT", "search captions for TEXT (case-insensitive)"],
    ["stats", "show aggregate dashboard stats inline"],
    ["/help", "this list"],
  ];
  return (
    <div
      style={{
        background: "var(--tac-surface2)",
        border: "1px solid var(--tac-border)",
        padding: "10px 14px",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 10,
        color: "var(--tac-mute)",
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          color: "#4f8dfe",
          fontSize: 9,
          letterSpacing: "0.18em",
          marginBottom: 8,
        }}
      >
        // QUERY GRAMMAR
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {rows.map(([cmd, desc]) => (
          <div
            key={cmd}
            style={{
              display: "grid",
              gridTemplateColumns: "200px 1fr",
              gap: 12,
              alignItems: "baseline",
            }}
          >
            <span style={{ color: "var(--tac-fg)" }}>{cmd}</span>
            <span style={{ color: "var(--tac-mute)" }}>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- query engine ----------

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function reelUrl(r) {
  if (r?.url) return r.url;
  if (r?.shortCode) return `https://www.instagram.com/reel/${r.shortCode}/`;
  return null;
}

const FIELD_GETTERS = {
  views: (r) => num(r.videoViewCount) || num(r.videoPlayCount),
  likes: (r) => num(r.likesCount),
  comments: (r) => num(r.commentsCount),
  engagement: (r) => num(r.likesCount) + num(r.commentsCount),
  duration: (r) => num(r.videoDuration),
};

const FIELD_LABEL = {
  views: "VIEWS",
  likes: "LIKES",
  comments: "COMMENTS",
  engagement: "ENGAGEMENT",
  duration: "DURATION",
};

function fieldGetter(name) {
  const key = (name || "").toLowerCase().trim();
  return FIELD_GETTERS[key] ? { key, getter: FIELD_GETTERS[key] } : null;
}

function runQuery(q, rows) {
  if (!rows || !rows.length) {
    return { error: "no rows in bus — inject a CSV first" };
  }

  const lower = q.toLowerCase().trim();

  if (lower === "/help" || lower === "help") {
    return { kind: "help", summary: "QUERY GRAMMAR" };
  }

  if (lower === "stats") {
    const list = ["views", "likes", "comments", "engagement"]
      .map((f) => `${f}=${avg(rows, FIELD_GETTERS[f]).toFixed(0)}`)
      .join(" ");
    return { kind: "stat", value: rows.length, label: "TOTAL ROWS", detail: list, summary: "AGGREGATE STATS" };
  }

  let m = lower.match(/^top\s+(\d+)\s+(?:by\s+)?(\w+)$/);
  if (m) {
    const n = Math.min(Math.max(parseInt(m[1], 10), 1), 50);
    const f = fieldGetter(m[2]);
    if (!f) return { error: `unknown field "${m[2]}"` };
    const sorted = [...rows]
      .map((r) => ({ ...r, _metric: f.getter(r), _url: reelUrl(r) }))
      .sort((a, b) => b._metric - a._metric)
      .slice(0, n);
    return {
      kind: "rows",
      rows: sorted,
      metricLabel: FIELD_LABEL[f.key],
      summary: `TOP ${n} · ${FIELD_LABEL[f.key]}`,
    };
  }

  m = lower.match(/^(avg|average|mean)\s+(\w+)$/);
  if (m) {
    const f = fieldGetter(m[2]);
    if (!f) return { error: `unknown field "${m[2]}"` };
    return {
      kind: "stat",
      value: Math.round(avg(rows, f.getter)),
      label: `AVG ${FIELD_LABEL[f.key]}`,
      detail: `n = ${rows.length}`,
      summary: `AVG · ${FIELD_LABEL[f.key]}`,
    };
  }

  m = lower.match(/^median\s+(\w+)$/);
  if (m) {
    const f = fieldGetter(m[1]);
    if (!f) return { error: `unknown field "${m[1]}"` };
    return {
      kind: "stat",
      value: Math.round(median(rows, f.getter)),
      label: `MEDIAN ${FIELD_LABEL[f.key]}`,
      detail: `n = ${rows.length}`,
      summary: `MEDIAN · ${FIELD_LABEL[f.key]}`,
    };
  }

  m = lower.match(/^sum\s+(\w+)$/);
  if (m) {
    const f = fieldGetter(m[1]);
    if (!f) return { error: `unknown field "${m[1]}"` };
    return {
      kind: "stat",
      value: rows.reduce((s, r) => s + f.getter(r), 0),
      label: `SUM ${FIELD_LABEL[f.key]}`,
      detail: `n = ${rows.length}`,
      summary: `SUM · ${FIELD_LABEL[f.key]}`,
    };
  }

  m = lower.match(/^count\s+(?:where\s+)?(\w+)\s*(>=|<=|>|<|==?|=)\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const f = fieldGetter(m[1]);
    if (!f) return { error: `unknown field "${m[1]}"` };
    const op = m[2];
    const target = Number(m[3]);
    const compare = (v) => {
      switch (op) {
        case ">":
          return v > target;
        case ">=":
          return v >= target;
        case "<":
          return v < target;
        case "<=":
          return v <= target;
        case "=":
        case "==":
          return v === target;
        default:
          return false;
      }
    };
    const hits = rows.filter((r) => compare(f.getter(r))).length;
    return {
      kind: "stat",
      value: hits,
      label: `COUNT WHERE ${m[1].toUpperCase()} ${op} ${target}`,
      detail: `${((hits / rows.length) * 100).toFixed(1)}% of n=${rows.length}`,
      summary: `COUNT · ${m[1].toUpperCase()} ${op} ${target}`,
    };
  }

  m = lower.match(/^count(?:\s+caption(?:\s+containing)?)\s+(.+)$/);
  if (m) {
    const needle = m[1].trim();
    const hits = rows.filter((r) =>
      String(r.caption || "")
        .toLowerCase()
        .includes(needle)
    ).length;
    return {
      kind: "stat",
      value: hits,
      label: `CAPTIONS CONTAINING "${needle}"`,
      detail: `${((hits / rows.length) * 100).toFixed(1)}% of n=${rows.length}`,
      summary: `COUNT · "${needle}"`,
    };
  }

  m = lower.match(/^(?:find|search|grep)\s+(.+)$/);
  if (m) {
    const needle = m[1].trim();
    const matched = rows
      .filter((r) =>
        String(r.caption || "").toLowerCase().includes(needle)
      )
      .map((r) => ({
        ...r,
        _metric: num(r.videoViewCount) || num(r.videoPlayCount),
        _url: reelUrl(r),
      }))
      .sort((a, b) => b._metric - a._metric)
      .slice(0, 10);
    if (!matched.length) {
      return { error: `no captions match "${needle}"` };
    }
    return {
      kind: "rows",
      rows: matched,
      metricLabel: "VIEWS",
      summary: `FIND "${needle}" · ${matched.length} HITS`,
    };
  }

  // bare field name → average
  const bare = fieldGetter(lower);
  if (bare) {
    return {
      kind: "stat",
      value: Math.round(avg(rows, bare.getter)),
      label: `AVG ${FIELD_LABEL[bare.key]}`,
      detail: `n = ${rows.length}`,
      summary: `AVG · ${FIELD_LABEL[bare.key]}`,
    };
  }

  return {
    error: `unrecognized query — try "/help" for grammar`,
  };
}

function avg(rows, get) {
  if (!rows.length) return 0;
  let total = 0;
  let count = 0;
  for (const r of rows) {
    const v = get(r);
    if (v) {
      total += v;
      count++;
    }
  }
  return count ? total / count : 0;
}

function median(rows, get) {
  const arr = rows.map(get).filter((v) => v > 0).sort((a, b) => a - b);
  if (!arr.length) return 0;
  return arr[Math.floor(arr.length / 2)];
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (typeof n === "string") return n;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function snippet(s, n) {
  const t = (s || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export default memo(CommandInput);
