import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ArrowUp, ArrowDown, Plus, Trash } from "@phosphor-icons/react";
import { useCsv, STAGE } from "../state/CsvContext.jsx";
import EmptyHint from "../widgets/EmptyHint.jsx";
import ExportMenu from "../widgets/ExportMenu.jsx";
import { exportDataset } from "../lib/exporters.js";

const COL_WIDTHS = {
  boolean: 70,
  number: 110,
  date: 150,
  default: 220,
};

export default function DatasetView() {
  const { stage, rows, parsed, filename, selectedCreator } = useCsv();
  const { search } = useOutletContext();

  if (stage !== STAGE.READY || !rows.length) {
    return <DatasetEmpty />;
  }

  const baseName = `${(filename || "swh-dataset").replace(/\.csv$/i, "")}${
    selectedCreator?.handle ? `-${selectedCreator.handle}` : ""
  }`;

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
        gridTemplateRows: "auto 1fr",
        gap: 1,
        background: "var(--tac-border)",
        minHeight: "calc(100dvh - 44px)",
      }}
    >
      <header
        style={{
          background: "var(--tac-bg)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div className="tac-label">SECTION D-02 / DATASET</div>
          <div
            className="tac-display"
            style={{ fontSize: 22, color: "var(--tac-fg)", marginTop: 4 }}
          >
            CRUD TABLE
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={onAddRow}
            className="tac-btn"
            style={{ padding: "6px 10px", fontSize: 10 }}
          >
            <Plus size={11} weight="regular" />
            ADD ROW
          </button>
          <ExportMenu
            disabled={!working.length}
            onExport={(fmt) => exportDataset(fmt, working, baseName)}
          />
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              color: "var(--tac-mute)",
              letterSpacing: "0.1em",
            }}
          >
            {sorted.length.toLocaleString()} / {working.length.toLocaleString()} ROWS
          </span>
        </div>
      </header>

      <div
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
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 11,
          }}
        >
          <thead
            style={{
              position: "sticky",
              top: 0,
              background: "var(--tac-surface2)",
              zIndex: 1,
            }}
          >
            <tr>
              <th
                style={{
                  ...thStyle,
                  width: 50,
                  textAlign: "right",
                  color: "var(--tac-dim)",
                }}
              >
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => cycleSort(col.key)}
                  style={{
                    ...thStyle,
                    width: COL_WIDTHS[col.type] || COL_WIDTHS.default,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                  title={`${col.key} · ${col.type}`}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ color: "var(--tac-fg)" }}>{col.key}</span>
                    <span
                      style={{
                        fontSize: 9,
                        color: "#4f8dfe",
                        border: "1px solid var(--tac-border)",
                        padding: "0px 4px",
                      }}
                    >
                      {col.type.toUpperCase()}
                    </span>
                    {sort.key === col.key && sort.dir === "asc" && (
                      <ArrowUp size={10} weight="bold" color="#4f8dfe" />
                    )}
                    {sort.key === col.key && sort.dir === "desc" && (
                      <ArrowDown size={10} weight="bold" color="#4f8dfe" />
                    )}
                  </div>
                </th>
              ))}
              <th style={{ ...thStyle, width: 50 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, rowIdx) => (
              <tr
                key={row._local || rowIdx}
                style={{ borderBottom: "1px solid var(--tac-surface)" }}
              >
                <td
                  style={{
                    ...tdStyle,
                    color: "var(--tac-dim)",
                    textAlign: "right",
                  }}
                >
                  {String(rowIdx + 1).padStart(3, "0")}
                </td>
                {columns.map((col) => {
                  const value = row[col.key];
                  const editing =
                    edit && edit.rowIdx === rowIdx && edit.key === col.key;
                  const matched =
                    search &&
                    value != null &&
                    String(value).toLowerCase().includes(search.toLowerCase());
                  return (
                    <td
                      key={col.key}
                      onClick={() => !editing && beginEdit(rowIdx, col.key, value)}
                      style={{
                        ...tdStyle,
                        cursor: "text",
                        position: "relative",
                        ...(editing
                          ? {
                              outline: "2px solid #4f8dfe",
                              outlineOffset: -2,
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
                            background: "var(--tac-bg)",
                            border: "none",
                            outline: "none",
                            color: "var(--tac-fg)",
                            fontFamily: '"JetBrains Mono", monospace',
                            fontSize: 11,
                            padding: 0,
                          }}
                        />
                      ) : (
                        <CellValue value={value} matched={matched} type={col.type} />
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
                      padding: 2,
                      display: "grid",
                      placeItems: "center",
                      transition: "color 120ms",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "#4f8dfe")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "var(--tac-dim)")
                    }
                  >
                    <Trash size={11} weight="regular" />
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
    return <span style={{ color: "var(--tac-dim)" }}>—</span>;
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
        textDecoration: matched ? "underline" : "none",
        textDecorationColor: "#4f8dfe",
        textDecorationThickness: matched ? 1 : 0,
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
  padding: "10px 12px",
  borderBottom: "1px solid var(--tac-border)",
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: 10,
  color: "var(--tac-mute)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "8px 12px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  verticalAlign: "top",
};
