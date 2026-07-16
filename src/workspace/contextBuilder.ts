import type { CanvasNode, Workspace, WorkspaceObject, WorkspaceRelation, WorkspaceView } from "./workspaceTypes";
import { getActiveCanvasView, getCanvasNodesForView } from "./workspaceSelectors";

export type NodeContextSummary = {
  id: string;
  type: string;
  name: string;
  keyProps: Record<string, unknown>;
};

export type RelationContextSummary = Pick<WorkspaceRelation, "id" | "sourceObjectId" | "targetObjectId" | "kind" | "label">;

export type MentionToken = {
  objectId: string;
  label: string;
};

export type WorkspaceContext = {
  activeView: {
    id: string;
    kind: WorkspaceView["kind"];
    name: string;
    visibleObjectIds: string[];
  };
  selectedNodeIds: string[];
  selectedObjects: NodeContextSummary[];
  selectedNodes: NodeContextSummary[];
  mentionedObjects: NodeContextSummary[];
  mentionedNodes: NodeContextSummary[];
  relatedObjects: NodeContextSummary[];
  relations: RelationContextSummary[];
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
  const activeView = getActiveCanvasView(workspace);
  const nodes = getCanvasNodesForView(workspace, activeView.id);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const selectedObjects = nodes.filter((node) => selectedNodeIds.includes(node.id)).map(toNodeContextSummary);
  const mentionTokens = parseMentionTokens(userMessage);
  const mentionedIds = new Set(mentionTokens.map((token) => token.objectId));
  const mentionedObjects = uniqueById([
    ...[...mentionedIds]
      .map((objectId) => workspace.objects[objectId])
      .filter((object): object is WorkspaceObject => Boolean(object))
      .map((object) => toObjectContextSummary(object, nodeMap.get(object.id))),
    ...nodes.filter((node) => userMessage.includes(`@${node.name}`)).map(toNodeContextSummary),
  ]);
  const focusObjectIds = new Set([...selectedObjects, ...mentionedObjects].map((object) => object.id));
  const relations = Object.values(workspace.relations)
    .filter((relation) => focusObjectIds.size === 0 || focusObjectIds.has(relation.sourceObjectId) || focusObjectIds.has(relation.targetObjectId))
    .map(toRelationContextSummary);
  const relatedObjectIds = new Set(
    relations.flatMap((relation) => [relation.sourceObjectId, relation.targetObjectId]).filter((objectId) => !focusObjectIds.has(objectId)),
  );
  const relatedObjects = [...relatedObjectIds]
    .map((objectId) => workspace.objects[objectId])
    .filter((object): object is WorkspaceObject => Boolean(object))
    .map((object) => toObjectContextSummary(object, nodeMap.get(object.id)));

  return {
    activeView: {
      id: activeView.id,
      kind: activeView.kind,
      name: activeView.name,
      visibleObjectIds: nodes.map((node) => node.id),
    },
    selectedNodeIds,
    selectedObjects,
    selectedNodes: selectedObjects,
    mentionedObjects,
    mentionedNodes: mentionedObjects,
    relatedObjects,
    relations,
    recentUserEvents: recentUserEvents.slice(-6),
    viewport: {
      visibleNodeIds: nodes.map((node) => node.id).slice(0, 16),
    },
    summary: buildWorkspaceSummary(workspace),
  };
}

export function buildWorkspaceSummary(workspace: Workspace): string {
  const objectCounts = countBy(Object.values(workspace.objects), (object) => object.kind);
  const viewCounts = countBy(Object.values(workspace.views), (view) => view.kind);
  const relationCounts = countBy(Object.values(workspace.relations), (relation) => relation.kind);

  return `Workspace "${workspace.title}" has ${Object.keys(workspace.objects).length} objects (${formatCounts(objectCounts)}), ${Object.keys(workspace.views).length} views (${formatCounts(viewCounts)}), and ${Object.keys(workspace.relations).length} relations (${formatCounts(relationCounts)}).`;
}

function toNodeContextSummary(node: CanvasNode): NodeContextSummary {
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    keyProps: pickKeyProps(node),
  };
}

function toObjectContextSummary(object: WorkspaceObject, projection?: CanvasNode): NodeContextSummary {
  if (projection) return toNodeContextSummary(projection);
  return {
    id: object.id,
    type: object.kind,
    name: object.name,
    keyProps: pickObjectKeyProps(object),
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
    mermaid: ["title", "diagramType", "source"],
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

function pickObjectKeyProps(object: WorkspaceObject): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(object.props)
      .filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean" || Array.isArray(value))
      .slice(0, 8)
      .map(([key, value]) => [key, compactValue(value)]),
  );
}

function uniqueById(items: NodeContextSummary[]): NodeContextSummary[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function parseMentionTokens(text: string): MentionToken[] {
  return [...text.matchAll(/@\[([^\]]+)\]\(object:([^)]+)\)/g)].map((match) => ({
    label: match[1],
    objectId: match[2],
  }));
}

function toRelationContextSummary(relation: WorkspaceRelation): RelationContextSummary {
  return {
    id: relation.id,
    sourceObjectId: relation.sourceObjectId,
    targetObjectId: relation.targetObjectId,
    kind: relation.kind,
    label: relation.label,
  };
}

function countBy<T>(items: T[], getKey: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function formatCounts(counts: Record<string, number>): string {
  const text = Object.entries(counts)
    .map(([type, count]) => `${type} ${count}`)
    .join(", ");
  return text || "none";
}
