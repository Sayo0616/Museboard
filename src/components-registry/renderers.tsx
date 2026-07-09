import { Check, GripHorizontal, GripVertical, MousePointerClick } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent } from "react";
import type { CanvasNode } from "../workspace/workspaceTypes";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { composeMarkdownSource, renderMarkdown, splitMarkdownSource } from "./markdown";

export type ComponentRendererProps = {
  node: CanvasNode;
};

type TableCellRef = {
  row: number;
  column: number;
};

type TableCellSelection = {
  anchor: TableCellRef;
  focus: TableCellRef;
};

type TableMerge = {
  row: number;
  column: number;
  rowSpan: number;
  colSpan: number;
};

type TableMenuState =
  | {
      type: "row";
      row: number;
      x: number;
      y: number;
    }
  | {
      type: "column";
      column: number;
      x: number;
      y: number;
    }
  | {
      type: "cell";
      row: number;
      column: number;
      x: number;
      y: number;
    };

export function TextRenderer({ node }: ComponentRendererProps) {
  const updateNode = useWorkspaceStore((state) => state.updateNode);
  const mode = useWorkspaceStore((state) => state.mode);
  const disabled = mode === "run";
  const markdownSource = useMemo(() => composeMarkdownSource(node), [node]);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(markdownSource);
  const skipNextBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(markdownSource);
    }
  }, [isEditing, markdownSource]);

  const startEditing = () => {
    if (disabled) return;
    skipNextBlurCommitRef.current = false;
    setDraft(markdownSource);
    setIsEditing(true);
  };

  const commitMarkdown = (suppressNextBlurCommit = false) => {
    if (!isEditing) return;
    skipNextBlurCommitRef.current = suppressNextBlurCommit;
    const parsed = splitMarkdownSource(draft);
    setIsEditing(false);
    updateNode(
      node.id,
      {
        "props.title": parsed.title,
        "props.text": parsed.text,
      },
      `${node.name} Markdown 已更新`,
    );
  };

  const cancelMarkdown = () => {
    skipNextBlurCommitRef.current = true;
    setDraft(markdownSource);
    setIsEditing(false);
  };

  return (
    <div className={`text-node ${isEditing ? "editing" : ""}`}>
      {isEditing && !disabled ? (
        <textarea
          autoFocus
          className="markdown-editor"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (skipNextBlurCommitRef.current) {
              skipNextBlurCommitRef.current = false;
              return;
            }
            commitMarkdown();
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              commitMarkdown(true);
              event.currentTarget.blur();
            }

            if (event.key === "Escape") {
              event.preventDefault();
              cancelMarkdown();
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <div
          className="markdown-preview"
          role="textbox"
          tabIndex={disabled ? -1 : 0}
          aria-readonly={disabled}
          onDoubleClick={startEditing}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "F2") {
              event.preventDefault();
              startEditing();
            }
          }}
        >
          {renderMarkdown(markdownSource)}
        </div>
      )}
    </div>
  );
}

export function SliderRenderer({ node }: ComponentRendererProps) {
  const beginUserEdit = useWorkspaceStore((state) => state.beginUserEdit);
  const previewUserEdit = useWorkspaceStore((state) => state.previewUserEdit);
  const commitUserEdit = useWorkspaceStore((state) => state.commitUserEdit);
  const min = Number(node.props.min ?? 0);
  const max = Number(node.props.max ?? 100);
  const step = Number(node.props.step ?? 1);
  const value = Number(node.props.value ?? 0);
  const unit = String(node.props.unit ?? "");
  const eventLabel = `${node.name} 当前值已更新`;

  const rangeError = getSliderRangeError(min, max, step, value);

  const previewValue = (next: number) => {
    if (rangeError) return;
    beginUserEdit(eventLabel);
    previewUserEdit(
      {
        message: "本地更新",
        operations: [{ type: "update_node", nodeId: node.id, patch: { "props.value": next } }],
      },
      eventLabel,
    );
  };

  const valueFromClientX = (clientX: number, rect: DOMRect) => {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const raw = min + Math.min(1, Math.max(0, ratio)) * (max - min);
    const stepped = step > 0 ? min + Math.round((raw - min) / step) * step : raw;
    const clamped = Math.min(high, Math.max(low, stepped));
    return Number(clamped.toFixed(6));
  };

  const startRangeDrag = (event: PointerEvent<HTMLInputElement>) => {
    if (rangeError) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    previewValue(valueFromClientX(event.clientX, rect));

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      moveEvent.stopImmediatePropagation();
      previewValue(valueFromClientX(moveEvent.clientX, rect));
    };

    const handleUp = (upEvent: globalThis.PointerEvent) => {
      upEvent.preventDefault();
      upEvent.stopImmediatePropagation();
      document.removeEventListener("pointermove", handleMove, true);
      document.removeEventListener("pointerup", handleUp, true);
      document.removeEventListener("pointercancel", handleUp, true);
      commitUserEdit(eventLabel);
    };

    document.addEventListener("pointermove", handleMove, true);
    document.addEventListener("pointerup", handleUp, true);
    document.addEventListener("pointercancel", handleUp, true);
  };

  return (
    <div className="slider-node">
      <div className="node-row">
        <span>{String(node.props.label ?? node.name)}</span>
        <strong>
          {value.toLocaleString("zh-CN")}
          {unit}
        </strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={Boolean(rangeError)}
        aria-invalid={Boolean(rangeError)}
        onPointerDown={startRangeDrag}
        onPointerUp={() => {
          if (!rangeError) commitUserEdit(eventLabel);
        }}
        onPointerCancel={() => {
          if (!rangeError) commitUserEdit(eventLabel);
        }}
        onBlur={() => {
          if (!rangeError) commitUserEdit(eventLabel);
        }}
        onKeyUp={(event) => {
          if (!rangeError && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
            commitUserEdit(eventLabel);
          }
        }}
        onInput={(event) => previewValue(Number(event.currentTarget.value))}
        onChange={(event) => previewValue(Number(event.target.value))}
      />
      {rangeError ? (
        <p className="component-error" role="alert">
          {rangeError}
        </p>
      ) : null}
      <div className="range-meta">
        <span>{min.toLocaleString("zh-CN")}</span>
        <span>{max.toLocaleString("zh-CN")}</span>
      </div>
    </div>
  );
}

