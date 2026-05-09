import { memo, useMemo } from "react";
import {
  ArrowSquareOut,
  Warning,
  Lightning,
  TrendDown,
  Target,
  ShareNetwork,
} from "@phosphor-icons/react";
import WidgetFrame from "./WidgetFrame.jsx";
import {
  performanceDistribution,
  viewsHistogram,
  rollingWindowComparison,
  personalBestStats,
  captionLengthStats,
  shareStats,
  postingTimeHeatmap,
  postingGapStats,
  deleteCandidateStats,
} from "../../lib/insights.js";

function PerformanceIntelligence({ rows = [], hideHeader = false }) {
  const dist = useMemo(() => performanceDistribution(rows), [rows]);
  const hist = useMemo(() => viewsHistogram(rows, 7), [rows]);
  const rolling = useMemo(() => rollingWindowComparison(rows, 30), [rows]);
  const personalBest = useMemo(() => personalBestStats(rows), [rows]);
  const captionStats = useMemo(() => captionLengthStats(rows), [rows]);
  const shareInfo = useMemo(() => shareStats(rows), [rows]);
  const heatmap = useMemo(() => postingTimeHeatmap(rows), [rows]);
  const gapStats = useMemo(() => postingGapStats(rows), [rows]);
  const deleteCands = useMemo(() => deleteCandidateStats(rows), [rows]);

  if (!rows.length) {
    return (
      <WidgetFrame name={hideHeader ? null : "Performance intelligence"}>
        <EmptyState>Add more posts to unlock this view.</EmptyState>
      </WidgetFrame>
    );
  }

  // Flop rate gets a warning tone only when it crosses a threshold; below
  // ~30 % it's just a fact about the dataset, not a problem to surface.
  const flopTone =
    dist.available && dist.flopRate >= 30 ? "warn" : "default";

  return (
    <section
      style={{
        display: "grid",
        gap: 16,
      }}
    >
      {!hideHeader && (
        <header
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div className="tac-section-title">
              Performance intelligence
            </div>
            <div className="tac-section-copy">
              Distribution, consistency, and pruning signals from this dataset.
            </div>
          </div>
        </header>
      )}

      {/* Row 1 — KPIs */}
      <div className={shareInfo.available ? "tac-grid-4" : "tac-grid-3"}>
        <KpiCard
          label="Hit rate"
          icon={Lightning}
          iconTone="accent"
          value={dist.available ? `${dist.hitRate}%` : "—"}
          helper="Posts above 2x median views"
          secondary={
            dist.available ? `${dist.hitCount} of ${dist.total} posts` : null
          }
          tone="ok"
        />
        <KpiCard
          label="Flop rate"
          icon={TrendDown}
          iconTone={flopTone === "warn" ? "warning" : "default"}
          value={dist.available ? `${dist.flopRate}%` : "—"}
          helper="Posts below 0.5x median views"
          secondary={
            dist.available ? `${dist.flopCount} of ${dist.total} posts` : null
          }
          tone={flopTone}
        />
        <KpiCard
          label="Consistency"
          icon={Target}
          iconTone={
            dist.available && dist.cv >= 2.0
              ? "warning"
              : dist.available && dist.cv >= 1.0
              ? "default"
              : "accent"
          }
          value={dist.available ? `${dist.consistencyScore}` : "—"}
          helper="Volatility of post views"
          secondary={dist.available ? dist.consistencyLabel : null}
          tone={
            dist.available && dist.cv >= 2.0
              ? "warn"
              : dist.available && dist.cv >= 1.0
              ? "default"
              : "ok"
          }
        />
        {shareInfo.available && (
          <KpiCard
            label="Share rate"
            icon={ShareNetwork}
            iconTone="cyan"
            value={`${shareInfo.avgShareRate}%`}
            helper="Shares per view"
            secondary={`${shareInfo.totalShares.toLocaleString()} total shares`}
            tone="default"
          />
        )}
      </div>

      {/* Row 2 — Distribution (wide) + Rolling window */}
      <div className="tac-pi-row">
        <ViewsDistribution hist={hist} />
        <RollingWindow data={rolling} />
      </div>

      {/* Row 3 — Personal bests + Review candidates */}
      <div className="tac-grid-2">
        <PersonalBests data={personalBest} />
        <PruneCandidates data={deleteCands} />
      </div>

      {/* Lower-priority diagnostics, collapsed by default */}
      <MoreDiagnostics
        captionStats={captionStats}
        heatmap={heatmap}
        gapStats={gapStats}
      />
    </section>
  );
}

