export type CanvasNodeType =
  | "text"
  | "button"
  | "slider"
  | "chart"
  | "mermaid"
  | "table"
  | "card"
  | "container"
  | "agent_plan"
  | "context_note";

export type WorkspaceMode = "edit" | "run" | "agent";

export type AgentPermissionLevel = "suggest" | "auto_apply_safe" | "confirm_destructive" | "manual_only";

export type AgentTransport = "local" | "http" | "sse" | "websocket";

export type WorkspaceVariable =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean };

export type Binding = {
  prop?: string;
  target?: string;
  variable: string;
};

export type CanvasPosition = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export type CanvasNode = {
  id: string;
  type: CanvasNodeType;
  name: string;
  position: CanvasPosition;
  props: Record<string, unknown>;
  state?: Record<string, unknown>;
  bindings?: {
    input?: Binding[];
    output?: Binding[];
  };
  permissions?: {
    userEditable: boolean;
    agentEditable: boolean;
    deletable: boolean;
  };
  metadata?: {
    createdBy: "user" | "agent";
    updatedBy: "user" | "agent";
    createdAt: string;
    updatedAt: string;
    description?: string;
  };
};

export type WorkspaceObjectKind =
  | "document"
  | "database_object"
  | "card"
  | "canvas"
  | "timeline"
  | "media"
  | "conversation"
  | "ai_artifact"
  | "dashboard";

export type WorkspaceObject = {
  id: string;
  kind: WorkspaceObjectKind;
  name: string;
  props: Record<string, unknown>;
  state?: Record<string, unknown>;
  bindings?: CanvasNode["bindings"];
  permissions?: {
    userEditable: boolean;
    agentEditable: boolean;
    deletable: boolean;
  };
  metadata: {
    createdBy: "user" | "agent";
    updatedBy: "user" | "agent";
    createdAt: string;
    updatedAt: string;
    description?: string;
    tags?: string[];
  };
};

export type CanvasObjectLayout = {
  objectId: string;
  rendererType: CanvasNodeType;
  position: CanvasPosition;
  localProps?: Record<string, unknown>;
  hidden?: boolean;
  locked?: boolean;
};

export type CanvasWorkspaceView = {
  id: string;
  kind: "canvas";
  name: string;
  objectIds: string[];
  layouts: Record<string, CanvasObjectLayout>;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
};

export type TableWorkspaceView = {
  id: string;
  kind: "table";
  name: string;
  objectIds: string[];
};

export type TimelineWorkspaceView = {
  id: string;
  kind: "timeline";
  name: string;
  objectIds: string[];
};

export type DashboardWorkspaceView = {
  id: string;
  kind: "dashboard";
  name: string;
  objectIds: string[];
};

export type GraphWorkspaceView = {
  id: string;
  kind: "graph";
  name: string;
  objectIds: string[];
  relationIds: string[];
};

export type WorkspaceView =
  | CanvasWorkspaceView
  | TableWorkspaceView
  | TimelineWorkspaceView
  | DashboardWorkspaceView
  | GraphWorkspaceView;

export type WorkspaceRelationKind = "reference" | "dependency" | "data_flow" | "comment" | "contains" | "derived_from";

export type WorkspaceRelation = {
  id: string;
  sourceObjectId: string;
  targetObjectId: string;
  kind: WorkspaceRelationKind;
  label?: string;
  props?: Record<string, unknown>;
  metadata: {
    createdBy: "user" | "agent";
    updatedBy: "user" | "agent";
    createdAt: string;
    updatedAt: string;
  };
};

export type WorkspaceDataSource = Record<string, unknown>;

export type EdgeHandle = "top" | "right" | "bottom" | "left";

export type EdgeArrowStyle = "none" | "arrow" | "circle" | "diamond";

export type EdgeLineStyle = "solid" | "dotted" | "dashed";

export type CanvasEdge = {
  id: string;
  sourceNodeId: string;
  sourceHandle?: EdgeHandle;
  targetNodeId: string;
  targetHandle?: EdgeHandle;
  type: "arrow" | "data_flow" | "dependency" | "comment";
  label?: string;
  strokeColor?: string;
  strokeWidth?: number;
  lineStyle?: EdgeLineStyle;
  startArrow?: EdgeArrowStyle;
  endArrow?: EdgeArrowStyle;
};

export type Page = {
  id: string;
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
};

export type Workspace = {
  schemaVersion: 2;
  id: string;
  title: string;
  version: number;
  activeViewId: string;
  objects: Record<string, WorkspaceObject>;
  views: Record<string, WorkspaceView>;
  relations: Record<string, WorkspaceRelation>;
  activePageId: string;
  pages: Page[];
  variables: Record<string, WorkspaceVariable>;
  dataSources: Record<string, WorkspaceDataSource>;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  createdAt: string;
};

export type VersionSnapshot = {
  id: string;
  version: number;
  label: string;
  createdAt: string;
  workspace: Workspace;
  diff: {
    nodesAdded: number;
    nodesRemoved: number;
    nodesUpdated: number;
    edgesAdded: number;
    edgesRemoved: number;
    variablesChanged: number;
  };
};
