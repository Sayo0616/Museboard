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

export type CanvasEdge = {
  id: string;
  sourceNodeId: string;
  sourceHandle?: string;
  targetNodeId: string;
  targetHandle?: string;
  type: "arrow" | "data_flow" | "dependency" | "comment";
  label?: string;
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
  id: string;
  title: string;
  version: number;
  activePageId: string;
  pages: Page[];
  variables: Record<string, WorkspaceVariable>;
  dataSources: Record<string, unknown>;
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
