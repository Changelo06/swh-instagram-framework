// Parse a streaming/streamed analysis markdown blob into a folder of focused
// layer files. Phase 1: pure UI-side derivation — no backend changes — so the
// parser has to be permissive about prompt drift (numbering, dashes, casing).

const FAST_LAYERS = [
  {
    id: "layer-1",
    title: "Layer 1: Performance Snapshot",
    aliases: [
      "performance snapshot",
      "performance signals",
      "performance",
      "snapshot",
    ],
  },
  {
    id: "layer-2",
    title: "Layer 2: Winning Hook Pattern",
    aliases: [
      "winning hook pattern",
      "hook pattern",
      "hooks",
      "hook",
    ],
  },
  {
    id: "layer-3",
    title: "Layer 3: Content Structure Pattern",
    aliases: [
      "content structure pattern",
      "content structure",
      "structure pattern",
      "structure",
      "pacing",
      "format",
    ],
  },
  {
    id: "layer-4",
    title: "Layer 4: Next Moves",
    aliases: [
      "next moves",
      "action plan",
      "next steps",
      "moves",
    ],
  },
];

const DEEP_LAYERS = [
  {
    id: "layer-1",
    title: "Layer 1: Performance Signals",
    aliases: ["performance signals", "performance", "baseline"],
  },
  {
    id: "layer-2",
    title: "Layer 2: Hook & Scroll Stopper",
    aliases: [
      "hook scroll stopper",
      "hook and scroll stopper",
      "scroll stopper",
      "hook",
    ],
  },
  {
    id: "layer-3",
    title: "Layer 3: Structure & Retention",
    aliases: [
      "structure retention",
      "structure and retention",
      "retention",
      "structure",
      "pacing",
    ],
  },
  {
    id: "layer-4",
    title: "Layer 4: Emotional & Identity Triggers",
    aliases: [
      "emotional identity triggers",
      "emotional and identity triggers",
      "emotional triggers",
      "identity triggers",
      "emotional arc",
      "identity",
      "emotion",
    ],
  },
  {
    id: "layer-5",
    title: "Layer 5: Follower-Base Dynamics",
    aliases: [
      "follower base dynamics",
      "follower-base dynamics",
      "follower dynamics",
      "audience dynamics",
      "audience",
      "followers",
    ],
  },
  {
    id: "layer-6",
    title: "Layer 6: Strategic Moves",
    aliases: [
      "strategic moves",
      "strategy and next moves",
      "strategy next moves",
      "strategy",
      "next moves",
      "moves",
    ],
  },
];

const OVERVIEW_ALIASES = [
  "overview",
  "executive summary",
  "summary",
  "key takeaways",
  "takeaways",
  "tl dr",
  "tldr",
];

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchLayer(headingText, catalogue) {
  const norm = normalize(headingText);
  if (!norm) return null;
  // Strip common prefixes like "layer 3", "3.", "part 2", "section a".
  const stripped = norm
    .replace(/^layer\s*\d+\s*/i, "")
    .replace(/^section\s*[a-z0-9]+\s*/i, "")
    .replace(/^part\s*\d+\s*/i, "")
    .replace(/^\d+[\s.)-]+/, "")
    .trim();
  for (const layer of catalogue) {
    for (const alias of layer.aliases) {
      const a = normalize(alias);
      if (norm === a || stripped === a) return layer.id;
      // Loose contains, but only if the alias is reasonably specific so a
      // generic word like "structure" doesn't bind to a heading that just
      // mentions it in passing.
      if (a.length >= 6 && (norm.includes(a) || stripped.includes(a))) {
        return layer.id;
      }
    }
  }
  return null;
}

function isOverviewHeading(headingText) {
  const norm = normalize(headingText);
  return OVERVIEW_ALIASES.some((a) => norm === a || norm.startsWith(`${a} `));
}

// Split a markdown blob into top-level `##` sections. Skips the streaming
// `<<<PARTn>>>` markers the analyze prompt uses internally so they don't
// pollute the parsed sections.
function splitSections(text) {
  if (!text) return [];
  const cleaned = text.replace(/^<<<PART\d+>>>\s*$/gim, "").trim();
  const lines = cleaned.split("\n");
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    // Treat only level-2 headings as section boundaries — "###" stays inside
    // its parent section so the model's nested structure is preserved.
    if (m && !line.startsWith("###")) {
      if (current) sections.push(current);
      current = { heading: m[1].trim(), bodyLines: [line] };
    } else if (current) {
      current.bodyLines.push(line);
    } else {
      // Pre-amble before any `##` heading — keep as a synthetic intro section.
      current = { heading: "", bodyLines: [line] };
    }
  }
  if (current) sections.push(current);
  return sections.map((s) => ({
    heading: s.heading,
    markdown: s.bodyLines.join("\n").trim(),
  }));
}

export function parseAnalysisLayers(text, mode) {
  const safeText = typeof text === "string" ? text : "";
  const catalogue =
    mode === "fast" || mode === "scripts-only" ? FAST_LAYERS : DEEP_LAYERS;

  const overviewSlot = {
    id: "overview",
    title: "Overview",
    markdown: "",
  };
  const layerSlots = catalogue.map((l) => ({
    id: l.id,
    title: l.title,
    markdown: "",
  }));

  let matched = 0;
  const overviewBuf = [];
  for (const sec of splitSections(safeText)) {
    if (!sec.heading && sec.markdown) {
      // Headless preamble — funnel into overview.
      overviewBuf.push(sec.markdown);
      continue;
    }
    if (isOverviewHeading(sec.heading)) {
      overviewBuf.push(sec.markdown);
      matched++;
      continue;
    }
    const layerId = matchLayer(sec.heading, catalogue);
    if (layerId) {
      const slot = layerSlots.find((l) => l.id === layerId);
      if (slot) {
        slot.markdown = slot.markdown
          ? `${slot.markdown}\n\n${sec.markdown}`
          : sec.markdown;
        matched++;
      }
      continue;
    }
    // Unknown heading — append to overview so nothing is dropped.
    overviewBuf.push(sec.markdown);
  }

  overviewSlot.markdown = overviewBuf.join("\n\n").trim();

  // No layer headings matched at all → return the full text as overview and
  // leave layers empty. The UI will fall back to "Full report" only.
  if (matched === 0) {
    return {
      overview: { ...overviewSlot, markdown: safeText.trim() },
      layers: [],
      raw: safeText,
    };
  }

  return {
    overview: overviewSlot,
    layers: layerSlots,
    raw: safeText,
  };
}
