// Lightweight, no-API-call classification of an uploaded dataset.
// Reads timestamps off parsed rows and decides whether the export is
// a Weekly / Monthly / Quarterly / All-Time pull, and whether the
// content mix is All Reels / Mixed / Posts Only.

const REEL_TYPES = new Set(["clips", "video", "reel", "reels"]);

function readTimestamp(row) {
  // Apify exports use ISO strings; some have unix ms in `taken_at_timestamp`.
  const raw = row.timestamp || row.takenAtTimestamp || row.taken_at_timestamp;
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 1_000_000_000) {
    // unix seconds or ms — heuristic: > 10 digits = ms
    const d = new Date(n > 1e12 ? n : n * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function classifyDataset(posts) {
  if (!Array.isArray(posts) || posts.length === 0) {
    return { type: "UNKNOWN", span: 0, oldest: null, newest: null };
  }

  const dates = posts.map(readTimestamp).filter(Boolean);

  if (dates.length === 0) {
    return { type: "UNKNOWN", span: 0, oldest: null, newest: null };
  }

  const oldest = new Date(Math.min(...dates.map((d) => d.getTime())));
  const newest = new Date(Math.max(...dates.map((d) => d.getTime())));
  const daySpan = (newest - oldest) / (1000 * 60 * 60 * 24);

  let type;
  if (daySpan <= 8) type = "WEEKLY";
  else if (daySpan <= 35) type = "MONTHLY";
  else if (daySpan <= 100) type = "QUARTERLY";
  else type = "ALL TIME";

  return { type, span: Math.round(daySpan), oldest, newest };
}

// All Reels / Mixed / Posts Only — derived from `productType` / `type` columns.
export function classifyContentMix(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return "UNKNOWN";

  let reels = 0;
  let other = 0;
  for (const r of posts) {
    const pt = String(r.productType || r.type || "").toLowerCase();
    if (!pt) {
      // No type info — treat as "other"
      other++;
      continue;
    }
    if (REEL_TYPES.has(pt) || pt.includes("clip") || pt.includes("video") || pt.includes("reel")) {
      reels++;
    } else {
      other++;
    }
  }

  const total = reels + other;
  if (total === 0) return "UNKNOWN";
  const reelPct = reels / total;
  if (reelPct >= 0.95) return "ALL REELS";
  if (reelPct <= 0.05) return "POSTS ONLY";
  return "MIXED";
}

export function formatRange(oldest, newest) {
  if (!oldest || !newest) return "—";
  const fmt = (d) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(oldest)} → ${fmt(newest)}`;
}

// Detect the creator's @handle from any column likely to carry it.
export function detectHandle(posts) {
  const candidates = ["ownerUsername", "owner_username", "username", "handle"];
  for (const r of posts) {
    for (const k of candidates) {
      const v = r[k] || (r._raw && r._raw[k]);
      if (v) return String(v).replace(/^@/, "");
    }
    // Try to extract from URL
    const u = r.url || r.postUrl;
    if (u) {
      const m = String(u).match(/instagram\.com\/([^/?#]+)\//i);
      if (m && m[1] && !["p", "reel", "tv"].includes(m[1].toLowerCase())) {
        return m[1];
      }
    }
  }
  return "creator";
}

// Read the handle off a single row, falling back through the same candidate
// columns the single-handle detector uses. Used to bucket rows per creator.
export function rowHandle(row) {
  if (!row) return "";
  const candidates = ["ownerUsername", "owner_username", "username", "handle"];
  for (const k of candidates) {
    const v = row[k] || (row._raw && row._raw[k]);
    if (v) return String(v).replace(/^@/, "").toLowerCase();
  }
  const u = row.url || row.postUrl;
  if (u) {
    const m = String(u).match(/instagram\.com\/([^/?#]+)\//i);
    if (m && m[1] && !["p", "reel", "tv"].includes(m[1].toLowerCase())) {
      return m[1].toLowerCase();
    }
  }
  return "";
}

// Group parsed rows by creator handle. Returns an array of
// { handle, displayHandle, rows, count } sorted by row count desc.
// Rows that don't expose a recognizable handle are bucketed under "unknown".
export function groupByCreator(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const buckets = new Map();
  for (const r of rows) {
    const h = rowHandle(r) || "unknown";
    if (!buckets.has(h)) buckets.set(h, []);
    buckets.get(h).push(r);
  }
  return Array.from(buckets.entries())
    .map(([handle, bucketRows]) => ({
      handle,
      displayHandle: handle === "unknown" ? "unattributed" : handle,
      rows: bucketRows,
      count: bucketRows.length,
    }))
    .sort((a, b) => b.count - a.count);
}

// Convenience wrapper: how many distinct creators are in this dataset?
// Excludes the "unknown" bucket from the count when other buckets exist.
export function distinctCreatorCount(rows) {
  const groups = groupByCreator(rows);
  const named = groups.filter((g) => g.handle !== "unknown");
  return named.length || groups.length;
}
