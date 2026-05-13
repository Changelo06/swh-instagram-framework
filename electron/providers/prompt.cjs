// Pure prompt-builder functions for the Anthropic analyze flow.
//
// These were inline inside server/index.js's /api/analyze handler.
// Extracting them here gives us:
//   - One source of truth as we kill /api/analyze in Phase 2.6
//   - Pure functions we can unit-test without touching the network
//   - A single place to evolve the prompt going forward
//
// Three modes share most of the structure but differ in layer specs:
//   - "fast"           → 4-layer compact analyze
//   - "full" (default) → 6-layer strategic analyze
//   - "reel-blueprint" → script variation generator (the Scripts flow)
//
// Each returns { userMessage, maxTokens, label } for the SDK call. The
// system prompt is the same SWH_Instagram_Agent_Prompt.md content
// across all three (with `cache_control: ephemeral` on the SDK side).

const fs = require("node:fs");
const path = require("node:path");

const TRANSCRIPT_FIELD = "reel-transcript";

// Reads SWH_Instagram_Agent_Prompt.md from either the dev tree
// (<repo>/SWH_Instagram_Agent_Prompt.md) or the packaged-app resources
// dir (process.resourcesPath/SWH_Instagram_Agent_Prompt.md). Cached
// after first read.
let _systemPromptCache = null;
function loadSystemPrompt(appRoot) {
  if (_systemPromptCache !== null) return _systemPromptCache;
  const candidates = [
    process.resourcesPath
      ? path.join(process.resourcesPath, "SWH_Instagram_Agent_Prompt.md")
      : null,
    appRoot ? path.join(appRoot, "SWH_Instagram_Agent_Prompt.md") : null,
    path.resolve(__dirname, "..", "..", "SWH_Instagram_Agent_Prompt.md"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      _systemPromptCache = fs.readFileSync(p, "utf8");
      return _systemPromptCache;
    }
  }
  throw new Error(
    `SWH_Instagram_Agent_Prompt.md not found in any of: ${candidates.join(
      ", "
    )}`
  );
}

// Test seam — let the test runner reset the cache between cases when
// it points the loader at different fixture files.
function _resetSystemPromptCache() {
  _systemPromptCache = null;
}

// --- Light per-dataset summary used in the prompt header ----------------
//
// Mirrors server/index.js's summarize() but trimmed to just the fields
// the user prompt references.

function summarizeDataset(rows) {
  const totalPosts = rows.length;
  const fieldKeys = new Set();
  for (const r of rows) {
    for (const k of Object.keys(r)) fieldKeys.add(k);
  }
  const fieldsPresent = [...fieldKeys].sort();

  // Coverage of the transcript field.
  let withTranscript = 0;
  for (const r of rows) {
    const t = r[TRANSCRIPT_FIELD] || r.transcript;
    if (t && String(t).trim()) withTranscript++;
  }
  const transcriptCoveragePct = totalPosts
    ? Math.round((withTranscript / totalPosts) * 100)
    : 0;

  // Did the dataset come with an audio field that triggers transcription?
  // We just want to mention "transcribed via Groq Whisper" in the prompt
  // when relevant.
  const audioField = rows.some((r) => r._audioUrl) ? "audioUrl" : null;

  return {
    totalPosts,
    fieldsPresent,
    fieldsMissing: [],
    transcriptCoveragePct,
    audioField,
  };
}

// Strip internal bookkeeping fields and unify transcript into a single
// `transcript` key. The model never sees `_audioUrl` / `_audioSourceField`.
function prepRowsForClaude(rows) {
  return rows.map((r) => {
    const t =
      (r[TRANSCRIPT_FIELD] && String(r[TRANSCRIPT_FIELD]).trim()) ||
      r.transcript ||
      "";
    const { _audioUrl, _audioSourceField, ...rest } = r;
    return { ...rest, transcript: t };
  });
}

// --- Layer specs --------------------------------------------------------

const FAST_LAYER_SPEC = [
  `## Overview`,
  `2-3 sentences: who this creator is, the shape of the dataset, and the single sharpest takeaway.`,
  ``,
  `## Layer 1: Performance Snapshot`,
  `### Summary`,
  `2 sentences: top-tier vs bottom-tier views, dominant duration window, best day if obvious.`,
  `### Evidence`,
  `3-5 bullets, each citing a real metric, post, or quoted line from the CSV.`,
  `### What to do next`,
  `1-3 bullets: concrete moves grounded in the snapshot.`,
  ``,
  `## Layer 2: Winning Hook Pattern`,
  `### Summary`,
  `2 sentences naming the single dominant hook formula and why it works for this audience.`,
  `### Evidence`,
  `3-5 bullets — include 2 quoted hook lines from the dataset and a reusable template ("[setup] → [tension] → [payoff]" form).`,
  `### What to do next`,
  `1-3 bullets: how to repeat or tighten the hook pattern.`,
  ``,
  `## Layer 3: Content Structure Pattern`,
  `### Summary`,
  `2 sentences on the dominant pacing / beat structure across top performers.`,
  `### Evidence`,
  `3-5 bullets: section-by-section breakdown of one top performer plus the recurring beat shape.`,
  `### What to do next`,
  `1-3 bullets: which beats to keep, which to drop.`,
  ``,
  `## Layer 4: Next Moves`,
  `### Summary`,
  `1-2 sentences on the strategic posture for the next 30 days.`,
  `### Evidence`,
  `3-5 bullets pulling specifically from Layers 1-3.`,
  `### What to do next`,
  `3-5 bullets, prioritized: repeat, stop, test next.`,
].join("\n");

