import express from "express";
import cors from "cors";
import multer from "multer";
import { parse } from "csv-parse/sync";
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROMPT_PATH = path.resolve(__dirname, "..", "SWH_Instagram_Agent_Prompt.md");
const SYSTEM_PROMPT = fs.readFileSync(PROMPT_PATH, "utf8");

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const PORT = process.env.PORT || 3001;

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const TRANSCRIBE_CONCURRENCY = Number(process.env.TRANSCRIBE_CONCURRENCY || 4);
const TRANSCRIPT_FIELD = "reel-transcript";

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("[warn] ANTHROPIC_API_KEY not set — /api/analyze will fail");
}
if (!GROQ_API_KEY) {
  console.warn("[warn] GROQ_API_KEY not set — /api/transcribe will fail");
}

const anthropic = new Anthropic();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

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

// ---------- Groq Whisper helpers ----------

async function downloadAudio(url, { timeoutMs = 30000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!r.ok) throw new Error(`audio fetch ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 24 * 1024 * 1024) {
      throw new Error(`audio too large for Groq (${buf.length} bytes)`);
    }
    return buf;
  } finally {
    clearTimeout(t);
  }
}

async function transcribeWithGroq(buf, { filename = "audio.mp4" } = {}) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");

  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "audio/mp4" }), filename);
  fd.append("model", GROQ_MODEL);
  fd.append("response_format", "text");
  fd.append("temperature", "0");

  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: fd,
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`groq ${r.status}: ${errText.slice(0, 200)}`);
  }
  const text = await r.text();
  return text.trim();
}

async function transcribeOne(url) {
  const buf = await downloadAudio(url);
  return transcribeWithGroq(buf);
}

// Bounded-concurrency runner.
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

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------- Routes ----------

app.post("/api/parse", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const text = req.file.buffer.toString("utf8");
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
      bom: true,
    });
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

app.post("/api/transcribe", async (req, res) => {
  const { rows, topN } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "rows[] required" });
  }
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not set on server" });
  }

  const limit = Number.isFinite(topN) && topN > 0 ? Math.floor(topN) : 5;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const enriched = rows.map((r) => ({ ...r }));

  // Rank candidates by engagement, then keep only the top N that have audio URL
  // and don't already have a transcript.
  const ranked = enriched
    .map((row, idx) => ({ row, idx, score: engagementScore(row) }))
    .filter(({ row }) => {
      const existing = row[TRANSCRIPT_FIELD] && String(row[TRANSCRIPT_FIELD]).trim();
      return row._audioUrl && !existing;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const todo = ranked.map(({ row, idx, score }) => ({
    idx,
    url: row._audioUrl,
    score,
  }));

  const audioField = enriched.find((r) => r._audioSourceField)?._audioSourceField || null;

  if (!audioField) {
    send("error", {
      message: `No audio URL column detected. Looked for: ${AUDIO_URL_CANDIDATES.join(", ")}`,
    });
    return res.end();
  }

  send("start", {
    audioField,
    total: todo.length,
    limit,
    strategy: "top engagement (likes + comments)",
    skipped: enriched.length - todo.length,
    model: GROQ_MODEL,
  });

  if (todo.length === 0) {
    send("done", { rows: enriched, transcribed: 0, failed: 0, skipped: enriched.length });
    return res.end();
  }

  let failed = 0;
  await pMapBounded(
    todo,
    TRANSCRIBE_CONCURRENCY,
    async (job) => {
      const text = await transcribeOne(job.url);
      enriched[job.idx][TRANSCRIPT_FIELD] = text;
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
  res.end();
});

app.post("/api/analyze", async (req, res) => {
  const { rows, filename, scriptCount, mode } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "rows[] required" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured on server" });
  }

  const scriptsOnly = mode === "scripts-only";
  const fastMode = mode === "fast";
  const scriptCountClamped = Math.min(
    5,
    Math.max(1, Number.isFinite(Number(scriptCount)) ? Math.floor(Number(scriptCount)) : 3)
  );

  const summary = summarize(rows);

  // For the prompt, unify the transcript field (prefer Groq output) and strip
  // the internal _audioUrl/_audioSourceField bookkeeping so Claude sees a clean dataset.
  const rowsForClaude = rows.map((r) => {
    const t = (r[TRANSCRIPT_FIELD] && String(r[TRANSCRIPT_FIELD]).trim()) || r.transcript || "";
    const { _audioUrl, _audioSourceField, ...rest } = r;
    return { ...rest, transcript: t };
  });

  const userMessage = [
    `Apify Instagram CSV export attached below as JSON.`,
    `Filename: ${filename || "unknown.csv"}`,
    `Total posts: ${summary.totalPosts}`,
    `Fields present: ${summary.fieldsPresent.join(", ")}`,
    `Fields missing: ${summary.fieldsMissing.join(", ") || "(none)"}`,
    `Transcript coverage: ${summary.transcriptCoveragePct}%`,
    summary.audioField
      ? `Audio URL field: ${summary.audioField} (transcribed via Groq Whisper into reel-transcript)`
      : `Audio URL field: none detected`,
    `Script variations requested: ${scriptCountClamped}`,
    `Mode: ${
      fastMode
        ? "fast (1-part condensed summary, ~30s)"
        : scriptsOnly
        ? "scripts-only (skip Parts 1 & 2 — produce only Part 3)"
        : "full framework"
    }`,
    ``,
    fastMode
      ? `FAST MODE: Produce a single condensed framework summary in Part 1, ~500–700 words total. Cover ONLY: (1) Performance signals — top vs bottom tier views, dominant duration window, best-performing day if obvious; (2) The single dominant hook pattern with 2 example lines from the dataset and a reusable template; (3) The dominant emotional arc (OPEN → MID → CLOSE) in one line; (4) ONE ready-to-use script blueprint (60-90 seconds) following the dominant structure. Skip raw layer-by-layer breakdowns.`
      : scriptsOnly
      ? `SCRIPTS-ONLY MODE: Run a fast internal analysis to identify the dominant hook patterns, structure pipeline, emotional arc and topic angles in the dataset, but DO NOT output Parts 1 or 2. Produce ONLY Part 3 (Script Blueprints) including the Reel Structure Blueprint, Top 3 Performance Breakdowns, Emotional Arc, and ${scriptCountClamped} Script Variations.`
      : `Run the full SWH Content Framework analysis (all six layers + the 10-section report) on this dataset. Output the complete framework in the exact format specified in your instructions. Use markdown.`,
    ``,
    `## OUTPUT FORMAT REQUIREMENT`,
    ``,
    `Stream the report as plain markdown using these exact delimiter markers between parts. Each marker must appear on its own line, with nothing else on that line:`,
    ``,
    `<<<PART1>>>`,
    `<the markdown for Part 1 — Data Analysis>`,
    ``,
    `<<<PART2>>>`,
    `<the markdown for Part 2 — Content Strategy>`,
    ``,
    `<<<PART3>>>`,
    `<the markdown for Part 3 — Script Blueprints>`,
    ``,
    `Hard rules for the streamed format:`,
    `- The very first non-whitespace token of your response must be a "<<<PART…>>>" marker.`,
    `- Do NOT wrap the response in JSON, in code fences, or in any introductory prose.`,
    `- Markers must appear in ascending order (PART1, then PART2, then PART3) and each at most once.`,
    `- Inside Part 2 include explicit subsections titled "Hook Gap Opportunities" and "Hook Patterns to Retire".`,
    `- Inside Part 3 include explicit subsections titled "Reel Structure Blueprint", "Top 3 Performance Breakdowns", "Emotional Arc", and "Script Variations".`,
    `- Include exactly ${scriptCountClamped} script variations in Part 3.`,
    fastMode
      ? `- FAST MODE: emit ONLY <<<PART1>>> followed by the condensed summary. Do not emit <<<PART2>>> or <<<PART3>>>.`
      : scriptsOnly
      ? `- SCRIPTS-ONLY MODE: emit ONLY <<<PART3>>> followed by the script blueprints content. Do not emit <<<PART1>>> or <<<PART2>>>.`
      : `- Emit all three parts in order with all required subsections.`,
    ``,
    `<csv_data>`,
    JSON.stringify(rowsForClaude, null, 2),
    `</csv_data>`,
  ].join("\n");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const stream = await anthropic.messages.stream({
      model: MODEL,
      // Fast mode targets a ~40s wall-clock; deep mode reserves headroom for
      // the full 3-part report plus JSON encoding overhead so it never
      // truncates mid-script.
      max_tokens: fastMode ? 4500 : 32000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        send("delta", { text: event.delta.text });
      }
    }

    const final = await stream.finalMessage();
    send("done", {
      stopReason: final.stop_reason,
      usage: final.usage,
    });
    res.end();
  } catch (e) {
    console.error(e);
    send("error", { message: e.message || "Claude API error" });
    res.end();
  }
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
  const anthropicConfigured = !!process.env.ANTHROPIC_API_KEY;
  const groqConfigured = !!GROQ_API_KEY;
  // We treat the framework as "online" iff the Anthropic key is present (Groq
  // is optional — captions-only analysis is supported when it's missing).
  res.json({
    ok: anthropicConfigured,
    model: MODEL,
    groqModel: GROQ_MODEL,
    services: {
      anthropic: { configured: anthropicConfigured, required: true },
      groq: { configured: groqConfigured, required: false },
    },
    // Legacy keys for older clients.
    groqConfigured,
    anthropicConfigured,
  });
});

app.listen(PORT, () => {
  console.log(`SWH server listening on http://localhost:${PORT}`);
  if (SERVE_CLIENT && fs.existsSync(CLIENT_DIST)) {
    console.log(`Client UI:    http://localhost:${PORT}/  (served from client/dist)`);
  }
  console.log(`Claude model: ${MODEL}`);
  console.log(`Groq Whisper model: ${GROQ_MODEL} (${GROQ_API_KEY ? "configured" : "MISSING KEY"})`);
});
