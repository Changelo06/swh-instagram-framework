import express from "express";
import cors from "cors";
import multer from "multer";
import { parse } from "csv-parse/sync";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
// Allow the Electron main process (or any launcher) to point us at a .env
// in a writable user-data directory rather than next to the bundled
// server/ folder. Falls through to dotenv's default lookup (cwd) when
// unset.
dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || undefined,
});
import {
  attachUser,
  requireAuth,
  loginRouter,
  logUsage,
} from "./auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// /api/analyze moved into the main process in Phase 2.6 (chiqo.anthropic.*
// IPC). The Anthropic SDK, the system prompt loader, and the API key are
// gone from this file — Anthropic now lives entirely inside
// electron/providers/, keyed by the vault.

const PORT = process.env.PORT || 3001;

const TRANSCRIPT_FIELD = "reel-transcript";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Resolve req.user for every request (no-op when no cookie). Routes that need
// auth opt in via `requireAuth`; /api/health and /api/login stay public so
// the launcher can poll and unauthenticated clients can sign in.
app.use(attachUser);
app.use("/api", loginRouter());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Canonical SWH fields → list of column-name aliases we accept from Apify exports.
// Match is case-insensitive (we lowercase before comparing).
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
  const fieldsMissing = FIELDS.filter((f) => !present.has(f) && f !== TRANSCRIPT_FIELD);

  const withTranscript = rows.filter((r) => {
    const t = r[TRANSCRIPT_FIELD] || r.transcript;
    return t && String(t).trim().length > 0;
  }).length;
  const withCaption = rows.filter((r) => r.caption && String(r.caption).trim().length > 0).length;
  const withViews = rows.filter((r) => r.videoViewCount && Number(r.videoViewCount) > 0).length;
  const withAudioUrl = rows.filter((r) => r._audioUrl).length;

  const audioSourceField = rows.find((r) => r._audioSourceField)?._audioSourceField || null;
  const transcribable = rows.filter(
    (r) => r._audioUrl && !(r[TRANSCRIPT_FIELD] && String(r[TRANSCRIPT_FIELD]).trim())
  ).length;

  return {
    totalPosts: rows.length,
    fieldsPresent,
    fieldsMissing,
    rawColumns,
    captionCoveragePct: rows.length ? Math.round((withCaption / rows.length) * 100) : 0,
    transcriptCoveragePct: rows.length ? Math.round((withTranscript / rows.length) * 100) : 0,
    viewCoveragePct: rows.length ? Math.round((withViews / rows.length) * 100) : 0,
    audioField: audioSourceField,
    audioFieldHits: withAudioUrl,
    transcribable,
  };
}

// ---------- Routes ----------

// ---------- Apify scraper ----------
//
// Drives the public `apify/instagram-scraper` actor end-to-end and streams
// progress back to the browser as Server-Sent Events. We deliberately do NOT
// persist the operator's Apify token — it travels in the request body, gets
// forwarded to api.apify.com, and is then discarded.
//
// Flow:
//   1. POST /v2/acts/{actor}/runs?token=… to start the run
//   2. Poll /v2/actor-runs/{runId}?token=… every APIFY_POLL_MS until terminal
//   3. GET /v2/datasets/{datasetId}/items?token=… for the scraped JSON
//   4. Run each item through pickFields() so the rows match the exact shape
//      that /api/parse emits — the rest of the app stays oblivious to source.
//
// `apify~instagram-scraper` is the URL-safe form of the actor id.
const APIFY_ACTOR_ID = "apify~instagram-scraper";
const APIFY_BASE = "https://api.apify.com/v2";
const APIFY_POLL_MS = Number(process.env.APIFY_POLL_MS || 3000);
const APIFY_MAX_POLLS = Number(process.env.APIFY_MAX_POLLS || 400); // ~20 min @ 3s
// Apify run statuses considered "still running" for polling purposes.
const APIFY_LIVE_STATUSES = new Set(["READY", "RUNNING"]);

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

async function apifyFetch(url, init = {}) {
  const r = await fetch(url, init);
  if (!r.ok) {
    let detail = "";
    try {
      detail = (await r.text()).slice(0, 400);
    } catch {}
    throw new Error(`apify ${r.status}: ${detail || r.statusText}`);
  }
  return r;
}

