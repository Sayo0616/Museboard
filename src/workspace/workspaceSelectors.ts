import type { CanvasEdge, CanvasNode, CanvasWorkspaceView, Page, Workspace, WorkspaceView } from "./workspaceTypes";
import { workspaceObjectToCanvasNode, workspaceRelationToCanvasEdge } from "./workspaceMigration";

export function getActivePage(workspace: Workspace): Page {
  const view = getActiveCanvasView(workspace);
  return {
    id: view.id,
    name: view.name,
    viewport: view.viewport,
    nodes: getCanvasNodesForView(workspace, view.id),
    edges: getCanvasEdgesForView(workspace, view.id),
  };
}

export function getActivePageIndex(workspace: Workspace): number {
  const index = getCanvasViews(workspace).findIndex((view) => view.id === workspace.activeViewId || view.id === workspace.activePageId);
  return index >= 0 ? index : 0;
}

export function getActiveWorkspaceView(workspace: Workspace): WorkspaceView {
  return workspace.views[workspace.activeViewId] ?? Object.values(workspace.views)[0];
}

export function getActiveCanvasView(workspace: Workspace): CanvasWorkspaceView {
  const activeView = getActiveWorkspaceView(workspace);
  if (activeView?.kind === "canvas") return activeView;
  return getCanvasViews(workspace)[0] ?? {
    id: "page_main",
    kind: "canvas",
    name: "Main canvas",
    objectIds: [],
    layouts: {},
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function getCanvasViews(workspace: Workspace): CanvasWorkspaceView[] {
  return Object.values(workspace.views).filter((view): view is CanvasWorkspaceView => view.kind === "canvas");
}

export function getCanvasNodesForView(workspace: Workspace, viewId: string): CanvasNode[] {
  const view = workspace.views[viewId];
  if (!view || view.kind !== "canvas") return [];

  return view.objectIds
    .map((objectId) => {
      const object = workspace.objects[objectId];
      const layout = view.layouts[objectId];
      if (!object || !layout || layout.hidden) return null;
      return workspaceObjectToCanvasNode(object, layout);
    })
    .filter((node): node is CanvasNode => Boolean(node));
}

export function getCanvasEdgesForView(workspace: Workspace, viewId: string): CanvasEdge[] {
  const view = workspace.views[viewId];
  if (!view || view.kind !== "canvas") return [];

  const visibleObjectIds = new Set(view.objectIds.filter((objectId) => Boolean(workspace.objects[objectId] && !view.layouts[objectId]?.hidden)));
  return Object.values(workspace.relations)
    .filter((relation) => visibleObjectIds.has(relation.sourceObjectId) && visibleObjectIds.has(relation.targetObjectId))
    .map(workspaceRelationToCanvasEdge);
}
