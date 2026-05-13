# chiqo.ai — Full phase prompt timeline

End-to-end map of the migration from "Electron wrapping a local Express
server" to "local-first, vault-gated, typed-IPC desktop app."

This is the receipt: each phase has its goal, the invariants it must
preserve, the concrete files it touches, the commit that landed it, and
the verification that proved it shipped.

## Invariants (apply to every phase)

1. **No chiqo server in the picture, ever.** The Express process is a
   transient compatibility layer that shrinks every phase and is gone by
   Phase 2.7.
2. **API keys never reach the renderer in plaintext.** Ever. Not
   `keysList()`, not error messages, not logs. The renderer only ever
   sees provider + fingerprint + last4.
3. **Every privileged action is gated on vault unlock.** Locked vault →
   typed `LOCKED` error → renderer prompts for password.
4. **On-disk files reveal nothing without the master password.** The
   vault DB is AES-256-GCM-wrapped with a key derived from the password
   via Argon2id. Lose the password → lose the data.
5. **One channel at a time.** Every preload method maps 1:1 to an
   `ipcMain.handle` channel. A method that exists in preload but has no
   handler returns `NOT_IMPLEMENTED` — never a silent hang.

---

## Phase 1.1 — Electron shell + preload bridge — DONE ([6a4016a](https://github.com/Changelo06/swh-instagram-framework/commit/6a4016a))

**Goal.** Stand up the Electron main process, the preload bridge, and
the strict CSP. No business logic yet — just the chassis every later
phase rides on.

**Delivered.**
- [electron/main.cjs](electron/main.cjs) — BrowserWindow + preload wiring
- [electron/preload.cjs](electron/preload.cjs) — frozen `window.chiqo`
  surface (`vault`, `keys`, `anthropic`, `groq`, `apify`, `runs`,
  `usage`, `app`)
- [electron/ipc/channels.cjs](electron/ipc/channels.cjs) — single source
  of truth for channel names + per-phase status
- [electron/ipc/index.cjs](electron/ipc/index.cjs) — registry that
  attaches real handlers OR a `NOT_IMPLEMENTED` stub
- Strict CSP: `default-src 'self'`; `connect-src 'self' http://127.0.0.1:*`
- `chiqo.ping` liveness check returning `{ pong, version, electron, node }`

**Verification.** Renderer boot calls `window.chiqo.ping()` and shows
`{ pong: true }`. Unimplemented channels reject with a phase hint.

---

## Phase 1.2 — Crypto module (KEK / DEK envelope) — DONE ([5844dec](https://github.com/Changelo06/swh-instagram-framework/commit/5844dec))

**Goal.** A pure crypto module the rest of the system can trust without
caring about the algorithm.