// ---------- Groq Whisper (speech-to-text) ----------
//
// We hit Groq's OpenAI-compatible endpoint with the audio file pulled directly
// off the Apify-resolved media URL (`row._audioUrl`). The token can come from
// the request body (operator-supplied via Settings) or from `GROQ_API_KEY` as
// a fallback for local dev. Tokens are NEVER persisted server-side.
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";
const GROQ_AUDIO_MAX_BYTES = 24 * 1024 * 1024; // Groq Whisper limit
const GROQ_DOWNLOAD_TIMEOUT_MS = Number(
  process.env.GROQ_DOWNLOAD_TIMEOUT_MS || 30000
);
const TRANSCRIBE_CONCURRENCY = Number(process.env.TRANSCRIBE_CONCURRENCY || 4);

async function downloadAudio(url, { timeoutMs = GROQ_DOWNLOAD_TIMEOUT_MS } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      headers: {
        // Instagram CDN occasionally rejects fetches without a UA.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!r.ok) throw new Error(`audio fetch ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > GROQ_AUDIO_MAX_BYTES) {
      throw new Error(`audio too large for Groq (${buf.length} bytes)`);
    }
    return buf;
  } finally {
    clearTimeout(t);
  }
}

async function transcribeWithGroq(buf, groqKey, { filename = "audio.mp4" } = {}) {
  if (!groqKey) throw new Error("Groq API key not provided");
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "audio/mp4" }), filename);
  fd.append("model", GROQ_MODEL);
  fd.append("response_format", "text");
  fd.append("temperature", "0");
  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}` },
    body: fd,
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`groq ${r.status}: ${errText.slice(0, 200) || r.statusText}`);
  }
  const text = await r.text();
  return text.trim();
}

async function transcribeOne(audioUrl, groqKey) {
  const buf = await downloadAudio(audioUrl);
  return transcribeWithGroq(buf, groqKey);
}

// Bounded-concurrency runner. Reports each completion via `onProgress` so the
// caller can stream live updates back to the operator without forcing every
// transcribe pass to finish first.
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
      onProgress?.({ completed, total: items.length, lastIndex: i, lastResult: results[i] });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

// Read the operator's Apify account profile + monthly usage. Both calls go
// through the server purely so the browser never touches CORS edge cases on
// console.apify.com endpoints; the token is per-request and not persisted.
app.post("/api/apify/account", requireAuth, async (req, res) => {
  // Same fallback rule as /api/scrape — body token first, env second.
  const token =
    String(req.body?.token || "").trim() || process.env.APIFY_TOKEN || "";
  if (!token) {
    return res
      .status(400)
      .json({ error: "APIFY_TOKEN is not configured on the server" });
  }
  try {
    const [userResp, usageResp] = await Promise.all([
      fetch(`${APIFY_BASE}/users/me?token=${encodeURIComponent(token)}`),
      fetch(`${APIFY_BASE}/users/me/usage/monthly?token=${encodeURIComponent(token)}`),
    ]);
    if (!userResp.ok) {
      const txt = await userResp.text().catch(() => "");
      return res
        .status(userResp.status)
        .json({ error: `apify ${userResp.status}: ${txt.slice(0, 200) || userResp.statusText}` });
    }
    const userJson = await userResp.json().catch(() => ({}));
    const usageJson = usageResp.ok ? await usageResp.json().catch(() => ({})) : null;
    res.json({ user: userJson?.data || null, usage: usageJson?.data || null });
  } catch (e) {
    console.error("[apify/account] failed", e);
    res.status(500).json({ error: e.message || "fetch failed" });
  }
});

app.post("/api/scrape", requireAuth, async (req, res) => {
  const {
    token,
    urls,
    resultsLimit,
    onlyPostsNewerThan,
    onlyPostsOlderThan,
    addParentData,
    // Operator-supplied Groq key from Settings; env fallback for local dev.
    groqToken,
  } = req.body || {};

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Whether the response can still accept writes. We check this — NOT the
  // request's close event — because Express's body parser causes `req` to
  // emit 'close' as soon as the JSON body is consumed, which falsely looks
  // like the client disconnected even though the SSE response is fine.
  const isOpen = () =>
    !!res.writable && !res.writableEnded && !res.destroyed;

  const send = (event, data) => {
    if (!isOpen()) return false;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      return false;
    }
  };

  // Diagnostic timeline. Every state transition lands here:
  //   - Server console (with elapsed-ms + runId tag)
  //   - SSE `state` event so the client can render a runtime panel
  // When something stalls we can read the timeline directly to see whether
  // the holdup is on the Apify side, the server side, or the client side.
  const requestStartedAt = Date.now();
  let runIdForLog = null;
  const mark = (label, detail) => {
    const t = Date.now() - requestStartedAt;
    const tag = `[scrape ${runIdForLog || "..."} +${t}ms]`;
    if (detail !== undefined && detail !== null && detail !== "") {
      console.log(tag, label, typeof detail === "string" ? detail : JSON.stringify(detail));
    } else {
      console.log(tag, label);
    }
    send("state", { t, label, detail: detail ?? null });
  };

  // Surface response-level lifecycle into the timeline. `req.on('close')` was
  // a false-positive trigger — leave it off entirely; we only watch the
  // response-side signals which fire when the client truly disconnects.
  res.on("close", () => mark("RES_ON_CLOSE"));
  res.on("error", (e) => mark("RES_ON_ERROR", { message: e?.message }));

  mark("REQUEST_RECEIVED", {
    urlsRequested: Array.isArray(urls) ? urls.length : 0,
    resultsLimit,
    onlyPostsNewerThan: onlyPostsNewerThan || null,
  });

  // Apify token resolution: prefer the per-request body token (legacy
  // browser-stored value, kept for backward compat), fall back to the
  // server's APIFY_TOKEN env. The client no longer needs to send a token —
  // operator config lives in `.env` now.
  const cleanToken =
    String(token || "").trim() || process.env.APIFY_TOKEN || "";
  if (!cleanToken) {
    mark("REJECT_NO_TOKEN");
    send("error", {
      message:
        "Apify token is not configured on the server. Set APIFY_TOKEN in server/.env.",
    });
    return res.end();
  }

  const directUrls = (Array.isArray(urls) ? urls : [])
    .map(normalizeIgUrl)
    .filter(Boolean);
  if (directUrls.length === 0) {
    mark("REJECT_NO_VALID_URLS");
    send("error", { message: "Provide at least one valid Instagram profile URL or @handle" });
    return res.end();
  }
  mark("URLS_NORMALIZED", { count: directUrls.length });

  const limitClamped = Math.min(
    1000,
    Math.max(1, Number.isFinite(Number(resultsLimit)) ? Math.floor(Number(resultsLimit)) : 50)
  );

  const actorInput = {
    directUrls,
    resultsType: "posts",
    resultsLimit: limitClamped,
    addParentData: !!addParentData,
  };
  if (typeof onlyPostsNewerThan === "string" && onlyPostsNewerThan.trim()) {
    actorInput.onlyPostsNewerThan = onlyPostsNewerThan.trim();
  }
  if (typeof onlyPostsOlderThan === "string" && onlyPostsOlderThan.trim()) {
    actorInput.onlyPostsOlderThan = onlyPostsOlderThan.trim();
  }

  // Apify run continues even if the operator navigates away — they're paying
  // for the compute and can recover the run from apify.com. The server only
  // cares about whether the response is still writable when emitting events.

  let runId = null;
  let datasetId = null;

  try {
    send("start", {
      actor: APIFY_ACTOR_ID,
      urls: directUrls,
      resultsLimit: limitClamped,
    });

    mark("APIFY_START_REQUEST", { actor: APIFY_ACTOR_ID });
    const startResp = await apifyFetch(
      `${APIFY_BASE}/acts/${APIFY_ACTOR_ID}/runs?token=${encodeURIComponent(cleanToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actorInput),
      }
    );
    const startJson = await startResp.json();
    runId = startJson?.data?.id;
    datasetId = startJson?.data?.defaultDatasetId;
    runIdForLog = runId;
    if (!runId || !datasetId) {
      throw new Error("Apify did not return runId/datasetId");
    }
    mark("APIFY_START_OK", { runId, datasetId });

    send("queued", {
      runId,
      datasetId,
      consoleUrl: `https://console.apify.com/actors/runs/${runId}`,
    });

    // Poll until terminal. Apify's run object also exposes `stats.itemCount`
    // mid-flight on most actors — surface it so the operator sees movement.
    let polls = 0;
    let lastStatus = null;
    let lastItemCount = 0;

    while (true) {
      polls++;
      if (polls > APIFY_MAX_POLLS) {
        throw new Error(`run still in progress after ${polls} polls — bailing out`);
      }
      await new Promise((r) => setTimeout(r, APIFY_POLL_MS));

      const statusResp = await apifyFetch(
        `${APIFY_BASE}/actor-runs/${runId}?token=${encodeURIComponent(cleanToken)}`
      );
      const statusJson = await statusResp.json();
      const status = statusJson?.data?.status;
      const itemCount = Number(statusJson?.data?.stats?.itemCount) || 0;

      // Always send progress every poll, even when status/itemCount didn't
      // change — keeps the SSE connection from idle-timing out at any proxy
      // (Vite dev, nginx, cloud LB) sitting in front of us. The cost is a
      // ~150 byte event every APIFY_POLL_MS, which is nothing.
      send("progress", {
        phase: "scraping",
        status,
        itemCount,
        requestsTotal: statusJson?.data?.stats?.requestsTotal || 0,
        startedAt: statusJson?.data?.startedAt,
      });
      lastStatus = status;
      lastItemCount = itemCount;

      if (!APIFY_LIVE_STATUSES.has(status)) {
        if (status !== "SUCCEEDED") {
          mark("SCRAPE_TERMINAL_NON_SUCCESS", { status });
          throw new Error(
            `Apify run ${status}: ${statusJson?.data?.exitCode ?? ""} ${statusJson?.data?.statusMessage || ""}`.trim()
          );
        }
        mark("SCRAPE_SUCCEEDED", { itemCount, polls });
        break; // SUCCEEDED → fetch dataset
      }
    }

    mark("DATASET_FETCH_START", { datasetId });
    const itemsResp = await apifyFetch(
      `${APIFY_BASE}/datasets/${datasetId}/items?format=json&clean=true&token=${encodeURIComponent(cleanToken)}`
    );
    const items = await itemsResp.json();
    if (!Array.isArray(items)) {
      throw new Error("Apify dataset response was not an array");
    }
    mark("DATASET_FETCH_OK", { items: items.length });

    const rows = items.map(pickFields);
    const filename = synthesizeScrapeFilename(directUrls);
    mark("ROWS_MAPPED", { rows: rows.length });

    // Chain Groq Whisper transcription. Best-effort: when the operator's
    // Groq key is missing or any individual reel fails, the scrape still
    // ships — the affected rows just have an empty `transcript` field.
    const groqKey =
      String(groqToken || "").trim() || process.env.GROQ_API_KEY || "";
    if (rows.length > 0) {
      const candidates = rows
        .map((row, idx) => ({ row, idx }))
        .filter(
          ({ row }) =>
            row._audioUrl &&
            String(row._audioUrl).startsWith("http") &&
            !(row[TRANSCRIPT_FIELD] && String(row[TRANSCRIPT_FIELD]).trim())
        );
      mark("TRANSCRIBE_CANDIDATES", {
        count: candidates.length,
        groqConfigured: !!groqKey,
      });
      if (candidates.length === 0) {
        mark("TRANSCRIBE_SKIPPED", { reason: "no audio URLs" });
      } else if (!groqKey) {
        mark("TRANSCRIBE_SKIPPED", { reason: "no groq token" });
        send("warn", {
          phase: "transcribing",
          message:
            "Groq token not set — transcripts skipped. Add a token in Settings → Groq to enable.",
        });
      } else {
        try {
          mark("TRANSCRIBE_START", {
            model: GROQ_MODEL,
            concurrency: TRANSCRIBE_CONCURRENCY,
          });
          send("progress", {
            phase: "transcribing",
            status: "STARTING",
            itemCount: 0,
            total: candidates.length,
          });
          let succeeded = 0;
          let failed = 0;
          await pMapBounded(
            candidates,
            TRANSCRIBE_CONCURRENCY,
            async ({ row }) => {
              const text = await transcribeOne(row._audioUrl, groqKey);
              // Write under both keys: `transcript` is the user-facing
              // column the spec asks for, `reel-transcript` is the
              // canonical key the rest of the pipeline (Analyze, Scripts)
              // already reads from.
              row.transcript = text;
              row[TRANSCRIPT_FIELD] = text;
              return text;
            },
            ({ completed, total, lastResult }) => {
              if (lastResult.ok) succeeded++;
              else failed++;
              if (!isOpen()) return;
              send("progress", {
                phase: "transcribing",
                status: "RUNNING",
                itemCount: completed,
                total,
                succeeded,
                failed,
              });
            }
          );
          mark("TRANSCRIBE_DONE", {
            succeeded,
            failed,
            total: candidates.length,
          });
          send("progress", {
            phase: "transcribing",
            status: "SUCCEEDED",
            itemCount: succeeded,
            total: candidates.length,
            succeeded,
            failed,
            done: true,
          });
        } catch (e) {
          mark("TRANSCRIBE_FAILED", { message: e.message });
          console.warn("[scrape] transcribe step failed:", e.message);
          send("warn", {
            phase: "transcribing",
            message: `transcribe step failed: ${e.message || "unknown error"}`,
          });
        }
      }
    }

    mark("SEND_DONE", { rows: rows.length });
    send("done", {
      summary: summarize(rows, items.length ? Object.keys(items[0]) : []),
      rows,
      filename,
      runId,
      datasetId,
    });
    if (isOpen()) res.end();
    mark("RES_END");
  } catch (e) {
    mark("CAUGHT_ERROR", { message: e.message });
    console.error("[scrape] failed", e);
    send("error", {
      message: e.message || "scrape failed",
      runId,
      datasetId,
    });
    if (isOpen()) res.end();
    mark("RES_END_AFTER_ERROR");
  }
});

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

