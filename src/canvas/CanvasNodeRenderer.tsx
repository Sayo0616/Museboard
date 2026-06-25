import type { PointerEvent } from "react";
import type { CanvasNode } from "../workspace/workspaceTypes";
import { CanvasNodeContent } from "./CanvasNodeContent";

type CanvasNodeRendererProps = {
  node: CanvasNode;
  selected: boolean;
  onPointerDown: (event: PointerEvent) => void;
};

export function CanvasNodeRenderer({ node, selected, onPointerDown }: CanvasNodeRendererProps) {
  return (
    <div
      className={`canvas-node node-${node.type} ${selected ? "selected" : ""}`}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: node.position.width,
        height: node.position.height,
        transform: node.position.rotation ? `rotate(${node.position.rotation}deg)` : undefined,
      }}
      onPointerDown={onPointerDown}
    >
      <div className="node-drag-handle">
        <span>{node.name}</span>
        <span className="node-type">{node.type}</span>
      </div>
      <div className="node-body" onPointerDown={(event) => event.stopPropagation()}>
        <CanvasNodeContent node={node} />
      </div>
    </div>
  );
}
