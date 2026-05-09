import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Plus,
  Stop,
  Trash,
  CheckCircle,
  XCircle,
  Clock,
  Microphone,
  ArrowsCounterClockwise,
  CaretDown,
  CaretRight,
  Folder,
  FolderOpen,
  FileText,
  FilmReel,
  Copy,
} from "@phosphor-icons/react";
import { useCsv, STAGE, ALL_HANDLE } from "../state/CsvContext.jsx";
import EmptyHint from "../widgets/EmptyHint.jsx";
import ExportMenu from "../widgets/ExportMenu.jsx";
import CreateVariationModal from "../widgets/CreateVariationModal.jsx";
import ConfirmAction from "../widgets/ConfirmAction.jsx";
import { exportVariation } from "../lib/exporters.js";

const PAGE_CAP = 12;

export default function ScriptsView() {
  const {
    stage,
    rows,
    filename,
    selectedCreator,
    selectedHandle,
    setSelectedHandle,
    creators,
    variations,
    activeVariationId,
    setActiveVariationId,
    stopVariation,
    removeVariation,
    retryVariation,
  } = useCsv();

  const [modalOpen, setModalOpen] = useState(false);
  // Selection covers both folders (scriptIdx: null) and files (scriptIdx: N).
  const [selection, setSelection] = useState({
    variationId: activeVariationId,
    scriptIdx: null,
  });
  // Folder expansion: a Set of variationIds. The active folder is always expanded.
  const [expanded, setExpanded] = useState(
    () => new Set(activeVariationId ? [activeVariationId] : [])
  );

  // Keep selection in sync with the global activeVariationId — when it changes
  // (e.g. a fresh generation just landed), drop to the folder overview.
  useEffect(() => {
    if (activeVariationId !== selection.variationId) {
      setSelection({ variationId: activeVariationId, scriptIdx: null });
      if (activeVariationId) {
        setExpanded((prev) => {
          if (prev.has(activeVariationId)) return prev;
          const next = new Set(prev);
          next.add(activeVariationId);
          return next;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVariationId]);

  // Variation forging targets a single creator's reels — drop out of the
  // unified ALL filter back to the first creator on entry so the modal's
  // source-video list isn't a confused blend.
  useEffect(() => {
    if (selectedHandle === ALL_HANDLE && creators.length > 0) {
      setSelectedHandle(creators[0].handle);
    }
  }, [selectedHandle, creators, setSelectedHandle]);

  if (stage !== STAGE.READY || !rows.length) {
    return <EmptyHint />;
  }

  const active = variations.find((v) => v.id === selection.variationId) || null;
  const baseName = `${(filename || "chiqo-variation").replace(/\.csv$/i, "")}${
    selectedCreator?.handle ? `-${selectedCreator.handle}` : ""
  }`;

  const atCap = variations.length >= PAGE_CAP;
  const tryOpen = () => {
    if (!atCap) setModalOpen(true);
  };

  const handleCreated = (id) => {
    if (!id) return;
    setActiveVariationId(id);
    setSelection({ variationId: id, scriptIdx: null });
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleSelectFolder = (vid) => {
    setActiveVariationId(vid);
    setSelection({ variationId: vid, scriptIdx: null });
    // Expanding the folder when its overview opens is the natural file-manager
    // behavior — collapsing only happens when the user explicitly toggles the
    // chevron on an inactive folder.
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(vid);
      return next;
    });
  };

  const handleToggleExpand = (vid, e) => {
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(vid)) next.delete(vid);
      else next.add(vid);
      return next;
    });
  };

  const handleSelectScript = (vid, idx) => {
    setActiveVariationId(vid);
    setSelection({ variationId: vid, scriptIdx: idx });
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(vid);
      return next;
    });
  };

  return (
    <>
      <section
        style={{
          display: "grid",
          gridTemplateRows: "1fr",
          gap: 0,
          background: "var(--tac-bg)",
          minHeight: "calc(100dvh - 44px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "280px 1fr",
            gap: 0,
            background: "var(--tac-bg)",
          }}
        >
          <aside
            style={{
              background: "var(--tac-surface)",
              borderRight: "1px solid var(--tac-border)",
              display: "grid",
              gridTemplateRows: "auto 1fr",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid var(--tac-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontFamily:
                    '"Inter", ui-sans-serif, system-ui, sans-serif',
                  fontSize: 12,
                  color: "var(--tac-mute)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {variations.length} of {PAGE_CAP} folders
              </span>
              <button
                type="button"
                onClick={tryOpen}
                disabled={atCap}
                className="tac-btn tac-btn-accent"
                style={{
                  padding: "5px 10px",
                  fontSize: 12,
                  opacity: atCap ? 0.4 : 1,
                  cursor: atCap ? "not-allowed" : "pointer",
                }}
                title={
                  atCap
                    ? `Folder cap reached (${PAGE_CAP} max)`
                    : "New script folder"
                }
              >
                <Plus size={12} weight="bold" />
                New
              </button>
            </div>

            <div style={{ overflowY: "auto", padding: "6px 0" }}>
              {variations.length === 0 ? (
                <div
                  style={{
                    padding: "16px 14px",
                    color: "var(--tac-mute)",
                    fontFamily:
                      '"Inter", ui-sans-serif, system-ui, sans-serif',
                    fontSize: 12,
                    lineHeight: 1.6,
                  }}
                >
                  No script folders yet. Click <strong>New</strong> to generate
                  scripts from any reel in the dataset.
                </div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {[...variations].reverse().map((v) => (
                    <FolderRow
                      key={v.id}
                      variation={v}
                      isExpanded={expanded.has(v.id)}
                      activeVariationId={selection.variationId}
                      activeScriptIdx={selection.scriptIdx}
                      onSelectFolder={() => handleSelectFolder(v.id)}
                      onToggleExpand={(e) => handleToggleExpand(v.id, e)}
                      onSelectScript={(idx) =>
                        handleSelectScript(v.id, idx)
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          </aside>

          <div
            style={{
              background: "var(--tac-bg)",
              display: "grid",
              gridTemplateRows: "auto 1fr",
              overflow: "hidden",
            }}
          >
            {active ? (
              <ContentPanel
                variation={active}
                activeScriptIdx={selection.scriptIdx}
                onSelectScript={(idx) =>
                  setSelection({ variationId: active.id, scriptIdx: idx })
                }
                backToFolder={() =>
                  setSelection({ variationId: active.id, scriptIdx: null })
                }
                stop={stopVariation}
                remove={(id) => {
                  removeVariation(id);
                  setSelection({ variationId: null, scriptIdx: null });
                }}
                retry={retryVariation}
                baseName={baseName}
              />
            ) : (
              <BlankFolder onCreate={tryOpen} atCap={atCap} cap={PAGE_CAP} />
            )}
          </div>
        </div>
      </section>

      <CreateVariationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
        slotsAvailable={Math.max(0, PAGE_CAP - variations.length)}
      />
    </>
  );
}

// ============================================================
// Sidebar — folder tree
// ============================================================

function FolderRow({
  variation,
  isExpanded,
  activeVariationId,
  activeScriptIdx,
  onSelectFolder,
  onToggleExpand,
  onSelectScript,
}) {
  const scripts = useMemo(() => parseScripts(variation.text), [variation.text]);
  const isFolderActive =
    variation.id === activeVariationId && activeScriptIdx === null;
  const Caret = isExpanded ? CaretDown : CaretRight;
  const FolderIcon = isExpanded ? FolderOpen : Folder;

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelectFolder}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectFolder();
          }
        }}
        style={{
          display: "grid",
          gridTemplateColumns: "16px 16px 1fr auto",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px 8px 6px",
          margin: "1px 6px",
          borderRadius: 6,
          cursor: "pointer",
          background: isFolderActive ? "var(--tac-surface2)" : "transparent",
          color: isFolderActive ? "var(--tac-fg)" : "var(--tac-mute)",
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
          fontSize: 13,
          transition: "background 100ms, color 100ms",
        }}
        onMouseEnter={(e) => {
          if (!isFolderActive) {
            e.currentTarget.style.color = "var(--tac-fg)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isFolderActive) {
            e.currentTarget.style.color = "var(--tac-mute)";
          }
        }}
      >
        <button
          type="button"
          aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
          onClick={onToggleExpand}
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            display: "grid",
            placeItems: "center",
            padding: 0,
            width: 16,
            height: 16,
            cursor: "pointer",
          }}
        >
          <Caret size={12} weight="bold" />
        </button>
        <FolderIcon
          size={15}
          weight="regular"
          color={
            isFolderActive ? "var(--tac-accent)" : "var(--tac-mute)"
          }
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: isFolderActive ? 500 : 400,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={variation.name}
          >
            {variation.name}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--tac-mute)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {variation.count} script{variation.count === 1 ? "" : "s"}
            {variation.sourceVideo?.handle &&
              ` · @${variation.sourceVideo.handle}`}
          </div>
        </div>
        <StatusDot status={variation.status} />
      </div>

      {isExpanded && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {scripts.length === 0 && variation.status === "running" && (
            <li
              style={{
                padding: "6px 10px 6px 38px",
                margin: "1px 6px",
                fontSize: 12,
                color: "var(--tac-mute)",
                fontStyle: "italic",
              }}
            >
              Generating…
            </li>
          )}
          {scripts.map((s, idx) => (
            <ScriptFileRow
              key={s.id}
              fileName={s.fileName}
              title={s.title}
              isActive={
                variation.id === activeVariationId &&
                activeScriptIdx === idx
              }
              onClick={() => onSelectScript(idx)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function ScriptFileRow({ fileName, title, isActive, onClick }) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        style={{
          display: "grid",
          gridTemplateColumns: "16px 1fr",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px 6px 32px",
          margin: "1px 6px",
          borderRadius: 6,
          cursor: "pointer",
          background: isActive ? "var(--tac-surface2)" : "transparent",
          color: isActive ? "var(--tac-fg)" : "var(--tac-mute)",
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
          fontSize: 12.5,
          transition: "background 100ms, color 100ms",
          borderLeft: isActive
            ? "2px solid var(--tac-accent)"
            : "2px solid transparent",
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.color = "var(--tac-fg)";
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.color = "var(--tac-mute)";
        }}
      >
        <FileText
          size={13}
          weight="regular"
          color={isActive ? "var(--tac-accent)" : "var(--tac-dim)"}
        />
        <div
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontWeight: isActive ? 500 : 400,
          }}
          title={title ? `${fileName} · ${title}` : fileName}
        >
          {fileName}
          {title && (
            <span style={{ color: "var(--tac-mute)", marginLeft: 6 }}>
              · {title}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

// ============================================================
// Content panel — folder overview vs single script document
// ============================================================

function ContentPanel({
  variation,
  activeScriptIdx,
  onSelectScript,
  backToFolder,
  stop,
  remove,
  retry,
  baseName,
}) {
  const isRunning = variation.status === "running";
  const isDone = variation.status === "done";
  const containerRef = useRef(null);
  const lastLenRef = useRef(0);
  const [autoScroll, setAutoScroll] = useState(true);
  // The "Done" pill shows for a couple of seconds when the user opens a
  // finished folder (or when the run lands while they're watching), then
  // fades away — we don't want a permanent "done" badge.
  const [showStatusPill, setShowStatusPill] = useState(true);
  useEffect(() => {
    setShowStatusPill(true);
    if (variation.status === "done") {
      const t = setTimeout(() => setShowStatusPill(false), 3000);
      return () => clearTimeout(t);
    }
  }, [variation.id, variation.status]);

  const scripts = useMemo(() => parseScripts(variation.text), [variation.text]);
  const activeScript =
    activeScriptIdx != null && activeScriptIdx >= 0
      ? scripts[activeScriptIdx]
      : null;

  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;
    if (variation.text.length === lastLenRef.current) return;
    lastLenRef.current = variation.text.length;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [variation.text, autoScroll]);

  const exportPayloadFolder = () => variation;
  const exportPayloadScript = (script) => ({
    ...variation,
    text: script.body,
    name: `${variation.name} - ${script.fileName}${
      script.title ? ` - ${script.title}` : ""
    }`,
  });
  const exportNameScript = (script) =>
    `${baseName}-${slugify(script.fileName)}${
      script.title ? `-${slugify(script.title)}` : ""
    }`;

  const onCopyScript = async (script) => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script.body);
    } catch (err) {
      console.warn("clipboard copy failed", err);
    }
  };

  return (
    <>
      <header
        style={{
          background: "var(--tac-surface)",
          borderBottom: "1px solid var(--tac-border)",
          padding: "16px 24px",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <div
            className="tac-section-title"
            style={{
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              wordBreak: "break-word",
              overflowWrap: "anywhere",
              minWidth: 0,
            }}
          >
            {activeScript && (
              <>
                <button
                  type="button"
                  onClick={backToFolder}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    color: "var(--tac-mute)",
                    fontFamily:
                      '"Inter", ui-sans-serif, system-ui, sans-serif',
                    fontSize: 15,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "var(--tac-accent)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "var(--tac-mute)")
                  }
                >
                  {variation.name}
                </button>
                <span style={{ color: "var(--tac-dim)" }}>/</span>
                <span>{activeScript.fileName}</span>
                {activeScript.title && (
                  <span
                    style={{
                      color: "var(--tac-mute)",
                      fontWeight: 400,
                    }}
                  >
                    — {activeScript.title}
                  </span>
                )}
              </>
            )}
            {!activeScript && variation.name}
          </div>
          <SourceLine src={variation.sourceVideo || {}} count={variation.count} />
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {showStatusPill && <RunMeta variation={variation} />}
          {isRunning ? (
            <button
              type="button"
              onClick={() => stop(variation.id)}
              aria-label="Stop run"
              className="tac-btn tac-btn-danger"
              style={{ padding: "6px 12px", fontSize: 12 }}
            >
              <Stop size={12} weight="fill" />
              Stop
            </button>
          ) : activeScript ? (
            <>
              <button
                type="button"
                onClick={() => onCopyScript(activeScript)}
                className="tac-btn"
                style={{ padding: "6px 12px", fontSize: 12 }}
                title="Copy script markdown to clipboard"
              >
                <Copy size={12} weight="regular" />
                Copy
              </button>
              <ExportMenu
                label="Export"
                disabled={variation.status !== "done"}
                onExport={(fmt) =>
                  exportVariation(
                    fmt,
                    exportPayloadScript(activeScript),
                    exportNameScript(activeScript)
                  )
                }
              />
            </>
          ) : (
            <>
              {!isDone && (
                <ConfirmAction
                  onConfirm={() => retry(variation.id)}
                  label="Retry"
                  armedLabel="Confirm retry"
                  Icon={ArrowsCounterClockwise}
                  tone="warn"
                  title="Re-run the transcribe + script generation pass — current folder is replaced."
                />
              )}
              <ExportMenu
                label="Export all"
                disabled={variation.status !== "done"}
                onExport={(fmt) =>
                  exportVariation(fmt, exportPayloadFolder(), baseName)
                }
              />
            </>
          )}
          <button
            type="button"
            onClick={() => remove(variation.id)}
            disabled={isRunning}
            aria-label="Delete folder"
            className="tac-btn"
            style={{
              padding: "6px 10px",
              fontSize: 12,
              opacity: isRunning ? 0.4 : 1,
            }}
          >
            <Trash size={12} weight="regular" />
          </button>
        </div>
      </header>

      <div
        ref={containerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          setAutoScroll(atBottom);
        }}
        style={{
          padding: "24px 24px 32px",
          overflowY: "auto",
        }}
      >
        {variation.phase === "transcribing" && (
          <div style={{ maxWidth: 820, margin: "0 auto 16px" }}>
            <TranscribePanel variation={variation} />
          </div>
        )}

        {activeScript ? (
          <article className="script-document">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={DOC_MD}>
              {activeScript.body}
            </ReactMarkdown>
            {isRunning && activeScriptIdx === scripts.length - 1 && (
              <StreamingCursor />
            )}
          </article>
        ) : (
          <FolderOverview
            variation={variation}
            scripts={scripts}
            isRunning={isRunning}
            onSelectScript={onSelectScript}
          />
        )}
      </div>
    </>
  );
}

// ============================================================
// Folder overview — shown when the parent folder is selected
// ============================================================

function FolderOverview({ variation, scripts, isRunning, onSelectScript }) {
  const src = variation.sourceVideo || {};
  const expectedCount = variation.count || scripts.length;
  const pendingCount = isRunning
    ? Math.max(0, expectedCount - scripts.length)
    : 0;

  const openSource = () => {
    if (!src.url) return;
    window.open(src.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      <div className="file-grid">
        <FileBox
          icon={FilmReel}
          iconColor="var(--tac-cyan)"
          filename="source_reel.mp4"
          subtitle={src.handle ? `@${src.handle}` : "source"}
          onClick={openSource}
          disabled={!src.url}
          title={src.url ? "Open source reel in a new tab" : "No source URL available"}
        />

        {scripts.map((s, idx) => (
          <FileBox
            key={s.id}
            icon={FileText}
            iconColor="var(--tac-accent)"
            filename={s.title || `Script Variation ${s.n}`}
            subtitle={`Script Variation ${s.n}`}
            onClick={() => onSelectScript(idx)}
            title={s.title ? `${s.title} — Script Variation ${s.n}` : `Script Variation ${s.n}`}
          />
        ))}

        {Array.from({ length: pendingCount }).map((_, i) => (
          <FileBox
            key={`pending-${i}`}
            icon={FileText}
            iconColor="var(--tac-dim)"
            filename="Generating…"
            subtitle={`Script Variation ${scripts.length + i + 1}`}
            pending
          />
        ))}
      </div>
    </div>
  );
}

function FileBox({
  icon: Icon,
  iconColor,
  filename,
  subtitle,
  onClick,
  disabled,
  pending,
  title,
}) {
  const isInert = disabled || pending;
  return (
    <div
      role={isInert ? undefined : "button"}
      tabIndex={isInert ? -1 : 0}
      onClick={isInert ? undefined : onClick}
      onKeyDown={(e) => {
        if (isInert) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      title={title}
      aria-disabled={disabled || undefined}
      data-pending={pending || undefined}
      className="file-box"
    >
      <div className="file-box__icon">
        <Icon size={28} weight="regular" color={iconColor} />
      </div>
      <div style={{ display: "grid", gap: 2 }}>
        <div className="file-box__name" title={filename}>
          {filename}
        </div>
        {subtitle && (
          <div className="file-box__sub" title={subtitle}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Script parser — splits the streaming markdown into Script_N files
// ============================================================

function parseScripts(text) {
  if (!text) return [];
  const re = /^##\s+Script\s+(\d+)\s*:\s*(.*)$/gim;
  const matches = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    matches.push({
      n: parseInt(m[1], 10),
      title: (m[2] || "").trim(),
      start: m.index,
    });
  }
  if (!matches.length) return [];
  return matches.map((cur, i) => {
    const next = matches[i + 1];
    const body = text.slice(cur.start, next ? next.start : text.length).trim();
    return {
      id: `script-${cur.n}`,
      n: cur.n,
      fileName: `Script_${cur.n}`,
      title: cur.title || "",
      body,
    };
  });
}

// ============================================================
// Markdown renderer for the script document surface
// ============================================================

function paragraphText(children) {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(paragraphText).join("");
  if (children && typeof children === "object") {
    if (typeof children.props?.children !== "undefined") {
      return paragraphText(children.props.children);
    }
  }
  return "";
}

const SHOT_RE = /^\s*\[[\s\S]+\]\s*$/;
const SPOKEN_RE = /^\s*"[\s\S]+"\s*$/;
const SMART_SPOKEN_RE = /^\s*[“][\s\S]+[”]\s*$/;

const DOC_MD = {
  // The tab strip + breadcrumb already show the script title — hide the
  // markdown heading so it doesn't double up.
  h2: () => null,
  p: ({ children, node, ...rest }) => {
    const raw = paragraphText(children).trim();
    if (raw && SHOT_RE.test(raw)) {
      return <div className="script-shot">{children}</div>;
    }
    if (raw && (SPOKEN_RE.test(raw) || SMART_SPOKEN_RE.test(raw))) {
      return <div className="script-spoken">{children}</div>;
    }
    return <p {...rest}>{children}</p>;
  },
};

function StreamingCursor() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 14,
        background: "var(--tac-accent)",
        verticalAlign: "middle",
        marginLeft: 4,
        animation: "tac-pulse 1s ease-in-out infinite",
      }}
    />
  );
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// ============================================================
// Empty + status helpers
// ============================================================

function BlankFolder({ onCreate, atCap, cap }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 380,
          textAlign: "center",
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
          color: "var(--tac-mute)",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <Folder
          size={32}
          weight="regular"
          color="var(--tac-mute)"
          style={{ marginBottom: 12 }}
        />
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--tac-fg)",
            marginBottom: 6,
          }}
        >
          No script folder selected
        </div>
        <div>
          Pick a folder from the left, or create a new one to generate scripts
          from any reel in the dataset. Up to {cap} folders can stay open at
          once.
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={atCap}
          className="tac-btn tac-btn-accent"
          style={{
            marginTop: 20,
            padding: "10px 18px",
            fontSize: 13,
            opacity: atCap ? 0.4 : 1,
            cursor: atCap ? "not-allowed" : "pointer",
          }}
        >
          <Plus size={13} weight="bold" />
          {atCap ? "Folder cap reached" : "New script folder"}
        </button>
      </div>
    </div>
  );
}

function SourceLine({ src, count }) {
  if (!src || (!src.url && !src.shortCode)) {
    return (
      <div
        style={{
          fontSize: 12,
          color: "var(--tac-mute)",
          marginTop: 2,
        }}
      >
        {count} script{count === 1 ? "" : "s"} from this reel
      </div>
    );
  }
  const meta = [
    src.handle ? `@${src.handle}` : null,
    src.views != null ? `${fmt(src.views)} views` : null,
  ].filter(Boolean);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        marginTop: 4,
        fontSize: 12,
        color: "var(--tac-mute)",
      }}
    >
      <span>
        {count} script{count === 1 ? "" : "s"}
      </span>
      {meta.map((m, i) => (
        <span key={i} style={{ display: "inline-flex", gap: 8 }}>
          <span style={{ color: "var(--tac-dim)" }}>·</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{m}</span>
        </span>
      ))}
    </div>
  );
}