app.post("/api/parse", requireAuth, upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const text = req.file.buffer.toString("utf8").replace(/^﻿/, "");
    const name = req.file.originalname || "";
    const isJson =
      /\.json$/i.test(name) ||
      req.file.mimetype === "application/json" ||
      // Heuristic for unnamed buffers: starts with `[` or `{` after trimming.
      /^[\s]*[\[{]/.test(text);

    let records;
    if (isJson) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        return res.status(400).json({ error: `Invalid JSON: ${e.message}` });
      }
      // Apify dataset exports may be a bare array OR an object that wraps the
      // array under common keys (`items`, `results`, `data`). Accept all.
      if (Array.isArray(parsed)) {
        records = parsed;
      } else if (parsed && typeof parsed === "object") {
        records =
          parsed.items || parsed.results || parsed.data || parsed.rows || null;
        if (!Array.isArray(records)) {
          return res.status(400).json({
            error:
              "JSON must be an array of records (or { items|results|data|rows: [...] })",
          });
        }
      } else {
        return res
          .status(400)
          .json({ error: "JSON must be an array of records" });
      }
    } else {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
        trim: true,
        bom: true,
      });
    }

    const rawColumns = records.length ? Object.keys(records[0]) : [];
    const rows = records.map(pickFields);
    res.json({
      summary: summarize(rows, rawColumns),
      rows,
      filename: req.file.originalname,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

function engagementScore(row) {
  const likes = Number(row.likesCount) || 0;
  const comments = Number(row.commentsCount) || 0;
  const views = Number(row.videoViewCount) || Number(row.videoPlayCount) || 0;
  if (likes + comments > 0) return likes + comments;
  return views; // fall back to views when engagement metrics are missing
}

// ---------- Groq Whisper transcriber ----------
//
// Top-N transcription pass driven by the operator's Groq token. The audio
// URL we send to Groq is whatever Apify's instagram-scraper resolved into
// `row._audioUrl` (typically the direct mp4 download URL). Groq Whisper has
// a 24 MB upload ceiling, enforced inside `downloadAudio`.

app.post("/api/transcribe", requireAuth, async (req, res) => {
  const { rows, topN, groqToken } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "rows[] required" });
  }
  const groqKey =
    String(groqToken || "").trim() || process.env.GROQ_API_KEY || "";
  if (!groqKey) {
    return res
      .status(503)
      .json({ error: "Groq API key not configured (set in Settings → Groq)" });
  }

  const limit = Number.isFinite(topN) && topN > 0 ? Math.floor(topN) : 5;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const isOpen = () =>
    !!res.writable && !res.writableEnded && !res.destroyed;
  const send = (event, data) => {
    if (!isOpen()) return false;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      return false;
    }
  };

  const enriched = rows.map((r) => ({ ...r }));

  // Rank candidates by engagement, keep top-N that have a resolved audio URL
  // and don't already have a transcript. Groq Whisper consumes the audio
  // file directly so we need `_audioUrl`, not the post-page URL.
  const ranked = enriched
    .map((row, idx) => ({ row, idx, score: engagementScore(row) }))
    .filter(({ row }) => {
      const existing =
        row[TRANSCRIPT_FIELD] && String(row[TRANSCRIPT_FIELD]).trim();
      return row._audioUrl && !existing;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const todo = ranked.map(({ row, idx, score }) => ({
    idx,
    url: row._audioUrl,
    score,
  }));

  const audioField =
    enriched.find((r) => r._audioSourceField)?._audioSourceField || null;

  send("start", {
    audioField,
    total: todo.length,
    limit,
    strategy: "top engagement (likes + comments)",
    skipped: enriched.length - todo.length,
    model: GROQ_MODEL,
  });

  if (todo.length === 0) {
    send("done", {
      rows: enriched,
      transcribed: 0,
      failed: 0,
      skipped: enriched.length,
    });
    return res.end();
  }

  let failed = 0;
  await pMapBounded(
    todo,
    TRANSCRIBE_CONCURRENCY,
    async (job) => {
      const text = await transcribeOne(job.url, groqKey);
      enriched[job.idx][TRANSCRIPT_FIELD] = text;
      enriched[job.idx].transcript = text;
      return text;
    },
    ({ completed, total, lastIndex, lastResult }) => {
      const job = todo[lastIndex];
      if (lastResult.ok) {
        send("progress", {
          completed,
          total,
          rowIndex: job.idx,
          ok: true,
          chars: lastResult.value.length,
        });
      } else {
        failed++;
        enriched[job.idx][TRANSCRIPT_FIELD] = "";
        enriched[job.idx]["_transcribe_error"] = lastResult.error;
        send("progress", {
          completed,
          total,
          rowIndex: job.idx,
          ok: false,
          error: lastResult.error,
        });
      }
    }
  );

  send("done", {
    rows: enriched,
    transcribed: todo.length - failed,
    failed,
    skipped: enriched.length - todo.length,
  });
  if (isOpen()) res.end();
});

