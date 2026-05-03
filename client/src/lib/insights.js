// Pure data transforms over parsed Apify rows.
// All functions take `rows` (array of row objects) and return JSON.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DURATION_BUCKETS = [
  { label: "0–15s", min: 0, max: 15 },
  { label: "15–30s", min: 15, max: 30 },
  { label: "30–60s", min: 30, max: 60 },
  { label: "60–120s", min: 60, max: 120 },
  { label: "120s+", min: 120, max: Infinity },
];

export function views(row) {
  return num(row.videoViewCount) || num(row.videoPlayCount);
}

export function engagement(row) {
  const likes = num(row.likesCount);
  const comments = num(row.commentsCount);
  return likes + comments;
}

export function engagementRate(row) {
  const v = views(row);
  if (!v) return 0;
  return (engagement(row) / v) * 100;
}

export function captionSnippet(row, maxLen = 60) {
  const c = (row.caption || "").trim().replace(/\s+/g, " ");
  if (!c) return "(no caption)";
  return c.length > maxLen ? c.slice(0, maxLen - 1) + "…" : c;
}

export function topByEngagement(rows, n = 10) {
  return [...rows]
    .map((r, i) => ({ ...r, _idx: i }))
    .sort((a, b) => engagement(b) - engagement(a))
    .slice(0, n);
}

export function topByViews(rows, n = 10) {
  return [...rows]
    .map((r, i) => ({ ...r, _idx: i }))
    .sort((a, b) => views(b) - views(a))
    .slice(0, n);
}

export function performanceTiers(rows) {
  if (!rows.length) return { top: [], mid: [], low: [] };
  const sorted = [...rows].sort((a, b) => views(b) - views(a));
  const topCount = Math.max(1, Math.round(sorted.length * 0.2));
  const lowCount = Math.max(1, Math.round(sorted.length * 0.2));
  return {
    top: sorted.slice(0, topCount),
    mid: sorted.slice(topCount, sorted.length - lowCount),
    low: sorted.slice(sorted.length - lowCount),
  };
}

export function tierDistribution(rows) {
  const { top, mid, low } = performanceTiers(rows);
  return [
    { name: "Top 20%", value: top.length, fill: "#EC4899" },
    { name: "Mid 60%", value: mid.length, fill: "#A855F7" },
    { name: "Low 20%", value: low.length, fill: "#3B82F6" },
  ];
}

// Upload cadence — how many posts per day-of-week.
// Distinct from viewsByDayOfWeek (which is performance per day).
export function uploadCadence(rows) {
  const buckets = DAY_NAMES.map((day) => ({ day, posts: 0 }));
  for (const r of rows) {
    if (!r.timestamp) continue;
    const d = new Date(r.timestamp);
    if (isNaN(d.getTime())) continue;
    buckets[d.getDay()].posts += 1;
  }
  return buckets;
}

export function viewsByDuration(rows) {
  return DURATION_BUCKETS.map((bucket) => {
    const inBucket = rows.filter((r) => {
      const d = num(r.videoDuration);
      return d >= bucket.min && d < bucket.max;
    });
    const totalViews = inBucket.reduce((s, r) => s + views(r), 0);
    return {
      bucket: bucket.label,
      avgViews: inBucket.length ? Math.round(totalViews / inBucket.length) : 0,
      count: inBucket.length,
    };
  });
}

export function viewsByDayOfWeek(rows) {
  const buckets = DAY_NAMES.map((day) => ({ day, total: 0, count: 0 }));
  for (const r of rows) {
    if (!r.timestamp) continue;
    const d = new Date(r.timestamp);
    if (isNaN(d.getTime())) continue;
    const dow = d.getDay();
    buckets[dow].total += views(r);
    buckets[dow].count += 1;
  }
  return buckets.map((b) => ({
    day: b.day,
    avgViews: b.count ? Math.round(b.total / b.count) : 0,
    posts: b.count,
  }));
}

export function audioOriginalVsLicensed(rows) {
  const original = rows.filter((r) => {
    const v = String(r["musicInfo/uses_original_audio"] || "").toLowerCase();
    return v === "true" || v === "1";
  });
  const licensed = rows.filter((r) => {
    const v = String(r["musicInfo/uses_original_audio"] || "").toLowerCase();
    return v === "false" || v === "0";
  });
  const avg = (arr) =>
    arr.length ? Math.round(arr.reduce((s, r) => s + views(r), 0) / arr.length) : 0;
  return [
    { type: "Original", avgViews: avg(original), count: original.length },
    { type: "Licensed", avgViews: avg(licensed), count: licensed.length },
  ];
}

export function topHashtags(rows, n = 10) {
  const counts = new Map();
  const viewSums = new Map();
  for (const r of rows) {
    const tags = collectHashtags(r);
    for (const t of tags) {
      counts.set(t, (counts.get(t) || 0) + 1);
      viewSums.set(t, (viewSums.get(t) || 0) + views(r));
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({
      tag,
      count,
      avgViews: Math.round(viewSums.get(tag) / count),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

function collectHashtags(row) {
  const out = new Set();
  for (let i = 0; i < 10; i++) {
    const v = row[`hashtags/${i}`];
    if (v) out.add(String(v).replace(/^#/, "").toLowerCase());
  }
  if (row.hashtags) {
    String(row.hashtags)
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, "").trim().toLowerCase())
      .filter(Boolean)
      .forEach((t) => out.add(t));
  }
  return [...out];
}

export function engagementScatter(rows) {
  return rows
    .filter((r) => views(r) > 0)
    .map((r, i) => ({
      x: views(r),
      y: Number(engagementRate(r).toFixed(2)),
      duration: num(r.videoDuration),
      // Caption acts as the per-dot identifier in the tooltip — give it
      // enough room to be readable, but cap it so a long paragraph caption
      // doesn't blow out the tooltip width.
      caption: captionSnippet(r, 80),
      idx: i,
    }));
}

export function aggregateStats(rows) {
  if (!rows.length) {
    return { total: 0, avgViews: 0, medianViews: 0, avgEngagement: 0, avgEngRate: 0 };
  }
  const viewsArr = rows.map(views).filter((v) => v > 0).sort((a, b) => a - b);
  const avgViews = viewsArr.length
    ? Math.round(viewsArr.reduce((s, v) => s + v, 0) / viewsArr.length)
    : 0;
  const medianViews = viewsArr.length
    ? viewsArr[Math.floor(viewsArr.length / 2)]
    : 0;
  const avgEngagement = Math.round(
    rows.reduce((s, r) => s + engagement(r), 0) / rows.length
  );
  const validRates = rows.map(engagementRate).filter((r) => r > 0);
  const avgEngRate = validRates.length
    ? Number((validRates.reduce((s, r) => s + r, 0) / validRates.length).toFixed(2))
    : 0;
  return {
    total: rows.length,
    avgViews,
    medianViews,
    avgEngagement,
    avgEngRate,
  };
}
