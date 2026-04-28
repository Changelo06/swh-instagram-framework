import {
  audioOriginalVsLicensed,
  captionSnippet,
  engagement,
  engagementRate,
  topByEngagement,
  topHashtags,
  viewsByDayOfWeek,
  viewsByDuration,
  views,
} from "./insights.js";

// ---------- File download helper ----------

export function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- CSV stringify ----------

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  return lines.join("\n");
}

// ---------- Exports ----------

export function downloadEnrichedCsv(rows, baseName) {
  if (!rows?.length) return;
  // Strip internal bookkeeping fields when exporting back to the user.
  const clean = rows.map(({ _audioUrl, _audioSourceField, ...rest }) => rest);
  const csv = rowsToCsv(clean);
  triggerDownload(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    `${baseName}-transcribed.csv`
  );
}

export function downloadInsightsCsv(rows, baseName) {
  if (!rows?.length) return;

  const sections = [];

  // 1. Top 20 posts by engagement
  sections.push("# Top 20 posts by engagement");
  const top = topByEngagement(rows, 20).map((r) => ({
    rank: undefined, // filled below
    caption: captionSnippet(r, 120),
    views: views(r),
    likes: r.likesCount || 0,
    comments: r.commentsCount || 0,
    engagement: engagement(r),
    engagement_rate_pct: Number(engagementRate(r).toFixed(2)),
    duration_s: r.videoDuration || "",
    timestamp: r.timestamp || "",
    url: r.url || "",
  }));
  top.forEach((t, i) => (t.rank = i + 1));
  sections.push(rowsToCsv(top));
  sections.push("");

  // 2. Views by duration bucket
  sections.push("# Average views by duration bucket");
  sections.push(rowsToCsv(viewsByDuration(rows)));
  sections.push("");

  // 3. Views by day of week
  sections.push("# Average views by day of week");
  sections.push(rowsToCsv(viewsByDayOfWeek(rows)));
  sections.push("");

  // 4. Audio original vs licensed
  sections.push("# Original vs licensed audio");
  sections.push(rowsToCsv(audioOriginalVsLicensed(rows)));
  sections.push("");

  // 5. Top hashtags
  sections.push("# Top hashtags");
  sections.push(rowsToCsv(topHashtags(rows, 25)));

  triggerDownload(
    new Blob([sections.join("\n")], { type: "text/csv;charset=utf-8" }),
    `${baseName}-insights.csv`
  );
}

export function downloadMarkdown(report, fileNameOrBase) {
  // Backwards compatible: if `fileNameOrBase` already ends in .md, use it as-is;
  // otherwise treat as a base name and append the legacy `-framework.md` suffix.
  const name =
    typeof fileNameOrBase === "string" && /\.md$/i.test(fileNameOrBase)
      ? fileNameOrBase
      : `${fileNameOrBase}-framework.md`;
  triggerDownload(
    new Blob([report], { type: "text/markdown;charset=utf-8" }),
    name
  );
}

export async function downloadFrameworkZip(framework, handle) {
  const { default: JSZip } = await import("jszip");
  const date = new Date().toISOString().split("T")[0];
  const cleanHandle = String(handle || "creator").replace(/^@/, "");
  const zip = new JSZip();

  const part1Name = `@${cleanHandle}_Part1_DataAnalysis_${date}.md`;
  const part2Name = `@${cleanHandle}_Part2_ContentStrategy_${date}.md`;
  const part3Name = `@${cleanHandle}_Part3_Scripts_${date}.md`;
  const fullName = `@${cleanHandle}_FullFramework_${date}.md`;

  if (framework.part1) zip.file(part1Name, framework.part1);
  if (framework.part2) zip.file(part2Name, framework.part2);
  if (framework.part3) zip.file(part3Name, framework.part3);

  const combined = [
    `# SWH CONTENT FRAMEWORK — @${cleanHandle}`,
    "",
    `Generated: ${date}`,
    "",
    "---",
    "",
    framework.part1 || "",
    "",
    "---",
    "",
    framework.part2 || "",
    "",
    "---",
    "",
    framework.part3 || "",
  ].join("\n");
  zip.file(fullName, combined);

  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `@${cleanHandle}_SWHFramework_${date}.zip`);
}

export function frameworkPartFilename(handle, partLabel, ext = "md") {
  const date = new Date().toISOString().split("T")[0];
  const cleanHandle = String(handle || "creator").replace(/^@/, "");
  return `@${cleanHandle}_${partLabel}_${date}.${ext}`;
}

