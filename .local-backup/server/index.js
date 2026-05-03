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

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("[warn] ANTHROPIC_API_KEY not set — /api/analyze will fail until you set it in server/.env");
}

const anthropic = new Anthropic();

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const FIELDS = [
  "id",
  "caption",
  "transcript",
  "videoViewCount",
  "videoPlayCount",
  "likesCount",
  "commentsCount",
  "timestamp",
  "videoDuration",
  "productType",
  "musicInfo/song_name",
  "musicInfo/artist_name",
  "musicInfo/uses_original_audio",
  "hashtags/0",
  "hashtags/1",
  "hashtags/2",
  "hashtags/3",
  "mentions/0",
  "images/0",
  "url",
];

function pickFields(row) {
  const out = {};
  for (const f of FIELDS) {
    if (row[f] !== undefined && row[f] !== "") out[f] = row[f];
  }
  return out;
}

function summarize(rows) {
  const present = new Set();
  for (const row of rows) for (const k of Object.keys(row)) present.add(k);
  const fieldsPresent = FIELDS.filter((f) => present.has(f));
  const fieldsMissing = FIELDS.filter((f) => !present.has(f));

  const withTranscript = rows.filter((r) => r.transcript && String(r.transcript).trim().length > 0).length;
  const withViews = rows.filter((r) => r.videoViewCount && Number(r.videoViewCount) > 0).length;

  return {
    totalPosts: rows.length,
    fieldsPresent,
    fieldsMissing,
    transcriptCoveragePct: rows.length ? Math.round((withTranscript / rows.length) * 100) : 0,
    viewCoveragePct: rows.length ? Math.round((withViews / rows.length) * 100) : 0,
  };
}

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
    });
    const rows = records.map(pickFields);
    res.json({ summary: summarize(rows), rows, filename: req.file.originalname });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/analyze", async (req, res) => {
  const { rows, filename } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "rows[] required" });
  }

  const summary = summarize(rows);

  const userMessage = [
    `Sort Feed CSV export attached below as JSON.`,
    `Filename: ${filename || "unknown.csv"}`,
    `Total posts: ${summary.totalPosts}`,
    `Fields present: ${summary.fieldsPresent.join(", ")}`,
    `Fields missing: ${summary.fieldsMissing.join(", ") || "(none)"}`,
    `Transcript coverage: ${summary.transcriptCoveragePct}%`,
    ``,
    `Run the full SWH Content Framework analysis (all six layers + the 10-section report) on this dataset. Output the complete framework in the exact format specified in your instructions. Use markdown.`,
    ``,
    `<csv_data>`,
    JSON.stringify(rows, null, 2),
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
      max_tokens: 16000,
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

app.get("/api/health", (_req, res) => res.json({ ok: true, model: MODEL }));

app.listen(PORT, () => {
  console.log(`SWH server listening on http://localhost:${PORT}`);
  console.log(`Model: ${MODEL}`);
});
