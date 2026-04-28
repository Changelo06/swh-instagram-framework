// Best-effort parsers that extract structured data from the markdown
// fragments Claude returns inside `part2` / `part3`. Every parser is
// defensive: when a section can't be found or the format drifts, it
// returns null so the UI falls back to plain markdown rendering.

// ----- streaming framework splitter -----

// Splits an in-flight streamed buffer into part1 / part2 / part3 strings
// using the `<<<PART1>>>` / `<<<PART2>>>` / `<<<PART3>>>` markers the
// server asks Claude to emit. Designed to run on every delta — partial
// markers (e.g. text ending in `<<<PART`) are simply ignored until the
// closing `>>>` arrives in the next chunk.
const STREAM_MARKERS = ["<<<PART1>>>", "<<<PART2>>>", "<<<PART3>>>"];

export function splitFrameworkStream(text) {
  const empty = { part1: "", part2: "", part3: "" };
  if (!text) return empty;

  const positions = STREAM_MARKERS.map((m) => text.indexOf(m));
  // No marker yet — buffer everything as part1 so the user still sees the
  // text appearing immediately. The first marker, when it arrives, will
  // strip the lead-in.
  if (positions.every((p) => p === -1)) {
    return { ...empty, part1: text };
  }

  const out = { ...empty };
  for (let i = 0; i < STREAM_MARKERS.length; i++) {
    const start = positions[i];
    if (start === -1) continue;
    const sliceStart = start + STREAM_MARKERS[i].length;
    // Find the next marker that actually appears further into the buffer.
    let nextEnd = text.length;
    for (let j = i + 1; j < STREAM_MARKERS.length; j++) {
      if (positions[j] !== -1 && positions[j] > start) {
        nextEnd = positions[j];
        break;
      }
    }
    const partKey = `part${i + 1}`;
    out[partKey] = text.slice(sliceStart, nextEnd).replace(/^\s*\n/, "").trimEnd();
  }
  return out;
}

// True once at least one part contains rendered content.
export function hasAnyFrameworkContent(fw) {
  return !!(fw && (fw.part1?.trim() || fw.part2?.trim() || fw.part3?.trim()));
}


// ----- shared markdown utilities -----

// Returns the body of the requested heading (case-insensitive, level 2-4),
// stopping at the next heading of the same or higher level.
export function extractSection(md, headingPattern) {
  if (!md) return null;
  const re = new RegExp(
    `^(#{2,4})\\s*(?:[-–—]\\s*)?(?:[\\d.]+\\s+)?(${headingPattern})\\s*$`,
    "im"
  );
  const m = re.exec(md);
  if (!m) return null;
  const startLevel = m[1].length;
  const startIdx = m.index + m[0].length;
  const after = md.slice(startIdx);
  const stopRe = new RegExp(`^#{1,${startLevel}}\\s+\\S`, "m");
  const stop = stopRe.exec(after);
  return (stop ? after.slice(0, stop.index) : after).trim();
}

