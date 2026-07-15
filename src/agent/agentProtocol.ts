import type { CanvasEdge, CanvasNode, WorkspaceVariable } from "../workspace/workspaceTypes";

export type CreateNodeOperation = {
  type: "create_node";
  node: CanvasNode;
};

export type UpdateNodeOperation = {
  type: "update_node";
  nodeId: string;
  patch: Record<string, unknown>;
};

export type DeleteNodeOperation = {
  type: "delete_node";
  nodeId: string;
};

export type MoveNodeOperation = {
  type: "move_node";
  nodeId: string;
  position: Partial<CanvasNode["position"]>;
};

export type CreateEdgeOperation = {
  type: "create_edge";
  edge: CanvasEdge;
};

export type UpdateEdgeOperation = {
  type: "update_edge";
  edgeId: string;
  patch: Partial<
    Pick<
      CanvasEdge,
      | "sourceNodeId"
      | "targetNodeId"
      | "type"
      | "label"
      | "sourceHandle"
      | "targetHandle"
      | "strokeColor"
      | "strokeWidth"
      | "lineStyle"
      | "startArrow"
      | "endArrow"
    >
  >;
};

export type DeleteEdgeOperation = {
  type: "delete_edge";
  edgeId: string;
};

export type GroupNodesOperation = {
  type: "group_nodes";
  nodeIds: string[];
  name: string;
};

export type SetVariableOperation = {
  type: "set_variable";
  key: string;
  variable: WorkspaceVariable;
};

export type WorkspaceOperation =
  | CreateNodeOperation
  | UpdateNodeOperation
  | DeleteNodeOperation
  | MoveNodeOperation
  | CreateEdgeOperation
  | UpdateEdgeOperation
  | DeleteEdgeOperation
  | GroupNodesOperation
  | SetVariableOperation;

export type AgentResponse = {
  message: string;
  operations: WorkspaceOperation[];
  requiresConfirmation?: boolean;
};
