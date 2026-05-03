// Universal export helpers for analyses, variations, and dataset rows.
// Formats: csv, json, txt, pdf.

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

function safeName(s, fallback = "swh-export") {
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
  // Escape quotes by doubling, wrap in quotes if needed.
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

// ---------- PDF ----------

export async function exportPdf(filename, text, { title } = {}) {
  // html2pdf is heavy → import dynamically so it doesn't bloat the main bundle.
  const mod = await import("html2pdf.js");
  const html2pdf = mod.default || mod;

  const container = document.createElement("div");
  container.style.padding = "24px";
  container.style.background = "var(--tac-bg)";
  container.style.color = "var(--tac-fg)";
  container.style.fontFamily = "JetBrains Mono, monospace";
  container.style.fontSize = "11px";
  container.style.lineHeight = "1.55";
  container.style.whiteSpace = "pre-wrap";
  container.style.width = "780px";
  container.style.minHeight = "1000px";

  const heading = document.createElement("div");
  heading.style.fontFamily = "Archivo Black, Impact, sans-serif";
  heading.style.fontSize = "20px";
  heading.style.color = "#4f8dfe";
  heading.style.letterSpacing = "0.04em";
  heading.style.textTransform = "uppercase";
  heading.style.marginBottom = "12px";
  heading.textContent = title || filename;

  const ruler = document.createElement("div");
  ruler.style.height = "1px";
  ruler.style.background = "var(--tac-border)";
  ruler.style.margin = "0 0 16px 0";

  const body = document.createElement("div");
  body.textContent = text || "(empty)";

  container.appendChild(heading);
  container.appendChild(ruler);
  container.appendChild(body);

  document.body.appendChild(container);
  try {
    await html2pdf()
      .set({
        margin: 12,
        filename: ensureExt(filename, ".pdf"),
        image: { type: "jpeg", quality: 0.92 },
        html2canvas: {
          scale: 2,
          backgroundColor: "var(--tac-bg)",
        },
        jsPDF: { unit: "pt", format: "a4", orientation: "portrait" },
      })
      .from(container)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}

function ensureExt(name, ext) {
  if (!name) return `swh-export-${ts()}${ext}`;
  return name.toLowerCase().endsWith(ext) ? name : `${name}${ext}`;
}

// ---------- domain-specific bundles ----------

export function exportAnalysis(format, analysis, baseName) {
  const fname = `${safeName(baseName, "swh-analysis")}-${analysis.mode}-${ts()}`;
  if (format === "txt") return exportText(fname, analysis.text || "");
  if (format === "json")
    return exportJson(fname, {
      kind: "analysis",
      mode: analysis.mode,
      startedAt: analysis.startedAt,
      status: analysis.status,
      usage: analysis.usage || null,
      text: analysis.text || "",
    });
  if (format === "csv") return exportAnalysisCsv(fname, analysis.text || "");
  if (format === "pdf")
    return exportPdf(fname, analysis.text || "", {
      title: `${analysis.mode.toUpperCase()} ANALYSIS · ${baseName || ""}`,
    });
}

export function exportVariation(format, variation, baseName) {
  const fname = `${safeName(baseName, "swh-variation")}-${safeName(
    variation.name
  )}-${ts()}`;
  if (format === "txt") return exportText(fname, variation.text || "");
  if (format === "json")
    return exportJson(fname, {
      kind: "variation",
      name: variation.name,
      sourceVideo: variation.sourceVideo,
      count: variation.count,
      startedAt: variation.startedAt,
      status: variation.status,
      usage: variation.usage || null,
      text: variation.text || "",
    });
  if (format === "csv") return exportAnalysisCsv(fname, variation.text || "");
  if (format === "pdf")
    return exportPdf(fname, variation.text || "", {
      title: `SCRIPT VARIATION · ${variation.name}`,
    });
}

export function exportDataset(format, rows, baseName) {
  const fname = `${safeName(baseName, "swh-dataset")}-${ts()}`;
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