const DEEP_LAYER_SPEC = [
  `## Overview`,
  `3-5 sentences: dataset shape, the sharpest signals, and the strategic question this report answers.`,
  ``,
  `## Layer 1: Performance Signals`,
  `### Summary`,
  `2-3 sentences on top-tier vs bottom-tier views, dominant duration, best day, and whether the account's wins are durable hits or viral flukes.`,
  `### Evidence`,
  `4-6 bullets citing real metrics or posts (views, likes, comments, engagement-rate outliers, posting cadence).`,
  `### What to do next`,
  `2-4 bullets of concrete performance-driven moves.`,
  ``,
  `## Layer 2: Hook & Scroll Stopper`,
  `### Summary`,
  `2-3 sentences on the dominant hook formula plus the scroll-stop mechanics (visual / audio / verbal).`,
  `### Evidence`,
  `4-6 bullets — include written-vs-spoken hook mismatches if transcripts exist, and 3 reusable hook templates with quoted examples from the dataset.`,
  `### What to do next`,
  `2-4 bullets on which hook variants to push, which to retire.`,
  ``,
  `## Layer 3: Structure & Retention`,
  `### Summary`,
  `2-3 sentences on the dominant pacing arc and the retention drivers behind top performers (cuts, b-roll cadence, loop hooks).`,
  `### Evidence`,
  `4-6 bullets: beat-by-beat shape of 2 top performers plus the pacing patterns that suppress retention in bottom-tier posts.`,
  `### What to do next`,
  `2-4 bullets on structural moves to repeat or change.`,
  ``,
  `## Layer 4: Emotional & Identity Triggers`,
  `### Summary`,
  `2-3 sentences on the primary emotion this creator triggers and the identity hooks (worldview, in-group / out-group framing).`,
  `### Evidence`,
  `4-6 bullets covering the emotional arc across top performers, vulnerability usage and its performance impact, and identity markers in caption + transcript language.`,
  `### What to do next`,
  `2-4 bullets on emotional / identity moves to lean into or correct.`,
  ``,
  `## Layer 5: Follower-Base Dynamics`,
  `This layer is about how this creator BUILDS AND CONDITIONS their audience over time — not how they go viral. Do NOT recommend script variations here. Recommend audience-building moves.`,
  `### Summary`,
  `3-4 sentences naming: the worldview being reinforced, the loyalty loops being run, and whether the creator is building loyal followers or only viral reach.`,
  `### Evidence`,
  `5-7 bullets covering: repeated beliefs / claims being instilled in the audience, recurring promises and callbacks, community identity markers (how followers are taught to see themselves), audience expectations being set, parasocial trust signals (direct address, vulnerability rituals, behind-the-scenes pacing), and concrete signs from the data of loyal-follower vs viral-only behavior (engagement-rate consistency, comment depth, repeated commenters if visible, save/share signals).`,
  `### What to do next`,
  `3-5 bullets of audience-building moves: which loyalty loops to deepen, which beliefs to reinforce more directly, where parasocial trust is leaking.`,
  ``,
  `## Layer 6: Strategic Moves`,
  `### Summary`,
  `2-3 sentences naming the strategic posture for the next 30-90 days.`,
  `### Evidence`,
  `4-6 bullets pulling from Layers 1-5: content gaps to fill, topics to retire, audience-building bets ranked by leverage.`,
  `### What to do next`,
  `4-6 bullets, prioritized and concrete: what to ship next, what to stop, what to test.`,
].join("\n");

// --- Builders -----------------------------------------------------------

