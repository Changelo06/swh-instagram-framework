import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ArrowUp, ArrowDown, Plus, Trash } from "@phosphor-icons/react";
import { useCsv, STAGE, ALL_HANDLE } from "../state/CsvContext.jsx";
import EmptyHint from "../widgets/EmptyHint.jsx";
import ExportMenu from "../widgets/ExportMenu.jsx";
import CreatorTabs from "../widgets/CreatorTabs.jsx";
import { exportDataset } from "../lib/exporters.js";

const COL_WIDTHS = {
  boolean: 70,
  number: 110,
  date: 150,
  default: 220,
};

export default function DatasetView() {
  const {
    stage,
    rows,
    parsed,
    filename,
    selectedCreator,
    selectedHandle,
    setSelectedHandle,
    creators,
  } = useCsv();
  const { search } = useOutletContext();

  // First time the user lands on the dataset with multiple creators detected,
  // default to the unified ALL view — the spec calls for "unified dataset but
  // can toggle single creator categorization." Subsequent visits keep whatever
  // tab the user last picked.
  const defaultedRef = useRef(false);
  useEffect(() => {
    if (
      !defaultedRef.current &&
      creators.length > 1 &&
      selectedHandle !== ALL_HANDLE
    ) {
      defaultedRef.current = true;
      setSelectedHandle(ALL_HANDLE);
    }
  }, [creators.length, selectedHandle, setSelectedHandle]);

  if (stage !== STAGE.READY || !rows.length) {
    return <DatasetEmpty />;
  }

  const handleSuffix =
    selectedHandle === ALL_HANDLE
      ? "-all"
      : selectedCreator?.handle
      ? `-${selectedCreator.handle}`
      : "";
  const baseName = `${(filename || "chiqo-dataset").replace(/\.csv$/i, "")}${handleSuffix}`;

  return (
    <DatasetTable
      rows={rows}
      parsed={parsed}
      search={search}
      baseName={baseName}
    />
  );
}

function DatasetEmpty() {
  return <EmptyHint />;
}

