import { Check, MousePointerClick } from "lucide-react";
import type { CanvasNode } from "../workspace/workspaceTypes";
import { useWorkspaceStore } from "../workspace/workspaceStore";

export function CanvasNodeContent({ node }: { node: CanvasNode }) {
  const updateNode = useWorkspaceStore((state) => state.updateNode);

  switch (node.type) {
    case "text":
    case "context_note":
    case "agent_plan":
      return <TextNode node={node} updateNode={updateNode} />;
    case "slider":
      return <SliderNode node={node} updateNode={updateNode} />;
    case "chart":
      return <ChartNode node={node} />;
    case "flowchart":
      return <FlowchartNode node={node} />;
    case "table":
      return <TableNode node={node} updateNode={updateNode} />;
    case "button":
      return <ButtonNode node={node} />;
    case "card":
    case "container":
      return <CardNode node={node} />;
    default:
      return <div className="empty-node">未注册组件</div>;
  }
}

function TextNode({
  node,
  updateNode,
}: {
  node: CanvasNode;
  updateNode: (nodeId: string, patch: Record<string, unknown>, label?: string) => void;
}) {
  return (
    <div className="text-node">
      <input
        className="node-title-input"
        value={String(node.props.title ?? node.name)}
        onChange={(event) => updateNode(node.id, { "props.title": event.target.value }, `${node.name} 标题已更新`)}
      />
      <textarea
        value={String(node.props.text ?? "")}
        onChange={(event) => updateNode(node.id, { "props.text": event.target.value }, `${node.name} 文本已更新`)}
      />
    </div>
  );
}

function SliderNode({
  node,
  updateNode,
}: {
  node: CanvasNode;
  updateNode: (nodeId: string, patch: Record<string, unknown>, label?: string) => void;
}) {
  const min = Number(node.props.min ?? 0);
  const max = Number(node.props.max ?? 100);
  const step = Number(node.props.step ?? 1);
  const value = Number(node.props.value ?? 0);
  const unit = String(node.props.unit ?? "");

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
        onChange={(event) => {
          const next = Number(event.target.value);
          updateNode(node.id, { "props.value": next }, `${node.name} 从 ${value} 改为 ${next}`);
        }}
      />
      <div className="range-meta">
        <span>{min.toLocaleString("zh-CN")}</span>
        <span>{max.toLocaleString("zh-CN")}</span>
      </div>
    </div>
  );
}

function ChartNode({ node }: { node: CanvasNode }) {
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
      <div className="chart-title">{String(node.props.title ?? node.name)}</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" aria-label={node.name}>
        <line x1="16" y1={height - 16} x2={width - 12} y2={height - 16} stroke="#ece7e7" />
        {chartType === "line" ? (
          <>
            <polyline points={points} fill="none" stroke="#e76f3c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {data.map((value, index) => {
              const x = 16 + (index * (width - 32)) / Math.max(data.length - 1, 1);
              const y = height - 16 - (value / max) * (height - 36);
              return <circle key={`${value}-${index}`} cx={x} cy={y} r="3" fill="#e76f3c" opacity="0.72" />;
            })}
          </>
        ) : (
          data.map((value, index) => {
            const barWidth = (width - 48) / data.length;
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
          })
        )}
      </svg>
      <div className="chart-labels">
        {labels.slice(0, 6).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function FlowchartNode({ node }: { node: CanvasNode }) {
  const steps = Array.isArray(node.props.steps) ? (node.props.steps as string[]) : [];
  return (
    <div className="flow-node-content">
      <div className="chart-title">{String(node.props.title ?? node.name)}</div>
      <div className="flow-steps">
        {steps.map((step, index) => (
          <div className="flow-step" key={step}>
            <span>{index + 1}</span>
            <p>{step}</p>
            {index < steps.length - 1 ? <div className="flow-connector" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function TableNode({
  node,
  updateNode,
}: {
  node: CanvasNode;
  updateNode: (nodeId: string, patch: Record<string, unknown>, label?: string) => void;
}) {
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

function ButtonNode({ node }: { node: CanvasNode }) {
  return (
    <button className="canvas-action-button">
      <MousePointerClick size={15} />
      {String(node.props.label ?? node.name)}
    </button>
  );
}

function CardNode({ node }: { node: CanvasNode }) {
  return (
    <div className="metric-card">
      <div>
        <span>{String(node.props.title ?? node.name)}</span>
        <strong>{String(node.props.value ?? "")}</strong>
      </div>
      <p>{String(node.props.detail ?? "")}</p>
      <div className="metric-foot">
        <Check size={14} />
        <span>结构化对象</span>
      </div>
    </div>
  );
}
