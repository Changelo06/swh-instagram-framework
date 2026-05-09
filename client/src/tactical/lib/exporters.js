// Universal export helpers for analyses, variations, and dataset rows.
// Formats: csv, json, txt, md, pdf.

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(s, fallback = "chiqo-export") {
  if (!s) return fallback;
  return String(s).replace(/[^A-Za-z0-9_\-.]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
}

function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}`;
}

// ---------- text & markdown ----------

export function exportText(filename, text) {
  const blob = new Blob([text || ""], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, ensureExt(filename, ".txt"));
}

export function exportMarkdown(filename, text) {
  const blob = new Blob([text || ""], {
    type: "text/markdown;charset=utf-8",
  });
  downloadBlob(blob, ensureExt(filename, ".md"));
}

export function exportJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  downloadBlob(blob, ensureExt(filename, ".json"));
}

// ---------- CSV ----------

function csvField(v) {
  if (v == null) return "";
  let s = String(v);
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportCsv(filename, rows, columns) {
  const cols =
    columns ||
    (rows.length
      ? [...new Set(rows.flatMap((r) => Object.keys(r)))].filter(
          (k) => !k.startsWith("_") && k !== "transcript"
        )
      : []);
  const header = cols.map(csvField).join(",");
  const body = rows
    .map((r) => cols.map((c) => csvField(r[c])).join(","))
    .join("\n");
  const csv = `${header}\n${body}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, ensureExt(filename, ".csv"));
}

// CSV of a markdown analysis report — splits on top-level headings into rows.
export function exportAnalysisCsv(filename, text) {
  const sections = splitMarkdownSections(text || "");
  exportCsv(
    filename,
    sections.map((s, i) => ({
      index: i + 1,
      heading: s.heading,
      content: s.body,
    })),
    ["index", "heading", "content"]
  );
}

function splitMarkdownSections(md) {
  const lines = md.split("\n");
  const out = [];
  let cur = { heading: "(intro)", body: "" };
  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m) {
      if (cur.body.trim() || cur.heading !== "(intro)") out.push(cur);
      cur = { heading: m[2].trim(), body: "" };
    } else {
      cur.body += (cur.body ? "\n" : "") + line;
    }
  }
  if (cur.body.trim() || cur.heading !== "(intro)") out.push(cur);
  return out.length ? out : [{ heading: "(empty)", body: md }];
}