function buildAnalyzeMessage({ rows, mode, filename }) {
  const fastMode = mode === "fast";
  const summary = summarizeDataset(rows);
  const rowsForClaude = prepRowsForClaude(rows);
  const layerSpec = fastMode ? FAST_LAYER_SPEC : DEEP_LAYER_SPEC;
  const layerCount = fastMode ? 4 : 6;
  const wordTarget = fastMode ? "~700-1000 words" : "~2000-3500 words";

  const userMessage = [
    `Apify Instagram CSV export attached below as JSON.`,
    `Filename: ${filename || "unknown.csv"}`,
    `Total posts: ${summary.totalPosts}`,
    `Fields present: ${summary.fieldsPresent.join(", ")}`,
    `Transcript coverage: ${summary.transcriptCoveragePct}%`,
    summary.audioField
      ? `Audio URL field: ${summary.audioField} (transcribed via Groq Whisper into reel-transcript)`
      : `Audio URL field: none detected`,
    `Mode: ${fastMode ? "fast analyze (4 layers)" : "deep analyze (6 layers)"}`,
    ``,
    `# TASK`,
    ``,
    fastMode
      ? `Run a Fast Analyze pass on this dataset. Compact, action-oriented diagnosis. ${layerCount} layers, ${wordTarget} total. Focus on content diagnosis and immediate next moves.`
      : `Run a Deep Analyze pass on this dataset. ${layerCount} layers, ${wordTarget} total. Focus on content diagnosis, creator strategy, and audience / follower-base dynamics. This is a strategic report, not a quick scan.`,
    ``,
    `**Analyze mode rule (hard):** Do NOT generate any scripts, script variations, beats, shot directions, hook variations lists, or production-ready prose. Script generation is owned by a separate Scripts workflow downstream. Stay in diagnostic + strategic territory only. The "What to do next" bullets are direction, not scripts.`,
    ``,
    `Override the system prompt's SECTION 01-10 output format and the SCRIPTING HANDOFF section. The exact output structure is specified below.`,
    ``,
    `# OUTPUT STRUCTURE`,
    ``,
    `Stream raw markdown. The very first non-whitespace token of your response MUST be "## Overview". No preamble, no JSON, no code fences, no <<<PART>>> markers.`,
    ``,
    `Use these exact level-2 headings, in this order:`,
    ``,
    layerSpec,
    ``,
    `# HARD RULES`,
    ``,
    `- Use these exact "## Layer N: <Title>" headings — downstream tooling splits the report on them.`,
    `- Inside each layer, use exactly the three "### Summary", "### Evidence", "### What to do next" subsection headings.`,
    `- Every claim must be traceable to a specific post, metric, or quoted line in the CSV. No generic advice.`,
    `- Sentence-case body text. No ALL-CAPS section titles.`,
    `- No scripts, no script variations, no shot lists, no beat-by-beat production scripts. Diagnostic + strategic content only.`,
    `- If a field is missing (e.g., transcripts absent), say so in the relevant Evidence bullet rather than fabricating signal.`,
    ``,
    `<csv_data>`,
    JSON.stringify(rowsForClaude, null, 2),
    `</csv_data>`,
  ].join("\n");

  return {
    userMessage,
    maxTokens: fastMode ? 4500 : 32000,
    label: fastMode ? "analyze-fast" : "analyze-deep",
  };
}

