// Dataset helpers shared by the parse / apify / groq main-process providers.
//
// These are pure functions copied verbatim from the old server/index.js so
// the migration is a like-for-like move. The rest of the app (renderer,
// analyzers) expects rows shaped by pickFields() and summaries shaped by
// summarize() — those shapes are the contract, do not break them.

const TRANSCRIPT_FIELD = "reel-transcript";

// Canonical SWH fields → list of column-name aliases we accept from Apify
// exports. Match is case-insensitive (we lowercase before comparing).
const FIELD_ALIASES = {
  id: ["id", "postId", "post_id", "pk"],
  shortCode: ["shortCode", "shortcode", "code"],
  url: ["url", "postUrl", "post_url", "permalink", "displayUrl"],
  ownerUsername: ["ownerUsername", "owner_username", "username", "handle"],
  ownerFullName: [
    "ownerFullName",
    "owner_full_name",
    "ownerFullname",
    "fullName",
    "full_name",
  ],
  caption: [
    "caption",
    "text",
    "description",
    "postText",
    "post_text",
    "edge_media_to_caption/edges/0/node/text",
  ],
  transcript: ["transcript", "Transcript", "captions", "subtitles"],
  [TRANSCRIPT_FIELD]: ["reel-transcript", "reel_transcript", "reelTranscript"],
  videoViewCount: ["videoViewCount", "video_view_count", "viewCount", "views", "playCount"],
  videoPlayCount: ["videoPlayCount", "video_play_count", "plays"],
  likesCount: ["likesCount", "likes_count", "likes", "edge_liked_by/count", "edge_media_preview_like/count"],
  commentsCount: ["commentsCount", "comments_count", "comments", "edge_media_to_comment/count"],
  shareCount: [
    "shareCount",
    "share_count",
    "shares",
    "shareCounts",
    "videoShareCount",
    "video_share_count",
    "edge_media_to_share/count",
  ],
  timestamp: ["timestamp", "taken_at_timestamp", "takenAtTimestamp", "createdAt", "created_at", "date"],
  videoDuration: ["videoDuration", "video_duration", "duration"],
  productType: ["productType", "product_type"],
  type: ["type", "mediaType", "__typename"],
  "musicInfo/song_name": ["musicInfo/song_name", "musicInfo.song_name", "song_name"],
  "musicInfo/artist_name": ["musicInfo/artist_name", "musicInfo.artist_name", "artist_name"],
  "musicInfo/uses_original_audio": [
    "musicInfo/uses_original_audio",
    "musicInfo.uses_original_audio",
    "uses_original_audio",
  ],
  "musicInfo/audio_id": ["musicInfo/audio_id", "musicInfo.audio_id", "audio_id"],
  hashtags: ["hashtags", "hashtag_list"],
  "hashtags/0": ["hashtags/0", "hashtags.0"],
  "hashtags/1": ["hashtags/1", "hashtags.1"],
  "hashtags/2": ["hashtags/2", "hashtags.2"],
  "hashtags/3": ["hashtags/3", "hashtags.3"],
  "mentions/0": ["mentions/0", "mentions.0"],
  "images/0": ["images/0", "images.0", "displayUrl", "thumbnailUrl"],
};

const FIELDS = Object.keys(FIELD_ALIASES);

// Apify Instagram actors export the audio/video URL under different names.
// Priority order: most-specific first. Match is case-insensitive.
const AUDIO_URL_CANDIDATES = [
  "audioUrl",
  "audio_url",
  "musicInfo/audio_url",
  "musicInfo.audio_url",
  "videoUrl",
  "video_url",
  "videoUrlBackup",
  "videoUrlBackup/0",
  "video_url_backup",
  "mediaUrl",
];

function buildLookup(row) {
  // Lowercase-keyed lookup, with BOM/whitespace stripped, so column names
  // match case-insensitively even when the CSV has a UTF-8 BOM.
  const lookup = {};
  for (const k of Object.keys(row)) {
    const normalized = k.replace(/^﻿/, "").trim().toLowerCase();
    lookup[normalized] = row[k];
  }
  return lookup;
}

