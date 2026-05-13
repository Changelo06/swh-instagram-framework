// Per-run cost + token usage log.
//
// Appends a single JSONL row per completed paid model call to
// <userData>/logs/usage.jsonl. The Account page (Phase 4) reads this
// file to render the spend summary + run history. Until then it's
// invisible to the user but valuable for debugging cost regressions.
//
// Ported from server/auth.js's logUsage — same row schema, just
// rerouted from `.chiqo/usage.jsonl` (server-rooted) to
// userData/logs/usage.jsonl (vault userData). The cost table moves
// with it.

const fs = require("node:fs");
const path = require("node:path");

// Hard-coded Anthropic prices (USD per 1M tokens) for the models we
// actually call. Update when Anthropic changes pricing. Models not in
// the table log costUsd:0 rather than guessing.
const PRICES_PER_MTOK = {
  "claude-sonnet-4-6": {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheCreate: 3.75,
  },
  "claude-opus-4-7": {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheCreate: 18.75,
  },
};

function priceFor(model) {
  if (!model) return null;
  return (
    PRICES_PER_MTOK[model] ||
    PRICES_PER_MTOK[String(model).toLowerCase()] ||
    null
  );
}

function computeCostUsd({ model, usage }) {
  const p = priceFor(model);
  if (!p || !usage) return 0;
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheCreate = usage.cache_creation_input_tokens || 0;
  const cost =
    (input * p.input +
      output * p.output +
      cacheRead * p.cacheRead +
      cacheCreate * p.cacheCreate) /
    1_000_000;
  return Math.round(cost * 1e6) / 1e6; // 6-decimal precision
}

function usageLogPath(userDataDir) {
  return path.join(userDataDir, "logs", "usage.jsonl");
}

function logUsage({ userDataDir, userId, runId, model, usage, route }) {
  if (!userDataDir) {
    // Best-effort logging only — never break a real run because we
    // couldn't find a log path.
    return;
  }
  const dir = path.join(userDataDir, "logs");
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn("[usage-log] could not create log dir:", e.message);
    return;
  }
  const row = {
    ts: new Date().toISOString(),
    runId: runId || null,
    userId: userId || null, // null in vault-mode; reserved for future multi-user
    route: route || null,
    model: model || null,
    inputTokens: usage?.input_tokens || 0,
    outputTokens: usage?.output_tokens || 0,
    cacheReadTokens: usage?.cache_read_input_tokens || 0,
    cacheCreateTokens: usage?.cache_creation_input_tokens || 0,
    costUsd: computeCostUsd({ model, usage }),
  };
  try {
    fs.appendFileSync(usageLogPath(userDataDir), JSON.stringify(row) + "\n");
  } catch (e) {
    console.warn("[usage-log] append failed:", e.message);
  }
}

module.exports = {
  PRICES_PER_MTOK,
  priceFor,
  computeCostUsd,
  usageLogPath,
  logUsage,
};