function getSliderRangeError(min: number, max: number, step: number, value: number): string | null {
  if (![min, max, step, value].every(Number.isFinite)) return "滑块配置包含无效数字，请在属性面板修正。";
  if (min >= max) return "最小值必须小于最大值，请在属性面板修正。";
  if (step <= 0) return "步长必须大于 0，请在属性面板修正。";
  if (value < min || value > max) return "当前值超出范围，请在属性面板修正。";
  return null;
}

export function ChartRenderer({ node }: ComponentRendererProps) {
  const updateNode = useWorkspaceStore((state) => state.updateNode);
  const mode = useWorkspaceStore((state) => state.mode);
  const data = Array.isArray(node.props.data) ? (node.props.data as number[]) : [];
  const labels = Array.isArray(node.props.labels) ? (node.props.labels as string[]) : [];
  const max = Math.max(...data, 1);
  const chartType = String(node.props.chartType ?? "bar");
  const width = Math.max(220, node.position.width - 36);
  const height = Math.max(130, node.position.height - 92);
  const points = data
    .map((value, index) => {
      const x = 16 + (index * (width - 32)) / Math.max(data.length - 1, 1);
      const y = height - 16 - (value / max) * (height - 36);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="chart-node-content">
      <input
        className="chart-title inline-node-input"
        value={String(node.props.title ?? node.name)}
        disabled={mode === "run"}
        onChange={(event) => updateNode(node.id, { "props.title": event.target.value }, `${node.name} 标题已更新`)}
      />
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" aria-label={node.name}>
        {chartType === "pie" ? (
          <PieChart data={data} labels={labels} width={width} height={height} />
        ) : chartType === "scatter" ? (
          <>
            <line x1="16" y1={height - 16} x2={width - 12} y2={height - 16} stroke="#ece7e7" />
            <ScatterChart data={data} width={width} height={height} max={max} />
          </>
        ) : chartType === "line" ? (
          <>
            <line x1="16" y1={height - 16} x2={width - 12} y2={height - 16} stroke="#ece7e7" />
            <polyline points={points} fill="none" stroke="#e76f3c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {data.map((value, index) => {
              const x = 16 + (index * (width - 32)) / Math.max(data.length - 1, 1);
              const y = height - 16 - (value / max) * (height - 36);
              return <circle key={`${value}-${index}`} cx={x} cy={y} r="3" fill="#e76f3c" opacity="0.72" />;
            })}
          </>
        ) : (
          <>
            <line x1="16" y1={height - 16} x2={width - 12} y2={height - 16} stroke="#ece7e7" />
            {data.map((value, index) => {
              const barWidth = (width - 48) / Math.max(data.length, 1);
              const barHeight = (value / max) * (height - 42);
              return (
                <rect
                  key={`${value}-${index}`}
                  x={22 + index * barWidth}
                  y={height - 16 - barHeight}
                  width={Math.max(10, barWidth - 10)}
                  height={barHeight}
                  rx="5"
                  fill="#e76f3c"
                  opacity="0.58"
                />
              );
            })}
          </>
        )}
      </svg>
      {chartType !== "pie" ? (
        <div className="chart-labels">
          {labels.slice(0, 6).map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PieChart({ data, labels, width, height }: { data: number[]; labels: string[]; width: number; height: number }) {
  const total = data.reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
  const radius = Math.max(38, Math.min(width, height) / 2 - 26);
  const cx = width / 2;
  const cy = height / 2;
  const colors = ["#e76f3c", "#f3b69b", "#f7d4c5", "#d88766", "#f0a37f", "#c96f54"];
  let angle = -90;

  return (
    <>
      {data.map((value, index) => {
        const portion = Math.max(0, value) / total;
        const nextAngle = angle + portion * 360;
        const path = describeArc(cx, cy, radius, angle, nextAngle);
        const labelAngle = angle + (nextAngle - angle) / 2;
        const labelPoint = polarToCartesian(cx, cy, radius * 0.66, labelAngle);
        const label = labels[index] ?? String(index + 1);
        const percent = Math.round(portion * 100);
        angle = nextAngle;
        return (
          <g key={`${value}-${index}`}>
            <path d={path} fill={colors[index % colors.length]} opacity="0.78" />
            {percent >= 5 ? (
              <text className="pie-slice-label" x={labelPoint.x} y={labelPoint.y} textAnchor="middle" dominantBaseline="middle">
                {label} {percent}%
              </text>
            ) : null}
          </g>
        );
      })}
    </>
  );
}

function ScatterChart({ data, width, height, max }: { data: number[]; width: number; height: number; max: number }) {
  return (
    <>
      {data.map((value, index) => {
        const x = 20 + (index * (width - 44)) / Math.max(data.length - 1, 1);
        const y = height - 18 - (value / max) * (height - 44);
        return <circle key={`${value}-${index}`} cx={x} cy={y} r="5" fill="#e76f3c" opacity="0.58" />;
      })}
    </>
  );
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [`M ${cx} ${cy}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`, "Z"].join(" ");
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

export function FlowchartRenderer({ node }: ComponentRendererProps) {
  const updateNode = useWorkspaceStore((state) => state.updateNode);
  const mode = useWorkspaceStore((state) => state.mode);
  const steps = Array.isArray(node.props.steps) ? (node.props.steps as string[]) : [];

  return (
    <div className="flow-node-content">
      <input
        className="chart-title inline-node-input"
        value={String(node.props.title ?? node.name)}
        disabled={mode === "run"}
        onChange={(event) => updateNode(node.id, { "props.title": event.target.value }, `${node.name} 标题已更新`)}
      />
      <div className="flow-steps">
        {steps.map((step, index) => (
          <div className="flow-step" key={`${step}-${index}`}>
            <span>{index + 1}</span>
            <p>{step}</p>
            {index < steps.length - 1 ? <div className="flow-connector" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableRenderer({ node }: ComponentRendererProps) {
  const updateNode = useWorkspaceStore((state) => state.updateNode);
  const mode = useWorkspaceStore((state) => state.mode);
  const disabled = mode === "run";
  const columns = normalizeTableColumns(node.props.columns, node.props.rows);
  const rows = normalizeTableRows(node.props.rows, columns.length);
  const merges = normalizeTableMerges(node.props.merges, rows.length, columns.length);
  const [selection, setSelection] = useState<TableCellSelection | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);
  const [menu, setMenu] = useState<TableMenuState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const skipCellFocusRef = useRef(false);
  const dragStateRef = useRef<{
    kind: "row" | "column";
    from: number;
    started: boolean;
    timeoutId: number;
  } | null>(null);
  const selectedBounds = selection ? getSelectionBounds(selection) : null;
  const selectedRow = selection?.focus.row ?? 0;
  const selectedColumn = selection?.focus.column ?? 0;

  useEffect(() => {
    if (!selection) return;
    const maxRow = rows.length - 1;
    const maxColumn = columns.length - 1;
    if (maxRow < 0 || maxColumn < 0) {
      setSelection(null);
      return;
    }
    const nextSelection = {
      anchor: {
        row: clampIndex(selection.anchor.row, maxRow),
        column: clampIndex(selection.anchor.column, maxColumn),
      },
      focus: {
        row: clampIndex(selection.focus.row, maxRow),
        column: clampIndex(selection.focus.column, maxColumn),
      },
    };
    if (
      nextSelection.anchor.row !== selection.anchor.row ||
      nextSelection.anchor.column !== selection.anchor.column ||
      nextSelection.focus.row !== selection.focus.row ||
      nextSelection.focus.column !== selection.focus.column
    ) {
      setSelection(nextSelection);
    }
  }, [columns.length, rows.length, selection]);

  const selectCell = (cell: TableCellRef, appendRange: boolean) => {
    setMenu(null);
    setNotice(null);
    setSelection((current) => ({
      anchor: appendRange && current ? current.anchor : cell,
      focus: cell,
    }));
  };

  const selectRow = (rowIndex: number) => {
    setMenu(null);
    setNotice(null);
    setSelection({
      anchor: { row: rowIndex, column: 0 },
      focus: { row: rowIndex, column: Math.max(0, columns.length - 1) },
    });
  };

  const selectColumn = (columnIndex: number) => {
    setMenu(null);
    setNotice(null);
    setSelection({
      anchor: { row: 0, column: columnIndex },
      focus: { row: Math.max(0, rows.length - 1), column: columnIndex },
    });
  };

  const getMenuPoint = (event: ReactMouseEvent<HTMLElement>) => {
    const tableRoot = event.currentTarget.closest(".table-node-content");
    const rect = tableRoot?.getBoundingClientRect();
    return {
      x: rect ? event.clientX - rect.left : event.clientX,
      y: rect ? event.clientY - rect.top : event.clientY,
    };
  };

  const patchTable = (patch: Record<string, unknown>, label: string) => {
    setNotice(null);
    updateNode(node.id, patch, `${node.name} ${label}`);
  };

  const patchTableState = (nextColumns: string[], nextRows: string[][], nextMerges: TableMerge[], label: string) => {
    patchTable(
      {
        "props.columns": nextColumns,
        "props.rows": nextRows,
        "props.merges": nextMerges,
      },
      label,
    );
  };

  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    const nextRows = rows.map((row) => [...row]);
    nextRows[rowIndex][columnIndex] = value;
    patchTable({ "props.rows": nextRows }, "表格内容已更新");
  };

  const updateColumn = (columnIndex: number, value: string) => {
    const nextColumns = [...columns];
    nextColumns[columnIndex] = value;
    patchTable({ "props.columns": nextColumns }, "表头已更新");
  };

  const insertRowAt = (insertAt: number) => {
    const blockReason = getRowInsertBlockReason(merges, insertAt);
    if (blockReason) {
      setNotice(blockReason);
      return;
    }
    const nextRows = [...rows.slice(0, insertAt), createEmptyTableRow(columns.length), ...rows.slice(insertAt)];
    const nextMerges = merges.map((merge) => (merge.row >= insertAt ? { ...merge, row: merge.row + 1 } : merge));
    patchTableState(columns, nextRows, nextMerges, "已插入行");
    setSelection({ anchor: { row: insertAt, column: 0 }, focus: { row: insertAt, column: 0 } });
  };

  const insertColumnAt = (insertAt: number) => {
    const blockReason = getColumnInsertBlockReason(merges, insertAt);
    if (blockReason) {
      setNotice(blockReason);
      return;
    }
    const nextColumns = [...columns.slice(0, insertAt), `列 ${insertAt + 1}`, ...columns.slice(insertAt)];
    const nextRows = rows.map((row) => [...row.slice(0, insertAt), "", ...row.slice(insertAt)]);
    const nextMerges = merges.map((merge) => (merge.column >= insertAt ? { ...merge, column: merge.column + 1 } : merge));
    patchTableState(nextColumns, nextRows, nextMerges, "已插入列");
    setSelection({ anchor: { row: 0, column: insertAt }, focus: { row: 0, column: insertAt } });
  };

  const moveRow = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= rows.length) return;
    if (fromIndex === toIndex) return;
    const blockReason = getRowMoveBlockReason(merges, fromIndex, toIndex);
    if (blockReason) {
      setNotice(blockReason);
      return;
    }
    const nextRows = moveArrayItem(rows, fromIndex, toIndex);
    const nextMerges = remapTableMerges(merges, { rowMap: createMovedIndexMap(rows.length, fromIndex, toIndex) });
    patchTableState(columns, nextRows, nextMerges, "已移动行");
    setSelection({ anchor: { row: toIndex, column: selectedColumn }, focus: { row: toIndex, column: selectedColumn } });
  };

  const moveColumn = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= columns.length) return;
    if (fromIndex === toIndex) return;
    const blockReason = getColumnMoveBlockReason(merges, fromIndex, toIndex);
    if (blockReason) {
      setNotice(blockReason);
      return;
    }
    const nextColumns = moveArrayItem(columns, fromIndex, toIndex);
    const nextRows = rows.map((row) => moveArrayItem(row, fromIndex, toIndex));
    const nextMerges = remapTableMerges(merges, { columnMap: createMovedIndexMap(columns.length, fromIndex, toIndex) });
    patchTableState(nextColumns, nextRows, nextMerges, "已移动列");
    setSelection({ anchor: { row: selectedRow, column: toIndex }, focus: { row: selectedRow, column: toIndex } });
  };

  const startHandleDrag = (kind: "row" | "column", from: number, event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    if (kind === "row") {
      selectRow(from);
    } else {
      selectColumn(from);
    }

    const isMergeLocked = kind === "row" ? isRowInVerticalMerge(merges, from) : isColumnInHorizontalMerge(merges, from);
    if (isMergeLocked) {
      setNotice(kind === "row" ? "竖向合并单元格所在行不能单独移动，请先拆分单元格。" : "横向合并单元格所在列不能单独移动，请先拆分单元格。");
      return;
    }

    const dragTarget = event.currentTarget.ownerDocument;
    const timeoutId = window.setTimeout(() => {
      if (dragStateRef.current) dragStateRef.current.started = true;
    }, 180);
    dragStateRef.current = { kind, from, started: false, timeoutId };

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const state = dragStateRef.current;
      if (!state?.started) return;
      moveEvent.preventDefault();
      const target = dragTarget.elementFromPoint(moveEvent.clientX, moveEvent.clientY) as HTMLElement | null;
      const nextIndex =
        state.kind === "row"
          ? Number(target?.closest("[data-table-row-index]")?.getAttribute("data-table-row-index"))
          : Number(target?.closest("[data-table-column-index]")?.getAttribute("data-table-column-index"));
      if (!Number.isInteger(nextIndex)) return;
      if (state.kind === "row") {
        setHoveredRow(nextIndex);
      } else {
        setHoveredColumn(nextIndex);
      }
    };

    const handleUp = (upEvent: globalThis.PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      window.clearTimeout(state.timeoutId);
      dragTarget.removeEventListener("pointermove", handleMove, true);
      dragTarget.removeEventListener("pointerup", handleUp, true);
      dragTarget.removeEventListener("pointercancel", handleUp, true);
      dragStateRef.current = null;

      if (!state.started) return;
      upEvent.preventDefault();
      const target = dragTarget.elementFromPoint(upEvent.clientX, upEvent.clientY) as HTMLElement | null;
      const nextIndex =
        state.kind === "row"
          ? Number(target?.closest("[data-table-row-index]")?.getAttribute("data-table-row-index"))
          : Number(target?.closest("[data-table-column-index]")?.getAttribute("data-table-column-index"));
      if (!Number.isInteger(nextIndex)) return;
      if (state.kind === "row") {
        moveRow(state.from, nextIndex);
      } else {
        moveColumn(state.from, nextIndex);
      }
    };

    dragTarget.addEventListener("pointermove", handleMove, true);
    dragTarget.addEventListener("pointerup", handleUp, true);
    dragTarget.addEventListener("pointercancel", handleUp, true);
  };

  const mergeBounds = (bounds: ReturnType<typeof getSelectionBounds>) => {
    const rowSpan = bounds.maxRow - bounds.minRow + 1;
    const colSpan = bounds.maxColumn - bounds.minColumn + 1;
    if (rowSpan < 2 && colSpan < 2) return;

    const nextRows = rows.map((row) => [...row]);
    const values: string[] = [];
    for (let rowIndex = bounds.minRow; rowIndex <= bounds.maxRow; rowIndex += 1) {
      for (let columnIndex = bounds.minColumn; columnIndex <= bounds.maxColumn; columnIndex += 1) {
        const value = nextRows[rowIndex]?.[columnIndex]?.trim();
        if (value) values.push(value);
        if (rowIndex !== bounds.minRow || columnIndex !== bounds.minColumn) {
          nextRows[rowIndex][columnIndex] = "";
        }
      }
    }
    if (!nextRows[bounds.minRow][bounds.minColumn].trim() && values.length > 0) {
      nextRows[bounds.minRow][bounds.minColumn] = values[0];
    }

    const nextMerge = {
      row: bounds.minRow,
      column: bounds.minColumn,
      rowSpan,
      colSpan,
    };
    const nextMerges = [
      ...merges.filter((merge) => !doesMergeIntersectBounds(merge, bounds)),
      nextMerge,
    ];
    patchTableState(columns, nextRows, nextMerges, "已合并单元格");
    setSelection({
      anchor: { row: bounds.minRow, column: bounds.minColumn },
      focus: { row: bounds.minRow, column: bounds.minColumn },
    });
  };

  const mergeSelection = () => {
    if (!selectedBounds) return;
    mergeBounds(selectedBounds);
  };

  const mergeRight = (row: number, column: number) => {
    if (column >= columns.length - 1) return;
    mergeBounds({ minRow: row, maxRow: row, minColumn: column, maxColumn: column + 1 });
  };

  const mergeDown = (row: number, column: number) => {
    if (row >= rows.length - 1) return;
    mergeBounds({ minRow: row, maxRow: row + 1, minColumn: column, maxColumn: column });
  };

  const unmergeSelection = () => {
    if (!selectedBounds) return;
    const nextMerges = merges.filter((merge) => !doesMergeIntersectBounds(merge, selectedBounds));
    if (nextMerges.length === merges.length) return;
    patchTable({ "props.merges": nextMerges }, "已拆分单元格");
  };

  const mergeCountInSelection = selectedBounds ? merges.filter((merge) => doesMergeIntersectBounds(merge, selectedBounds)).length : 0;
  const canMerge = Boolean(selectedBounds && (selectedBounds.minRow !== selectedBounds.maxRow || selectedBounds.minColumn !== selectedBounds.maxColumn));
  const selectedRowSet = selectedBounds ? new Set(range(selectedBounds.minRow, selectedBounds.maxRow)) : new Set<number>();
  const selectedColumnSet = selectedBounds ? new Set(range(selectedBounds.minColumn, selectedBounds.maxColumn)) : new Set<number>();

  return (
    <div className="table-node-content" onPointerDown={() => setMenu(null)}>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th className="table-corner-cell">
                <span className="table-selection-label">{formatTableSelectionLabel(selection)}</span>
              </th>
              {columns.map((column, columnIndex) => (
                <th
                  key={`column-${columnIndex}`}
                  className={`${selectedColumnSet.has(columnIndex) ? "selected-column" : ""} ${
                    hoveredColumn === columnIndex ? "hovered-column" : ""
                  }`}
                  data-table-column-index={columnIndex}
                  onMouseEnter={() => setHoveredColumn(columnIndex)}
                  onMouseLeave={() => setHoveredColumn((current) => (current === columnIndex ? null : current))}
                >
                  <button
                    className="table-column-handle"
                    type="button"
                    aria-label={`选择第 ${columnIndex + 1} 列`}
                    disabled={disabled}
                    onPointerDown={(event) => startHandleDrag("column", columnIndex, event)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      selectColumn(columnIndex);
                      setMenu({ type: "column", column: columnIndex, ...getMenuPoint(event) });
                    }}
                  >
                    <GripHorizontal size={13} />
                  </button>
                  <input
                    aria-label={`编辑第 ${columnIndex + 1} 列表头`}
                    value={column}
                    disabled={disabled}
                    onFocus={() => selectCell({ row: selectedRow, column: columnIndex }, false)}
                    onChange={(event) => updateColumn(columnIndex, event.target.value)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={`row-${rowIndex}`}
                className={`${selectedRowSet.has(rowIndex) ? "selected-row" : ""} ${hoveredRow === rowIndex ? "hovered-row" : ""}`}
                data-table-row-index={rowIndex}
                onMouseEnter={() => setHoveredRow(rowIndex)}
                onMouseLeave={() => setHoveredRow((current) => (current === rowIndex ? null : current))}
              >
                <td className="table-row-control">
                  <button
                    className="table-row-handle"
                    type="button"
                    aria-label={`选择第 ${rowIndex + 1} 行`}
                    disabled={disabled}
                    onPointerDown={(event) => startHandleDrag("row", rowIndex, event)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      selectRow(rowIndex);
                      setMenu({ type: "row", row: rowIndex, ...getMenuPoint(event) });
                    }}
                  >
                    <GripVertical size={13} />
                  </button>
                </td>
                {row.map((cell, columnIndex) => {
                  if (isCellCoveredByMerge(merges, rowIndex, columnIndex)) return null;
                  const merge = getMergeAnchor(merges, rowIndex, columnIndex);
                  const isSelected = selectedBounds ? isCellWithinBounds(rowIndex, columnIndex, selectedBounds) : false;
                  return (
                    <td
                      key={`${rowIndex}-${columnIndex}`}
                      className={`${isSelected ? "selected-cell" : ""} ${merge ? "merged-cell" : ""}`}
                      rowSpan={merge?.rowSpan}
                      colSpan={merge?.colSpan}
                      onPointerDownCapture={(event) => {
                        skipCellFocusRef.current = true;
                        selectCell({ row: rowIndex, column: columnIndex }, event.shiftKey);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const isInsideSelection = selectedBounds ? isCellWithinBounds(rowIndex, columnIndex, selectedBounds) : false;
                        if (!isInsideSelection) {
                          selectCell({ row: rowIndex, column: columnIndex }, event.shiftKey);
                        }
                        setMenu({ type: "cell", row: rowIndex, column: columnIndex, ...getMenuPoint(event) });
                      }}
                    >
                      <input
                        aria-label={`编辑第 ${rowIndex + 1} 行第 ${columnIndex + 1} 列`}
                        value={cell}
                        disabled={disabled}
                        onFocus={() => {
                          if (skipCellFocusRef.current) {
                            skipCellFocusRef.current = false;
                            return;
                          }
                          selectCell({ row: rowIndex, column: columnIndex }, false);
                        }}
                        onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {menu ? (
        <TableContextMenu
          menu={menu}
          rows={rows.length}
          columns={columns.length}
          rowMoveUpBlocked={menu.type === "row" ? Boolean(getRowMoveBlockReason(merges, menu.row, menu.row - 1)) : false}
          rowMoveDownBlocked={menu.type === "row" ? Boolean(getRowMoveBlockReason(merges, menu.row, menu.row + 1)) : false}
          columnMoveLeftBlocked={menu.type === "column" ? Boolean(getColumnMoveBlockReason(merges, menu.column, menu.column - 1)) : false}
          columnMoveRightBlocked={menu.type === "column" ? Boolean(getColumnMoveBlockReason(merges, menu.column, menu.column + 1)) : false}
          rowInsertBeforeBlocked={menu.type !== "column" ? Boolean(getRowInsertBlockReason(merges, menu.row)) : false}
          rowInsertAfterBlocked={menu.type !== "column" ? Boolean(getRowInsertBlockReason(merges, menu.row + 1)) : false}
          columnInsertBeforeBlocked={menu.type !== "row" ? Boolean(getColumnInsertBlockReason(merges, menu.column)) : false}
          columnInsertAfterBlocked={menu.type !== "row" ? Boolean(getColumnInsertBlockReason(merges, menu.column + 1)) : false}
          canMerge={canMerge}
          canUnmerge={mergeCountInSelection > 0}
          onClose={() => setMenu(null)}
          onInsertRowBefore={(row) => insertRowAt(row)}
          onInsertRowAfter={(row) => insertRowAt(row + 1)}
          onMoveRowUp={(row) => moveRow(row, row - 1)}
          onMoveRowDown={(row) => moveRow(row, row + 1)}
          onInsertColumnBefore={(column) => insertColumnAt(column)}
          onInsertColumnAfter={(column) => insertColumnAt(column + 1)}
          onMoveColumnLeft={(column) => moveColumn(column, column - 1)}
          onMoveColumnRight={(column) => moveColumn(column, column + 1)}
          onMerge={mergeSelection}
          onMergeDown={mergeDown}
          onMergeRight={mergeRight}
          onUnmerge={unmergeSelection}
        />
      ) : null}
      {notice ? (
        <p className="table-notice" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function TableContextMenu({
  canMerge,
  canUnmerge,
  columnInsertAfterBlocked,
  columnInsertBeforeBlocked,
  columnMoveLeftBlocked,
  columnMoveRightBlocked,
  columns,
  menu,
  onClose,
  onInsertColumnAfter,
  onInsertColumnBefore,
  onInsertRowAfter,
  onInsertRowBefore,
  onMerge,
  onMoveColumnLeft,
  onMoveColumnRight,
  onMoveRowDown,
  onMoveRowUp,
  onUnmerge,
  onMergeDown,
  onMergeRight,
  rowInsertAfterBlocked,
  rowInsertBeforeBlocked,
  rowMoveDownBlocked,
  rowMoveUpBlocked,
  rows,
}: {
  canMerge: boolean;
  canUnmerge: boolean;
  columnInsertAfterBlocked: boolean;
  columnInsertBeforeBlocked: boolean;
  columnMoveLeftBlocked: boolean;
  columnMoveRightBlocked: boolean;
  columns: number;
  menu: TableMenuState;
  onClose: () => void;
  onInsertColumnAfter: (column: number) => void;
  onInsertColumnBefore: (column: number) => void;
  onInsertRowAfter: (row: number) => void;
  onInsertRowBefore: (row: number) => void;
  onMerge: () => void;
  onMergeDown: (row: number, column: number) => void;
  onMergeRight: (row: number, column: number) => void;
  onMoveColumnLeft: (column: number) => void;
  onMoveColumnRight: (column: number) => void;
  onMoveRowDown: (row: number) => void;
  onMoveRowUp: (row: number) => void;
  onUnmerge: () => void;
  rowInsertAfterBlocked: boolean;
  rowInsertBeforeBlocked: boolean;
  rowMoveDownBlocked: boolean;
  rowMoveUpBlocked: boolean;
  rows: number;
}) {
  const run = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      className="table-context-menu"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {menu.type === "row" ? (
        <>
          <button type="button" disabled={rowInsertBeforeBlocked} onClick={() => run(() => onInsertRowBefore(menu.row))}>在上方插入行</button>
          <button type="button" disabled={rowInsertAfterBlocked} onClick={() => run(() => onInsertRowAfter(menu.row))}>在下方插入行</button>
          <button type="button" disabled={rowMoveUpBlocked || menu.row <= 0} onClick={() => run(() => onMoveRowUp(menu.row))}>上移整行</button>
          <button type="button" disabled={rowMoveDownBlocked || menu.row >= rows - 1} onClick={() => run(() => onMoveRowDown(menu.row))}>下移整行</button>
          {rowInsertBeforeBlocked || rowInsertAfterBlocked ? <p className="table-menu-hint">不能在竖向合并单元格中间插入行。</p> : null}
          {rowMoveUpBlocked || rowMoveDownBlocked ? <p className="table-menu-hint">不能移入或移出竖向合并单元格所在行。</p> : null}
        </>
      ) : null}
      {menu.type === "column" ? (
        <>
          <button type="button" disabled={columnInsertBeforeBlocked} onClick={() => run(() => onInsertColumnBefore(menu.column))}>在左侧插入列</button>
          <button type="button" disabled={columnInsertAfterBlocked} onClick={() => run(() => onInsertColumnAfter(menu.column))}>在右侧插入列</button>
          <button type="button" disabled={columnMoveLeftBlocked || menu.column <= 0} onClick={() => run(() => onMoveColumnLeft(menu.column))}>左移整列</button>
          <button type="button" disabled={columnMoveRightBlocked || menu.column >= columns - 1} onClick={() => run(() => onMoveColumnRight(menu.column))}>右移整列</button>
          {columnInsertBeforeBlocked || columnInsertAfterBlocked ? <p className="table-menu-hint">不能在横向合并单元格中间插入列。</p> : null}
          {columnMoveLeftBlocked || columnMoveRightBlocked ? <p className="table-menu-hint">不能移入或移出横向合并单元格所在列。</p> : null}
        </>
      ) : null}
      {menu.type === "cell" ? (
        <>
          {canMerge ? <button type="button" onClick={() => run(onMerge)}>合并选区</button> : null}
          {!canMerge ? <button type="button" disabled={menu.column >= columns - 1} onClick={() => run(() => onMergeRight(menu.row, menu.column))}>向右合并</button> : null}
          {!canMerge ? <button type="button" disabled={menu.row >= rows - 1} onClick={() => run(() => onMergeDown(menu.row, menu.column))}>向下合并</button> : null}
          <button type="button" disabled={!canUnmerge} onClick={() => run(onUnmerge)}>拆分单元格</button>
          <button type="button" disabled={rowInsertAfterBlocked} onClick={() => run(() => onInsertRowAfter(menu.row))}>在下方插入行</button>
          <button type="button" disabled={columnInsertAfterBlocked} onClick={() => run(() => onInsertColumnAfter(menu.column))}>在右侧插入列</button>
        </>
      ) : null}
    </div>
  );
}

function normalizeTableColumns(rawColumns: unknown, rawRows: unknown): string[] {
  if (Array.isArray(rawColumns) && rawColumns.length > 0) return rawColumns.map((column, index) => String(column || `列 ${index + 1}`));
  const rowWidth = Array.isArray(rawRows) ? Math.max(1, ...rawRows.map((row) => (Array.isArray(row) ? row.length : 0))) : 1;
  return Array.from({ length: rowWidth }, (_item, index) => `列 ${index + 1}`);
}

function normalizeTableRows(rawRows: unknown, columnCount: number): string[][] {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const normalizedRows = rows.map((row) => {
    const cells = Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [];
    return Array.from({ length: columnCount }, (_item, index) => cells[index] ?? "");
  });
  return normalizedRows.length > 0 ? normalizedRows : [createEmptyTableRow(columnCount)];
}

function createEmptyTableRow(columnCount: number): string[] {
  return Array.from({ length: Math.max(1, columnCount) }, () => "");
}

function normalizeTableMerges(rawMerges: unknown, rowCount: number, columnCount: number): TableMerge[] {
  if (!Array.isArray(rawMerges)) return [];
  return rawMerges
    .map((merge) => {
      const record = merge && typeof merge === "object" ? (merge as Record<string, unknown>) : {};
      return {
        row: Number(record.row),
        column: Number(record.column),
        rowSpan: Number(record.rowSpan),
        colSpan: Number(record.colSpan),
      };
    })
    .filter((merge) => {
      return (
        Number.isInteger(merge.row) &&
        Number.isInteger(merge.column) &&
        Number.isInteger(merge.rowSpan) &&
        Number.isInteger(merge.colSpan) &&
        merge.row >= 0 &&
        merge.column >= 0 &&
        (merge.rowSpan > 1 || merge.colSpan > 1)
      );
    })
    .filter((merge) => merge.row < rowCount && merge.column < columnCount)
    .map((merge) => ({
      ...merge,
      rowSpan: Math.min(merge.rowSpan, rowCount - merge.row),
      colSpan: Math.min(merge.colSpan, columnCount - merge.column),
    }));
}

function clampIndex(value: number, max: number): number {
  return Math.min(Math.max(0, value), max);
}

function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_item, index) => start + index);
}

function getSelectionBounds(selection: TableCellSelection) {
  return {
    minRow: Math.min(selection.anchor.row, selection.focus.row),
    maxRow: Math.max(selection.anchor.row, selection.focus.row),
    minColumn: Math.min(selection.anchor.column, selection.focus.column),
    maxColumn: Math.max(selection.anchor.column, selection.focus.column),
  };
}

function isCellWithinBounds(row: number, column: number, bounds: ReturnType<typeof getSelectionBounds>): boolean {
  return row >= bounds.minRow && row <= bounds.maxRow && column >= bounds.minColumn && column <= bounds.maxColumn;
}

function getMergeAnchor(merges: TableMerge[], row: number, column: number): TableMerge | undefined {
  return merges.find((merge) => merge.row === row && merge.column === column);
}

function isCellCoveredByMerge(merges: TableMerge[], row: number, column: number): boolean {
  return merges.some((merge) => {
    const inside = row >= merge.row && row < merge.row + merge.rowSpan && column >= merge.column && column < merge.column + merge.colSpan;
    return inside && (row !== merge.row || column !== merge.column);
  });
}

function isRowInVerticalMerge(merges: TableMerge[], row: number): boolean {
  return merges.some((merge) => merge.rowSpan > 1 && row >= merge.row && row < merge.row + merge.rowSpan);
}

function isColumnInHorizontalMerge(merges: TableMerge[], column: number): boolean {
  return merges.some((merge) => merge.colSpan > 1 && column >= merge.column && column < merge.column + merge.colSpan);
}

function getRowMoveBlockReason(merges: TableMerge[], from: number, to: number): string | null {
  if (isRowInVerticalMerge(merges, from)) return "竖向合并单元格所在行不能单独移动，请先拆分单元格。";
  if (isRowInVerticalMerge(merges, to)) return "不能移动到竖向合并单元格所在行，请先拆分单元格。";
  return null;
}

function getColumnMoveBlockReason(merges: TableMerge[], from: number, to: number): string | null {
  if (isColumnInHorizontalMerge(merges, from)) return "横向合并单元格所在列不能单独移动，请先拆分单元格。";
  if (isColumnInHorizontalMerge(merges, to)) return "不能移动到横向合并单元格所在列，请先拆分单元格。";
  return null;
}

function getRowInsertBlockReason(merges: TableMerge[], insertAt: number): string | null {
  const isInsideVerticalMerge = merges.some((merge) => merge.rowSpan > 1 && insertAt > merge.row && insertAt < merge.row + merge.rowSpan);
  return isInsideVerticalMerge ? "不能在竖向合并单元格中间插入行，请先拆分单元格。" : null;
}

function getColumnInsertBlockReason(merges: TableMerge[], insertAt: number): string | null {
  const isInsideHorizontalMerge = merges.some((merge) => merge.colSpan > 1 && insertAt > merge.column && insertAt < merge.column + merge.colSpan);
  return isInsideHorizontalMerge ? "不能在横向合并单元格中间插入列，请先拆分单元格。" : null;
}

function doesMergeIntersectBounds(merge: TableMerge, bounds: ReturnType<typeof getSelectionBounds>): boolean {
  return (
    merge.row <= bounds.maxRow &&
    merge.row + merge.rowSpan - 1 >= bounds.minRow &&
    merge.column <= bounds.maxColumn &&
    merge.column + merge.colSpan - 1 >= bounds.minColumn
  );
}

function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
  const nextItems = [...items];
  const [item] = nextItems.splice(from, 1);
  nextItems.splice(to, 0, item);
  return nextItems;
}

function createMovedIndexMap(length: number, from: number, to: number): Map<number, number> {
  return new Map(moveArrayItem(Array.from({ length }, (_item, index) => index), from, to).map((oldIndex, newIndex) => [oldIndex, newIndex]));
}

function remapTableMerges(
  merges: TableMerge[],
  maps: {
    rowMap?: Map<number, number>;
    columnMap?: Map<number, number>;
  },
): TableMerge[] {
  return merges.map((merge) => ({
    ...merge,
    row: maps.rowMap?.get(merge.row) ?? merge.row,
    column: maps.columnMap?.get(merge.column) ?? merge.column,
  }));
}

function formatTableSelectionLabel(selection: TableCellSelection | null): string {
  if (!selection) return "选择单元格";
  const bounds = getSelectionBounds(selection);
  const rowLabel = bounds.minRow === bounds.maxRow ? `R${bounds.minRow + 1}` : `R${bounds.minRow + 1}:R${bounds.maxRow + 1}`;
  const columnLabel =
    bounds.minColumn === bounds.maxColumn ? `C${bounds.minColumn + 1}` : `C${bounds.minColumn + 1}:C${bounds.maxColumn + 1}`;
  return `${rowLabel} ${columnLabel}`;
}

export function ButtonRenderer({ node }: ComponentRendererProps) {
  const updateNode = useWorkspaceStore((state) => state.updateNode);
  const mode = useWorkspaceStore((state) => state.mode);
  const label = String(node.props.label ?? node.name);

  return (
    <button
      className="canvas-action-button"
      onClick={() => {
        if (mode === "run") {
          updateNode(node.id, { "state.lastRunAt": new Date().toISOString() }, `${node.name} 已运行`);
        }
      }}
    >
      <MousePointerClick size={15} />
      {mode === "run" ? `${label}` : label}
    </button>
  );
}

export function CardRenderer({ node }: ComponentRendererProps) {
  const updateNode = useWorkspaceStore((state) => state.updateNode);
  const mode = useWorkspaceStore((state) => state.mode);
  const disabled = mode === "run";

  return (
    <div className="metric-card">
      <div>
        <input
          value={String(node.props.title ?? node.name)}
          disabled={disabled}
          onChange={(event) => updateNode(node.id, { "props.title": event.target.value }, `${node.name} 标题已更新`)}
        />
        <input
          className="metric-value-input"
          value={String(node.props.value ?? "")}
          disabled={disabled}
          onChange={(event) => updateNode(node.id, { "props.value": event.target.value }, `${node.name} 数值已更新`)}
        />
      </div>
      <textarea
        value={String(node.props.detail ?? "")}
        disabled={disabled}
        onChange={(event) => updateNode(node.id, { "props.detail": event.target.value }, `${node.name} 说明已更新`)}
      />
      <div className="metric-foot">
        <Check size={14} />
        <span>{node.permissions?.agentEditable === false ? "Agent 已锁定" : "结构化对象"}</span>
      </div>
    </div>
  );
}
