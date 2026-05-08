import { memo, useEffect, useRef, useState } from "react";
import { ArrowSquareOut, ArrowRight, X as XIcon } from "@phosphor-icons/react";
import WidgetFrame from "./WidgetFrame.jsx";
import { useCsv } from "../state/CsvContext.jsx";

const PLACEHOLDER_HINTS = [
  "top 10 likes",
  "avg views",
  "median engagement",
  "find handsworkout",
  "/help",
  "count caption containing morning",
  "top 5 by comments",
];

function CommandInput({ name = "Query dataset" }) {
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
    <WidgetFrame name={name}>
      <div style={{ display: "grid", gap: 12 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          style={{
            background: "var(--tac-surface)",
            border: "1px solid var(--tac-border)",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            transition: "border-color 120ms, box-shadow 120ms",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--tac-accent)";
            e.currentTarget.style.boxShadow =
              "0 0 0 3px rgba(79, 141, 254, 0.2)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--tac-border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <span
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 13,
              color: "var(--tac-accent)",
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
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 13,
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
                color: "var(--tac-mute)",
                cursor: "pointer",
                padding: 4,
                borderRadius: 4,
                display: "grid",
                placeItems: "center",
                transition: "color 120ms, background 120ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--tac-fg)";
                e.currentTarget.style.background = "var(--tac-surface2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--tac-mute)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <XIcon size={13} weight="regular" />
            </button>
          )}
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Run query"
            className="tac-btn tac-btn-accent"
            style={{
              padding: "5px 10px",
              fontSize: 12,
              opacity: text.trim() ? 1 : 0.4,
              cursor: text.trim() ? "pointer" : "not-allowed",
            }}
          >
            Run
            <ArrowRight size={12} weight="bold" />
          </button>
        </form>

        <Footer result={result} rowCount={rows.length} />

        {result && <ResultPanel result={result} />}
      </div>
    </WidgetFrame>
  );
}

function Footer({ result, rowCount }) {
  const variant = result?.error ? "err" : result ? "ok" : "";
  const label = result?.error
    ? "Query error"
    : result
    ? `Result · ${result.summary || "OK"}`
    : `Idle · ${rowCount.toLocaleString()} rows`;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 12,
        color: "var(--tac-mute)",
        flexWrap: "wrap",
      }}
    >
      <span className={`tac-pill${variant ? ` tac-pill--${variant}` : ""}`}>
        {label}
      </span>
      <span style={{ color: "var(--tac-dim)" }}>
        Try: top N field · avg field · find TEXT · /help
      </span>
    </div>
  );
}

function ResultPanel({ result }) {
  if (result.error) {
    return (
      <div className="tac-error-banner">
        {result.error}
      </div>
    );
  }
  if (result.kind === "help") return <HelpResult />;
  if (result.kind === "stat") return <StatResult result={result} />;
  if (result.kind === "rows") return <RowsResult result={result} />;
  return null;
}

