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

type SelectionBox = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

export function CanvasPanel() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const selectNode = useWorkspaceStore((state) => state.selectNode);
  const selectEdge = useWorkspaceStore((state) => state.selectEdge);
  const moveNode = useWorkspaceStore((state) => state.moveNode);
  const resizeNode = useWorkspaceStore((state) => state.resizeNode);
  const mode = useWorkspaceStore((state) => state.mode);
  const selectedNodeIds = useWorkspaceStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useWorkspaceStore((state) => state.selectedEdgeIds);
  const setSelectedNodeIds = useWorkspaceStore((state) => state.setSelectedNodeIds);
  const createEdgeFromSelection = useWorkspaceStore((state) => state.createEdgeFromSelection);
  const deleteEdgesForSelection = useWorkspaceStore((state) => state.deleteEdgesForSelection);
  const activePage = getActivePage(workspace);
  const nodes = activePage.nodes;
  const edges = activePage.edges;
  const editorRef = useRef<Editor | null>(null);
  const isSyncingTldrawRef = useRef(false);
  const modeRef = useRef(mode);
  const nodesRef = useRef(nodes);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewportRevision, setViewportRevision] = useState(0);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const syncWorkspaceToTldraw = useCallback((editor: Editor, nextNodes: CanvasNode[]) => {
    isSyncingTldrawRef.current = true;
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
    try {
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
    } finally {
      queueMicrotask(() => {
        isSyncingTldrawRef.current = false;
      });
    }
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    syncWorkspaceToTldraw(editorRef.current, nodes);
  }, [nodes, syncWorkspaceToTldraw]);

  useEffect(() => {
    if (!editor) return;
    const nextShapeIds = selectedNodeIds.map(shapeIdForNode).filter((shapeId) => Boolean(editor.getShape(shapeId)));
    const currentShapeIds = editor
      .getSelectedShapeIds()
      .filter((shapeId) => editor.getShape(shapeId)?.type === museboardShapeType);
    if (areShapeIdListsEqual(currentShapeIds, nextShapeIds)) return;

    isSyncingTldrawRef.current = true;
    try {
      editor.setSelectedShapes(nextShapeIds);
    } finally {
      queueMicrotask(() => {
        isSyncingTldrawRef.current = false;
      });
    }
  }, [editor, selectedNodeIds]);

  return (
    <div className="canvas-panel">
      <div
        className="tldraw-host"
        onPointerDownCapture={(event) => {
          const target = event.target as HTMLElement;
          blurActiveEditableIfOutside(target);
          if (target.closest(".node-select-toggle")) return;
          if (target.closest(".canvas-edge-hit")) return;
          if (target.closest(".edge-controls")) return;
          const nodeElement = target.closest<HTMLElement>("[data-node-id]");
          if (nodeElement) {
            selectNode(nodeElement.dataset.nodeId ?? null, event.shiftKey || event.metaKey || event.ctrlKey);
            return;
          }

          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          selectNode(null);

          const hostRect = event.currentTarget.getBoundingClientRect();
          const start = { x: event.clientX - hostRect.left, y: event.clientY - hostRect.top };
          const startScreen = { x: event.clientX, y: event.clientY };
          setSelectionBox({ startX: start.x, startY: start.y, currentX: start.x, currentY: start.y });

          const handleMove = (moveEvent: PointerEvent) => {
            moveEvent.preventDefault();
            setSelectionBox((current) =>
              current
                ? {
                    ...current,
                    currentX: moveEvent.clientX - hostRect.left,
                    currentY: moveEvent.clientY - hostRect.top,
                  }
                : current,
            );
          };
          const handleUp = (upEvent: PointerEvent) => {
            upEvent.preventDefault();
            window.removeEventListener("pointermove", handleMove, true);
            window.removeEventListener("pointerup", handleUp, true);
            setSelectionBox(null);

            const distance = Math.hypot(upEvent.clientX - startScreen.x, upEvent.clientY - startScreen.y);
            if (distance < 4 || !editorRef.current) return;

            const startPage = editorRef.current.screenToPage(startScreen);
            const endPage = editorRef.current.screenToPage({ x: upEvent.clientX, y: upEvent.clientY });
            const bounds = normalizeBounds(startPage, endPage);
            setSelectedNodeIds(nodesRef.current.filter((node) => intersectsNode(node, bounds)).map((node) => node.id));
          };

          window.addEventListener("pointermove", handleMove, true);
          window.addEventListener("pointerup", handleUp, true);
        }}
      >
        <TldrawEditor
          shapeUtils={shapeUtils}
          tools={tools}
          initialState="select"
          onMount={(editor) => {
            editorRef.current = editor;
            setEditor(editor);
            syncWorkspaceToTldraw(editor, nodes);
            setZoom(editor.getZoomLevel());
            setViewportRevision((current) => current + 1);

            const removeListener = editor.store.listen(
              (entry) => {
                if (isSyncingTldrawRef.current) {
                  setZoom(editor.getZoomLevel());
                  setViewportRevision((current) => current + 1);
                  return;
                }

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
                setViewportRevision((current) => current + 1);
              },
              { source: "user", scope: "all" },
            );

            return () => {
              removeListener();
              editorRef.current = null;
              setEditor(null);
            };
          }}
        />
        <CanvasEdgesLayer
          nodes={nodes}
          edges={edges}
          selectedNodeIds={selectedNodeIds}
          selectedEdgeIds={selectedEdgeIds}
          editor={editor}
          viewportRevision={viewportRevision}
          onSelectEdge={selectEdge}
          onCreateEdge={createEdgeFromSelection}
          onDeleteSelectedEdges={deleteEdgesForSelection}
        />
        {selectionBox ? <div className="marquee-selection" style={selectionBoxStyle(selectionBox)} /> : null}
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
          setViewportRevision((current) => current + 1);
        }}
        onZoomOut={() => {
          editorRef.current?.zoomOut(undefined, { animation: { duration: 140 } });
          setZoom(editorRef.current?.getZoomLevel() ?? zoom);
          setViewportRevision((current) => current + 1);
        }}
        onFit={() => {
          editorRef.current?.zoomToFit({ animation: { duration: 160 } });
          setZoom(editorRef.current?.getZoomLevel() ?? zoom);
          setViewportRevision((current) => current + 1);
        }}
      />
    </div>
  );
}

