import { useCallback, useEffect, useRef, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { TldrawEditor, defaultTools, type Editor, type TLShape } from "tldraw";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasEdgesLayer } from "./CanvasEdgesLayer";
import { MuseboardNodeShapeUtil, museboardShapeType, shapeIdForNode } from "./TldrawNodeShape";
import { InspectorPanel } from "../inspector/InspectorPanel";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { getActivePage } from "../workspace/workspaceSelectors";
import type { CanvasNode } from "../workspace/workspaceTypes";

const shapeUtils = [MuseboardNodeShapeUtil];
const tools = [...defaultTools];

export function CanvasPanel() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const selectNode = useWorkspaceStore((state) => state.selectNode);
  const moveNode = useWorkspaceStore((state) => state.moveNode);
  const resizeNode = useWorkspaceStore((state) => state.resizeNode);
  const mode = useWorkspaceStore((state) => state.mode);
  const selectedNodeIds = useWorkspaceStore((state) => state.selectedNodeIds);
  const setSelectedNodeIds = useWorkspaceStore((state) => state.setSelectedNodeIds);
  const createEdgeFromSelection = useWorkspaceStore((state) => state.createEdgeFromSelection);
  const deleteEdgesForSelection = useWorkspaceStore((state) => state.deleteEdgesForSelection);
  const activePage = getActivePage(workspace);
  const nodes = activePage.nodes;
  const edges = activePage.edges;
  const editorRef = useRef<Editor | null>(null);
  const modeRef = useRef(mode);
  const nodesRef = useRef(nodes);
  const [zoom, setZoom] = useState(1);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

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
      <div
        className="tldraw-host"
        onPointerDownCapture={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest(".node-select-toggle")) return;
          const nodeElement = target.closest<HTMLElement>("[data-node-id]");
          if (!nodeElement) return;
          selectNode(nodeElement.dataset.nodeId ?? null, event.shiftKey || event.metaKey || event.ctrlKey);
        }}
      >
        <TldrawEditor
          shapeUtils={shapeUtils}
          tools={tools}
          initialState="select"
          onMount={(editor) => {
            editorRef.current = editor;
            syncWorkspaceToTldraw(editor, nodes);
            setZoom(editor.getZoomLevel());

            const removeListener = editor.store.listen(
              (entry) => {
                const selectedNodeIdsFromEditor = editor
                  .getSelectedShapes()
                  .filter((shape): shape is TLShape & { type: typeof museboardShapeType; props: { nodeId: string } } => {
                    return shape.type === museboardShapeType;
                  })
                  .map((shape) => shape.props.nodeId);
                if (selectedNodeIdsFromEditor.length > 0) {
                  setSelectedNodeIds(selectedNodeIdsFromEditor);
                }

                Object.values(entry.changes.updated).forEach(([from, to]) => {
                  if (from.typeName !== "shape" || to.typeName !== "shape") return;
                  if (from.type !== museboardShapeType || to.type !== museboardShapeType) return;
                  const shape = to as TLShape & { props: { nodeId: string; w: number; h: number } };
                  if (modeRef.current === "run") {
                    syncWorkspaceToTldraw(editor, nodesRef.current);
                    return;
                  }
                  const previousShape = from as TLShape & { props: { w: number; h: number } };
                  const didResize = previousShape.props.w !== shape.props.w || previousShape.props.h !== shape.props.h;
                  if (didResize) {
                    resizeNode(shape.props.nodeId, to.x, to.y, shape.props.w, shape.props.h);
                  } else if (from.x !== to.x || from.y !== to.y) {
                    moveNode(shape.props.nodeId, to.x, to.y);
                  }
                });
                setZoom(editor.getZoomLevel());
              },
              { source: "user", scope: "all" },
            );

            return () => {
              removeListener();
              editorRef.current = null;
            };
          }}
        />
        <CanvasEdgesLayer
          nodes={nodes}
          edges={edges}
          selectedNodeIds={selectedNodeIds}
          onCreateEdge={createEdgeFromSelection}
          onDeleteSelectedEdges={deleteEdgesForSelection}
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