function DatasetTable({ rows, parsed, search, baseName }) {
  const columns = useMemo(() => buildColumns(rows, parsed), [rows, parsed]);
  const [sort, setSort] = useState({ key: null, dir: null });
  const [edit, setEdit] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [working, setWorking] = useState(rows);

  // Re-seed the editable working set when the upstream rows change — happens
  // when the user toggles between creator tabs (or ALL/unified). We discard
  // any in-flight cell edit so the inline editor doesn't dangle on a row that
  // just disappeared.
  useEffect(() => {
    setWorking(rows);
    setEdit(null);
  }, [rows]);

  const filtered = useMemo(() => {
    if (!search) return working;
    const q = search.toLowerCase();
    return working.filter((r) =>
      columns.some((c) => {
        const v = r[c.key];
        return v != null && String(v).toLowerCase().includes(q);
      })
    );
  }, [working, search, columns]);

  const sorted = useMemo(() => {
    if (!sort.key || !sort.dir) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    const out = [...filtered].sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      if (col?.type === "number") return (Number(va) || 0) - (Number(vb) || 0);
      if (col?.type === "date") return new Date(va || 0) - new Date(vb || 0);
      return String(va || "").localeCompare(String(vb || ""));
    });
    return sort.dir === "desc" ? out.reverse() : out;
  }, [filtered, sort, columns]);

  const cycleSort = (key) =>
    setSort((s) => {
      if (s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: null };
    });

  const onAddRow = () => {
    const blank = Object.fromEntries(columns.map((c) => [c.key, ""]));
    setWorking((w) => [{ ...blank, _local: Date.now() }, ...w]);
  };

  const onDelete = (idx) => {
    setWorking((w) => w.filter((_, i) => i !== idx));
  };

  const beginEdit = (rowIdx, key, value) => {
    setEdit({ rowIdx, key });
    setEditValue(value == null ? "" : String(value));
  };

  const commitEdit = () => {
    if (!edit) return;
    setWorking((w) =>
      w.map((r, i) => (i === edit.rowIdx ? { ...r, [edit.key]: editValue } : r))
    );
    setEdit(null);
  };

  return (
    <section
      style={{
        display: "grid",
        gridTemplateRows: "auto auto 1fr",
        gap: 1,
        background: "var(--tac-border)",
        minHeight: "calc(100dvh - 44px)",
      }}
    >
      <header
        style={{
          background: "var(--tac-bg)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
            fontSize: 12,
            color: "var(--tac-mute)",
            fontVariantNumeric: "tabular-nums",
            marginRight: "auto",
          }}
        >
          {sorted.length.toLocaleString()} of{" "}
          {working.length.toLocaleString()} rows
        </span>
        <button
          type="button"
          onClick={onAddRow}
          className="tac-btn"
          style={{ padding: "6px 12px", fontSize: 12 }}
        >
          <Plus size={12} weight="regular" />
          Add row
        </button>
        <ExportMenu
          disabled={!working.length}
          onExport={(fmt) => exportDataset(fmt, working, baseName)}
        />
      </header>

      <CreatorTabs allowAll allLabel="All creators" label="Filter" />

      <div
        className="tac-dataset-scroll"
        style={{
          background: "var(--tac-bg)",
          overflow: "auto",
          maxHeight: "calc(100dvh - 44px - 76px)",
        }}
      >
        <table
          style={{
            tableLayout: "fixed",
            width: "max-content",
            minWidth: "100%",
            borderCollapse: "collapse",
            fontFamily:
              '"Inter", ui-sans-serif, system-ui, sans-serif',
            fontSize: 13,
          }}
        >
          <thead
            style={{
              position: "sticky",
              top: 0,
              background: "var(--tac-surface)",
              zIndex: 1,
            }}
          >
            <tr>
              <th
                style={{
                  ...thStyle,
                  width: 56,
                  textAlign: "right",
                  color: "var(--tac-dim)",
                }}
              >
                #
              </th>
              {columns.map((col) => {
                const isNumeric = col.type === "number";
                return (
                  <th
                    key={col.key}
                    onClick={() => cycleSort(col.key)}
                    style={{
                      ...thStyle,
                      width: COL_WIDTHS[col.type] || COL_WIDTHS.default,
                      cursor: "pointer",
                      userSelect: "none",
                      textAlign: isNumeric ? "right" : "left",
                    }}
                    title={`${col.key} · ${col.type}`}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        justifyContent: isNumeric ? "flex-end" : "flex-start",
                      }}
                    >
                      <span style={{ color: "var(--tac-mute)" }}>
                        {col.key}
                      </span>
                      {sort.key === col.key && sort.dir === "asc" && (
                        <ArrowUp
                          size={11}
                          weight="bold"
                          color="var(--tac-accent)"
                        />
                      )}
                      {sort.key === col.key && sort.dir === "desc" && (
                        <ArrowDown
                          size={11}
                          weight="bold"
                          color="var(--tac-accent)"
                        />
                      )}
                    </div>
                  </th>
                );
              })}
              <th style={{ ...thStyle, width: 50 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, rowIdx) => (
              <tr
                key={row._local || rowIdx}
                className="tac-dataset-row"
                style={{ borderBottom: "1px solid var(--tac-border)" }}
              >
                <td
                  style={{
                    ...tdStyle,
                    color: "var(--tac-dim)",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 12,
                  }}
                >
                  {rowIdx + 1}
                </td>
                {columns.map((col) => {
                  const value = row[col.key];
                  const editing =
                    edit && edit.rowIdx === rowIdx && edit.key === col.key;
                  const matched =
                    search &&
                    value != null &&
                    String(value).toLowerCase().includes(search.toLowerCase());
                  const isNumeric = col.type === "number";
                  return (
                    <td
                      key={col.key}
                      onClick={() =>
                        !editing && beginEdit(rowIdx, col.key, value)
                      }
                      style={{
                        ...tdStyle,
                        cursor: "text",
                        position: "relative",
                        textAlign: isNumeric ? "right" : "left",
                        fontVariantNumeric: isNumeric ? "tabular-nums" : "normal",
                        ...(editing
                          ? {
                              outline: "2px solid var(--tac-accent)",
                              outlineOffset: -2,
                              background: "var(--tac-surface2)",
                            }
                          : {}),
                      }}
                    >
                      {editing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") setEdit(null);
                          }}
                          style={{
                            width: "100%",
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            color: "var(--tac-fg)",
                            fontFamily:
                              '"Inter", ui-sans-serif, system-ui, sans-serif',
                            fontSize: 13,
                            padding: 0,
                            textAlign: isNumeric ? "right" : "left",
                          }}
                        />
                      ) : (
                        <CellValue
                          value={value}
                          matched={matched}
                          type={col.type}
                        />
                      )}
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={() => onDelete(rowIdx)}
                    aria-label="Delete row"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--tac-dim)",
                      cursor: "pointer",
                      padding: 4,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: 4,
                      transition: "color 120ms, background 120ms",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--tac-danger)";
                      e.currentTarget.style.background = "var(--tac-surface2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--tac-dim)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Trash size={12} weight="regular" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CellValue({ value, matched, type }) {
  if (value == null || value === "") {
    return (
      <span
        style={{
          color: "var(--tac-dim)",
          fontStyle: "italic",
          fontSize: 12,
        }}
      >
        —
      </span>
    );
  }
  let str = String(value);
  if (type === "number") {
    const n = Number(value);
    if (Number.isFinite(n)) str = n.toLocaleString();
  } else if (type === "date") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) str = d.toISOString().slice(0, 10);
  }
  if (str.length > 80) str = str.slice(0, 79) + "…";
  return (
    <span
      style={{
        color: "var(--tac-fg)",
        backgroundColor: matched ? "var(--tac-accent-soft)" : "transparent",
        padding: matched ? "1px 4px" : 0,
        borderRadius: matched ? 3 : 0,
        transition: "background-color 120ms",
      }}
    >
      {str}
    </span>
  );
}

function buildColumns(rows, parsed) {
  if (!rows.length) return [];
  const sample = rows[0];
  const allKeys = [...new Set(rows.flatMap((r) => Object.keys(r)))]
    .filter((k) => !k.startsWith("_") && k !== "transcript");

  const preferred = [
    "id",
    "shortCode",
    "ownerUsername",
    "url",
    "caption",
    "videoViewCount",
    "videoPlayCount",
    "likesCount",
    "commentsCount",
    "videoDuration",
    "timestamp",
    "productType",
    "type",
  ];

  const ordered = [
    ...preferred.filter((k) => allKeys.includes(k)),
    ...allKeys.filter((k) => !preferred.includes(k)),
  ];

  return ordered.map((key) => {
    const raw = sample[key];
    let type = "text";
    if (typeof raw === "boolean") type = "boolean";
    else if (typeof raw === "number" || /count|duration/i.test(key)) type = "number";
    else if (/timestamp|_at|date/i.test(key)) type = "date";
    return { key, type };
  });
}

const thStyle = {
  textAlign: "left",
  padding: "12px 14px",
  borderBottom: "1px solid var(--tac-border)",
  fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
  fontSize: 12,
  color: "var(--tac-mute)",
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "11px 14px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  verticalAlign: "middle",
  fontSize: 13,
};
