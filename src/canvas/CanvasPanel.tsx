import { useCallback, useEffect, useRef, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { TldrawEditor, type Editor, type TLShape } from "tldraw";
import { CanvasToolbar } from "./CanvasToolbar";
import { MuseboardNodeShapeUtil, museboardShapeType, shapeIdForNode } from "./TldrawNodeShape";
import { InspectorPanel } from "../inspector/InspectorPanel";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import type { CanvasNode } from "../workspace/workspaceTypes";

const shapeUtils = [MuseboardNodeShapeUtil];

export function CanvasPanel() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const moveNode = useWorkspaceStore((state) => state.moveNode);
  const editorRef = useRef<Editor | null>(null);
  const [zoom, setZoom] = useState(1);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const nodes = workspace.pages[0].nodes;

  const syncWorkspaceToTldraw = useCallback((editor: Editor, nextNodes: CanvasNode[]) => {
    const currentMuseboardShapes = editor
      .getCurrentPageShapes()
      .filter((shape): shape is TLShape & { type: typeof museboardShapeType; props: { nodeId: string; w: number; h: number } } => {
        return shape.type === museboardShapeType;
      });
    const nodeIds = new Set(nextNodes.map((node) => node.id));
    const existingIds = new Set(currentMuseboardShapes.map((shape) => shape.props.nodeId));

    const staleShapeIds = currentMuseboardShapes
      .filter((shape) => !nodeIds.has(shape.props.nodeId))
      .map((shape) => shape.id);
    if (staleShapeIds.length > 0) editor.deleteShapes(staleShapeIds);

    const shapesToCreate = nextNodes
      .filter((node) => !existingIds.has(node.id))
      .map((node) => ({
        id: shapeIdForNode(node.id),
        type: museboardShapeType,
        x: node.position.x,
        y: node.position.y,
        rotation: ((node.position.rotation ?? 0) * Math.PI) / 180,
        props: {
          nodeId: node.id,
          w: node.position.width,
          h: node.position.height,
        },
      }));
    if (shapesToCreate.length > 0) editor.createShapes(shapesToCreate);

    const shapesToUpdate = nextNodes
      .filter((node) => existingIds.has(node.id))
      .map((node) => ({
        id: shapeIdForNode(node.id),
        type: museboardShapeType,
        x: node.position.x,
        y: node.position.y,
        rotation: ((node.position.rotation ?? 0) * Math.PI) / 180,
        props: {
          nodeId: node.id,
          w: node.position.width,
          h: node.position.height,
        },
      }));
    if (shapesToUpdate.length > 0) editor.updateShapes(shapesToUpdate);
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    syncWorkspaceToTldraw(editorRef.current, nodes);
  }, [nodes, syncWorkspaceToTldraw]);

  return (
    <div className="canvas-panel">
      <div className="tldraw-host">
        <TldrawEditor
          shapeUtils={shapeUtils}
          onMount={(editor) => {
            editorRef.current = editor;
            syncWorkspaceToTldraw(editor, nodes);
            setZoom(editor.getZoomLevel());

            const removeListener = editor.store.listen(
              (entry) => {
                Object.values(entry.changes.updated).forEach(([from, to]) => {
                  if (from.typeName !== "shape" || to.typeName !== "shape") return;
                  if (from.type !== museboardShapeType || to.type !== museboardShapeType) return;
                  const shape = to as TLShape & { props: { nodeId: string } };
                  if (from.x !== to.x || from.y !== to.y) {
                    moveNode(shape.props.nodeId, to.x, to.y);
                  }
                });
                setZoom(editor.getZoomLevel());
              },
              { source: "user", scope: "document" },
            );

            return () => {
              removeListener();
              editorRef.current = null;
            };
          }}
        />
      </div>

      <div className={`floating-inspector ${inspectorCollapsed ? "collapsed" : ""}`}>
        <button
          className="inspector-toggle"
          type="button"
          aria-label={inspectorCollapsed ? "展开属性面板" : "收纳属性面板"}
          title={inspectorCollapsed ? "展开属性面板" : "收纳属性面板"}
          onClick={() => setInspectorCollapsed((current) => !current)}
        >
          {inspectorCollapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
        </button>
        {!inspectorCollapsed ? <InspectorPanel /> : null}
      </div>

      <CanvasToolbar
        zoom={zoom}
        onZoomIn={() => {
          editorRef.current?.zoomIn(undefined, { animation: { duration: 140 } });
          setZoom(editorRef.current?.getZoomLevel() ?? zoom);
        }}
        onZoomOut={() => {
          editorRef.current?.zoomOut(undefined, { animation: { duration: 140 } });
          setZoom(editorRef.current?.getZoomLevel() ?? zoom);
        }}
        onFit={() => {
          editorRef.current?.zoomToFit({ animation: { duration: 160 } });
          setZoom(editorRef.current?.getZoomLevel() ?? zoom);
        }}
      />
    </div>
  );
}
