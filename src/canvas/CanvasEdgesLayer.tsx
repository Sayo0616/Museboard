import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link2, Unlink2 } from "lucide-react";
import type { Editor } from "tldraw";
import type { CanvasEdge, CanvasNode, EdgeArrowStyle, EdgeHandle, EdgeLineStyle } from "../workspace/workspaceTypes";
import { Button } from "../ui/Button";
import { Tooltip } from "../ui/Tooltip";

type CanvasEdgesLayerProps = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  editor: Editor | null;
  viewportRevision: number;
  onSelectEdge: (edgeId: string, append?: boolean) => void;
  onCreateEdge: () => void;
  onCreateEdgeFromHandles: (sourceNodeId: string, sourceHandle: EdgeHandle, targetNodeId: string, targetHandle: EdgeHandle) => void;
  onReconnectEdgeEndpoint: (edgeId: string, endpoint: "source" | "target", nodeId: string, handle: EdgeHandle) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDeleteSelectedEdges: () => void;
};

type ViewportPoint = {
  x: number;
  y: number;
};

type DraftConnection = {
  kind: "create";
  blockedNodeId: string;
  startNodeId: string;
  startHandle: EdgeHandle;
  startPoint: ViewportPoint;
  current: ViewportPoint;
} | {
  kind: "reconnect";
  edgeId: string;
  endpoint: "source" | "target";
  blockedNodeId: string;
  fixedHandle: EdgeHandle;
  fixedPoint: ViewportPoint;
  originalHandle: EdgeHandle;
  current: ViewportPoint;
};

const edgeHandles: EdgeHandle[] = ["top", "right", "bottom", "left"];
const defaultStrokeColor = "#cdbcb0";
const defaultStrokeWidth = 1.5;

