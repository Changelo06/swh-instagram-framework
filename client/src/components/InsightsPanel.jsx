import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  aggregateStats,
  captionSnippet,
  engagement,
  engagementRate,
  engagementScatter,
  tierDistribution,
  uploadCadence,
  viewsByDayOfWeek,
  viewsByDuration,
  views,
} from "../lib/insights.js";
import Top10Reels from "./Top10Reels.jsx";

// ---- vibrant chart palette ----
const VIBE_PINK = "#EC4899";
const VIBE_PURPLE = "#A855F7";
const VIBE_INDIGO = "#6366F1";
const VIBE_BLUE = "#3B82F6";
const VIBE_AMBER = "#FBBF24";
const VIBE_ORANGE = "#F97316";

const GRID = "rgba(255,255,255,0.06)";
const TEXT = "#94a3b8";

const tooltipStyle = {
  backgroundColor: "#0a0a0a",
  border: "1px solid rgba(168,85,247,0.35)",
  borderRadius: "10px",
  fontSize: "12px",
  color: "#f1f5f9",
  boxShadow: "0 12px 32px -8px rgba(0,0,0,0.8)",
};
const tooltipLabelStyle = { color: "#EC4899", fontWeight: 600, marginBottom: 4 };
const tooltipItemStyle = { color: "#e2e8f0" };

function reelUrl(row) {
  if (row?.url) return row.url;
  if (row?.shortCode) return `https://www.instagram.com/reel/${row.shortCode}/`;
  return null;
}

function formatCompact(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function InsightsPanel({ rows }) {
  if (!rows?.length) return null;

  const stats = aggregateStats(rows);
  const tiers = tierDistribution(rows);
  const byDuration = viewsByDuration(rows);
  const byDay = viewsByDayOfWeek(rows);
  const cadence = uploadCadence(rows);

  // Enrich scatter data with the original row reference so we can link
  // each point through to its reel URL.
  const scatter = useMemo(() => {
    const enriched = engagementScatter(rows);
    return enriched.map((p, i) => ({ ...p, _row: rows[p.idx] || rows[i] }));
  }, [rows]);

  const onScatterClick = (data) => {
    const url = reelUrl(data?._row);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-5">
      <KpiRow stats={stats} totalPosts={rows.length} />

      <Top10Reels rows={rows} />

      <div className="grid lg:grid-cols-2 gap-5">
        <ChartCard
          title="Performance tiers"
          subtitle="By view count · SWH 20/60/20 split"
        >
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={tiers}
                dataKey="value"
                nameKey="name"
                innerRadius={70}
                outerRadius={110}
                stroke="#000"
                strokeWidth={2}
                paddingAngle={2}
              >
                {tiers.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
              />
              <Legend wrapperStyle={{ color: TEXT, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Upload cadence"
          subtitle="Number of posts by day of week"
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={cadence} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="grad-cadence" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VIBE_PINK} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={VIBE_PURPLE} stopOpacity={0.85} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: TEXT, fontSize: 12 }} />
              <YAxis tick={{ fill: TEXT, fontSize: 11 }} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                formatter={(v) => [v, "Posts"]}
              />
              <Bar dataKey="posts" fill="url(#grad-cadence)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title="Average views by duration"
        subtitle="Where the algorithm rewards length"
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={byDuration} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="grad-duration" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={VIBE_AMBER} stopOpacity={0.95} />
                <stop offset="60%" stopColor={VIBE_ORANGE} stopOpacity={0.9} />
                <stop offset="100%" stopColor={VIBE_PINK} stopOpacity={0.85} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="bucket" tick={{ fill: TEXT, fontSize: 12 }} />
            <YAxis
              tick={{ fill: TEXT, fontSize: 11 }}
              tickFormatter={(v) => formatCompact(v)}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(v, _k, item) => [
                v.toLocaleString(),
                `Avg views (${item?.payload?.count ?? 0} posts)`,
              ]}
            />
            <Bar dataKey="avgViews" fill="url(#grad-duration)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Average views by day of week"
        subtitle="Best posting windows"
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={byDay} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="grad-dow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={VIBE_PURPLE} stopOpacity={0.95} />
                <stop offset="100%" stopColor={VIBE_INDIGO} stopOpacity={0.85} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="day" tick={{ fill: TEXT, fontSize: 12 }} />
            <YAxis
              tick={{ fill: TEXT, fontSize: 11 }}
              tickFormatter={(v) => formatCompact(v)}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(v, _k, item) => [
                v.toLocaleString(),
                `Avg views (${item?.payload?.posts ?? 0} posts)`,
              ]}
            />
            <Bar dataKey="avgViews" fill="url(#grad-dow)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Views vs engagement rate"
        subtitle="Click any point to open the reel · dot size = duration"
      >
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis
              type="number"
              dataKey="x"
              name="Views"
              tick={{ fill: TEXT, fontSize: 11 }}
              tickFormatter={(v) => formatCompact(v)}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Engagement %"
              tick={{ fill: TEXT, fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
            />
            <ZAxis type="number" dataKey="duration" range={[40, 240]} name="Duration (s)" />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              cursor={{ strokeDasharray: "3 3", stroke: "rgba(168,85,247,0.4)" }}
              formatter={(value, key) => {
                if (key === "x") return [value.toLocaleString(), "Views"];
                if (key === "y") return [`${value}%`, "Engagement"];
                if (key === "duration") return [`${value}s`, "Duration"];
                return [value, key];
              }}
              labelFormatter={(_, items) => {
                const cap = items?.[0]?.payload?.caption;
                return cap && cap !== "(no caption)" ? `“${cap}”` : "(no caption)";
              }}
            />
            <Scatter
              data={scatter}
              fill={VIBE_PINK}
              fillOpacity={0.85}
              stroke={VIBE_PURPLE}
              strokeWidth={1}
              onClick={onScatterClick}
              style={{ cursor: "pointer" }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function KpiRow({ stats, totalPosts }) {
  const items = [
    { label: "Posts analyzed", value: totalPosts.toLocaleString(), hue: "#EC4899" },
    { label: "Avg views", value: formatCompact(stats.avgViews), hue: "#A855F7" },
    { label: "Median views", value: formatCompact(stats.medianViews), hue: "#6366F1" },
    { label: "Avg engagement", value: formatCompact(stats.avgEngagement), hue: "#3B82F6" },
    { label: "Avg eng. rate", value: `${stats.avgEngRate}%`, hue: "#FBBF24" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="panel p-4 relative overflow-hidden"
        >
          <div
            className="absolute inset-x-0 top-0 h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${it.hue}, transparent)`,
            }}
          />
          <div className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-semibold">
            {it.label}
          </div>
          <div
            className="text-2xl font-serif mt-1 leading-none font-bold"
            style={{ color: it.hue }}
          >
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="panel p-5">
      <div className="mb-4">
        <div className="font-serif text-base text-white">{title}</div>
        {subtitle && (
          <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}
