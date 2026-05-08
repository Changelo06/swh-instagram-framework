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

// ============================================================
// Performance Intelligence helpers
// All pure. All handle empty rows + missing fields gracefully.
// ============================================================

export function shares(row) {
  return num(row.shareCount) || num(row.shares);
}

export function shareRate(row) {
  const v = views(row);
  if (!v) return 0;
  return (shares(row) / v) * 100;
}

function rowTimestamp(row) {
  const t = row.timestamp || row.takenAtTimestamp || row.taken_at_timestamp;
  if (!t) return null;
  const d = new Date(t).getTime();
  return Number.isFinite(d) ? d : null;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// 1. performanceDistribution — hit/flop/consistency from views.
export function performanceDistribution(rows) {
  if (!rows || !rows.length) return { available: false };
  const viewsArr = rows.map(views).filter((v) => v > 0);
  if (viewsArr.length < 2) return { available: false };
  const med = median(viewsArr);
  const mu = mean(viewsArr);
  const variance =
    viewsArr.reduce((s, v) => s + (v - mu) ** 2, 0) / viewsArr.length;
  const stdDev = Math.sqrt(variance);
  const cv = mu ? stdDev / mu : 0;
  const consistencyScore = Math.max(0, Math.min(100, 100 - cv * 35));
  let consistencyLabel = "Steady";
  if (cv >= 2.0) consistencyLabel = "High variance";
  else if (cv >= 1.0) consistencyLabel = "Moderate variance";
  const hitThreshold = 2 * med;
  const flopThreshold = 0.5 * med;
  const hits = viewsArr.filter((v) => v >= hitThreshold).length;
  const flops = viewsArr.filter((v) => v <= flopThreshold).length;
  return {
    available: true,
    total: viewsArr.length,
    median: med,
    mean: Math.round(mu),
    stdDev: Math.round(stdDev),
    cv: Number(cv.toFixed(2)),
    consistencyScore: Math.round(consistencyScore),
    consistencyLabel,
    hitCount: hits,
    flopCount: flops,
    hitRate: Number(((hits / viewsArr.length) * 100).toFixed(1)),
    flopRate: Number(((flops / viewsArr.length) * 100).toFixed(1)),
  };
}

// 2. viewsHistogram — 6–8 linear buckets across [min, max].
export function viewsHistogram(rows, bucketCount = 7) {
  const v = (rows || []).map(views).filter((x) => x > 0);
  if (!v.length) return { available: false, buckets: [] };
  const sorted = [...v].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const med = sorted[Math.floor(sorted.length / 2)];
  if (lo === hi) {
    return {
      available: true,
      buckets: [
        {
          from: lo,
          to: hi,
          count: v.length,
          label: formatRange(lo, hi),
        },
      ],
      maxCount: v.length,
      medianBucketIdx: 0,
      median: med,
    };
  }
  const step = (hi - lo) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, i) => {
    const from = lo + step * i;
    const to = i === bucketCount - 1 ? hi : lo + step * (i + 1);
    return { from, to, count: 0, label: formatRange(from, to) };
  });
  for (const x of v) {
    const idx = Math.min(bucketCount - 1, Math.floor((x - lo) / step));
    buckets[idx].count++;
  }
  const medianBucketIdx = Math.min(
    bucketCount - 1,
    Math.floor((med - lo) / step)
  );
  const maxCount = Math.max(...buckets.map((b) => b.count));
  return { available: true, buckets, maxCount, medianBucketIdx, median: med };
}

function formatRange(a, b) {
  return `${shortNum(a)}–${shortNum(b)}`;
}

function shortNum(n) {
  const r = Math.round(n);
  if (r >= 1_000_000) return `${(r / 1_000_000).toFixed(1)}M`;
  if (r >= 1_000) return `${(r / 1_000).toFixed(1)}K`;
  return r.toString();
}