export function CanvasEdgesLayer({
  nodes,
  edges,
  selectedNodeIds,
  selectedEdgeIds,
  editor,
  viewportRevision: _viewportRevision,
  onSelectEdge,
  onCreateEdge,
  onCreateEdgeFromHandles,
  onReconnectEdgeEndpoint,
  onDeleteEdge,
  onDeleteSelectedEdges,
}: CanvasEdgesLayerProps) {
  void _viewportRevision;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draftConnection, setDraftConnection] = useState<DraftConnection | null>(null);
  const [draftHoverNodeId, setDraftHoverNodeId] = useState<string | null>(null);
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const renderableEdges = edges
    .map((edge) => {
      const source = nodeMap.get(edge.sourceNodeId);
      const target = nodeMap.get(edge.targetNodeId);
      if (!source || !target) return null;
      return { edge, source, target };
    })
    .filter((item): item is { edge: CanvasEdge; source: CanvasNode; target: CanvasNode } => Boolean(item));
  const selectedEdgeCount = edges.filter(
    (edge) => selectedEdgeIds.includes(edge.id) || selectedNodeIds.includes(edge.sourceNodeId) || selectedNodeIds.includes(edge.targetNodeId),
  ).length;

  const startConnectionDrag = (event: ReactPointerEvent<SVGCircleElement>, node: CanvasNode, handle: EdgeHandle) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const start = toViewport(editor, edgePoint(node, handle));
    const pointer = clientToSvgPoint(svgRef.current, event.clientX, event.clientY);
    setDraftConnection({ kind: "create", blockedNodeId: node.id, startNodeId: node.id, startHandle: handle, startPoint: start, current: pointer });
    setDraftHoverNodeId(null);

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      moveEvent.stopImmediatePropagation();
      setDraftConnection((current) =>
        current ? { ...current, current: clientToSvgPoint(svgRef.current, moveEvent.clientX, moveEvent.clientY) } : current,
      );
      const point = clientToSvgPoint(svgRef.current, moveEvent.clientX, moveEvent.clientY);
      setDraftHoverNodeId(findHoveredNodeId(nodes, editor, point, node.id));
    };

    const stopDrag = (upEvent: PointerEvent) => {
      upEvent.preventDefault();
      upEvent.stopImmediatePropagation();
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", stopDrag, true);
      window.removeEventListener("pointercancel", stopDrag, true);
      setDraftConnection(null);
      setDraftHoverNodeId(null);

      const point = clientToSvgPoint(svgRef.current, upEvent.clientX, upEvent.clientY);
      const target = findNearestHandle(nodes, editor, point, node.id);
      if (!target) return;
      onCreateEdgeFromHandles(node.id, handle, target.nodeId, target.handle);
    };

    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", stopDrag, true);
    window.addEventListener("pointercancel", stopDrag, true);
  };

  const startEndpointDrag = (
    event: ReactPointerEvent<SVGCircleElement>,
    edge: CanvasEdge,
    endpoint: "source" | "target",
    source: CanvasNode,
    target: CanvasNode,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectEdge(edge.id, event.shiftKey || event.metaKey || event.ctrlKey);

    const sourceHandle = edge.sourceHandle ?? "right";
    const targetHandle = edge.targetHandle ?? "left";
    const fixedNode = endpoint === "source" ? target : source;
    const fixedHandle = endpoint === "source" ? targetHandle : sourceHandle;
    const originalHandle = endpoint === "source" ? sourceHandle : targetHandle;
    const fixedPoint = toViewport(editor, edgePoint(fixedNode, fixedHandle));
    const blockedNodeId = fixedNode.id;
    const pointer = clientToSvgPoint(svgRef.current, event.clientX, event.clientY);
    setDraftConnection({ kind: "reconnect", edgeId: edge.id, endpoint, blockedNodeId, fixedHandle, fixedPoint, originalHandle, current: pointer });
    setDraftHoverNodeId(null);

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      moveEvent.stopImmediatePropagation();
      const point = clientToSvgPoint(svgRef.current, moveEvent.clientX, moveEvent.clientY);
      setDraftConnection((current) => (current ? { ...current, current: point } : current));
      setDraftHoverNodeId(findHoveredNodeId(nodes, editor, point, blockedNodeId));
    };

    const stopDrag = (upEvent: PointerEvent) => {
      upEvent.preventDefault();
      upEvent.stopImmediatePropagation();
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", stopDrag, true);
      window.removeEventListener("pointercancel", stopDrag, true);
      setDraftConnection(null);
      setDraftHoverNodeId(null);

      const point = clientToSvgPoint(svgRef.current, upEvent.clientX, upEvent.clientY);
      const dropTarget = findNearestHandle(nodes, editor, point, blockedNodeId);
      if (!dropTarget) {
        onDeleteEdge(edge.id);
        return;
      }
      onReconnectEdgeEndpoint(edge.id, endpoint, dropTarget.nodeId, dropTarget.handle);
    };

    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", stopDrag, true);
    window.addEventListener("pointercancel", stopDrag, true);
  };

  return (
    <>
      <svg ref={svgRef} className="canvas-edges-layer" aria-label="画板连接">
        <defs>
          <marker id="edge-marker-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto-start-reverse" markerUnits="strokeWidth">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
          <marker id="edge-marker-circle" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="strokeWidth">
            <circle cx="4" cy="4" r="3" fill="context-stroke" />
          </marker>
          <marker id="edge-marker-diamond" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M 5 0 L 10 5 L 5 10 L 0 5 z" fill="context-stroke" />
          </marker>
        </defs>

        {renderableEdges.map(({ edge, source, target }) => {
          const sourceHandle = edge.sourceHandle ?? "right";
          const targetHandle = edge.targetHandle ?? "left";
          const start = toViewport(editor, edgePoint(source, sourceHandle));
          const end = toViewport(editor, edgePoint(target, targetHandle));
          const path = makeEdgePath(start, sourceHandle, end, targetHandle);
          const labelPoint = edgeLabelPoint(start, sourceHandle, end, targetHandle);
          const isSelected = selectedEdgeIds.includes(edge.id);
          const strokeColor = edge.strokeColor ?? defaultStrokeColor;
          const strokeWidth = edge.strokeWidth ?? defaultStrokeWidth;
          const strokeDasharray = dashArray(edge.lineStyle, strokeWidth);

          return (
            <g key={edge.id} className={`canvas-edge edge-${edge.type} ${isSelected ? "selected" : ""}`}>
              <path
                className="canvas-edge-hit"
                d={path}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectEdge(edge.id, event.shiftKey || event.metaKey || event.ctrlKey);
                }}
              />
              <path
                className="canvas-edge-stroke"
                d={path}
                markerStart={markerUrl(edge.startArrow)}
                markerEnd={markerUrl(edge.endArrow ?? "arrow")}
                style={{
                  stroke: strokeColor,
                  strokeWidth,
                  strokeDasharray,
                  opacity: isSelected ? 0.95 : 0.76,
                }}
              />
              {edge.label ? (
                <text className="canvas-edge-label" x={labelPoint.x} y={labelPoint.y} textAnchor="middle" dominantBaseline="middle">
                  {edge.label}
                </text>
              ) : null}
              {isSelected && !draftConnection ? (
                <>
                  <circle
                    className="edge-endpoint-handle source"
                    data-edge-id={edge.id}
                    data-endpoint="source"
                    cx={start.x}
                    cy={start.y}
                    r={6}
                    onPointerDown={(event) => startEndpointDrag(event, edge, "source", source, target)}
                  />
                  <circle
                    className="edge-endpoint-handle target"
                    data-edge-id={edge.id}
                    data-endpoint="target"
                    cx={end.x}
                    cy={end.y}
                    r={6}
                    onPointerDown={(event) => startEndpointDrag(event, edge, "target", source, target)}
                  />
                </>
              ) : null}
            </g>
          );
        })}

        {draftConnection ? (
          <path
            className="canvas-edge-draft"
            d={makeDraftPath(draftConnection)}
          />
        ) : null}

        <g className="connection-handles">
          {nodes.flatMap((node) =>
            edgeHandles.map((handle) => {
              if (!shouldShowHandle(node.id, selectedNodeIds, draftConnection, draftHoverNodeId)) return null;
              const point = toViewport(editor, edgePoint(node, handle));
              const isSelfTarget = draftConnection?.blockedNodeId === node.id;
              return (
                <circle
                  key={`${node.id}-${handle}`}
                  className={`connection-handle ${selectedNodeIds.includes(node.id) ? "selected" : ""} ${isSelfTarget ? "self-target" : ""}`}
                  data-node-id={node.id}
                  data-handle={handle}
                  cx={point.x}
                  cy={point.y}
                  r={5}
                  onPointerDown={(event) => startConnectionDrag(event, node, handle)}
                />
              );
            }),
          )}
        </g>
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

