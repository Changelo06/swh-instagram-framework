// Anthropic streaming, main-process side.
//
// Pulls the API key from the unlocked vault (NEVER from env, NEVER
// from IPC payloads — that's the whole point of the vault). Streams
// Claude's response text into the run abstraction in
// electron/runs/index.cjs, which fans out delta events to the
// renderer.
//
// Three call shapes share this path:
//   - mode: "fast"            → Fast analyze (4 layers)
//   - mode: "full" (default)  → Deep analyze (6 layers)
//   - mode: "reel-blueprint"  → Script variations
//
// Prompt construction is in electron/providers/prompt.cjs. This module
// is just SDK plumbing.

const Anthropic = require("@anthropic-ai/sdk").default ||
  require("@anthropic-ai/sdk");

const runs = require("../runs/index.cjs");
const prompt = require("./prompt.cjs");

const DEFAULT_MODEL =
  process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

let _appRoot = null;
function setAppRoot(appRoot) {
  _appRoot = appRoot;
}

// Build the SDK client lazily, using whatever key the vault hands us.
// We don't cache it — keys may rotate via Settings, and creating a
// client is cheap (no network I/O until first request).
function makeClient(apiKey) {
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    const e = new Error(
      "anthropic: no API key configured. Open Settings → API keys and add an Anthropic key."
    );
    e.code = "NO_API_KEY";
    throw e;
  }
  return new Anthropic({ apiKey });
}

// Kick off an analyze run. Returns the runId synchronously; the actual
// streaming happens in the background. Renderer subscribes via
// chiqo.runs.subscribe(runId, callback) to receive deltas.
//
// `payload` shape (passed through from chiqo.anthropic.analyze):
//   {
//     rows: [...],           // dataset rows (Apify CSV / scrape output)
//     mode: "fast" | "full" | "reel-blueprint",
//     filename?: string,
//     scriptCount?: number,  // reel-blueprint only
//     dna?: string,          // reel-blueprint brand voice brief
//     dnaFilename?: string,
//   }
//
// `getApiKey()` is a closure injected by the IPC handler — it calls
// vaultSession.getApiKey("anthropic"). Decouples this module from the
// session singleton so it's unit-testable.
//
// `sender` is the Electron WebContents that initiated the call. Delta
// events get sent back to it via webContents.send.
function startAnalyzeRun({ payload, getApiKey, sender }) {
  // Validation + prompt build happen synchronously so the IPC call
  // throws BEFORE we mint a runId. Cleaner UX — a malformed payload
  // turns into a rejected promise on the renderer side instead of a
  // run that immediately errors out.
  const { userMessage, maxTokens, label } = prompt.buildPrompt(payload);
  const apiKey = getApiKey();
  const client = makeClient(apiKey);
  const systemPrompt = prompt.loadSystemPrompt(_appRoot);

  const controller = new AbortController();
  const runId = runs.startRun({
    type: label,
    route: `chiqo.anthropic.analyze(${label})`,
    sender,
    model: DEFAULT_MODEL,
    abortController: controller,
  });

  // Fire and forget — the stream loop runs in the background and
  // notifies the run abstraction as text arrives.
  runStreamLoop({ runId, client, systemPrompt, userMessage, maxTokens, controller })
    .catch((err) => {
      // Defensive: runStreamLoop should already have called
      // runs.onError on any throw, but if something escaped the
      // try-catch (e.g., a synchronous construction error), make
      // sure we don't leave the run in "starting" forever.
      try {
        runs.onError(runId, err);
      } catch {}
    });

  return { runId };
}

async function runStreamLoop({
  runId,
  client,
  systemPrompt,
  userMessage,
  maxTokens,
  controller,
}) {
  try {
    const stream = client.messages.stream(
      {
        model: DEFAULT_MODEL,
        max_tokens: maxTokens,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userMessage }],
      },
      { signal: controller.signal }
    );

    runs.onStreaming(runId);

    for await (const event of stream) {
      if (controller.signal.aborted) {
        // The SDK's iterator usually throws AbortError on the next tick
        // when the signal fires, but be belt-and-suspenders.
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }
      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta"
      ) {
        runs.onDelta(runId, event.delta.text);
      }
    }

    const final = await stream.finalMessage();
    runs.onDone(runId, {
      usage: final.usage,
      stopReason: final.stop_reason,
    });
  } catch (err) {
    runs.onError(runId, err);
  }
}

module.exports = {
  setAppRoot,
  startAnalyzeRun,
  DEFAULT_MODEL,
  // Test seam
  _makeClient: makeClient,
};
