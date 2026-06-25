import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  createShapeId,
  type Geometry2d,
  type RecordProps,
  type TLBaseShape,
  type TLShapeId,
  useEditor,
} from "tldraw";
import { CanvasNodeContent } from "./CanvasNodeContent";
import { useWorkspaceStore } from "../workspace/workspaceStore";

export const museboardShapeType = "museboard-node" as const;

type MuseboardShape = TLBaseShape<
  typeof museboardShapeType,
  {
    w: number;
    h: number;
    nodeId: string;
  }
>;

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [museboardShapeType]: MuseboardShape["props"];
  }
}

export class MuseboardNodeShapeUtil extends ShapeUtil<MuseboardShape> {
  static override type = museboardShapeType;

  static override props: RecordProps<MuseboardShape> = {
    w: T.number,
    h: T.number,
    nodeId: T.string,
  };

  getDefaultProps(): MuseboardShape["props"] {
    return {
      w: 260,
      h: 140,
      nodeId: "",
    };
  }

  getGeometry(shape: MuseboardShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  component(shape: MuseboardShape) {
    return <MuseboardTldrawNode shape={shape} />;
  }

  getIndicatorPath(shape: MuseboardShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }

  indicator(shape: MuseboardShape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}

function MuseboardTldrawNode({ shape }: { shape: MuseboardShape }) {
  const node = useWorkspaceStore((state) => state.workspace.pages[0].nodes.find((item) => item.id === shape.props.nodeId));
  const selectNode = useWorkspaceStore((state) => state.selectNode);
  const moveNode = useWorkspaceStore((state) => state.moveNode);
  const editor = useEditor();

  if (!node) {
    return (
      <HTMLContainer className="tldraw-node-host missing">
        <div className="node-body">节点不存在</div>
      </HTMLContainer>
    );
  }

  return (
    <HTMLContainer className={`tldraw-node-host node-${node.type}`} onPointerDown={() => selectNode(node.id)}>
      <div className="canvas-node tldraw-node-shell" style={{ width: shape.props.w, height: shape.props.h }}>
        <div
          className="node-drag-handle"
          onPointerDown={(event) => {
            event.stopPropagation();
            selectNode(node.id);
            const start = {
              clientX: event.clientX,
              clientY: event.clientY,
              x: node.position.x,
              y: node.position.y,
              zoom: editor.getZoomLevel() || 1,
            };

            const handleMove = (moveEvent: PointerEvent) => {
              const nextX = start.x + (moveEvent.clientX - start.clientX) / start.zoom;
              const nextY = start.y + (moveEvent.clientY - start.clientY) / start.zoom;
              moveNode(node.id, nextX, nextY);
            };

            const handleUp = () => {
              window.removeEventListener("pointermove", handleMove);
              window.removeEventListener("pointerup", handleUp);
            };

            window.addEventListener("pointermove", handleMove);
            window.addEventListener("pointerup", handleUp);
          }}
        >
          <span>{node.name}</span>
          <span className="node-type">{node.type}</span>
        </div>
        <div className="node-body" onPointerDown={(event) => event.stopPropagation()}>
          <CanvasNodeContent node={node} />
        </div>
      </div>
    </HTMLContainer>
  );
}

export function shapeIdForNode(nodeId: string): TLShapeId {
  return createShapeId(`museboard-${nodeId}`);
}