function MoreDiagnostics({ captionStats, heatmap, gapStats }) {
  return (
    <details
      style={{
        background: "var(--tac-surface)",
        border: "1px solid var(--tac-border)",
        borderRadius: 10,
      }}
    >
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 18px",
          cursor: "pointer",
          listStyle: "none",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--tac-fg)",
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <span>More diagnostics</span>
        <span
          style={{
            fontSize: 12,
            color: "var(--tac-mute)",
            fontWeight: 400,
          }}
        >
          Caption length · Posting time · Posting gaps
        </span>
      </summary>
      <div
        style={{
          padding: "0 18px 18px",
          display: "grid",
          gap: 16,
        }}
      >
        <div className="tac-grid-3">
          <CaptionLength data={captionStats} />
          <PostingHeatmap data={heatmap} />
          <PostingGaps data={gapStats} />
        </div>
      </div>
    </details>
  );
}

// ---------------- KPI card ----------------

function KpiCard({
  label,
  value,
  helper,
  secondary,
  tone = "default",
  icon,
  iconTone = "default",
}) {
  const valueColor =
    tone === "ok"
      ? "var(--tac-success)"
      : tone === "warn"
      ? "var(--tac-warning)"
      : "var(--tac-fg)";
  return (
    <WidgetFrame name={label} iconBadge={icon} iconTone={iconTone}>
      <div style={{ display: "grid", gap: 6 }}>
        <div
          className="tac-kpi-value"
          style={{ color: valueColor, fontSize: 26 }}
        >
          {value}
        </div>
        <div style={{ fontSize: 12, color: "var(--tac-mute)" }}>{helper}</div>
        {secondary && (
          <div
            style={{
              fontSize: 12,
              color: "var(--tac-fg)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {secondary}
          </div>
        )}
      </div>
    </WidgetFrame>
  );
}

// ---------------- Views distribution ----------------

function ViewsDistribution({ hist }) {
  if (!hist.available) {
    return (
      <WidgetFrame name="Views distribution">
        <EmptyState>Not enough posts yet.</EmptyState>
      </WidgetFrame>
    );
  }
  const { buckets, maxCount, medianBucketIdx, median } = hist;
  return (
    <WidgetFrame name="Views distribution">
      <div style={{ display: "grid", gap: 8 }}>
        <div
          style={{
            fontSize: 12,
            color: "var(--tac-mute)",
          }}
        >
          Median ≈ {fmtNum(median)} views
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {buckets.map((b, i) => {
            const pct = maxCount ? (b.count / maxCount) * 100 : 0;
            const isMedian = i === medianBucketIdx;
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px 1fr 36px",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: isMedian
                      ? "var(--tac-fg)"
                      : "var(--tac-mute)",
                    fontFamily:
                      '"JetBrains Mono", ui-monospace, monospace',
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {b.label}
                </span>
                <div
                  style={{
                    height: 14,
                    background: "var(--tac-surface2)",
                    borderRadius: 4,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(pct, b.count > 0 ? 4 : 0)}%`,
                      height: "100%",
                      background: isMedian
                        ? "var(--tac-accent)"
                        : "var(--tac-accent-soft-strong)",
                      borderRadius: 4,
                      transition: "width 240ms ease",
                    }}
                  />
                </div>
                <span
                  className="tac-mono"
                  style={{
                    fontSize: 12,
                    color: "var(--tac-fg)",
                    textAlign: "right",
                  }}
                >
                  {b.count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </WidgetFrame>
  );
}

// ---------------- Rolling 30-day window ----------------

function RollingWindow({ data }) {
  if (!data.available) {
    return (
      <WidgetFrame name={`Last ${data.windowDays || 30} days`}>
        <EmptyState>Not enough dated posts for a 30-day comparison.</EmptyState>
      </WidgetFrame>
    );
  }
  const rows = [
    {
      label: "Avg views",
      cur: fmtNum(data.current.avgViews),
      delta: data.deltas.avgViews,
    },
    {
      label: "Engagement rate",
      cur: `${data.current.avgEngRate}%`,
      delta: data.deltas.avgEngRate,
    },
    {
      label: "Posts",
      cur: data.current.posts.toLocaleString(),
      delta: data.deltas.posts,
    },
  ];
  if (data.hasShares) {
    rows.push({
      label: "Share rate",
      cur: `${data.current.avgShareRate}%`,
      delta: data.deltas.avgShareRate,
    });
  }
  return (
    <WidgetFrame name={`Last ${data.windowDays} days`}>
      <div style={{ display: "grid", gap: 4 }}>
        <div
          style={{
            fontSize: 12,
            color: "var(--tac-mute)",
          }}
        >
          Compared to the previous {data.windowDays} days.
        </div>
        <table className="tac-table" style={{ marginTop: 4 }}>
          <thead>
            <tr>
              <th>Metric</th>
              <th className="num">Current</th>
              <th className="num" style={{ width: 80 }}>
                Δ
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num">{r.cur}</td>
                <td className="num">
                  <DeltaCell value={r.delta} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetFrame>
  );
}

function DeltaCell({ value }) {
  if (value == null) {
    return <span style={{ color: "var(--tac-dim)" }}>—</span>;
  }
  if (value === 0) {
    return <span style={{ color: "var(--tac-mute)" }}>0%</span>;
  }
  const positive = value > 0;
  return (
    <span
      style={{
        color: positive ? "var(--tac-success)" : "var(--tac-danger)",
        fontWeight: 500,
      }}
    >
      {positive ? "+" : ""}
      {value}%
    </span>
  );
}

// ---------------- Caption length ----------------

function CaptionLength({ data }) {
  if (!data.available || data.buckets.every((b) => b.count === 0)) {
    return (
      <WidgetFrame name="Caption length">
        <EmptyState>Not enough posts yet.</EmptyState>
      </WidgetFrame>
    );
  }
  return (
    <WidgetFrame name="Caption length">
      <table className="tac-table">
        <thead>
          <tr>
            <th>Bucket</th>
            <th className="num">Posts</th>
            <th className="num">Avg views</th>
            {data.hasShares && <th className="num">Share rate</th>}
          </tr>
        </thead>
        <tbody>
          {data.buckets.map((b) => (
            <tr key={b.id}>
              <td>
                <div style={{ fontWeight: 500 }}>{b.label}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--tac-mute)",
                    fontFamily:
                      '"JetBrains Mono", ui-monospace, monospace',
                  }}
                >
                  {b.range} chars
                </div>
              </td>
              <td className="num">{b.count}</td>
              <td className="num">{b.count ? fmtNum(b.avgViews) : "—"}</td>
              {data.hasShares && (
                <td className="num">
                  {b.count ? `${b.avgShareRate}%` : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </WidgetFrame>
  );
}

// ---------------- Posting time heatmap ----------------

function PostingHeatmap({ data }) {
  if (!data.available) {
    return (
      <WidgetFrame name="Posting time">
        <EmptyState>No dated posts found.</EmptyState>
      </WidgetFrame>
    );
  }
  const max = data.maxAvgViews || 1;
  return (
    <WidgetFrame name="Posting time">
      <div style={{ display: "grid", gap: 6 }}>
        <div
          style={{
            fontSize: 12,
            color: "var(--tac-mute)",
          }}
        >
          Cell shade = average views for that day × time block.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "44px repeat(4, 1fr)",
            gap: 4,
            marginTop: 4,
          }}
        >
          <span />
          {data.blocks.map((b) => (
            <span
              key={b.id}
              style={{
                fontSize: 11,
                color: "var(--tac-mute)",
                textAlign: "center",
                fontFamily:
                  '"JetBrains Mono", ui-monospace, monospace',
              }}
            >
              {b.label}
            </span>
          ))}
          {data.grid.map((dayRow, di) => (
            <DayRow key={di} day={data.days[di]} cells={dayRow} max={max} />
          ))}
        </div>
      </div>
    </WidgetFrame>
  );
}

function DayRow({ day, cells, max }) {
  return (
    <>
      <span
        style={{
          fontSize: 11,
          color: "var(--tac-mute)",
          alignSelf: "center",
        }}
      >
        {day}
      </span>
      {cells.map((c) => {
        const intensity = max ? c.avgViews / max : 0;
        const bg = c.count
          ? `rgba(33, 208, 122, ${0.1 + intensity * 0.65})`
          : "var(--tac-surface-inner)";
        return (
          <div
            key={c.block}
            title={`${day} ${c.blockLabel} · ${c.count} posts · avg ${fmtNum(
              c.avgViews
            )} views`}
            style={{
              height: 28,
              borderRadius: 4,
              background: bg,
              display: "grid",
              placeItems: "center",
              fontSize: 11,
              color: c.count
                ? "var(--tac-fg)"
                : "var(--tac-dim)",
              fontVariantNumeric: "tabular-nums",
              fontFamily:
                '"JetBrains Mono", ui-monospace, monospace',
              transition: "background 200ms",
            }}
          >
            {c.count || ""}
          </div>
        );
      })}
    </>
  );
}

// ---------------- Posting gaps ----------------

function PostingGaps({ data }) {
  if (!data.available) {
    return (
      <WidgetFrame name="Posting gaps">
        <EmptyState>No dated posts found.</EmptyState>
      </WidgetFrame>
    );
  }
  if (data.gapsOver7 === 0) {
    return (
      <WidgetFrame name="Posting gaps">
        <div style={{ display: "grid", gap: 8 }}>
          <Stat
            label="Longest gap"
            value={`${data.longestGapDays} days`}
            tone="ok"
          />
          <Stat
            label="Days since last post"
            value={`${data.lastPostDays} days`}
          />
          <div style={{ fontSize: 12, color: "var(--tac-mute)" }}>
            No posting gaps over 7 days detected.
          </div>
        </div>
      </WidgetFrame>
    );
  }
  return (
    <WidgetFrame name="Posting gaps">
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <Stat
            label="Longest gap"
            value={`${data.longestGapDays} days`}
            tone="warn"
          />
          <Stat
            label="Gaps over 7 days"
            value={`${data.gapsOver7}`}
            tone="warn"
          />
          <Stat
            label="Days since last post"
            value={`${data.lastPostDays} days`}
            tone={data.lastPostDays > 7 ? "warn" : "default"}
          />
        </div>
        {data.gaps.length > 0 && (
          <div
            style={{
              fontSize: 12,
              color: "var(--tac-mute)",
              borderTop: "1px solid var(--tac-border)",
              paddingTop: 8,
            }}
          >
            Top gap: {data.gaps[0].days} days between{" "}
            {fmtDate(data.gaps[0].startTs)} and {fmtDate(data.gaps[0].endTs)}.
          </div>
        )}
      </div>
    </WidgetFrame>
  );
}

function Stat({ label, value, tone }) {
  const color =
    tone === "warn"
      ? "var(--tac-warning)"
      : tone === "ok"
      ? "var(--tac-success)"
      : "var(--tac-fg)";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 13, color: "var(--tac-mute)" }}>{label}</span>
      <span
        style={{
          fontSize: 14,
          color,
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------- Personal bests ----------------

function PersonalBests({ data }) {
  if (!data.available) {
    return (
      <WidgetFrame name="Personal bests">
        <EmptyState>Not enough posts yet.</EmptyState>
      </WidgetFrame>
    );
  }
  const { traits } = data;
  return (
    <WidgetFrame name="Personal bests">
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <BestStat
            label="Best post"
            value={fmtNum(data.bestViews)}
            sub="views"
          />
          <BestStat
            label="Top 10% threshold"
            value={fmtNum(data.top10Threshold)}
            sub={`${data.top10Count} posts`}
          />
        </div>
        <div
          style={{
            borderTop: "1px solid var(--tac-border)",
            paddingTop: 12,
            display: "grid",
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "var(--tac-mute)",
              fontWeight: 500,
            }}
          >
            Common traits in the top 10%
          </div>
          <TraitRow
            label="Median duration"
            value={traits.medianDuration ? `${traits.medianDuration}s` : "—"}
          />
          <TraitRow
            label="Most common day"
            value={traits.mostCommonDay || "—"}
          />
          <TraitRow
            label="Avg caption length"
            value={
              traits.avgCaptionLength
                ? `${traits.avgCaptionLength} chars`
                : "—"
            }
          />
          <TraitRow
            label="Top hashtag"
            value={traits.mostCommonHashtag ? `#${traits.mostCommonHashtag}` : "—"}
          />
        </div>
      </div>
    </WidgetFrame>
  );
}

function BestStat({ label, value, sub }) {
  return (
    <div
      style={{
        background: "var(--tac-surface2)",
        border: "1px solid var(--tac-border)",
        borderRadius: 8,
        padding: "10px 12px",
        display: "grid",
        gap: 2,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--tac-mute)" }}>{label}</div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: "var(--tac-fg)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--tac-mute)" }}>{sub}</div>
      )}
    </div>
  );
}

function TraitRow({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 13, color: "var(--tac-mute)" }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          color: "var(--tac-fg)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------- Prune candidates ----------------

function PruneCandidates({ data }) {
  if (!data.available) {
    return (
      <WidgetFrame name="Review candidates">
        <EmptyState>
          {data.reason === "small_sample"
            ? "Need at least 10 posts to suggest review candidates."
            : "No review candidates found."}
        </EmptyState>
      </WidgetFrame>
    );
  }
  if (data.count === 0) {
    return (
      <WidgetFrame name="Review candidates">
        <EmptyState>No review candidates found.</EmptyState>
      </WidgetFrame>
    );
  }
  return (
    <WidgetFrame name="Review candidates">
      <div style={{ display: "grid", gap: 10 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--tac-mute)",
            lineHeight: 1.5,
          }}
        >
          <Warning size={14} weight="regular" color="var(--tac-warning)" />
          <span>
            {data.count} low-performing post
            {data.count === 1 ? "" : "s"} (under {fmtNum(data.p10Views)} views
            with weak engagement). Worth reviewing before future strategy
            decisions — context still matters.
          </span>
        </div>
        <table className="tac-table">
          <thead>
            <tr>
              <th>Caption</th>
              <th className="num">Views</th>
              <th className="num">ER</th>
              {data.hasShares && <th className="num">SR</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {data.candidates.map((c, i) => (
              <tr key={i}>
                <td
                  style={{
                    maxWidth: 240,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={c.caption}
                >
                  {c.caption}
                </td>
                <td className="num">{fmtNum(c.views)}</td>
                <td className="num">{c.engagementRate}%</td>
                {data.hasShares && (
                  <td className="num">
                    {c.shareRate != null ? `${c.shareRate}%` : "—"}
                  </td>
                )}
                <td style={{ textAlign: "right", width: 36 }}>
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open reel"
                      style={{
                        color: "var(--tac-mute)",
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "var(--tac-accent)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "var(--tac-mute)")
                      }
                    >
                      <ArrowSquareOut size={12} weight="regular" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetFrame>
  );
}

// ---------------- Misc helpers ----------------

function EmptyState({ children }) {
  return (
    <div
      className="tac-empty-grid"
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: 88,
        padding: "24px 16px",
        border: "1px solid var(--tac-border)",
        borderRadius: 8,
        fontSize: 13,
        color: "var(--tac-mute)",
        textAlign: "center",
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function fmtNum(n) {
  if (n == null || Number.isNaN(n) || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function fmtDate(ts) {
  try {
    return new Date(ts).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

export default memo(PerformanceIntelligence);