// ---------- Markdown -> HTML (small, scoped to script document patterns) ----------
//
// We can't use react-markdown here because the export runs inside an async
// callback that isn't wrapped in React rendering. This mini-converter handles
// the patterns the script-blueprint prompt actually emits:
//   - ##/###/####  → h2/h3/h4
//   - blank-line separated paragraphs
//   - [bracket]    → shot direction div
//   - "quote"      → spoken line div
//   - >            → blockquote
//   - - / *        → ul list
//   - **bold**     → <strong>
//
// It is NOT a full markdown parser, but it covers everything the prompt is
// instructed to produce and degrades safely on unexpected input (renders as
// regular paragraphs).
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMd(s) {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function markdownToHtml(md) {
  if (!md) return "";
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // Headings
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inlineMd(h[2])}</h${level}>`);
      i++;
      continue;
    }
    // Blockquote (one or more consecutive `>` lines).
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(`<blockquote><p>${inlineMd(buf.join(" "))}</p></blockquote>`);
      continue;
    }
    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push(
        "<ul>" + items.map((x) => `<li>${inlineMd(x)}</li>`).join("") + "</ul>"
      );
      continue;
    }
    // Paragraph (collect contiguous non-blank lines).
    const para = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|\s*[-*]\s|\s*>\s)/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    const joined = para.join(" ").trim();
    // Shot direction or spoken line classification.
    if (/^\s*\[[\s\S]+\]\s*$/.test(joined)) {
      out.push(`<div class="script-shot">${inlineMd(joined)}</div>`);
    } else if (/^\s*"[\s\S]+"\s*$/.test(joined) || /^\s*[“][\s\S]+[”]\s*$/.test(joined)) {
      out.push(`<div class="script-spoken">${inlineMd(joined)}</div>`);
    } else {
      out.push(`<p>${inlineMd(joined)}</p>`);
    }
  }
  return out.join("\n");
}

// ---------- PDF ----------
//
// Render the markdown into the same `.script-document` surface used in the
// app, then snapshot it via html2pdf.js. We use a `--print` modifier class
// that overrides every CSS-variable-driven color with a literal hex so
// html2canvas (which can't reliably resolve CSS custom properties on cloned
// nodes) reliably paints the dark cinematic look on the canvas.
export async function exportPdf(filename, text, { title } = {}) {
  const mod = await import("html2pdf.js");
  const html2pdf = mod.default || mod;

  const wrap = document.createElement("div");
  wrap.style.position = "fixed";
  wrap.style.left = "-99999px";
  wrap.style.top = "0";
  wrap.style.width = "820px";
  wrap.style.background = "#080a0a";
  wrap.style.padding = "32px";
  wrap.style.fontFamily =
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

  const article = document.createElement("article");
  article.className = "script-document script-document--print";

  const titleEl = document.createElement("h2");
  titleEl.style.margin = "0 0 18px";
  titleEl.style.color = "#f3f7f5";
  titleEl.style.fontSize = "22px";
  titleEl.style.fontWeight = "700";
  titleEl.style.letterSpacing = "-0.015em";
  titleEl.textContent = title || filename;

  const body = document.createElement("div");
  body.innerHTML = markdownToHtml(text || "");

  article.appendChild(titleEl);
  article.appendChild(body);
  wrap.appendChild(article);
  document.body.appendChild(wrap);

  try {
    await html2pdf()
      .set({
        margin: 18,
        filename: ensureExt(filename, ".pdf"),
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: 2,
          backgroundColor: "#080a0a",
          useCORS: true,
        },
        jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
      })
      .from(article)
      .save();
  } finally {
    document.body.removeChild(wrap);
  }
}

function ensureExt(name, ext) {
  if (!name) return `chiqo-export-${ts()}${ext}`;
  return name.toLowerCase().endsWith(ext) ? name : `${name}${ext}`;
}

// ---------- domain-specific bundles ----------

export function exportAnalysis(format, analysis, baseName) {
  const fname = `${safeName(baseName, "chiqo-analysis")}-${analysis.mode}-${ts()}`;
  const text = analysis.text || "";
  if (format === "txt") return exportText(fname, text);
  if (format === "md") return exportMarkdown(fname, text);
  if (format === "json")
    return exportJson(fname, {
      kind: "analysis",
      mode: analysis.mode,
      startedAt: analysis.startedAt,
      status: analysis.status,
      usage: analysis.usage || null,
      text,
    });
  if (format === "csv") return exportAnalysisCsv(fname, text);
  if (format === "pdf")
    return exportPdf(fname, text, {
      title: `${analysis.mode.toUpperCase()} ANALYSIS · ${baseName || ""}`,
    });
}

export function exportVariation(format, variation, baseName) {
  const fname = `${safeName(baseName, "chiqo-variation")}-${safeName(
    variation.name
  )}-${ts()}`;
  const text = variation.text || "";
  if (format === "txt") return exportText(fname, text);
  if (format === "md") return exportMarkdown(fname, text);
  if (format === "json")
    return exportJson(fname, {
      kind: "variation",
      name: variation.name,
      sourceVideo: variation.sourceVideo,
      count: variation.count,
      startedAt: variation.startedAt,
      status: variation.status,
      usage: variation.usage || null,
      text,
    });
  if (format === "csv") return exportAnalysisCsv(fname, text);
  if (format === "pdf")
    return exportPdf(fname, text, {
      title: variation.name || "Script",
    });
}

export function exportDataset(format, rows, baseName) {
  const fname = `${safeName(baseName, "chiqo-dataset")}-${ts()}`;
  if (format === "csv") return exportCsv(fname, rows);
  if (format === "json") return exportJson(fname, { kind: "dataset", rows });
  if (format === "txt") {
    const lines = rows
      .map((r, i) => {
        const e = Object.entries(r).filter(
          ([k]) => !k.startsWith("_") && k !== "transcript"
        );
        return [
          `--- ROW ${i + 1} ---`,
          ...e.map(([k, v]) => `  ${k}: ${v == null ? "" : String(v).slice(0, 800)}`),
        ].join("\n");
      })
      .join("\n\n");
    return exportText(fname, lines);
  }
  if (format === "pdf")
    return exportPdf(
      fname,
      rows
        .slice(0, 200)
        .map(
          (r, i) =>
            `[#${i + 1}] ` +
            ["url", "caption", "videoViewCount", "likesCount", "commentsCount"]
              .filter((k) => r[k] != null)
              .map((k) => `${k}=${String(r[k]).slice(0, 120)}`)
              .join(" · ")
        )
        .join("\n\n"),
      { title: `DATASET · ${baseName || ""}` }
    );
}
