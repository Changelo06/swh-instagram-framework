// Runs persistence layer — DB CRUD.
//
// Phase 3 backs the in-memory runs registry with a `runs` table in the
// vault DB. Every state transition writes through here; list/get/remove
// read from here. While the vault is LOCKED there's no DB to write to,
// so the registry falls back to in-memory only.
//
// Design notes:
//   - The `payload_json` and `usage_json` columns hold opaque JSON. They
//     never participate in WHERE clauses — pure pass-through storage so
//     the schema stays stable as provider payloads evolve.
//   - We don't store the renderer-side AbortController or webContents
//     sender — both are tied to the live process and can't be
//     serialized. After hydration, runs are read-only history.
//   - `cost_usd` is denormalized for fast Account-page aggregation;
//     recomputed from `usage_json` + `model` at write time via
//     usage-log.computeCostUsd().

const { computeCostUsd } = require("./usage-log.cjs");

// Serialize the relevant fields of an in-memory record onto a DB row.
function recordToRow(r) {
  return {
    id: r.id,
    type: r.type || null,
    route: r.route || null,
    status: r.status,
    model: r.model || null,
    started_at: r.startedAt,
    finished_at: r.finishedAt || null,
    output_length: r.accumulator?.length || 0,
    usage_json: r.usage ? JSON.stringify(r.usage) : null,
    stop_reason: r.stopReason || null,
    error: r.error || null,
    cost_usd: computeCostUsd({ model: r.model, usage: r.usage }) || 0,
    payload_json: r.donePayload ? JSON.stringify(r.donePayload) : null,
  };
}

// Inverse: hydrate an in-memory record from a DB row. The runtime-only
// fields (sender, controller, accumulator) come back null/empty since
// the process they belonged to is gone.
function rowToRecord(row) {
  return {
    id: row.id,
    type: row.type,
    route: row.route,
    status: row.status,
    model: row.model,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    accumulator: "",
    outputLength: row.output_length || 0,
    usage: row.usage_json ? safeJsonParse(row.usage_json) : null,
    stopReason: row.stop_reason,
    error: row.error,
    costUsd: row.cost_usd || 0,
    donePayload: row.payload_json ? safeJsonParse(row.payload_json) : null,
    sender: null,
    controller: null,
    persisted: true,
  };
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Upsert by id. Used for both "new run starting" and "run completed"
// transitions — same SQL, just different status/fields.
function upsertRun(db, record) {
  const row = recordToRow(record);
  db.prepare(
    `INSERT INTO runs (
       id, type, route, status, model, started_at, finished_at,
       output_length, usage_json, stop_reason, error, cost_usd, payload_json
     ) VALUES (
       @id, @type, @route, @status, @model, @started_at, @finished_at,
       @output_length, @usage_json, @stop_reason, @error, @cost_usd, @payload_json
     )
     ON CONFLICT(id) DO UPDATE SET
       type          = excluded.type,
       route         = excluded.route,
       status        = excluded.status,
       model         = excluded.model,
       finished_at   = excluded.finished_at,
       output_length = excluded.output_length,
       usage_json    = excluded.usage_json,
       stop_reason   = excluded.stop_reason,
       error         = excluded.error,
       cost_usd      = excluded.cost_usd,
       payload_json  = excluded.payload_json`
  ).run(row);
}

// Read a single run by id. Returns null if not found.
function getRun(db, id) {
  const row = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id);
  return row ? rowToRecord(row) : null;
}