function readAlias(lookup, aliases) {
  for (const alias of aliases) {
    const v = lookup[alias.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

function detectAudioFieldKey(lookup) {
  for (const cand of AUDIO_URL_CANDIDATES) {
    const v = lookup[cand.toLowerCase()];
    if (v && String(v).startsWith("http")) return cand;
  }
  return null;
}

function pickFields(row) {
  const lookup = buildLookup(row);
  const out = {};
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    const v = readAlias(lookup, aliases);
    if (v !== undefined) out[canonical] = v;
  }
  // Carry through audio URL under a stable canonical key.
  for (const cand of AUDIO_URL_CANDIDATES) {
    const v = lookup[cand.toLowerCase()];
    if (v && String(v).startsWith("http")) {
      out._audioUrl = v;
      out._audioSourceField = cand;
      break;
    }
  }
  return out;
}

function summarize(rows, rawColumns = []) {
  const present = new Set();
  for (const row of rows) for (const k of Object.keys(row)) present.add(k);
  const fieldsPresent = FIELDS.filter((f) => present.has(f));
  const fieldsMissing = FIELDS.filter(
    (f) => !present.has(f) && f !== TRANSCRIPT_FIELD
  );

  const withTranscript = rows.filter((r) => {
    const t = r[TRANSCRIPT_FIELD] || r.transcript;
    return t && String(t).trim().length > 0;
  }).length;
  const withCaption = rows.filter(
    (r) => r.caption && String(r.caption).trim().length > 0
  ).length;
  const withViews = rows.filter(
    (r) => r.videoViewCount && Number(r.videoViewCount) > 0
  ).length;
  const withAudioUrl = rows.filter((r) => r._audioUrl).length;

  const audioSourceField =
    rows.find((r) => r._audioSourceField)?._audioSourceField || null;
  const transcribable = rows.filter(
    (r) =>
      r._audioUrl &&
      !(r[TRANSCRIPT_FIELD] && String(r[TRANSCRIPT_FIELD]).trim())
  ).length;

  return {
    totalPosts: rows.length,
    fieldsPresent,
    fieldsMissing,
    rawColumns,
    captionCoveragePct: rows.length
      ? Math.round((withCaption / rows.length) * 100)
      : 0,
    transcriptCoveragePct: rows.length
      ? Math.round((withTranscript / rows.length) * 100)
      : 0,
    viewCoveragePct: rows.length
      ? Math.round((withViews / rows.length) * 100)
      : 0,
    audioField: audioSourceField,
    audioFieldHits: withAudioUrl,
    transcribable,
  };
}

// Engagement ranker for "top N to transcribe" selection.
function engagementScore(row) {
  const likes = Number(row.likesCount) || 0;
  const comments = Number(row.commentsCount) || 0;
  const views = Number(row.videoViewCount) || Number(row.videoPlayCount) || 0;
  if (likes + comments > 0) return likes + comments;
  return views;
}

function normalizeIgUrl(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  // Bare handles like "@hormozi" / "hormozi" → full profile URL.
  if (!/^https?:\/\//i.test(trimmed)) {
    const handle = trimmed.replace(/^@/, "").replace(/\/+$/, "");
    if (!handle) return null;
    return `https://www.instagram.com/${handle}/`;
  }
  // Reject obviously non-instagram urls so the actor doesn't burn credits.
  try {
    const u = new URL(trimmed);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function synthesizeScrapeFilename(urls) {
  const handles = urls
    .map((u) => {
      try {
        const parts = new URL(u).pathname.split("/").filter(Boolean);
        return parts[0] || "creator";
      } catch {
        return "creator";
      }
    })
    .filter(Boolean);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const head = handles.slice(0, 3).join("+");
  const more = handles.length > 3 ? `+${handles.length - 3}more` : "";
  return `apify-${head}${more}-${stamp}.json`;
}

// Bounded-concurrency runner used by both the transcribe pass and any
// future fan-out work. Reports each completion via `onProgress` so the
// caller can stream live updates without forcing every job to finish first.
async function pMapBounded(items, limit, fn, onProgress) {
  const results = new Array(items.length);
  let cursor = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (e) {
        results[i] = { ok: false, error: e.message || String(e) };
      }
      completed++;
      onProgress?.({
        completed,
        total: items.length,
        lastIndex: i,
        lastResult: results[i],
      });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

module.exports = {
  TRANSCRIPT_FIELD,
  FIELD_ALIASES,
  FIELDS,
  AUDIO_URL_CANDIDATES,
  buildLookup,
  readAlias,
  detectAudioFieldKey,
  pickFields,
  summarize,
  engagementScore,
  normalizeIgUrl,
  synthesizeScrapeFilename,
  pMapBounded,
};