**Delivered.**
- Argon2id KDF via [hash-wasm](https://www.npmjs.com/package/hash-wasm)
  — `M=128 MiB`, `T=4`, `p=1`, ~320ms/derive (resists offline cracking
  on commodity GPUs).
- AES-256-GCM DEK envelope: a random Data Encryption Key is wrapped by a
  Key Encryption Key derived from the password. Rotating the password
  re-wraps the DEK — it does NOT re-encrypt the database.
- [electron/vault/crypto.cjs](electron/vault/crypto.cjs) + tests
  ([crypto.test.cjs](electron/vault/crypto.test.cjs)).

**Verification.** Unit tests under Electron's bundled Node
(`ELECTRON_RUN_AS_NODE=1`) — round-trip wrap / unwrap, tampered-IV
rejects, tampered-tag rejects, derive-time bounds.

---

## Phase 1.3 — Encrypted SQLite vault + vault IPC handlers — DONE ([0d2079e](https://github.com/Changelo06/swh-instagram-framework/commit/0d2079e))

**Goal.** Persist vault state. Wire every `chiqo.vault.*` IPC channel.

**Architectural compromise.** SQLCipher (`better-sqlite3-multiple-ciphers`)
needs a binding rebuilt for Electron's NMV. We don't have VS Build Tools
on this Windows box. **File-level AES-256-GCM wrap on top of plain
better-sqlite3** delivers the same security guarantee (encrypted at
rest, plaintext only in process memory while unlocked) without requiring
a native rebuild.

**Delivered.**
- [electron/vault/db.cjs](electron/vault/db.cjs) — open / migrate /
  rekey / wipe. Schema versioned via `MIGRATIONS.length`.
- [electron/vault/meta.cjs](electron/vault/meta.cjs) — `vault-meta.json`
  holds KDF params + the wrapped DEK + the password hint (never the DEK
  itself, never the password).
- [electron/vault/session.cjs](electron/vault/session.cjs) — single
  in-process session: status / create / unlock / lock / changePassword /
  wipe. Memoizes the unwrapped DEK; clears it on `lock()`.
- [scripts/fetch-electron-prebuild.cjs](scripts/fetch-electron-prebuild.cjs)
  — postinstall hook that fetches the Electron-ABI prebuild of
  better-sqlite3 (plain Node can't load it after this; tests run via
  Electron's bundled Node).
- IPC handlers for: `chiqo.vault.status / create / unlock / lock /
  getHint / setHint / changePassword / wipe`.

**Verification.** [scripts/test-vault.cjs](scripts/test-vault.cjs) runs
the suite. Round-trip create → unlock → lock → unlock. Wrong password →
typed `BAD_PASSWORD`. Wipe → meta + DB both gone.

---

## Phase 2.4 — VaultGate UI replaces `/api/login` — DONE ([1a0adc5](https://github.com/Changelo06/swh-instagram-framework/commit/1a0adc5))

**Goal.** Renderer talks to the vault, not to Express auth. First-run +
returning-user flows.

**Delivered.**
- VaultGate React shell — three states: `no-vault` (Create), `locked`
  (Unlock with hint), `unlocked` (pass-through).
- Password strength + confirm-typed hint UX.
- Drops `/api/login` from the renderer's hot path entirely. Express's
  `loginRouter` stays mounted for as long as `/api/scrape` and
  `/api/transcribe` exist (gone in 2.7).

**Verification.** First run: create vault → unlock → see app. F5 (close
window): app reopens to "locked" state. Wipe button → confirm-text
modal → vault gone.

---

## Phase 2.5 — Provider API keys live in the vault — DONE ([b9da019](https://github.com/Changelo06/swh-instagram-framework/commit/b9da019))

**Goal.** Move every API key out of `.env` / localStorage into the
encrypted DB. Renderer can list / set / delete; it can NEVER read a
plaintext value back.

**Delivered.**
- Migration v2: `api_keys` table (`provider` PK, `value` (encrypted
  blob), `fingerprint`, `last4`, `created_at`, `updated_at`).
- `session.listApiKeys / setApiKey / getApiKey / deleteApiKey`. Only
  `getApiKey` returns plaintext — and ONLY to main-process providers
  via a closure (`getApiKey: () => session.getApiKey('anthropic')`).
- IPC handlers `chiqo.keys.list / set / delete` — `list` and `set`
  return public-safe metadata only.
- [Settings → API keys](client/src/tactical/shell/SettingsDrawer.jsx)
  UI: add / replace / delete per provider, with fingerprint + last4 for
  identification.

**Verification.** Adding a key writes to the encrypted DB. Reopen the
app, unlock, key shows up with same fingerprint + last4. Wipe → keys
gone with the vault.

---

## Phase 2.6 — Anthropic streaming via IPC

Subdivided into three commits so each is reviewable on its own.

### Phase 2.6a — Provider + runs scaffold (main side) — DONE ([00b0583](https://github.com/Changelo06/swh-instagram-framework/commit/00b0583))

**Goal.** Build the main-process Anthropic path. The renderer doesn't
change yet — this commit only adds new capability.

**Delivered.**
- [electron/providers/prompt.cjs](electron/providers/prompt.cjs) —
  prompt builders extracted verbatim from `server/index.js` (`fast`,
  `full`, `reel-blueprint` modes). Pure functions, no I/O.
- [electron/providers/anthropic.cjs](electron/providers/anthropic.cjs) —
  `startAnalyzeRun({payload, getApiKey, sender})` → returns `{runId}`.
  Drives `client.messages.stream(...)` with an AbortController. `getApiKey`
  is a closure (unit-testable, decoupled from the vault singleton).
- [electron/runs/index.cjs](electron/runs/index.cjs) — in-memory runs
  registry. Lifecycle: `starting → streaming → done | error | stopped`.
  Events emitted on `chiqo.runs.delta.<runId>`.
- [electron/runs/usage-log.cjs](electron/runs/usage-log.cjs) — JSONL
  append at `userData/logs/usage.jsonl`. Cost computed from
  `PRICES_PER_MTOK` (sonnet-4-6 + opus-4-7).
- IPC handlers `chiqo.anthropic.analyze / stop / countTokens` and
  `chiqo.runs.list / get / delete`. `countTokens` is a stub (char/4)
  until Phase 4 ships the real cost preview.

**Verification.** [scripts/smoke-anthropic-ipc.cjs](scripts/smoke-anthropic-ipc.cjs)
covers: locked-vault → `LOCKED`, no-key → `NO_API_KEY`, empty-rows →
`BAD_INPUT`, fake-key valid-payload → returns `runId` synchronously,
`runs.list / get / delete`, bogus-runId → `NOT_FOUND`.

### Phase 2.6b — Renderer routes analyze through IPC — DONE ([88d5abb](https://github.com/Changelo06/swh-instagram-framework/commit/88d5abb))

**Goal.** The renderer stops fetching `/api/analyze`. Single switch in
`streamAnalyze`; everything downstream keeps working.

**Delivered.**
- [client/src/lib/anthropic-stream.js](client/src/lib/anthropic-stream.js) —
  translates the IPC event stream
  (`{type: 'delta' | 'state' | 'done' | 'error'}`) back into the
  `{onDelta, onDone, onError}` callback shape `streamAnalyze` already
  speaks. Returns `{runId, abort}`; `abort()` calls
  `chiqo.anthropic.stop(runId)`.
- [client/src/tactical/state/CsvContext.jsx](client/src/tactical/state/CsvContext.jsx) —
  `streamAnalyze` now dispatches: `/api/analyze` → IPC path,
  everything else (`/api/scrape`, `/api/transcribe`) → existing
  fetch + SSE path. Both store a uniform `.abort()` handle so
  `stopAnalysis` / `stopVariation` don't change.

**Verification.** Client builds clean. `runAnalysis` and `runVariation`
both reach the new path.

### Phase 2.6c — Delete `/api/analyze` from Express — DONE ([6a951b1](https://github.com/Changelo06/swh-instagram-framework/commit/6a951b1))

**Goal.** Remove the dead handler. The Express server stops touching
Anthropic entirely.

**Delivered.**
- [server/index.js](server/index.js) loses: `/api/analyze` handler
  (~378 lines), `@anthropic-ai/sdk` import + instance, `SYSTEM_PROMPT`
  + `PROMPT_PATH` loader, `MODEL` constant, `ANTHROPIC_API_KEY` env
  warning, `Claude model:` startup log.
- `/api/health` stops reporting Anthropic. Renderer reads Anthropic
  readiness from `chiqo.keys.list()` now.
- [client/src/components/ApiStatus.jsx](client/src/components/ApiStatus.jsx)
  tolerates the absent field (treats it as "managed in vault" rather
  than "missing → offline").
- `@anthropic-ai/sdk` dropped from `server/package.json` → 22
  transitive packages removed from `server/node_modules`.

**Verification.** `node --check server/index.js` clean. Server boots
clean (no missing-key warnings). Client builds clean.

---

## Phase 2.7 — Groq + Apify move into main — PENDING

**Goal.** The Express server loses every remaining provider call.
`/api/transcribe`, `/api/scrape`, `/api/parse` and the auth routes all
migrate to vault-gated IPC. After this phase the Express server is gone.

**Channels (already exposed in preload, currently stubbed
`NOT_IMPLEMENTED`).**
- `chiqo.groq.transcribe` / `chiqo.groq.stop`
- `chiqo.apify.scrape` / `chiqo.apify.account` / `chiqo.apify.stop`

**Plan sketch.**
- `electron/providers/groq.cjs` — Whisper transcribe with progress
  events on the same `chiqo.runs.delta.<runId>` channel shape.
- `electron/providers/apify.cjs` — scrape submission + polling +
  console URL surfacing. Same runs envelope.
- `electron/providers/parse.cjs` — CSV/JSON parse + classify (currently
  in [server/index.js](server/index.js)).
- Move runs lifecycle multiplexing: a single run can fan out to
  transcribe + analyze sub-stages (CsvContext already encodes this).
- Delete `server/` entirely. `server/auth.js`, `server/.env`,
  `users.json` all retire.
- Update [electron/main.cjs](electron/main.cjs) to stop spawning the
  Express child.

**Out of scope.** Anything UI. Anything that touches persistence
(Phase 3).

**Verification (when it lands).** End-to-end smoke: Apify scrape
(`resultsLimit: 5`) → Groq transcribe → fast analyze → variation. Same
flow as today, no `/api/*` requests in DevTools network tab. Express
process not running.

---

## Phase 3 — Runs persisted to DB — PENDING

**Goal.** `runs.list / get / delete` survive app restarts. The renderer
gets a "Runs" history page (it already calls `chiqo.runs.list` — Phase
3 just upgrades the storage backend without renaming a single channel).

**Plan sketch.**
- Migration v3: `runs` table (`id`, `provider`, `mode`, `payload_json`,
  `state`, `started_at`, `finished_at`, `usage_json`, `cost_usd`,
  `error_message`).
- [electron/runs/index.cjs](electron/runs/index.cjs) gains a
  write-through path — every state transition is persisted.
- [electron/runs/usage-log.cjs](electron/runs/usage-log.cjs) hydrates
  from DB on boot instead of JSONL.
- Renderer Runs view (deferred work; existing IPC contract honoured).

**Renderer contract guarantee.** `chiqo.runs.list / get / delete` keep
the exact same shape. No JSX change required.

---

## Phase 4 — Cost preview + Account / usage page — PENDING

**Goal.** Users see what a run will cost BEFORE they fire it, and what
they've already spent. Honest pricing surface.

**Channels (already exposed in preload, currently stubbed
`NOT_IMPLEMENTED`).**
- `chiqo.usage.summary` / `chiqo.usage.list`

**Plan sketch.**
- `chiqo.anthropic.countTokens` graduates from char/4 stub to the real
  Anthropic `messages.countTokens` call (it exists; we just need to
  wire it).
- Account page: per-day / per-week token + USD totals, broken down by
  provider + mode. Sourced from the runs table (Phase 3).
- Cost preview tile on Dashboard before "Run analyze" — token estimate
  × current model price.

---

## Phase 5 — Polish — PENDING

**Goal.** Ship-ready. Surface the rough edges discovered across earlier
phases.

**Plan sketch (non-exhaustive, will firm up after Phase 4).**
- Auto-lock after idle window (configurable in Settings).
- Bundle size pass — the `index-*.js` chunk is 1.2MB; `html2pdf` is
  670KB. Code-split `html2pdf` behind the Export button.
- Crash diagnostics — capture `unhandledRejection` from main and
  surface via a quiet toast (not a crash dialog).
- macOS code-signing + notarization. Windows installer signing.

---

## Architecture diff

### Before this migration

```
┌────────────────────────────────────────────────────────────┐
│ Electron BrowserWindow (renderer)                           │
│   localStorage: APIFY_TOKEN, GROQ_TOKEN  ← plaintext         │
│   fetch /api/analyze  → SSE  → SDK call                     │
│   fetch /api/scrape   → SSE  → Apify Console               │
│   fetch /api/transcribe → SSE → Groq Whisper                │
└─────────────────────────────┬──────────────────────────────┘
                              │ HTTP localhost:3001
┌─────────────────────────────┴──────────────────────────────┐
│ Express server (spawned by Electron)                        │
│   .env: ANTHROPIC_API_KEY, GROQ_API_KEY, APIFY_TOKEN  ← FS  │
│   users.json (bcrypt hashes)                                │
│   /api/analyze (Anthropic SDK)                              │
│   /api/scrape (Apify)                                       │
│   /api/transcribe (Groq)                                    │
└────────────────────────────────────────────────────────────┘
```

### After Phase 2.6c (today)

```
┌────────────────────────────────────────────────────────────┐
│ Electron BrowserWindow (renderer)                           │
│   No plaintext keys anywhere on disk                        │
│   chiqo.anthropic.analyze(payload)  ← IPC, vault-gated      │
│   fetch /api/scrape, /api/transcribe ← remaining server     │
└─────────────────┬─────────────────────┬──────────────────────┘
                  │ IPC                 │ HTTP localhost:3001
┌─────────────────┴───────────┐ ┌───────┴────────────────────┐
│ Electron main process       │ │ Express server (transient) │
│   Vault (KDF + AES-GCM)     │ │   /api/scrape (Apify)      │
│   Anthropic SDK              │ │   /api/transcribe (Groq)   │
│   Runs registry              │ │   /api/parse (CSV)         │
│   Usage log (JSONL)          │ │                            │
└─────────────────────────────┘ └────────────────────────────┘
```

### After Phase 2.7 (target)

```
┌────────────────────────────────────────────────────────────┐
│ Electron BrowserWindow (renderer)                           │
│   chiqo.* IPC for everything                                │
└─────────────────────────────┬──────────────────────────────┘
                              │ IPC
┌─────────────────────────────┴──────────────────────────────┐
│ Electron main process                                       │
│   Vault, Anthropic, Groq, Apify, Parse, Runs, Usage         │
└────────────────────────────────────────────────────────────┘

No Express. No server/. No localhost:3001. No .env files. No
users.json. The on-disk surface is just userData/vault.db.enc +
vault-meta.json — both useless without the master password.
```

---

## Status summary

| Phase | Title                                       | Commit    | Status     |
|------:|---------------------------------------------|-----------|------------|
| 1.1   | Electron shell + preload bridge             | [6a4016a](https://github.com/Changelo06/swh-instagram-framework/commit/6a4016a) | ✅ DONE    |
| 1.2   | Crypto module (KEK / DEK envelope)          | [5844dec](https://github.com/Changelo06/swh-instagram-framework/commit/5844dec) | ✅ DONE    |
| 1.3   | Encrypted SQLite vault + vault IPC          | [0d2079e](https://github.com/Changelo06/swh-instagram-framework/commit/0d2079e) | ✅ DONE    |
| 2.4   | VaultGate UI replaces /api/login            | [1a0adc5](https://github.com/Changelo06/swh-instagram-framework/commit/1a0adc5) | ✅ DONE    |
| 2.5   | Provider API keys in vault                  | [b9da019](https://github.com/Changelo06/swh-instagram-framework/commit/b9da019) | ✅ DONE    |
| 2.6a  | Anthropic streaming via IPC (main side)     | [00b0583](https://github.com/Changelo06/swh-instagram-framework/commit/00b0583) | ✅ DONE    |
| 2.6b  | Renderer routes analyze through IPC         | [88d5abb](https://github.com/Changelo06/swh-instagram-framework/commit/88d5abb) | ✅ DONE    |
| 2.6c  | Delete /api/analyze from Express            | [6a951b1](https://github.com/Changelo06/swh-instagram-framework/commit/6a951b1) | ✅ DONE    |
| 2.7   | Groq + Apify move into main                 | —         | ⏳ PENDING |
| 3     | Runs persisted to DB                        | —         | ⏳ PENDING |
| 4     | Cost preview + Account / usage page         | —         | ⏳ PENDING |
| 5     | Polish (auto-lock, bundle, signing, …)      | —         | ⏳ PENDING |
