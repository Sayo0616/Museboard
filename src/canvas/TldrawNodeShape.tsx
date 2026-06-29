import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  createShapeId,
  resizeBox,
  type Geometry2d,
  type RecordProps,
  type TLBaseShape,
  type TLResizeInfo,
  type TLShapeId,
  useEditor,
} from "tldraw";
import { CanvasNodeContent } from "./CanvasNodeContent";
import { useWorkspaceStore } from "../workspace/workspaceStore";

export const museboardShapeType = "museboard-node" as const;
const minNodeWidth = 80;
const minNodeHeight = 48;
const resizeHandles = ["top", "right", "bottom", "left", "top-left", "top-right", "bottom-right", "bottom-left"] as const;

type ResizeHandle = (typeof resizeHandles)[number];

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

  override onResize(shape: MuseboardShape, info: TLResizeInfo<MuseboardShape>) {
    const resized = resizeBox(shape, info, { minWidth: minNodeWidth, minHeight: minNodeHeight });
    return {
      ...resized,
      props: {
        ...shape.props,
        w: resized.props.w,
        h: resized.props.h,
      },
    };
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
  const isSelected = useWorkspaceStore((state) => state.selectedNodeIds.includes(shape.props.nodeId));
  const selectNode = useWorkspaceStore((state) => state.selectNode);
  const beginUserEdit = useWorkspaceStore((state) => state.beginUserEdit);
  const previewUserEdit = useWorkspaceStore((state) => state.previewUserEdit);
  const commitUserEdit = useWorkspaceStore((state) => state.commitUserEdit);
  const editor = useEditor();

  if (!node) {
    return (
      <HTMLContainer className="tldraw-node-host missing">
        <div className="node-body">节点不存在</div>
      </HTMLContainer>
    );
  }

  return (
    <HTMLContainer className={`tldraw-node-host node-${node.type}`} onPointerDownCapture={() => selectNode(node.id)}>
      <div className={`canvas-node tldraw-node-shell ${isSelected ? "selected" : ""}`} style={{ width: shape.props.w, height: shape.props.h }}>
        <div
          className="node-drag-handle"
          onPointerDown={(event) => {
            event.stopPropagation();
            selectNode(node.id);
            const eventLabel = `移动 ${node.id}`;
            beginUserEdit(eventLabel);
            const start = {
              clientX: event.clientX,
              clientY: event.clientY,
              x: node.position.x,
              y: node.position.y,
              zoom: editor.getZoomLevel() || 1,
            };
            const dragTarget = event.currentTarget.ownerDocument.body;

            const handleMove = (moveEvent: PointerEvent) => {
              moveEvent.preventDefault();
              moveEvent.stopImmediatePropagation();
              const nextX = start.x + (moveEvent.clientX - start.clientX) / start.zoom;
              const nextY = start.y + (moveEvent.clientY - start.clientY) / start.zoom;
              previewUserEdit(
                {
                  message: "本地移动",
                  operations: [{ type: "move_node", nodeId: node.id, position: { x: nextX, y: nextY } }],
                },
                eventLabel,
              );
            };

            const handleUp = (upEvent: PointerEvent) => {
              upEvent.preventDefault();
              upEvent.stopImmediatePropagation();
              dragTarget.removeEventListener("pointermove", handleMove, true);
              dragTarget.removeEventListener("pointerup", handleUp, true);
              commitUserEdit(eventLabel);
            };

            dragTarget.addEventListener("pointermove", handleMove, true);
            dragTarget.addEventListener("pointerup", handleUp, true);
          }}
        >
          <span>{node.name}</span>
          <span className="node-type">{node.type}</span>
        </div>
        <div className="node-body" onPointerDown={(event) => event.stopPropagation()}>
          <CanvasNodeContent node={node} />
        </div>
        {resizeHandles.map((handle) => (
          <button
            key={handle}
            className={`node-resize-handle ${handle}`}
            type="button"
            aria-label={`Resize ${handle}`}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              selectNode(node.id);
              const eventLabel = `缩放 ${node.id}`;
              beginUserEdit(eventLabel);
              const start = {
                clientX: event.clientX,
                clientY: event.clientY,
                x: node.position.x,
                y: node.position.y,
                width: node.position.width,
                height: node.position.height,
                zoom: editor.getZoomLevel() || 1,
              };
              const dragTarget = event.currentTarget.ownerDocument.body;

              const handleMove = (moveEvent: PointerEvent) => {
                moveEvent.preventDefault();
                moveEvent.stopImmediatePropagation();
                const dx = (moveEvent.clientX - start.clientX) / start.zoom;
                const dy = (moveEvent.clientY - start.clientY) / start.zoom;
                const next = getResizedBounds(handle, start, dx, dy);
                previewUserEdit(
                  {
                    message: "本地缩放",
                    operations: [{ type: "move_node", nodeId: node.id, position: next }],
                  },
                  eventLabel,
                );
              };

              const handleUp = (upEvent: PointerEvent) => {
                upEvent.preventDefault();
                upEvent.stopImmediatePropagation();
                dragTarget.removeEventListener("pointermove", handleMove, true);
                dragTarget.removeEventListener("pointerup", handleUp, true);
                commitUserEdit(eventLabel);
              };

              dragTarget.addEventListener("pointermove", handleMove, true);
              dragTarget.addEventListener("pointerup", handleUp, true);
            }}
          />
        ))}
      </div>
    </HTMLContainer>
  );
}

function getResizedBounds(
  handle: ResizeHandle,
  start: { x: number; y: number; width: number; height: number },
  dx: number,
  dy: number,
) {
  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  if (handle.includes("right")) {
    width = Math.max(minNodeWidth, start.width + dx);
  }

  if (handle.includes("left")) {
    width = Math.max(minNodeWidth, start.width - dx);
    x = start.x + start.width - width;
  }

  if (handle.includes("bottom")) {
    height = Math.max(minNodeHeight, start.height + dy);
  }

  if (handle.includes("top")) {
    height = Math.max(minNodeHeight, start.height - dy);
    y = start.y + start.height - height;
  }

  return { x, y, width, height };
}

export function shapeIdForNode(nodeId: string): TLShapeId {
  return createShapeId(`museboard-${nodeId}`);
}