function RunMeta({ variation }) {
  const status = variation.status;
  const Icon =
    status === "running"
      ? Clock
      : status === "done"
      ? CheckCircle
      : status === "stopped"
      ? Stop
      : XCircle;
  const variant =
    status === "running"
      ? "accent"
      : status === "done"
      ? "ok"
      : status === "stopped"
      ? "warn"
      : "err";
  const label =
    status === "running"
      ? "Running"
      : status === "done"
      ? "Done"
      : status === "stopped"
      ? "Stopped"
      : "Error";
  return (
    <span
      className={`tac-pill tac-pill--${variant}`}
      style={{ paddingTop: 4, paddingBottom: 4 }}
    >
      <Icon size={11} weight="regular" />
      {label}
    </span>
  );
}

function TranscribePanel({ variation }) {
  const p = variation.transcribeProgress || {};
  const total = p.total || 1;
  const completed = p.completed || 0;
  const pct = Math.min(100, Math.round((completed / Math.max(total, 1)) * 100));
  const failed = p.ok === false;
  const done = completed >= total && p.ok !== false;

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        padding: "12px 14px",
        background: "var(--tac-surface)",
        border: "1px solid var(--tac-border)",
        borderRadius: 8,
        borderLeft: failed
          ? "3px solid var(--tac-danger)"
          : done
          ? "3px solid var(--tac-success)"
          : "3px solid var(--tac-accent)",
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Microphone
            size={14}
            weight="regular"
            color={
              failed
                ? "var(--tac-danger)"
                : done
                ? "var(--tac-success)"
                : "var(--tac-accent)"
            }
          />
          <span style={{ color: "var(--tac-fg)", fontWeight: 500 }}>
            {failed
              ? "Transcribe failed"
              : done
              ? "Transcribe complete"
              : "Transcribing source reel"}
          </span>
        </div>
        <span
          style={{
            fontSize: 12,
            color: "var(--tac-mute)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {completed}/{total} · {pct}%
        </span>
      </div>

      <div
        style={{
          height: 4,
          background: "var(--tac-surface-inner)",
          borderRadius: 4,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: `${pct || 4}%`,
            background: failed
              ? "var(--tac-danger)"
              : done
              ? "var(--tac-success)"
              : "var(--tac-accent)",
            borderRadius: 4,
            transition: "width 240ms ease",
            animation:
              !done && !failed ? "tac-pulse 1.6s ease-in-out infinite" : "none",
          }}
        />
      </div>

      {p.error && (
        <div style={{ color: "var(--tac-danger)", fontSize: 12 }}>{p.error}</div>
      )}
    </div>
  );
}

function StatusDot({ status }) {
  // The dot is a "needs attention" indicator. Once a folder is done, it goes
  // away — we keep it for in-flight or interrupted runs only.
  if (status === "done") return null;
  const map = {
    running: "var(--tac-accent)",
    stopped: "var(--tac-warning)",
    error: "var(--tac-danger)",
  };
  const color = map[status] || "var(--tac-mute)";
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: 9999,
        background: color,
        animation:
          status === "running"
            ? "tac-pulse 1.6s ease-in-out infinite"
            : "none",
        flexShrink: 0,
      }}
    />
  );
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