// In production (one-click launcher), the express server also serves the
// built React app from `client/dist/`. In dev, Vite serves the client on
// :5173 and proxies /api/* here.
const CLIENT_DIST = path.resolve(__dirname, "..", "client", "dist");
const SERVE_CLIENT =
  process.env.SERVE_CLIENT === "1" ||
  process.env.NODE_ENV === "production" ||
  fs.existsSync(path.join(CLIENT_DIST, "index.html"));

if (SERVE_CLIENT && fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  // SPA fallback for any non-/api route — uses a regex to dodge Express 5's
  // path-to-regexp wildcard parsing changes.
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

app.get("/api/health", (_req, res) => {
  // Anthropic moved into the main-process vault path; the renderer reads
  // its readiness from chiqo.keys.list() now, not from /api/health. We
  // keep groq + apify here because they are still env-driven until they
  // migrate in Phase 2.7.
  const groqEnvConfigured = !!process.env.GROQ_API_KEY;
  const apifyConfigured = !!process.env.APIFY_TOKEN;
  res.json({
    ok: true,
    groqModel: GROQ_MODEL,
    services: {
      groq: { configured: groqEnvConfigured, required: false },
      apify: { configured: apifyConfigured, required: false },
    },
    groqConfigured: groqEnvConfigured,
    apifyConfigured,
  });
});

app.listen(PORT, () => {
  console.log(`chiqo.ai server listening on http://localhost:${PORT}`);
  if (SERVE_CLIENT && fs.existsSync(CLIENT_DIST)) {
    console.log(`Client UI: http://localhost:${PORT}`);
  }
  console.log(
    `Groq Whisper: ${GROQ_MODEL} (${
      process.env.GROQ_API_KEY ? "env key configured" : "no env key set"
    })`
  );
});
