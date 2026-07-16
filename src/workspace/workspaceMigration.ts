import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeType,
  CanvasObjectLayout,
  CanvasWorkspaceView,
  Page,
  Workspace,
  WorkspaceObject,
  WorkspaceObjectKind,
  WorkspaceRelation,
  WorkspaceRelationKind,
  WorkspaceView,
} from "./workspaceTypes";

type LegacyWorkspace = Omit<Workspace, "schemaVersion" | "activeViewId" | "objects" | "views" | "relations"> & {
  schemaVersion?: number;
  activeViewId?: string;
  objects?: Record<string, WorkspaceObject>;
  views?: Record<string, WorkspaceView>;
  relations?: Record<string, WorkspaceRelation>;
};

const defaultTimestamp = "2026-01-01T00:00:00.000Z";

export function migrateLegacyWorkspaceToV2(value: unknown): Workspace {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Workspace must be an object");
  }

  const input = value as Partial<LegacyWorkspace>;
  if (input.schemaVersion === 2 && input.objects && input.views && input.relations) {
    return syncLegacyPagesFromV2(normalizeV2Workspace(input as Workspace));
  }

  if (!Array.isArray(input.pages) || input.pages.length === 0) {
    throw new Error("Legacy workspace must contain at least one page");
  }

  const objects: Record<string, WorkspaceObject> = {};
  const views: Record<string, WorkspaceView> = {};
  const relations: Record<string, WorkspaceRelation> = {};
  const createdAt = input.createdAt ?? defaultTimestamp;
  const updatedAt = input.updatedAt ?? createdAt;

  input.pages.forEach((legacyPage) => {
    const page = normalizeLegacyPage(legacyPage);
    const view: CanvasWorkspaceView = {
      id: page.id,
      kind: "canvas",
      name: page.name,
      objectIds: [],
      layouts: {},
      viewport: page.viewport,
    };

    page.nodes.forEach((legacyNode) => {
      const node = migrateLegacyNode(legacyNode);
      objects[node.id] = canvasNodeToWorkspaceObject(node, createdAt, updatedAt);
      view.objectIds.push(node.id);
      view.layouts[node.id] = {
        objectId: node.id,
        rendererType: node.type,
        position: node.position,
      };
    });

    page.edges.forEach((edge) => {
      relations[edge.id] = canvasEdgeToWorkspaceRelation(edge, createdAt, updatedAt);
    });

    views[view.id] = view;
  });

  const firstPageId = input.pages[0]?.id ?? "page_main";
  const activeViewId = input.activeViewId ?? input.activePageId ?? firstPageId;
  const workspace: Workspace = {
    schemaVersion: 2,
    id: input.id ?? "workspace_museboard",
    title: input.title ?? "Museboard Workspace",
    version: input.version ?? 1,
    activeViewId,
    activePageId: activeViewId,
    objects,
    views,
    relations,
    variables: input.variables ?? {},
    dataSources: input.dataSources ?? {},
    createdAt,
    updatedAt,
    pages: [],
  };

  return syncLegacyPagesFromV2(workspace);
}