// List runs, most recent first. The optional `filter` object can scope
// by status (single value) or by type. Both kept narrow — the renderer
// page does its own UI filtering on the returned list.
function listRuns(db, { status, type, limit = 500 } = {}) {
  const where = [];
  const params = [];
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (type) {
    where.push("type = ?");
    params.push(type);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT * FROM runs ${whereSql}
       ORDER BY started_at DESC
       LIMIT ?`
    )
    .all(...params, limit);
  return rows.map(rowToRecord);
}

function deleteRun(db, id) {
  const r = db.prepare(`DELETE FROM runs WHERE id = ?`).run(id);
  return { deleted: r.changes > 0 };
}

// On unlock, sweep any rows left in `starting` / `streaming` from a
// previous process to `stopped` — the original AbortController and
// webContents are gone with that process, so the run effectively died.
function reapInFlight(db) {
  const r = db
    .prepare(
      `UPDATE runs
         SET status = 'stopped',
             finished_at = COALESCE(finished_at, ?),
             error = COALESCE(error, 'app exited mid-run')
       WHERE status IN ('starting', 'streaming')`
    )
    .run(Date.now());
  return { reaped: r.changes };
}

// Aggregates used by the Account page. Kept here so the SQL lives next
// to the schema.
//
// `sinceMs` is an optional inclusive lower bound on started_at. Token
// totals are summed by parsing usage_json on the fly — fine at the
// sizes we expect (a year of daily runs is ~5k rows). If this turns
// into a hot path later, denormalize tokens into their own columns.
function summarize(db, { sinceMs } = {}) {
  const params = [];
  let where = "WHERE 1=1";
  if (Number.isFinite(sinceMs)) {
    where += " AND started_at >= ?";
    params.push(sinceMs);
  }
  const baseRow = db
    .prepare(
      `SELECT
         COUNT(*)                         AS totalRuns,
         SUM(cost_usd)                    AS totalCostUsd,
         COUNT(DISTINCT model)            AS distinctModels,
         SUM(CASE WHEN status='done'    THEN 1 ELSE 0 END) AS doneCount,
         SUM(CASE WHEN status='error'   THEN 1 ELSE 0 END) AS errorCount,
         SUM(CASE WHEN status='stopped' THEN 1 ELSE 0 END) AS stoppedCount
       FROM runs ${where}`
    )
    .get(...params);

  // Tokens are inside usage_json. SQLite doesn't have a JSON function
  // we want to depend on across versions — pull the rows we need and
  // sum in JS.
  const usageRows = db
    .prepare(`SELECT usage_json FROM runs ${where} AND usage_json IS NOT NULL`)
    .all(...params);
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreateTokens = 0;
  for (const r of usageRows) {
    try {
      const u = JSON.parse(r.usage_json);
      inputTokens += u?.input_tokens || 0;
      outputTokens += u?.output_tokens || 0;
      cacheReadTokens += u?.cache_read_input_tokens || 0;
      cacheCreateTokens += u?.cache_creation_input_tokens || 0;
    } catch {
      /* skip malformed row */
    }
  }

  return {
    totalRuns: baseRow?.totalRuns || 0,
    totalCostUsd: baseRow?.totalCostUsd || 0,
    distinctModels: baseRow?.distinctModels || 0,
    doneCount: baseRow?.doneCount || 0,
    errorCount: baseRow?.errorCount || 0,
    stoppedCount: baseRow?.stoppedCount || 0,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreateTokens,
    sinceMs: Number.isFinite(sinceMs) ? sinceMs : null,
  };
}

// Per-day cost breakdown for the Account page sparkline. Returns
// last `days` days, each with totalCostUsd + runs + outputTokens.
// Filled in order oldest → newest with zero-buckets for empty days so
// the renderer doesn't have to gap-fill.
function dailyUsage(db, { days = 30 } = {}) {
  const clamped = Math.max(1, Math.min(365, Math.floor(days)));
  const now = new Date();
  const startOfTodayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const dayMs = 24 * 60 * 60 * 1000;
  const firstBucketMs = startOfTodayUtc - (clamped - 1) * dayMs;

  const rows = db
    .prepare(
      `SELECT started_at, cost_usd, usage_json
         FROM runs
         WHERE started_at >= ?`
    )
    .all(firstBucketMs);

  // Pre-allocate the day buckets so empty days show up as zeros.
  const buckets = new Array(clamped).fill(0).map((_, i) => {
    const dayMsStart = firstBucketMs + i * dayMs;
    return {
      dayMs: dayMsStart,
      dayLabel: new Date(dayMsStart).toISOString().slice(0, 10),
      totalCostUsd: 0,
      runs: 0,
      outputTokens: 0,
    };
  });

  for (const r of rows) {
    const idx = Math.floor((r.started_at - firstBucketMs) / dayMs);
    if (idx < 0 || idx >= clamped) continue;
    buckets[idx].totalCostUsd += r.cost_usd || 0;
    buckets[idx].runs += 1;
    if (r.usage_json) {
      try {
        const u = JSON.parse(r.usage_json);
        buckets[idx].outputTokens += u?.output_tokens || 0;
      } catch {
        /* skip */
      }
    }
  }
  return buckets;
}

module.exports = {
  upsertRun,
  getRun,
  listRuns,
  deleteRun,
  reapInFlight,
  summarize,
  dailyUsage,
  // exported for tests
  recordToRow,
  rowToRecord,
};