// .txt — drop common markdown formatting so the file reads cleanly in any editor.
function markdownToPlainText(md) {
  if (!md) return "";
  return md
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?|```/g, "")) // strip fences
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, (m) => m) // leave numbered lists
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

export function downloadText(content, filename) {
  triggerDownload(
    new Blob([markdownToPlainText(content)], { type: "text/plain;charset=utf-8" }),
    filename
  );
}

// Save the transcribed reels as a single, human-readable .txt file.
// One block per post: rank, caption snippet, views, then the transcript.
export function downloadTranscriptsTxt(rows, handle) {
  if (!rows?.length) return;

  const TRANSCRIPT_KEY = "reel-transcript";
  const transcribed = rows
    .map((r, i) => ({ ...r, _idx: i }))
    .filter((r) => {
      const t = r[TRANSCRIPT_KEY] || r.transcript;
      return t && String(t).trim().length > 0;
    })
    .sort((a, b) => views(b) - views(a));

  if (!transcribed.length) {
    triggerDownload(
      new Blob(["No transcripts available in this dataset."], { type: "text/plain" }),
      `@${String(handle || "creator").replace(/^@/, "")}_transcripts.txt`
    );
    return;
  }

  const date = new Date().toISOString().split("T")[0];
  const cleanHandle = String(handle || "creator").replace(/^@/, "");

  const blocks = transcribed.map((r, i) => {
    const transcript = String(r[TRANSCRIPT_KEY] || r.transcript || "").trim();
    const caption = String(r.caption || "").trim().replace(/\s+/g, " ");
    const v = views(r);
    const likes = Number(r.likesCount) || 0;
    const comments = Number(r.commentsCount) || 0;
    const ts = r.timestamp || "";
    const url = r.url || "";
    return [
      `─────────────────────────────────────────────────────────`,
      `#${i + 1} · ${v.toLocaleString()} views · ${likes.toLocaleString()} likes · ${comments.toLocaleString()} comments`,
      ts ? `Posted: ${ts}` : null,
      url ? `URL: ${url}` : null,
      caption ? `\nCAPTION:\n${caption}` : null,
      `\nTRANSCRIPT:\n${transcript}`,
      ``,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const header = [
    `SWH INSTAGRAM TRANSCRIPTS — @${cleanHandle}`,
    `Generated: ${date}`,
    `Total transcripts: ${transcribed.length}`,
    ``,
  ].join("\n");

  triggerDownload(
    new Blob([header + blocks.join("\n")], { type: "text/plain;charset=utf-8" }),
    `@${cleanHandle}_transcripts_${date}.txt`
  );
}

// PDF export of a markdown string. Renders the markdown into an in-viewport
// but visually hidden container styled like the in-app `.report` block, then
// snapshots it via html2pdf.js.
//
// Why not off-screen? html2canvas (used internally by html2pdf.js) measures
// elements via getBoundingClientRect — when an element is positioned at
// `left: -10000px` some browsers report 0×0 or skip it, producing an empty
// PDF. Putting it on-screen with `opacity:0` + `pointer-events:none` keeps
// html2canvas happy without showing a flash to the user.
export async function downloadMarkdownPdf(md, filename) {
  if (!md) {
    console.warn("[pdf] empty markdown — nothing to export");
    return;
  }

  let html2pdfMod;
  let html;
  try {
    const [
      { renderToStaticMarkup },
      ReactMod,
      ReactMarkdownMod,
      remarkGfmMod,
      pdfMod,
    ] = await Promise.all([
      import("react-dom/server"),
      import("react"),
      import("react-markdown"),
      import("remark-gfm"),
      import("html2pdf.js"),
    ]);
    html2pdfMod = pdfMod;

    // The `react` namespace import exposes named exports directly with Vite,
    // but defensively fall back to `.default` in case bundler interop differs.
    const createElement = ReactMod.createElement || ReactMod.default?.createElement;
    const ReactMarkdown = ReactMarkdownMod.default || ReactMarkdownMod;
    const remarkGfm = remarkGfmMod.default || remarkGfmMod;

    html = renderToStaticMarkup(
      createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, md)
    );
  } catch (e) {
    console.error("[pdf] failed to render markdown to HTML", e);
    alert("PDF export failed while rendering the report. See console for details.");
    return;
  }

  // Two-element trick: a 0×0 clipping wrapper hides the source visually
  // (overflow:hidden + max-height:0) while the inner `container` keeps its
  // full layout box. html2canvas snapshots the inner container directly and
  // sees real width/height with all text. Crucially we do NOT set opacity:0
  // on either node — html2canvas respects opacity, so opacity:0 produces a
  // PDF with the background color but invisible text.
  const clip = document.createElement("div");
  clip.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "width:0",
    "height:0",
    "max-width:0",
    "max-height:0",
    "overflow:hidden",
    "pointer-events:none",
    "z-index:-1",
  ].join(";");

  const container = document.createElement("div");
  container.className = "report pdf-export";
  container.style.cssText = [
    "width:800px",
    "background:#0a1628",
    "color:#cbd5e1",
    "padding:24px",
    "font-family:'Inter',system-ui,sans-serif",
  ].join(";");
  container.innerHTML = html;

  clip.appendChild(container);
  document.body.appendChild(clip);

  // Wait one frame so the browser computes layout (and applies the global
  // `.report` stylesheet) before html2canvas measures. Also wait briefly
  // for any web fonts that haven't finished loading.
  await new Promise((r) => requestAnimationFrame(() => r()));
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }
  await new Promise((r) => setTimeout(r, 50));

  try {
    const factory = html2pdfMod.default || html2pdfMod;
    await factory()
      .set({
        margin: [12, 14, 14, 14],
        filename,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: 2,
          backgroundColor: "#0a1628",
          useCORS: true,
          windowWidth: 800,
          // Force the container's full scrollHeight so multi-page reports
          // aren't clipped at the viewport.
          height: container.scrollHeight,
          windowHeight: container.scrollHeight,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(container)
      .save();
  } catch (e) {
    console.error("[pdf] html2pdf failed", e);
    alert(`PDF export failed: ${e.message || e}. See console for details.`);
  } finally {
    clip.remove();
  }
}

// ---------- PDF (uses html2pdf.js, dynamically imported) ----------

export async function downloadPdf({ element, baseName, filename }) {
  if (!element) return;
  const { default: html2pdf } = await import("html2pdf.js");
  await html2pdf()
    .set({
      margin: [12, 14, 14, 14],
      filename: `${baseName}-${filename || "report"}.pdf`,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: {
        scale: 2,
        backgroundColor: "#0a1628",
        useCORS: true,
        windowWidth: element.scrollWidth,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    })
    .from(element)
    .save();
}
