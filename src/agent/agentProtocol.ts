import type { CanvasEdge, CanvasNode, CanvasObjectLayout, WorkspaceObject, WorkspaceRelation, WorkspaceVariable, WorkspaceView } from "../workspace/workspaceTypes";

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

export type CreateObjectOperation = {
  type: "create_object";
  object: WorkspaceObject;
};

export type UpdateObjectOperation = {
  type: "update_object";
  objectId: string;
  patch: Record<string, unknown>;
};

export type DeleteObjectOperation = {
  type: "delete_object";
  objectId: string;
};

export type CreateViewOperation = {
  type: "create_view";
  view: WorkspaceView;
};

export type UpdateViewOperation = {
  type: "update_view";
  viewId: string;
  patch: Record<string, unknown>;
};

export type DeleteViewOperation = {
  type: "delete_view";
  viewId: string;
};

export type PlaceObjectInViewOperation = {
  type: "place_object_in_view";
  viewId?: string;
  objectId: string;
  layout: CanvasObjectLayout;
};

export type RemoveObjectFromViewOperation = {
  type: "remove_object_from_view";
  viewId?: string;
  objectId: string;
};

export type UpdateViewLayoutOperation = {
  type: "update_view_layout";
  viewId?: string;
  objectId: string;
  patch: Record<string, unknown>;
};

export type CreateRelationOperation = {
  type: "create_relation";
  relation: WorkspaceRelation;
};

export type UpdateRelationOperation = {
  type: "update_relation";
  relationId: string;
  patch: Partial<
    Pick<WorkspaceRelation, "sourceObjectId" | "targetObjectId" | "kind" | "label" | "props">
  >;
};

export type DeleteRelationOperation = {
  type: "delete_relation";
  relationId: string;
};

export type WorkspaceOperation =
  | CreateObjectOperation
  | UpdateObjectOperation
  | DeleteObjectOperation
  | CreateViewOperation
  | UpdateViewOperation
  | DeleteViewOperation
  | PlaceObjectInViewOperation
  | RemoveObjectFromViewOperation
  | UpdateViewLayoutOperation
  | CreateRelationOperation
  | UpdateRelationOperation
  | DeleteRelationOperation
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
