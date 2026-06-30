import type { Page, Workspace } from "./workspaceTypes";

export function getActivePage(workspace: Workspace): Page {
  return workspace.pages.find((page) => page.id === workspace.activePageId) ?? workspace.pages[0];
}

export function getActivePageIndex(workspace: Workspace): number {
  const index = workspace.pages.findIndex((page) => page.id === workspace.activePageId);
  return index >= 0 ? index : 0;
}