export function syncLegacyPagesFromV2(workspace: Workspace): Workspace {
  const pages = Object.values(workspace.views)
    .filter((view): view is CanvasWorkspaceView => view.kind === "canvas")
    .map((view) => canvasViewToPage(workspace, view));

  const fallbackPage: Page =
    pages[0] ?? {
      id: "page_main",
      name: "Main canvas",
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
  const activeView = workspace.views[workspace.activeViewId];
  const activePageId = activeView?.kind === "canvas" ? activeView.id : fallbackPage.id;

  return {
    ...workspace,
    schemaVersion: 2,
    activePageId,
    pages,
  };
}

export function canvasNodeToWorkspaceObject(node: CanvasNode, createdAt: string, updatedAt: string): WorkspaceObject {
  return {
    id: node.id,
    kind: objectKindForNodeType(node.type),
    name: node.name,
    props: structuredClone(node.props),
    state: node.state ? structuredClone(node.state) : undefined,
    bindings: node.bindings ? structuredClone(node.bindings) : undefined,
    permissions: node.permissions ? structuredClone(node.permissions) : { userEditable: true, agentEditable: true, deletable: true },
    metadata: {
      createdBy: node.metadata?.createdBy ?? "user",
      updatedBy: node.metadata?.updatedBy ?? "user",
      createdAt: node.metadata?.createdAt ?? createdAt,
      updatedAt: node.metadata?.updatedAt ?? updatedAt,
      description: node.metadata?.description,
    },
  };
}

export function canvasEdgeToWorkspaceRelation(edge: CanvasEdge, createdAt: string, updatedAt: string): WorkspaceRelation {
  return {
    id: edge.id,
    sourceObjectId: edge.sourceNodeId,
    targetObjectId: edge.targetNodeId,
    kind: relationKindForEdgeType(edge.type),
    label: edge.label,
    props: {
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      edgeType: edge.type,
      strokeColor: edge.strokeColor,
      strokeWidth: edge.strokeWidth,
      lineStyle: edge.lineStyle,
      startArrow: edge.startArrow,
      endArrow: edge.endArrow,
    },
    metadata: {
      createdBy: "user",
      updatedBy: "user",
      createdAt,
      updatedAt,
    },
  };
}

export function workspaceObjectToCanvasNode(object: WorkspaceObject, layout: CanvasObjectLayout): CanvasNode {
  return {
    id: object.id,
    type: layout.rendererType,
    name: object.name,
    position: layout.position,
    props: { ...structuredClone(object.props), ...(layout.localProps ? structuredClone(layout.localProps) : {}) },
    state: object.state ? structuredClone(object.state) : undefined,
    bindings: object.bindings ? structuredClone(object.bindings) : undefined,
    permissions: object.permissions ? structuredClone(object.permissions) : undefined,
    metadata: {
      createdBy: object.metadata.createdBy,
      updatedBy: object.metadata.updatedBy,
      createdAt: object.metadata.createdAt,
      updatedAt: object.metadata.updatedAt,
      description: object.metadata.description,
    },
  };
}

export function workspaceRelationToCanvasEdge(relation: WorkspaceRelation): CanvasEdge {
  const props = relation.props ?? {};
  return {
    id: relation.id,
    sourceNodeId: relation.sourceObjectId,
    targetNodeId: relation.targetObjectId,
    type: edgeTypeForRelationKind(relation.kind, props.edgeType),
    label: relation.label,
    sourceHandle: asEdgeHandle(props.sourceHandle),
    targetHandle: asEdgeHandle(props.targetHandle),
    strokeColor: typeof props.strokeColor === "string" ? props.strokeColor : undefined,
    strokeWidth: typeof props.strokeWidth === "number" ? props.strokeWidth : undefined,
    lineStyle: props.lineStyle === "dotted" || props.lineStyle === "dashed" || props.lineStyle === "solid" ? props.lineStyle : undefined,
    startArrow:
      props.startArrow === "none" || props.startArrow === "arrow" || props.startArrow === "circle" || props.startArrow === "diamond"
        ? props.startArrow
        : undefined,
    endArrow:
      props.endArrow === "none" || props.endArrow === "arrow" || props.endArrow === "circle" || props.endArrow === "diamond"
        ? props.endArrow
        : undefined,
  };
}

function normalizeV2Workspace(workspace: Workspace): Workspace {
  return {
    ...workspace,
    schemaVersion: 2,
    activeViewId: workspace.activeViewId,
    activePageId: workspace.activePageId ?? workspace.activeViewId,
    pages: [],
  };
}

function canvasViewToPage(workspace: Workspace, view: CanvasWorkspaceView): Page {
  const nodes = view.objectIds
    .map((objectId) => {
      const object = workspace.objects[objectId];
      const layout = view.layouts[objectId];
      if (!object || !layout || layout.hidden) return null;
      return workspaceObjectToCanvasNode(object, layout);
    })
    .filter((node): node is CanvasNode => Boolean(node));

  const visibleObjectIds = new Set(nodes.map((node) => node.id));
  const edges = Object.values(workspace.relations)
    .filter((relation) => visibleObjectIds.has(relation.sourceObjectId) && visibleObjectIds.has(relation.targetObjectId))
    .map(workspaceRelationToCanvasEdge);

  return {
    id: view.id,
    name: view.name,
    viewport: view.viewport,
    nodes,
    edges,
  };
}

function normalizeLegacyPage(page: Page): Page {
  return {
    ...page,
    nodes: page.nodes.map(migrateLegacyNode),
  };
}

function migrateLegacyNode(node: CanvasNode): CanvasNode {
  if ((node as unknown as { type?: string }).type !== "flowchart") return node;
  return {
    ...node,
    type: "mermaid",
    props: migrateFlowchartProps(node.props),
  };
}

function migrateFlowchartProps(props: Record<string, unknown>): Record<string, unknown> {
  if (typeof props.source === "string" && props.source.trim()) {
    return {
      ...props,
      diagramType: typeof props.diagramType === "string" ? props.diagramType : "flowchart",
      theme: props.theme === "default" ? "default" : "neutral",
    };
  }

  const steps = Array.isArray(props.steps) ? props.steps.map((step) => String(step).trim()).filter(Boolean) : [];
  const source =
    steps.length > 0
      ? ["flowchart TD", ...steps.map((step, index) => `  N${index + 1}[${escapeMermaidLabel(step)}]${index < steps.length - 1 ? ` --> N${index + 2}` : ""}`)].join("\n")
      : "flowchart TD\n  A[Input] --> B[Process]\n  B --> C[Output]";

  return {
    title: props.title,
    diagramType: "flowchart",
    theme: "neutral",
    source,
  };
}

function escapeMermaidLabel(label: string): string {
  return label.replace(/[\[\]]/g, "");
}

function objectKindForNodeType(type: CanvasNodeType): WorkspaceObjectKind {
  if (type === "table") return "database_object";
  if (type === "mermaid" || type === "agent_plan") return "ai_artifact";
  if (type === "text" || type === "context_note") return "document";
  if (type === "chart") return "dashboard";
  if (type === "container") return "canvas";
  return "card";
}

function relationKindForEdgeType(type: CanvasEdge["type"]): WorkspaceRelationKind {
  if (type === "data_flow") return "data_flow";
  if (type === "comment") return "comment";
  if (type === "dependency") return "dependency";
  return "reference";
}

function edgeTypeForRelationKind(kind: WorkspaceRelationKind, edgeType: unknown): CanvasEdge["type"] {
  if (edgeType === "arrow" || edgeType === "data_flow" || edgeType === "dependency" || edgeType === "comment") return edgeType;
  if (kind === "data_flow") return "data_flow";
  if (kind === "comment") return "comment";
  if (kind === "dependency") return "dependency";
  return "arrow";
}

function asEdgeHandle(value: unknown): CanvasEdge["sourceHandle"] {
  return value === "top" || value === "right" || value === "bottom" || value === "left" ? value : undefined;
}