// Splits a section into top-level "items" — each item is the body under a
// sub-heading (level 3-4) or a top-level bullet group.
function splitItems(section) {
  if (!section) return [];
  // Try sub-headings first
  const subHeadings = [...section.matchAll(/^(#{3,5})\s+(.+)$/gm)];
  if (subHeadings.length >= 2) {
    const items = [];
    for (let i = 0; i < subHeadings.length; i++) {
      const start = subHeadings[i].index + subHeadings[i][0].length;
      const end = i + 1 < subHeadings.length ? subHeadings[i + 1].index : section.length;
      items.push({
        title: subHeadings[i][2].replace(/[*_`]/g, "").trim(),
        body: section.slice(start, end).trim(),
      });
    }
    return items;
  }
  // Fall back to bold-leading bullets
  const lines = section.split(/\r?\n/);
  const items = [];
  let current = null;
  for (const line of lines) {
    const m =
      line.match(/^\s*[-*•]\s*\*\*(.+?)\*\*\s*[—:-]?\s*(.*)$/) ||
      line.match(/^\s*\*\*(.+?)\*\*\s*$/);
    if (m) {
      if (current) items.push(current);
      current = { title: m[1].trim(), body: (m[2] || "").trim() };
    } else if (current) {
      current.body += "\n" + line;
    }
  }
  if (current) items.push(current);
  return items.map((it) => ({ ...it, body: it.body.trim() }));
}

function bulletList(body) {
  if (!body) return [];
  return body
    .split(/\r?\n/)
    .filter((l) => /^\s*[-*•]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-*•]\s+/, "").trim());
}

function firstNumber(s) {
  const m = String(s).match(/[\d,]+/);
  return m ? Number(m[0].replace(/,/g, "")) : null;
}

// ----- HOOK INTELLIGENCE PARSER -----

// We expect part2 to contain something like:
//   ## Hook Intelligence
//     ### SPECIFIC CONTROVERSY
//     - Performance: HIGH
//     - Used in top posts: 6
//     - Structure: How to [action] every [category]
//     - Examples:
//       - "How to sell to every type of race" (13,927 views)
//       - "How to sell to every type of buyer in 40 seconds" (4,225 views)
//     - Template: How to [action] every [specific type]
//
// The parser is defensive — anything missing turns into a null/empty value.
export function parseHookIntelligence(part2Md) {
  const section =
    extractSection(part2Md, "Hook Intelligence|Active Hooks?|Hook Patterns?|Hook Architecture") ||
    extractSection(part2Md, "Hooks?");
  if (!section) return null;

  const rawHooks = splitItems(section);
  if (!rawHooks.length) return null;

  const hooks = rawHooks
    .filter(
      (h) =>
        !/^(gap|untapped|retire|avoid|opportunit)/i.test(h.title) // gap/retire sections handled separately
    )
    .map((h) => parseHookCard(h))
    .filter(Boolean);

  if (!hooks.length) return null;
  return hooks;
}

function parseHookCard({ title, body }) {
  if (!title) return null;
  const lines = body.split(/\r?\n/);
  const card = {
    type: title.replace(/[*_`]/g, "").toUpperCase(),
    performance: null,
    usedInTopPosts: null,
    structure: null,
    template: null,
    examples: [],
  };

  let inExamples = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;

    if (/^[-*•]?\s*\*?\*?examples?\*?\*?\s*[:：]/i.test(l)) {
      inExamples = true;
      continue;
    }
    const perfMatch = l.match(/performance\s*[:：]\s*\*?\*?(HIGH|MEDIUM|LOW)/i);
    if (perfMatch) {
      card.performance = perfMatch[1].toUpperCase();
      inExamples = false;
      continue;
    }
    const usedMatch = l.match(/(?:used\s+in\s+top\s+posts?|top\s+posts?\s+used)\s*[:：]\s*([\d,]+)/i);
    if (usedMatch) {
      card.usedInTopPosts = firstNumber(usedMatch[1]);
      inExamples = false;
      continue;
    }
    const structureMatch = l.match(/^[-*•]?\s*\*?\*?structure\*?\*?\s*[:：]\s*(.+)$/i);
    if (structureMatch) {
      card.structure = structureMatch[1].replace(/[*_`]/g, "").trim();
      inExamples = false;
      continue;
    }
    const templateMatch = l.match(/^[-*•]?\s*\*?\*?template\*?\*?\s*[:：]\s*(.+)$/i);
    if (templateMatch) {
      card.template = templateMatch[1].replace(/[*_`]/g, "").trim();
      inExamples = false;
      continue;
    }

    if (inExamples && /^[-*•]\s+/.test(raw)) {
      const ex = raw.replace(/^\s*[-*•]\s+/, "").trim();
      const viewsMatch = ex.match(/[\(\[]([\d,]+)\s*views?[\)\]]?/i);
      const text = ex.replace(/[\(\[]([\d,]+)\s*views?[\)\]]?/i, "").replace(/[—–-]\s*$/, "").trim();
      card.examples.push({
        text: text.replace(/^["']|["']$/g, ""),
        views: viewsMatch ? firstNumber(viewsMatch[1]) : null,
      });
    }
  }

  // If we got nothing structured, return null
  if (!card.examples.length && !card.structure && !card.template && !card.performance) {
    return null;
  }
  return card;
}

export function parseHookGaps(part2Md) {
  const section = extractSection(
    part2Md,
    "Hook Gap Opportunit(?:y|ies)|Untapped Hooks?|Gap Opportunit(?:y|ies)"
  );
  if (!section) return null;
  const items = splitItems(section);
  if (!items.length) return null;
  return items.map((it) => {
    const bullets = bulletList(it.body);
    return {
      type: it.title.replace(/[*_`]/g, "").toUpperCase(),
      reason:
        bullets.find((b) => /^why|works|because/i.test(b))?.replace(/^why\s*[:：]?\s*/i, "") ||
        bullets[0] ||
        it.body.replace(/^[-*•]\s+/gm, "").trim(),
      example:
        bullets.find((b) => /^example|suggested/i.test(b))?.replace(/^(example|suggested)\s*[:：]?\s*/i, "") ||
        null,
    };
  });
}

export function parseHookRetires(part2Md) {
  const section = extractSection(
    part2Md,
    "Hook Patterns? to Retire|Patterns? to Retire|Retire(?:d)? Hooks?|Hooks? to Avoid"
  );
  if (!section) return null;
  const items = splitItems(section);
  if (!items.length) return null;
  return items.map((it) => {
    const bullets = bulletList(it.body);
    return {
      type: it.title.replace(/[*_`]/g, "").toUpperCase(),
      evidence:
        bullets.find((b) => /used in|avg|average|posts/i.test(b)) ||
        bullets[0] ||
        it.body.replace(/^[-*•]\s+/gm, "").trim(),
    };
  });
}

// ----- REEL STRUCTURE PARSER -----

// Looks for a pipeline like: HOOK (5s) → CONTEXT (15s) → TENSION (20s) → ...
const STAGE_RE =
  /\b(HOOK|CONTEXT|TENSION|TURN|PROOF|TEACH|CTA|SETUP|REVEAL|PAYOFF|STORY|PROBLEM|SOLUTION|DEMO|EXAMPLE|CALLBACK|TRANSITION)\b/gi;

export function parseReelStructure(part3Md) {
  const section = extractSection(
    part3Md,
    "Reel Structure Blueprint|Dominant Structure|Section.?by.?Section|Video Structure"
  );
  if (!section) return null;

  // Try to find a single line that contains the arrow-separated pipeline.
  const arrowLine = section
    .split(/\r?\n/)
    .find((line) => /[→>=–-]/.test(line) && (line.match(STAGE_RE) || []).length >= 3);

  let stages = null;
  if (arrowLine) {
    const parts = arrowLine.split(/\s*(?:→|=>|->|»)\s*/);
    stages = parts
      .map((p) => {
        const stageMatch = p.match(STAGE_RE);
        const secMatch = p.match(/(\d+)\s*s/i);
        if (!stageMatch) return null;
        return {
          name: stageMatch[0].toUpperCase(),
          seconds: secMatch ? Number(secMatch[1]) : null,
          examples: [],
        };
      })
      .filter(Boolean);
  }

  if (!stages || stages.length < 2) {
    // Fallback: find stage names with seconds in any order.
    const matches = [...section.matchAll(/\b(HOOK|CONTEXT|TENSION|TURN|PROOF|TEACH|CTA|SETUP|REVEAL|PAYOFF|STORY|PROBLEM|SOLUTION|DEMO|EXAMPLE)\b[^\d\n]{0,30}(\d+)\s*s/gi)];
    if (matches.length >= 2) {
      stages = matches.map((m) => ({
        name: m[1].toUpperCase(),
        seconds: Number(m[2]),
        examples: [],
      }));
    }
  }

  if (!stages || stages.length < 2) return null;

  const breakdowns = parseTopBreakdowns(part3Md);
  return { stages, breakdowns: breakdowns || [] };
}

function parseTopBreakdowns(part3Md) {
  const section = extractSection(
    part3Md,
    "Top 3 Performance Breakdowns?|Top.?Performing Breakdowns?|Performance Breakdowns?"
  );
  if (!section) return null;
  const items = splitItems(section);
  if (!items.length) return null;
  return items.slice(0, 3).map((it) => {
    const viewsMatch = it.title.match(/([\d,]+)\s*(?:views?|plays?)/i);
    return {
      title: it.title.replace(/[*_`]/g, "").trim(),
      views: viewsMatch ? firstNumber(viewsMatch[1]) : null,
      body: it.body,
    };
  });
}

// ----- EMOTIONAL BLUEPRINT PARSER -----

const EMOTIONS = [
  "ASPIRATION",
  "FRUSTRATION VALIDATION",
  "FRUSTRATION",
  "CURIOSITY",
  "FEAR OF MISSING OUT",
  "FOMO",
  "IDENTITY PRIDE",
  "IDENTITY",
  "LOYALTY/BETRAYAL",
  "LOYALTY",
  "BETRAYAL",
  "AUTHORITY TRUST",
  "AUTHORITY",
  "ENTERTAINMENT",
  "VULNERABILITY",
  "ANGER",
  "HOPE",
];

const EMOTION_COLORS = {
  ASPIRATION: "#F39C12",
  "FRUSTRATION VALIDATION": "#E74C3C",
  FRUSTRATION: "#E74C3C",
  CURIOSITY: "#3498DB",
  "FEAR OF MISSING OUT": "#9B59B6",
  FOMO: "#9B59B6",
  "IDENTITY PRIDE": "#C9A84C",
  IDENTITY: "#C9A84C",
  "LOYALTY/BETRAYAL": "#E67E22",
  LOYALTY: "#E67E22",
  BETRAYAL: "#E67E22",
  "AUTHORITY TRUST": "#2ECC71",
  AUTHORITY: "#2ECC71",
  ENTERTAINMENT: "#1ABC9C",
  VULNERABILITY: "#A78BFA",
  ANGER: "#EF4444",
  HOPE: "#10B981",
};

export function emotionColor(name) {
  if (!name) return "#8892A4";
  const key = String(name).toUpperCase().trim();
  return EMOTION_COLORS[key] || "#C9A84C";
}

function findEmotion(text) {
  if (!text) return null;
  const upper = text.toUpperCase();
  // longest match wins
  const sorted = [...EMOTIONS].sort((a, b) => b.length - a.length);
  for (const e of sorted) {
    if (upper.includes(e)) return e;
  }
  return null;
}

export function parseEmotionalArc(part3Md) {
  const section = extractSection(
    part3Md,
    "Emotional Arc|Emotional Blueprint|Emotional DNA|Emotional Mapping"
  );
  if (!section) return null;

  const stages = ["OPEN", "MID", "CLOSE"];
  const arc = stages.map((label) => {
    // Look for line like:  - OPEN: ASPIRATION ...
    const lineRe = new RegExp(`(?:^|\\n)\\s*[-*•]?\\s*\\*?\\*?${label}(?:ING)?\\*?\\*?\\s*[:：—-]\\s*([^\\n]+)`, "i");
    const m = section.match(lineRe);
    const emotion = m ? findEmotion(m[1]) : null;
    return { label, emotion };
  });

  if (!arc.some((s) => s.emotion)) return null;

  // Intensity distribution
  const intensitySection = extractSection(part3Md, "Intensity Distribution|Intensity") || section;
  const intensity = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const key of ["LOW", "MEDIUM", "HIGH"]) {
    const re = new RegExp(`${key}[^%]*?(\\d{1,3})\\s*%`, "i");
    const m = intensitySection.match(re);
    if (m) intensity[key] = Number(m[1]);
  }

  // Vulnerability
  const vulnRe = /vulnerabilit[yi][^.]*?(?:avg|average)?[^.]*?([\d,]+)[^.]*?(?:vs|versus)[^.]*?([\d,]+)/i;
  const vMatch = section.match(vulnRe);
  const vulnerability = vMatch
    ? { withAvg: firstNumber(vMatch[1]), withoutAvg: firstNumber(vMatch[2]) }
    : null;

  // Emotion to avoid
  const avoidRe = /(?:avoid|bottom\s+performers?)[^.]*?:?\s*([A-Z][A-Z\s/]+)/;
  const aMatch = section.match(avoidRe);
  const avoid = aMatch ? findEmotion(aMatch[1]) : null;

  return { arc, intensity, vulnerability, avoid };
}
