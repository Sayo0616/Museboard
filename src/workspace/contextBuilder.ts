import type { CanvasNode, Workspace } from "./workspaceTypes";

export type WorkspaceContext = {
  selectedNodeIds: string[];
  selectedNodes: Pick<CanvasNode, "id" | "type" | "name" | "props">[];
  recentUserEvents: string[];
  viewport: {
    visibleNodeIds: string[];
  };
  summary: string;
};

export function buildWorkspaceContext(
  workspace: Workspace,
  selectedNodeIds: string[],
  recentUserEvents: string[],
): WorkspaceContext {
  const page = workspace.pages[0];
  const selectedNodes = page.nodes
    .filter((node) => selectedNodeIds.includes(node.id))
    .map(({ id, type, name, props }) => ({ id, type, name, props }));

  return {
    selectedNodeIds,
    selectedNodes,
    recentUserEvents: recentUserEvents.slice(-6),
    viewport: {
      visibleNodeIds: page.nodes.map((node) => node.id).slice(0, 16),
    },
    summary: buildWorkspaceSummary(workspace),
  };
}

export function buildWorkspaceSummary(workspace: Workspace): string {
  const page = workspace.pages[0];
  const counts = page.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.type] = (acc[node.type] ?? 0) + 1;
    return acc;
  }, {});

  const countText = Object.entries(counts)
    .map(([type, count]) => `${type} ${count}`)
    .join(", ");

  return `当前工作区「${workspace.title}」包含 ${page.nodes.length} 个节点：${countText || "空画板"}。`;
}