function StatResult({ result }) {
  return (
    <div
      style={{
        background: "var(--tac-surface2)",
        border: "1px solid var(--tac-border)",
        borderRadius: 8,
        padding: "14px 16px",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        alignItems: "center",
        gap: 16,
      }}
    >
      <span
        style={{
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
          fontSize: 28,
          fontWeight: 600,
          color: "var(--tac-accent)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
        }}
      >
        {fmt(result.value)}
      </span>
      <div>
        <div
          style={{
            fontSize: 13,
            color: "var(--tac-fg)",
            fontWeight: 500,
          }}
        >
          {result.label}
        </div>
        {result.detail && (
          <div
            style={{
              fontSize: 12,
              color: "var(--tac-mute)",
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
  return (
    <div
      style={{
        background: "var(--tac-surface)",
        border: "1px solid var(--tac-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <table className="tac-table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th className="num" style={{ width: 100 }}>
              {result.metricLabel || "Metric"}
            </th>
            <th>Caption</th>
            <th style={{ width: 80, textAlign: "right" }}>Link</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, 10).map((r, i) => (
            <tr key={i}>
              <td
                className="num"
                style={{
                  color: "var(--tac-mute)",
                  fontWeight: 500,
                }}
              >
                {i + 1}
              </td>
              <td
                className="num"
                style={{
                  color: "var(--tac-accent)",
                  fontWeight: 600,
                }}
              >
                {fmt(r._metric)}
              </td>
              <td
                title={r.caption || ""}
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 360,
                  color: r.caption ? "var(--tac-fg)" : "var(--tac-dim)",
                }}
              >
                {snippet(r.caption, 80) || "(no caption)"}
              </td>
              <td style={{ textAlign: "right" }}>
                {r._url ? (
                  <a
                    href={r._url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open reel"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 12,
                      color: "var(--tac-mute)",
                      textDecoration: "none",
                      padding: "2px 6px",
                      borderRadius: 4,
                      transition: "color 120ms, background 120ms",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--tac-accent)";
                      e.currentTarget.style.background = "var(--tac-surface2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--tac-mute)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    Open
                    <ArrowSquareOut size={11} weight="regular" />
                  </a>
                ) : (
                  <span style={{ color: "var(--tac-dim)" }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HelpResult() {
  const rows = [
    [
      "top N field",
      "Rank top N reels by field (views/likes/comments/engagement/duration)",
    ],
    ["avg field", "Average value of field across all rows"],
    ["median field", "Median value of field"],
    ["sum field", "Sum of field across all rows"],
    ["count where COND", "Count rows where COND (e.g. likes > 1000)"],
    ["find TEXT", "Search captions for TEXT (case-insensitive)"],
    ["stats", "Show aggregate dashboard stats inline"],
    ["/help", "This list"],
  ];
  return (
    <div
      style={{
        background: "var(--tac-surface2)",
        border: "1px solid var(--tac-border)",
        borderRadius: 8,
        padding: "12px 16px",
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 13,
        color: "var(--tac-mute)",
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          color: "var(--tac-fg)",
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        Query grammar
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
            <span
              style={{
                color: "var(--tac-fg)",
                fontFamily:
                  '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 12,
              }}
            >
              {cmd}
            </span>
            <span style={{ color: "var(--tac-mute)" }}>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- query engine (logic unchanged) ----------

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
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  engagement: "Engagement",
  duration: "Duration",
};

function fieldGetter(name) {
  const key = (name || "").toLowerCase().trim();
  return FIELD_GETTERS[key] ? { key, getter: FIELD_GETTERS[key] } : null;
}

function runQuery(q, rows) {
  if (!rows || !rows.length) {
    return { error: "No rows in dataset — load a CSV first." };
  }

  const lower = q.toLowerCase().trim();

  if (lower === "/help" || lower === "help") {
    return { kind: "help", summary: "Query grammar" };
  }

  if (lower === "stats") {
    const list = ["views", "likes", "comments", "engagement"]
      .map((f) => `${f}=${avg(rows, FIELD_GETTERS[f]).toFixed(0)}`)
      .join(" · ");
    return {
      kind: "stat",
      value: rows.length,
      label: "Total rows",
      detail: list,
      summary: "Aggregate stats",
    };
  }

  let m = lower.match(/^top\s+(\d+)\s+(?:by\s+)?(\w+)$/);
  if (m) {
    const n = Math.min(Math.max(parseInt(m[1], 10), 1), 50);
    const f = fieldGetter(m[2]);
    if (!f) return { error: `Unknown field "${m[2]}"` };
    const sorted = [...rows]
      .map((r) => ({ ...r, _metric: f.getter(r), _url: reelUrl(r) }))
      .sort((a, b) => b._metric - a._metric)
      .slice(0, n);
    return {
      kind: "rows",
      rows: sorted,
      metricLabel: FIELD_LABEL[f.key],
      summary: `Top ${n} · ${FIELD_LABEL[f.key].toLowerCase()}`,
    };
  }

  m = lower.match(/^(avg|average|mean)\s+(\w+)$/);
  if (m) {
    const f = fieldGetter(m[2]);
    if (!f) return { error: `Unknown field "${m[2]}"` };
    return {
      kind: "stat",
      value: Math.round(avg(rows, f.getter)),
      label: `Average ${FIELD_LABEL[f.key].toLowerCase()}`,
      detail: `n = ${rows.length}`,
      summary: `Avg · ${FIELD_LABEL[f.key].toLowerCase()}`,
    };
  }

  m = lower.match(/^median\s+(\w+)$/);
  if (m) {
    const f = fieldGetter(m[1]);
    if (!f) return { error: `Unknown field "${m[1]}"` };
    return {
      kind: "stat",
      value: Math.round(median(rows, f.getter)),
      label: `Median ${FIELD_LABEL[f.key].toLowerCase()}`,
      detail: `n = ${rows.length}`,
      summary: `Median · ${FIELD_LABEL[f.key].toLowerCase()}`,
    };
  }

  m = lower.match(/^sum\s+(\w+)$/);
  if (m) {
    const f = fieldGetter(m[1]);
    if (!f) return { error: `Unknown field "${m[1]}"` };
    return {
      kind: "stat",
      value: rows.reduce((s, r) => s + f.getter(r), 0),
      label: `Sum ${FIELD_LABEL[f.key].toLowerCase()}`,
      detail: `n = ${rows.length}`,
      summary: `Sum · ${FIELD_LABEL[f.key].toLowerCase()}`,
    };
  }

  m = lower.match(/^count\s+(?:where\s+)?(\w+)\s*(>=|<=|>|<|==?|=)\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const f = fieldGetter(m[1]);
    if (!f) return { error: `Unknown field "${m[1]}"` };
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
      label: `Count where ${m[1]} ${op} ${target}`,
      detail: `${((hits / rows.length) * 100).toFixed(1)}% of n=${rows.length}`,
      summary: `Count · ${m[1]} ${op} ${target}`,
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
      label: `Captions containing "${needle}"`,
      detail: `${((hits / rows.length) * 100).toFixed(1)}% of n=${rows.length}`,
      summary: `Count · "${needle}"`,
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
      return { error: `No captions match "${needle}"` };
    }
    return {
      kind: "rows",
      rows: matched,
      metricLabel: "Views",
      summary: `Find "${needle}" · ${matched.length} hits`,
    };
  }

  // bare field name → average
  const bare = fieldGetter(lower);
  if (bare) {
    return {
      kind: "stat",
      value: Math.round(avg(rows, bare.getter)),
      label: `Average ${FIELD_LABEL[bare.key].toLowerCase()}`,
      detail: `n = ${rows.length}`,
      summary: `Avg · ${FIELD_LABEL[bare.key].toLowerCase()}`,
    };
  }

  return {
    error: `Unrecognized query — try "/help" for grammar.`,
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
