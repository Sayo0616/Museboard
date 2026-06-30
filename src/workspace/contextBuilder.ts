import type { CanvasNode, Workspace } from "./workspaceTypes";
import { getActivePage } from "./workspaceSelectors";

export type NodeContextSummary = Pick<CanvasNode, "id" | "type" | "name"> & {
  keyProps: Record<string, unknown>;
};

export type WorkspaceContext = {
  selectedNodeIds: string[];
  selectedNodes: NodeContextSummary[];
  mentionedNodes: NodeContextSummary[];
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
  userMessage = "",
): WorkspaceContext {
  const page = getActivePage(workspace);
  const selectedNodes = page.nodes
    .filter((node) => selectedNodeIds.includes(node.id))
    .map(toNodeContextSummary);
  const mentionedNodes = page.nodes.filter((node) => userMessage.includes(`@${node.name}`)).map(toNodeContextSummary);

  return {
    selectedNodeIds,
    selectedNodes,
    mentionedNodes,
    recentUserEvents: recentUserEvents.slice(-6),
    viewport: {
      visibleNodeIds: page.nodes.map((node) => node.id).slice(0, 16),
    },
    summary: buildWorkspaceSummary(workspace),
  };
}

export function buildWorkspaceSummary(workspace: Workspace): string {
  const page = getActivePage(workspace);
  const counts = page.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.type] = (acc[node.type] ?? 0) + 1;
    return acc;
  }, {});

  const countText = Object.entries(counts)
    .map(([type, count]) => `${type} ${count}`)
    .join(", ");

  return `当前工作区「${workspace.title}」的「${page.name}」页面包含 ${page.nodes.length} 个节点：${countText || "空画板"}。`;
}

function toNodeContextSummary(node: CanvasNode): NodeContextSummary {
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    keyProps: pickKeyProps(node),
  };
}

function pickKeyProps(node: CanvasNode): Record<string, unknown> {
  const allowedByType: Record<CanvasNode["type"], string[]> = {
    text: ["title", "text"],
    context_note: ["title", "text"],
    agent_plan: ["title", "text"],
    button: ["label", "action"],
    slider: ["label", "min", "max", "step", "value", "unit"],
    chart: ["title", "chartType", "data", "labels"],
    flowchart: ["title", "steps"],
    table: ["columns", "rows"],
    card: ["title", "value", "detail"],
    container: ["title", "detail"],
  };

  return allowedByType[node.type].reduce<Record<string, unknown>>((summary, key) => {
    if (typeof node.props[key] !== "undefined") {
      summary[key] = compactValue(node.props[key]);
    }
    return summary;
  }, {});
}

function compactValue(value: unknown): unknown {
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 160)}...` : value;
  if (Array.isArray(value)) return value.slice(0, 8);
  return value;
}