function shouldShowHandle(
  nodeId: string,
  selectedNodeIds: string[],
  draftConnection: DraftConnection | null,
  draftHoverNodeId: string | null,
) {
  if (!draftConnection) return selectedNodeIds.includes(nodeId);
  return nodeId === draftHoverNodeId;
}

function edgePoint(node: CanvasNode, handle: EdgeHandle): ViewportPoint {
  switch (handle) {
    case "top":
      return { x: node.position.x + node.position.width / 2, y: node.position.y };
    case "right":
      return { x: node.position.x + node.position.width, y: node.position.y + node.position.height / 2 };
    case "bottom":
      return { x: node.position.x + node.position.width / 2, y: node.position.y + node.position.height };
    case "left":
      return { x: node.position.x, y: node.position.y + node.position.height / 2 };
  }
}

function makeEdgePath(start: ViewportPoint, sourceHandle: EdgeHandle, end: ViewportPoint, targetHandle: EdgeHandle) {
  const { controlStart, controlEnd } = edgeControlPoints(start, sourceHandle, end, targetHandle);
  return `M ${start.x} ${start.y} C ${controlStart.x} ${controlStart.y}, ${controlEnd.x} ${controlEnd.y}, ${end.x} ${end.y}`;
}

function makeDraftPath(draft: DraftConnection) {
  if (draft.kind === "create") {
    return makeEdgePath(draft.startPoint, draft.startHandle, draft.current, oppositeHandle(draft.startHandle));
  }
  if (draft.endpoint === "source") {
    return makeEdgePath(draft.current, draft.originalHandle, draft.fixedPoint, draft.fixedHandle);
  }
  return makeEdgePath(draft.fixedPoint, draft.fixedHandle, draft.current, draft.originalHandle);
}

function edgeLabelPoint(start: ViewportPoint, sourceHandle: EdgeHandle, end: ViewportPoint, targetHandle: EdgeHandle) {
  const { controlStart, controlEnd } = edgeControlPoints(start, sourceHandle, end, targetHandle);
  return cubicPoint(start, controlStart, controlEnd, end, 0.5);
}

