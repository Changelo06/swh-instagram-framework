// CSV / JSON dataset parser.
//
// Replaces the old /api/parse Express handler. The renderer hands us a
// Buffer (or Uint8Array — Electron's IPC structured-clone handles both)
// plus the original filename. We figure out CSV vs JSON, normalize via
// pickFields, and hand back the same `{rows, summary, filename}` shape
// the renderer always consumed.
//
// Synchronous on purpose: csv-parse/sync is fast for the dataset sizes
// we deal with (sub-100k rows). No streaming needed.

const { parse } = require("csv-parse/sync");
const { pickFields, summarize } = require("./dataset.cjs");

// Parse a Buffer/Uint8Array as CSV or JSON depending on filename + content.
// Throws on bad input — caller (the IPC handler) translates to a typed error.
function parseBuffer({ buffer, filename }) {
  if (!buffer) {
    const e = new Error("file buffer is required");
    e.code = "BAD_INPUT";
    throw e;
  }
  const buf = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(buffer instanceof ArrayBuffer ? buffer : buffer.buffer || buffer);

  const text = buf.toString("utf8").replace(/^﻿/, "");
  const name = filename || "";

  const isJson =
    /\.json$/i.test(name) ||
    // Heuristic for unnamed buffers: starts with `[` or `{` after trimming.
    /^[\s]*[\[{]/.test(text);

  let records;
  if (isJson) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const err = new Error(`Invalid JSON: ${e.message}`);
      err.code = "BAD_JSON";
      throw err;
    }
    // Apify dataset exports may be a bare array OR an object that wraps
    // the array under common keys (`items`, `results`, `data`, `rows`).
    if (Array.isArray(parsed)) {
      records = parsed;
    } else if (parsed && typeof parsed === "object") {
      records =
        parsed.items || parsed.results || parsed.data || parsed.rows || null;
      if (!Array.isArray(records)) {
        const err = new Error(
          "JSON must be an array of records (or { items|results|data|rows: [...] })"
        );
        err.code = "BAD_JSON_SHAPE";
        throw err;
      }
    } else {
      const err = new Error("JSON must be an array of records");
      err.code = "BAD_JSON_SHAPE";
      throw err;
    }
  } else {
    try {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
        trim: true,
        bom: true,
      });
    } catch (e) {
      const err = new Error(`CSV parse failed: ${e.message}`);
      err.code = "BAD_CSV";
      throw err;
    }
  }

  const rawColumns = records.length ? Object.keys(records[0]) : [];
  const rows = records.map(pickFields);
  return {
    summary: summarize(rows, rawColumns),
    rows,
    filename: name || null,
  };
}

module.exports = { parseBuffer };
