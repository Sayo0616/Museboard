import { Check, MousePointerClick } from "lucide-react";
import type { PointerEvent } from "react";
import type { CanvasNode } from "../workspace/workspaceTypes";
import { useWorkspaceStore } from "../workspace/workspaceStore";

export type ComponentRendererProps = {
  node: CanvasNode;
};

export function TextRenderer({ node }: ComponentRendererProps) {
  const updateNode = useWorkspaceStore((state) => state.updateNode);
  const mode = useWorkspaceStore((state) => state.mode);
  const disabled = mode === "run";

  return (
    <div className="text-node">
      <input
        className="node-title-input"
        value={String(node.props.title ?? node.name)}
        disabled={disabled}
        onChange={(event) => updateNode(node.id, { "props.title": event.target.value }, `${node.name} 标题已更新`)}
      />
      <textarea
        value={String(node.props.text ?? "")}
        disabled={disabled}
        onChange={(event) => updateNode(node.id, { "props.text": event.target.value }, `${node.name} 文本已更新`)}
      />
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

  const previewValue = (next: number) => {
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
        onPointerDown={startRangeDrag}
        onPointerUp={() => commitUserEdit(eventLabel)}
        onPointerCancel={() => commitUserEdit(eventLabel)}
        onBlur={() => commitUserEdit(eventLabel)}
        onKeyUp={(event) => {
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
            commitUserEdit(eventLabel);
          }
        }}
        onInput={(event) => previewValue(Number(event.currentTarget.value))}
        onChange={(event) => previewValue(Number(event.target.value))}
      />
      <div className="range-meta">
        <span>{min.toLocaleString("zh-CN")}</span>
        <span>{max.toLocaleString("zh-CN")}</span>
      </div>
    </div>
  );
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
  const columns = Array.isArray(node.props.columns) ? (node.props.columns as string[]) : [];
  const rows = Array.isArray(node.props.rows) ? (node.props.rows as string[][]) : [];

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={`${row.join("-")}-${rowIndex}`}>
            {row.map((cell, cellIndex) => (
              <td key={`${cell}-${cellIndex}`}>
                <input
                  value={cell}
                  disabled={mode === "run"}
                  onChange={(event) => {
                    const nextRows = rows.map((item) => [...item]);
                    nextRows[rowIndex][cellIndex] = event.target.value;
                    updateNode(node.id, { "props.rows": nextRows }, `${node.name} 表格已更新`);
                  }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
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
