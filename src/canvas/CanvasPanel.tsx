import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Copy, LockKeyhole, PanelRightClose, PanelRightOpen, Trash2, UnlockKeyhole } from "lucide-react";
import { TldrawEditor, Vec, defaultTools, type Editor, type TLShape } from "tldraw";
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

type NodeContextMenu = {
  nodeId: string;
  x: number;
  y: number;
};

export function CanvasPanel() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const selectNode = useWorkspaceStore((state) => state.selectNode);
  const selectEdge = useWorkspaceStore((state) => state.selectEdge);
  const setActiveNode = useWorkspaceStore((state) => state.setActiveNode);
  const setHoveredNode = useWorkspaceStore((state) => state.setHoveredNode);
  const moveNode = useWorkspaceStore((state) => state.moveNode);
  const resizeNode = useWorkspaceStore((state) => state.resizeNode);
  const mode = useWorkspaceStore((state) => state.mode);
  const selectedNodeIds = useWorkspaceStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useWorkspaceStore((state) => state.selectedEdgeIds);
  const setSelectedNodeIds = useWorkspaceStore((state) => state.setSelectedNodeIds);
  const duplicateNode = useWorkspaceStore((state) => state.duplicateNode);
  const deleteNode = useWorkspaceStore((state) => state.deleteNode);
  const toggleLockNode = useWorkspaceStore((state) => state.toggleLockNode);
  const createEdgeFromSelection = useWorkspaceStore((state) => state.createEdgeFromSelection);
  const deleteEdgesForSelection = useWorkspaceStore((state) => state.deleteEdgesForSelection);
  const activePage = getActivePage(workspace);
  const nodes = activePage.nodes;
  const edges = activePage.edges;
  const editorRef = useRef<Editor | null>(null);
  const isSyncingTldrawRef = useRef(false);
  const suppressTldrawSelectionRef = useRef(false);
  const modeRef = useRef(mode);
  const nodesRef = useRef(nodes);
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewportRevision, setViewportRevision] = useState(0);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<NodeContextMenu | null>(null);
  const [isMiddlePanning, setIsMiddlePanning] = useState(false);
  const contextNode = nodeContextMenu ? nodes.find((node) => node.id === nodeContextMenu.nodeId) : null;

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds;
  }, [selectedNodeIds]);

  useEffect(() => {
    if (!nodeContextMenu) return;
    if (!nodes.some((node) => node.id === nodeContextMenu.nodeId)) {
      setNodeContextMenu(null);
    }
  }, [nodeContextMenu, nodes]);

  const startMiddlePan = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const editor = editorRef.current;
    if (!editor) return;
    event.preventDefault();
    event.stopPropagation();
    setNodeContextMenu(null);
    setSelectionBox(null);
    setIsMiddlePanning(true);
    suppressTldrawSelectionRef.current = true;
    editor.stopCameraAnimation();

    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      camera: editor.getCamera(),
    };

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      moveEvent.stopImmediatePropagation();
      editor.setCamera({
        x: start.camera.x + moveEvent.clientX - start.clientX,
        y: start.camera.y + moveEvent.clientY - start.clientY,
        z: start.camera.z,
      });
      setZoom(editor.getZoomLevel());
      setViewportRevision((current) => current + 1);
    };

    const stopPan = (upEvent: PointerEvent) => {
      upEvent.preventDefault();
      upEvent.stopImmediatePropagation();
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", stopPan, true);
      window.removeEventListener("pointercancel", stopPan, true);
      setIsMiddlePanning(false);
      window.setTimeout(() => {
        suppressTldrawSelectionRef.current = false;
      }, 80);
    };

    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", stopPan, true);
    window.addEventListener("pointercancel", stopPan, true);
  }, []);

  const handleWheelZoom = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    const editor = editorRef.current;
    if (!editor) return;
    event.preventDefault();
    event.stopPropagation();
    const point = new Vec(event.clientX, event.clientY);
    if (event.deltaY < 0) {
      editor.zoomIn(point, { animation: { duration: 80 } });
    } else if (event.deltaY > 0) {
      editor.zoomOut(point, { animation: { duration: 80 } });
    }
    setZoom(editor.getZoomLevel());
    setViewportRevision((current) => current + 1);
  }, []);

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
        className={`tldraw-host ${isMiddlePanning ? "middle-panning" : ""}`}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
        onWheelCapture={handleWheelZoom}
        onPointerMoveCapture={(event) => {
          const nodeElement = (event.target as HTMLElement).closest<HTMLElement>("[data-node-id]");
          setHoveredNode(nodeElement?.dataset.nodeId ?? null);
        }}
        onPointerLeave={() => setHoveredNode(null)}
        onPointerDownCapture={(event) => {
          const target = event.target as HTMLElement;
          blurActiveEditableIfOutside(target);
          if (event.button === 1) {
            startMiddlePan(event);
            return;
          }
          if (target.closest(".node-select-toggle")) return;
          if (target.closest(".node-drag-handle")) return;
          if (target.closest(".node-resize-handle")) return;
          if (target.closest(".canvas-edge-hit")) return;
          if (target.closest(".edge-controls")) return;
          const nodeElement = target.closest<HTMLElement>("[data-node-id]");
          if (nodeElement) {
            const nodeId = nodeElement.dataset.nodeId ?? null;
            if (event.button === 2 && nodeId) {
              event.preventDefault();
              event.stopPropagation();
              suppressTldrawSelectionRef.current = true;
              const hostRect = event.currentTarget.getBoundingClientRect();
              setActiveNode(nodeId);
              setNodeContextMenu({
                nodeId,
                x: event.clientX - hostRect.left,
                y: event.clientY - hostRect.top,
              });
              window.setTimeout(() => {
                suppressTldrawSelectionRef.current = false;
              }, 80);
              return;
            }
            if (event.button === 0) {
              setNodeContextMenu(null);
              selectNode(nodeId, event.shiftKey || event.metaKey || event.ctrlKey);
            }
            return;
          }

          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          setNodeContextMenu(null);
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
                if (suppressTldrawSelectionRef.current && !areStringListsEqual(selectedNodeIdsFromEditor, selectedNodeIdsRef.current)) {
                  isSyncingTldrawRef.current = true;
                  try {
                    editor.setSelectedShapes(
                      selectedNodeIdsRef.current.map(shapeIdForNode).filter((shapeId) => Boolean(editor.getShape(shapeId))),
                    );
                  } finally {
                    queueMicrotask(() => {
                      isSyncingTldrawRef.current = false;
                    });
                  }
                  setZoom(editor.getZoomLevel());
                  setViewportRevision((current) => current + 1);
                  return;
                }
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
        {contextNode ? (
          <div className="node-context-menu" style={{ left: nodeContextMenu?.x, top: nodeContextMenu?.y }} role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                duplicateNode(contextNode.id);
                setNodeContextMenu(null);
              }}
            >
              <Copy size={14} />
              <span>复制</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                toggleLockNode(contextNode.id);
                setNodeContextMenu(null);
              }}
            >
              {contextNode.permissions?.agentEditable === false ? <UnlockKeyhole size={14} /> : <LockKeyhole size={14} />}
              <span>{contextNode.permissions?.agentEditable === false ? "解锁 Agent" : "锁定 Agent"}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                deleteNode(contextNode.id);
                setNodeContextMenu(null);
              }}
            >
              <Trash2 size={14} />
              <span>删除</span>
            </button>
          </div>
        ) : null}
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

function areStringListsEqual(current: string[], next: string[]) {
  if (current.length !== next.length) return false;
  return current.every((item, index) => item === next[index]);
}

function selectionBoxStyle(box: SelectionBox) {
  const left = Math.min(box.startX, box.currentX);
  const top = Math.min(box.startY, box.currentY);
  const width = Math.abs(box.currentX - box.startX);
  const height = Math.abs(box.currentY - box.startY);
  return { left, top, width, height };
}