function edgeControlPoints(start: ViewportPoint, sourceHandle: EdgeHandle, end: ViewportPoint, targetHandle: EdgeHandle) {
  const distance = Math.max(44, Math.min(180, Math.hypot(end.x - start.x, end.y - start.y) * 0.34));
  const controlStart = controlPoint(start, sourceHandle, distance);
  const controlEnd = controlPoint(end, targetHandle, distance);
  return { controlStart, controlEnd };
}

function controlPoint(point: ViewportPoint, handle: EdgeHandle, distance: number): ViewportPoint {
  switch (handle) {
    case "top":
      return { x: point.x, y: point.y - distance };
    case "right":
      return { x: point.x + distance, y: point.y };
    case "bottom":
      return { x: point.x, y: point.y + distance };
    case "left":
      return { x: point.x - distance, y: point.y };
  }
}

function oppositeHandle(handle: EdgeHandle): EdgeHandle {
  switch (handle) {
    case "top":
      return "bottom";
    case "right":
      return "left";
    case "bottom":
      return "top";
    case "left":
      return "right";
  }
}

function cubicPoint(start: ViewportPoint, controlStart: ViewportPoint, controlEnd: ViewportPoint, end: ViewportPoint, t: number): ViewportPoint {
  const mt = 1 - t;
  return {
    x: mt ** 3 * start.x + 3 * mt ** 2 * t * controlStart.x + 3 * mt * t ** 2 * controlEnd.x + t ** 3 * end.x,
    y: mt ** 3 * start.y + 3 * mt ** 2 * t * controlStart.y + 3 * mt * t ** 2 * controlEnd.y + t ** 3 * end.y,
  };
}

function markerUrl(style: EdgeArrowStyle | undefined) {
  if (!style || style === "none") return undefined;
  return `url(#edge-marker-${style})`;
}

function dashArray(style: EdgeLineStyle | undefined, width: number) {
  if (style === "dotted") return `${Math.max(1, width)} ${Math.max(4, width * 3)}`;
  if (style === "dashed") return `${Math.max(5, width * 4)} ${Math.max(4, width * 3)}`;
  return undefined;
}

function clientToSvgPoint(svg: SVGSVGElement | null, clientX: number, clientY: number): ViewportPoint {
  const rect = svg?.getBoundingClientRect();
  if (!rect) return { x: clientX, y: clientY };
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function toViewport(editor: Editor | null, point: ViewportPoint): ViewportPoint {
  return editor?.pageToViewport(point) ?? point;
}

function findHoveredNodeId(nodes: CanvasNode[], editor: Editor | null, point: ViewportPoint, blockedNodeId: string) {
  const handle = findNearestHandle(nodes, editor, point, blockedNodeId, 22);
  if (handle) return handle.nodeId;

  const hoveredNode = nodes.find((node) => {
    if (node.id === blockedNodeId) return false;
    const topLeft = toViewport(editor, { x: node.position.x, y: node.position.y });
    const bottomRight = toViewport(editor, {
      x: node.position.x + node.position.width,
      y: node.position.y + node.position.height,
    });
    const left = Math.min(topLeft.x, bottomRight.x) - 18;
    const right = Math.max(topLeft.x, bottomRight.x) + 18;
    const top = Math.min(topLeft.y, bottomRight.y) - 18;
    const bottom = Math.max(topLeft.y, bottomRight.y) + 18;
    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  });
  return hoveredNode?.id ?? null;
}

function findNearestHandle(
  nodes: CanvasNode[],
  editor: Editor | null,
  point: ViewportPoint,
  blockedNodeId: string,
  threshold = 18,
): { nodeId: string; handle: EdgeHandle; distance: number } | null {
  let nearest: { nodeId: string; handle: EdgeHandle; distance: number } | null = null;
  for (const node of nodes) {
    if (node.id === blockedNodeId) continue;
    for (const handle of edgeHandles) {
      const handlePoint = toViewport(editor, edgePoint(node, handle));
      const distance = Math.hypot(handlePoint.x - point.x, handlePoint.y - point.y);
      if (distance > threshold) continue;
      if (!nearest || distance < nearest.distance) {
        nearest = { nodeId: node.id, handle, distance };
      }
    }
  }
  return nearest;
}
