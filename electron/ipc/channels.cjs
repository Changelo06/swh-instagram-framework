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
    // Phase 1.2 / 1.3 — Vault crypto + SQLCipher
    { channel: "chiqo.vault.status",         phase: "1.2" },
    { channel: "chiqo.vault.create",         phase: "1.2" },
    { channel: "chiqo.vault.unlock",         phase: "1.2" },
    { channel: "chiqo.vault.lock",           phase: "1.2" },
    { channel: "chiqo.vault.setHint",        phase: "1.2" },
    { channel: "chiqo.vault.getHint",        phase: "1.2" },
    { channel: "chiqo.vault.changePassword", phase: "1.2" },
    { channel: "chiqo.vault.wipe",           phase: "4"   },

    // Phase 2.5 — Provider API keys in the vault
    { channel: "chiqo.keys.list",   phase: "2.5" },
    { channel: "chiqo.keys.set",    phase: "2.5" },
    { channel: "chiqo.keys.delete", phase: "2.5" },

    // Phase 2.6 — Anthropic calls move into main
    { channel: "chiqo.anthropic.analyze",     phase: "2.6" },
    { channel: "chiqo.anthropic.countTokens", phase: "2.6" },
    { channel: "chiqo.anthropic.stop",        phase: "2.6" },

    // Phase 2.7 — Groq + Apify calls move into main
    { channel: "chiqo.groq.transcribe", phase: "2.7" },
    { channel: "chiqo.groq.stop",       phase: "2.7" },
    { channel: "chiqo.apify.scrape",    phase: "2.7" },
    { channel: "chiqo.apify.account",   phase: "2.7" },
    { channel: "chiqo.apify.stop",      phase: "2.7" },

    // Phase 3 — Runs as first-class objects
    { channel: "chiqo.runs.list",   phase: "3" },
    { channel: "chiqo.runs.get",    phase: "3" },
    { channel: "chiqo.runs.delete", phase: "3" },

    // Phase 4 — Account / usage page
    { channel: "chiqo.usage.summary", phase: "4" },
    { channel: "chiqo.usage.list",    phase: "4" },
  ],
};