// 3. rollingWindowComparison — current vs previous N-day window.
export function rollingWindowComparison(rows, days = 30) {
  const tsRows = (rows || [])
    .map((r) => {
      const t = rowTimestamp(r);
      return t == null ? null : { row: r, t };
    })
    .filter(Boolean);
  if (tsRows.length < 2) return { available: false, windowDays: days };
  const maxT = Math.max(...tsRows.map((x) => x.t));
  const dayMs = 86400000;
  const currentStart = maxT - days * dayMs;
  const previousStart = maxT - 2 * days * dayMs;
  const currentRows = tsRows
    .filter((x) => x.t >= currentStart && x.t <= maxT)
    .map((x) => x.row);
  const previousRows = tsRows
    .filter((x) => x.t >= previousStart && x.t < currentStart)
    .map((x) => x.row);
  const hasShares = (rows || []).some((r) => shares(r) > 0);
  if (!currentRows.length || !previousRows.length) {
    return {
      available: false,
      windowDays: days,
      hasShares,
      reason:
        currentRows.length && !previousRows.length
          ? "no_previous_window"
          : "no_dated_posts",
    };
  }
  const summarize = (rs) => {
    const v = rs.map(views).filter((x) => x > 0);
    const er = rs.map(engagementRate).filter((x) => x > 0);
    const sr = rs.map(shareRate).filter((x) => x > 0);
    return {
      posts: rs.length,
      avgViews: v.length ? Math.round(mean(v)) : 0,
      avgEngRate: er.length ? Number(mean(er).toFixed(2)) : 0,
      avgShareRate: sr.length ? Number(mean(sr).toFixed(2)) : 0,
    };
  };
  const cur = summarize(currentRows);
  const prev = summarize(previousRows);
  const delta = (a, b) =>
    b ? Number((((a - b) / b) * 100).toFixed(1)) : null;
  return {
    available: true,
    windowDays: days,
    current: cur,
    previous: prev,
    deltas: {
      avgViews: delta(cur.avgViews, prev.avgViews),
      avgEngRate: delta(cur.avgEngRate, prev.avgEngRate),
      posts: delta(cur.posts, prev.posts),
      avgShareRate: hasShares
        ? delta(cur.avgShareRate, prev.avgShareRate)
        : null,
    },
    hasShares,
  };
}

