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
  audioOriginalVsLicensed,
  captionSnippet,
  engagement,
  engagementRate,
  engagementScatter,
  tierDistribution,
  topByEngagement,
  topHashtags,
  viewsByDayOfWeek,
  viewsByDuration,
  views,
} from "../lib/insights.js";

const GOLD = "#d4af37";
const GOLD_DIM = "#947420";
const NAVY_GRID = "#1d3a60";
const TEXT = "#cbd5e1";

const tooltipStyle = {
  backgroundColor: "#0a1628",
  border: "1px solid rgba(212,175,55,0.3)",
  borderRadius: "6px",
  fontSize: "12px",
  color: "#e2e8f0",
};

// Recharts renders the tooltip label + item rows with their own inline
// styles (defaults are dark text on a light background). Override both
// so they're readable on the dark navy tooltip.
const tooltipLabelStyle = { color: "#e6c768", fontWeight: 600, marginBottom: 4 };
const tooltipItemStyle = { color: "#e2e8f0" };

export default function InsightsPanel({ rows }) {
  if (!rows?.length) return null;

  const stats = aggregateStats(rows);
  const top10 = topByEngagement(rows, 10);
  const tiers = tierDistribution(rows);
  const byDuration = viewsByDuration(rows);
  const byDay = viewsByDayOfWeek(rows);
  const audio = audioOriginalVsLicensed(rows);
  const tags = topHashtags(rows, 12);
  const scatter = engagementScatter(rows);

  return (
    <div className="space-y-6">
      <KpiRow stats={stats} totalPosts={rows.length} />

      <ChartCard title="Top 10 reels by engagement" subtitle="Likes + comments per post">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={top10} margin={{ top: 5, right: 10, left: 0, bottom: 70 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={NAVY_GRID} vertical={false} />
            <XAxis
              dataKey="caption"
              tick={{ fill: TEXT, fontSize: 10 }}
              interval={0}
              angle={-30}
              textAnchor="end"
              tickFormatter={(v) => (v ? String(v).slice(0, 22) + (v.length > 22 ? "…" : "") : "")}
            />
            <YAxis tick={{ fill: TEXT, fontSize: 11 }} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(v) => [v.toLocaleString(), "Engagement"]}
              labelFormatter={(label, items) => {
                const row = items?.[0]?.payload;
                return row ? captionSnippet(row, 80) : label;
              }}
            />
            <Bar dataKey={(r) => engagement(r)} fill={GOLD} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="Performance tiers" subtitle="By view count, SWH 20/60/20 split">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={tiers}
                dataKey="value"
                nameKey="name"
                innerRadius={70}
                outerRadius={110}
                stroke="#0a1628"
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

        <ChartCard title="Original vs licensed audio" subtitle="Average views per post">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={audio} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={NAVY_GRID} vertical={false} />
              <XAxis dataKey="type" tick={{ fill: TEXT, fontSize: 12 }} />
              <YAxis tick={{ fill: TEXT, fontSize: 11 }} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                formatter={(v, _k, item) => [
                  v.toLocaleString(),
                  `Avg views (${item?.payload?.count ?? 0} posts)`,
                ]}
              />
              <Bar dataKey="avgViews" fill={GOLD} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Average views by duration" subtitle="Where the algorithm rewards length">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={byDuration} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={NAVY_GRID} vertical={false} />
            <XAxis dataKey="bucket" tick={{ fill: TEXT, fontSize: 12 }} />
            <YAxis tick={{ fill: TEXT, fontSize: 11 }} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(v, _k, item) => [
                v.toLocaleString(),
                `Avg views (${item?.payload?.count ?? 0} posts)`,
              ]}
            />
            <Bar dataKey="avgViews" fill={GOLD} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Average views by day of week" subtitle="Best posting windows">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={byDay} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={NAVY_GRID} vertical={false} />
            <XAxis dataKey="day" tick={{ fill: TEXT, fontSize: 12 }} />
            <YAxis tick={{ fill: TEXT, fontSize: 11 }} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(v, _k, item) => [
                v.toLocaleString(),
                `Avg views (${item?.payload?.posts ?? 0} posts)`,
              ]}
            />
            <Bar dataKey="avgViews" fill={GOLD} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="Views vs engagement rate" subtitle="High-resonance posts cluster top-left">
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={NAVY_GRID} />
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
                cursor={{ strokeDasharray: "3 3" }}
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
              <Scatter data={scatter} fill={GOLD} fillOpacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top hashtags" subtitle="Frequency × average views">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={tags}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 70, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={NAVY_GRID} horizontal={false} />
              <XAxis type="number" tick={{ fill: TEXT, fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="tag"
                tick={{ fill: TEXT, fontSize: 11 }}
                tickFormatter={(v) => `#${v}`}
                width={70}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
                formatter={(v, _k, item) => [
                  v,
                  `Used in ${v} posts (${(item?.payload?.avgViews || 0).toLocaleString()} avg views)`,
                ]}
              />
              <Bar dataKey="count" fill={GOLD_DIM} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function KpiRow({ stats, totalPosts }) {
  const items = [
    { label: "Posts analyzed", value: totalPosts.toLocaleString() },
    { label: "Avg views", value: stats.avgViews.toLocaleString() },
    { label: "Median views", value: stats.medianViews.toLocaleString() },
    { label: "Avg engagement", value: stats.avgEngagement.toLocaleString() },
    { label: "Avg eng. rate", value: `${stats.avgEngRate}%` },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="bg-navy-900/60 border border-gold-500/15 rounded-lg p-4"
        >
          <div className="text-xs text-slate-400 uppercase tracking-wider">{it.label}</div>
          <div className="text-2xl font-serif text-gold-400 mt-1 leading-none">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="card p-5">
      <div className="mb-4">
        <div className="font-serif text-base text-gold-400">{title}</div>
        {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function formatCompact(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