function buildReelBlueprintMessage({
  rows,
  filename,
  scriptCount,
  dna,
  dnaFilename,
}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    const e = new Error("buildReelBlueprintMessage: rows[] required");
    e.code = "BAD_INPUT";
    throw e;
  }
  const target = prepRowsForClaude(rows)[0];
  const scriptCountClamped = Math.min(
    5,
    Math.max(
      1,
      Number.isFinite(Number(scriptCount)) ? Math.floor(Number(scriptCount)) : 3
    )
  );
  const dnaText =
    typeof dna === "string" && dna.trim().length > 0
      ? dna.trim().slice(0, 30000)
      : null;

  const userMessage = [
    `# SCRIPT VARIATIONS REQUEST`,
    ``,
    `You are generating production-ready short-form video scripts using ONE source reel as reference material. The user does NOT want a long analysis essay — they want record-ready scripts with a short context brief at the top of each.`,
    ``,
    `Produce exactly ${scriptCountClamped} script variation${
      scriptCountClamped > 1 ? "s" : ""
    }. Vary the topical angle while preserving the source reel's structural mechanics (hook → tension → payoff → CTA, or whatever its actual shape is).`,
    ``,
    `## SOURCE REEL`,
    ``,
    `<source_reel>`,
    JSON.stringify(target, null, 2),
    `</source_reel>`,
    ``,
    `Source dataset: ${filename || "unknown.csv"}`,
    target.timestamp ? `Posted at: ${target.timestamp}` : ``,
    target.url ? `URL: ${target.url}` : ``,
    target.transcript
      ? `Transcript captured (${String(target.transcript).length} chars).`
      : `No transcript captured — work from caption + metadata.`,
    dnaText
      ? `\nA brand voice brief was uploaded (filename: ${
          dnaFilename || "brief"
        }). Each script MUST follow this brand voice while preserving the source reel's structural mechanics.\n\n<brand_voice_brief>\n${dnaText}\n</brand_voice_brief>\n`
      : ``,
    ``,
    `## OUTPUT FORMAT`,
    ``,
    `Stream raw markdown. Start directly with "## Script 1: <title>". Do NOT include any of the following sections:`,
    `- Why it went viral`,
    `- Posting metadata`,
    `- Caption breakdown`,
    `- Word-level analysis`,
    `- Emotional weight map`,
    `- Length / duration analysis`,
    `- Structural blueprint preamble`,
    `- Hook variations list`,
    `- Source reel explanation`,
    ``,
    `For each variation, use EXACTLY this structure (markdown). Pay close attention to where blank lines must appear — they affect the rendered document layout.`,
    ``,
    `## Script N: <short, vivid title>`,
    ``,
    `### Context Brief`,
    `- **Original context:** one sentence on what the source reel actually was.`,
    `- **Why it worked:** one sentence on the underlying mechanism.`,
    `- **Emotional context:** one sentence on the emotional arc the viewer travelled.`,
    `- **Transfer principle:** one sentence on what to reuse for THIS variation.`,
    ``,
    `### Hook`,
    ``,
    `[Tight crop, eye level — describe the visual]`,
    ``,
    `"Spoken hook line, 8-14 words max."`,
    ``,
    `### Full Script`,
    ``,
    `Break the script into 3-5 numbered beats. Each beat uses a fourth-level heading like "#### Beat 1: Setup", "#### Beat 2: Tension", etc. Inside each beat, alternate shot directions (in [square brackets] on their own paragraph) with the spoken lines (in "double quotes" on their own paragraph). Leave a blank line between every shot direction and every spoken line so they render as separate paragraphs. Example shape:`,
    ``,
    `#### Beat 1: <short name>`,
    ``,
    `[Shot direction here.]`,
    ``,
    `"Spoken line that lands on a single thought."`,
    ``,
    `[Cut to b-roll or graphic.]`,
    ``,
    `"Next spoken beat that builds the tension."`,
    ``,
    `Repeat for each beat. Aim for 3-5 beats total covering setup, tension, payoff, and CTA framing.`,
    ``,
    `### On-screen Text`,
    ``,
    `Short lines, one per bullet. These are the exact words that appear on screen during the cut.`,
    ``,
    `- First on-screen line`,
    `- Second on-screen line`,
    ``,
    `### Shot Notes`,
    ``,
    `- Tight, practical bullets the editor can act on (camera, framing, b-roll, audio cues, transitions).`,
    `- One bullet per discrete instruction.`,
    ``,
    `### CTA`,
    ``,
    `[Direct address — return to a single tight crop on the speaker.]`,
    ``,
    `"Final spoken CTA line."`,
    ``,
    `### Caption`,
    ``,
    `> One short caption to ship with the post. Use a markdown blockquote so it stands out in the document.`,
    ``,
    `Hard rules:`,
    `- The very first non-whitespace token of your response must be "## Script 1:".`,
    `- Use the EXACT subsection headings above ("### Context Brief", "### Hook", "### Full Script", "### On-screen Text", "### Shot Notes", "### CTA", "### Caption") so downstream tooling can split and render each script.`,
    `- Inside Full Script, use "#### Beat N: <name>" headings for every beat.`,
    `- Every shot direction MUST be on its own paragraph in [square brackets].`,
    `- Every spoken line MUST be on its own paragraph wrapped in "double quotes".`,
    `- Leave a blank line between every shot direction and every spoken line.`,
    `- The Context Brief must be exactly four bullets. Do not add a fifth.`,
    `- Each script must be ready to record — no meta-placeholders like "[insert your line here]". Specific, real lines only.`,
    `- Vary by topical angle and surface phrasing, not by structure.`,
    `- Do NOT announce yourself or describe what you are about to do.`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    userMessage,
    maxTokens: 16000,
    label: "script-variation",
    scriptCount: scriptCountClamped,
  };
}

// Dispatch — picks the right builder based on `mode`.
function buildPrompt({ rows, mode, filename, scriptCount, dna, dnaFilename }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    const e = new Error("buildPrompt: rows[] required");
    e.code = "BAD_INPUT";
    throw e;
  }
  if (mode === "reel-blueprint") {
    return buildReelBlueprintMessage({
      rows,
      filename,
      scriptCount,
      dna,
      dnaFilename,
    });
  }
  return buildAnalyzeMessage({ rows, mode, filename });
}

module.exports = {
  TRANSCRIPT_FIELD,
  loadSystemPrompt,
  _resetSystemPromptCache,
  summarizeDataset,
  prepRowsForClaude,
  buildAnalyzeMessage,
  buildReelBlueprintMessage,
  buildPrompt,
  FAST_LAYER_SPEC,
  DEEP_LAYER_SPEC,
};