// 4. personalBestStats — top 1% / top 10% with simple traits.
export function personalBestStats(rows) {
  if (!rows || !rows.length) return { available: false };
  const sorted = rows
    .filter((r) => views(r) > 0)
    .slice()
    .sort((a, b) => views(b) - views(a));
  if (!sorted.length) return { available: false };
  const top1Count = Math.max(1, Math.floor(sorted.length * 0.01));
  const top10Count = Math.max(1, Math.ceil(sorted.length * 0.1));
  const top10 = sorted.slice(0, top10Count);
  const best = sorted[0];
  const top10Threshold = views(top10[top10.length - 1]);

  const durations = top10
    .map((r) => num(r.videoDuration))
    .filter((d) => d > 0);
  const medianDuration = durations.length
    ? Math.round(median(durations))
    : 0;

  const dayCounts = {};
  for (const r of top10) {
    const t = rowTimestamp(r);
    if (t == null) continue;
    const day = DAY_NAMES[new Date(t).getDay()];
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  }
  const mostCommonDay =
    Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const captionLens = top10
    .map((r) => (r.caption || "").trim().length)
    .filter((l) => l > 0);
  const avgCaptionLength = captionLens.length
    ? Math.round(mean(captionLens))
    : 0;

  const tagCounts = new Map();
  for (const r of top10) {
    const tags = collectHashtags(r);
    for (const t of tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  const topTag = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const mostCommonHashtag = topTag && topTag[1] >= 2 ? topTag[0] : null;

  return {
    available: true,
    bestRow: best,
    bestViews: views(best),
    top1Count,
    top10Count,
    top10Threshold,
    top10Rows: top10,
    traits: {
      medianDuration,
      mostCommonDay,
      avgCaptionLength,
      mostCommonHashtag,
    },
  };
}

// 5. captionLengthStats — bucketed by caption length.
export function captionLengthStats(rows) {
  const BUCKETS = [
    { id: "none", label: "No caption", range: "0", min: 0, max: 0 },
    { id: "short", label: "Short", range: "1–80", min: 1, max: 80 },
    { id: "medium", label: "Medium", range: "81–220", min: 81, max: 220 },
    { id: "long", label: "Long", range: "221+", min: 221, max: Infinity },
  ];
  if (!rows || !rows.length) return { available: false, buckets: [] };
  const hasShares = rows.some((r) => shares(r) > 0);
  const buckets = BUCKETS.map((b) => {
    const inB = rows.filter((r) => {
      const len = (r.caption || "").trim().length;
      return len >= b.min && len <= b.max;
    });
    const v = inB.map(views).filter((x) => x > 0);
    const sr = inB.map(shareRate).filter((x) => x > 0);
    return {
      id: b.id,
      label: b.label,
      range: b.range,
      count: inB.length,
      avgViews: v.length ? Math.round(mean(v)) : 0,
      avgShareRate: sr.length ? Number(mean(sr).toFixed(2)) : 0,
    };
  });
  return { available: true, buckets, hasShares };
}

// 6. shareStats — only when shareCount/shares is present somewhere.
export function shareStats(rows) {
  if (!rows || !rows.length) return { available: false };
  const hasShares = rows.some((r) => shares(r) > 0);
  if (!hasShares) return { available: false };
  const valid = rows.filter((r) => views(r) > 0);
  if (!valid.length) return { available: false };
  const totalShares = valid.reduce((s, r) => s + shares(r), 0);
  const totalViews = valid.reduce((s, r) => s + views(r), 0);
  const avgShareRate = totalViews
    ? Number(((totalShares / totalViews) * 100).toFixed(2))
    : 0;
  return {
    available: true,
    hasShares: true,
    totalShares,
    avgShareRate,
    sampleSize: valid.length,
  };
}

// 7. postingTimeHeatmap — day-of-week × 6-hour blocks, with Mon-first ordering.
const TIME_BLOCKS = [
  { id: 0, label: "00–05" },
  { id: 1, label: "06–11" },
  { id: 2, label: "12–17" },
  { id: 3, label: "18–23" },
];
const HEATMAP_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function postingTimeHeatmap(rows) {
  const grid = HEATMAP_DAYS.map((day, di) =>
    TIME_BLOCKS.map((b) => ({
      day,
      dayIdx: di,
      block: b.id,
      blockLabel: b.label,
      count: 0,
      totalViews: 0,
      avgViews: 0,
    }))
  );
  let usable = 0;
  for (const r of (rows || [])) {
    const t = rowTimestamp(r);
    if (t == null) continue;
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) continue;
    // Sun=0..Sat=6 → Mon=0..Sun=6
    const dow = (d.getDay() + 6) % 7;
    const block = Math.floor(d.getHours() / 6);
    const cell = grid[dow]?.[block];
    if (!cell) continue;
    cell.count += 1;
    cell.totalViews += views(r);
    usable++;
  }
  if (!usable) return { available: false };
  let maxAvg = 0;
  for (const dayRow of grid) {
    for (const cell of dayRow) {
      cell.avgViews = cell.count
        ? Math.round(cell.totalViews / cell.count)
        : 0;
      if (cell.avgViews > maxAvg) maxAvg = cell.avgViews;
    }
  }
  return {
    available: true,
    grid,
    maxAvgViews: maxAvg,
    days: HEATMAP_DAYS,
    blocks: TIME_BLOCKS,
    totalDated: usable,
  };
}

// 8. postingGapStats — surface gaps ≥ 7 days.
export function postingGapStats(rows) {
  const ts = (rows || [])
    .map(rowTimestamp)
    .filter((t) => t != null)
    .sort((a, b) => a - b);
  if (ts.length < 2) return { available: false };
  const dayMs = 86400000;
  const gaps = [];
  let longestGap = 0;
  for (let i = 1; i < ts.length; i++) {
    const days = (ts[i] - ts[i - 1]) / dayMs;
    if (days > longestGap) longestGap = days;
    if (days >= 7) {
      gaps.push({
        startTs: ts[i - 1],
        endTs: ts[i],
        days: Math.round(days),
      });
    }
  }
  gaps.sort((a, b) => b.days - a.days);
  const lastPostDays = Math.round((Date.now() - ts[ts.length - 1]) / dayMs);
  return {
    available: true,
    gaps: gaps.slice(0, 5),
    longestGapDays: Math.round(longestGap),
    gapsOver7: gaps.length,
    lastPostDays,
    totalPosts: ts.length,
  };
}

// 9. deleteCandidateStats — bottom 10% with low engagement (and low shares
//    when shares are present). Conservative: needs at least 10 valid rows.
export function deleteCandidateStats(rows) {
  if (!rows || !rows.length)
    return { available: false, count: 0, candidates: [] };
  const valid = rows.filter((r) => views(r) > 0);
  if (valid.length < 10) {
    return { available: false, count: 0, candidates: [], reason: "small_sample" };
  }
  const viewsArr = valid.map(views).sort((a, b) => a - b);
  const p10Idx = Math.max(0, Math.floor(viewsArr.length * 0.1) - 1);
  const p10Views = viewsArr[p10Idx];
  const ratesArr = valid.map(engagementRate).filter((r) => r > 0);
  const medianER = ratesArr.length ? median(ratesArr) : 0;
  const hasShares = valid.some((r) => shares(r) > 0);
  let medianSR = 0;
  if (hasShares) {
    const srArr = valid.map(shareRate).filter((r) => r > 0);
    medianSR = srArr.length ? median(srArr) : 0;
  }
  const candidates = valid
    .filter((r) => {
      const v = views(r);
      const er = engagementRate(r);
      const sr = shareRate(r);
      return (
        v <= p10Views &&
        er <= medianER * 0.5 &&
        (!hasShares || sr <= medianSR * 0.5)
      );
    })
    .sort((a, b) => views(a) - views(b));
  return {
    available: true,
    count: candidates.length,
    candidates: candidates.slice(0, 5).map((r) => ({
      url: r.url || (r.shortCode ? `https://www.instagram.com/reel/${r.shortCode}/` : null),
      caption: captionSnippet(r, 80),
      views: views(r),
      engagementRate: Number(engagementRate(r).toFixed(2)),
      shareRate: hasShares ? Number(shareRate(r).toFixed(2)) : null,
    })),
    p10Views,
    totalSampled: valid.length,
    hasShares,
  };
}