function normalizeBounds(start: { x: number; y: number }, end: { x: number; y: number }) {
  const x1 = Math.min(start.x, end.x);
  const y1 = Math.min(start.y, end.y);
  const x2 = Math.max(start.x, end.x);
  const y2 = Math.max(start.y, end.y);
  return { x1, y1, x2, y2 };
}

function intersectsNode(node: CanvasNode, bounds: ReturnType<typeof normalizeBounds>) {
  const nodeX2 = node.position.x + node.position.width;
  const nodeY2 = node.position.y + node.position.height;
  return node.position.x <= bounds.x2 && nodeX2 >= bounds.x1 && node.position.y <= bounds.y2 && nodeY2 >= bounds.y1;
}

function blurActiveEditableIfOutside(target: HTMLElement) {
  const activeElement = target.ownerDocument.activeElement;
  if (!(activeElement instanceof HTMLElement)) return;
  if (!activeElement.matches("input, textarea, select, [contenteditable='true']")) return;
  if (activeElement.contains(target)) return;
  activeElement.blur();
}

function areShapeIdListsEqual(current: unknown[], next: unknown[]) {
  if (current.length !== next.length) return false;
  return current.every((shapeId, index) => shapeId === next[index]);
}

function selectionBoxStyle(box: SelectionBox) {
  const left = Math.min(box.startX, box.currentX);
  const top = Math.min(box.startY, box.currentY);
  const width = Math.abs(box.currentX - box.startX);
  const height = Math.abs(box.currentY - box.startY);
  return { left, top, width, height };
}
