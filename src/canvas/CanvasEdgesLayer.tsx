import { Link2, Unlink2 } from "lucide-react";
import type { CanvasEdge, CanvasNode } from "../workspace/workspaceTypes";
import { Button } from "../ui/Button";
import { Tooltip } from "../ui/Tooltip";

type CanvasEdgesLayerProps = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeIds: string[];
  onCreateEdge: () => void;
  onDeleteSelectedEdges: () => void;
};

export function CanvasEdgesLayer({
  nodes,
  edges,
  selectedNodeIds,
  onCreateEdge,
  onDeleteSelectedEdges,
}: CanvasEdgesLayerProps) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const renderableEdges = edges
    .map((edge) => {
      const source = nodeMap.get(edge.sourceNodeId);
      const target = nodeMap.get(edge.targetNodeId);
      if (!source || !target) return null;
      return { edge, source, target };
    })
    .filter((item): item is { edge: CanvasEdge; source: CanvasNode; target: CanvasNode } => Boolean(item));
  const selectedEdgeCount = edges.filter(
    (edge) => selectedNodeIds.includes(edge.sourceNodeId) || selectedNodeIds.includes(edge.targetNodeId),
  ).length;

  return (
    <>
      <svg className="canvas-edges-layer" aria-hidden="true">
        <defs>
          <marker id="edge-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        {renderableEdges.map(({ edge, source, target }) => {
          const start = edgePoint(source, "right");
          const end = edgePoint(target, "left");
          const midX = (start.x + end.x) / 2;
          const path = `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
          return (
            <g key={edge.id} className={`canvas-edge edge-${edge.type}`}>
              <path d={path} markerEnd="url(#edge-arrow)" />
              {edge.label ? (
                <text x={midX} y={(start.y + end.y) / 2 - 8} textAnchor="middle">
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="edge-controls">
        <Tooltip label="连接前两个选中对象">
          <Button onClick={onCreateEdge} disabled={selectedNodeIds.length < 2} aria-label="连接前两个选中对象">
            <Link2 size={14} />
          </Button>
        </Tooltip>
        <Tooltip label="删除选中对象相关连接">
          <Button onClick={onDeleteSelectedEdges} disabled={selectedEdgeCount === 0} aria-label="删除选中对象相关连接">
            <Unlink2 size={14} />
          </Button>
        </Tooltip>
      </div>
    </>
  );
}

function edgePoint(node: CanvasNode, side: "left" | "right") {
  return {
    x: side === "right" ? node.position.x + node.position.width : node.position.x,
    y: node.position.y + node.position.height / 2,
  };
}
