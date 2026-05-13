// Single source of truth for IPC channels.
//
// As we land each phase, the matching rows move out of UNIMPLEMENTED and
// the real handler gets registered in electron/ipc/index.cjs. A channel
// listed here but NOT yet implemented returns `NOT_IMPLEMENTED` to the
// renderer — never a silent hang.
//
// Adding a row here is the only place a new IPC channel comes into
// existence. preload.cjs MUST also expose it, or the renderer can't
// reach it.

module.exports = {
  // Channels whose real handlers ship in a later phase. Each gets a
  // typed `NOT_IMPLEMENTED` rejection until the matching phase lands.
  UNIMPLEMENTED: [
    // Phase 1.2 / 1.3 vault channels — all live now (real handlers in
    // electron/ipc/index.cjs).

    // Phase 2.5 keys channels — all live now (real handlers in
    // electron/ipc/index.cjs).

    // Phase 2.6 Anthropic channels — all live now (real handlers in
    // electron/ipc/index.cjs).

    // Phase 2.7 Groq + Apify + parse channels — all live now (real
    // handlers in electron/ipc/index.cjs).

    // chiqo.runs.{list,get,delete} now have basic in-memory handlers
    // (Phase 2.6). Phase 3 will swap them for DB-backed persistence
    // without changing the renderer-facing contract.

    // Phase 4 — Account / usage page
    { channel: "chiqo.usage.summary", phase: "4" },
    { channel: "chiqo.usage.list",    phase: "4" },
  ],
};
