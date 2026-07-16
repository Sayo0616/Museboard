import { agentResponseSchema, workspaceOperationSchema } from "../agent/operationSchemas";
import type { AgentResponse, WorkspaceOperation } from "../agent/agentProtocol";
import type { CanvasEdge, CanvasNode, CanvasWorkspaceView, Workspace, WorkspaceObject, WorkspaceRelation, WorkspaceVariable } from "./workspaceTypes";
import { nowIso } from "../utils/id";
import { setAtPath } from "../utils/patch";
import { validateComponentProps } from "../components-registry/registry";
import {
  canvasEdgeToWorkspaceRelation,
  canvasNodeToWorkspaceObject,
  migrateLegacyWorkspaceToV2,
  syncLegacyPagesFromV2,
  workspaceObjectToCanvasNode,
  workspaceRelationToCanvasEdge,
} from "./workspaceMigration";
import { getActiveCanvasView, getCanvasNodesForView, getCanvasViews } from "./workspaceSelectors";
import { validateWorkspace } from "./workspaceSchema";

const destructiveOperations = new Set<WorkspaceOperation["type"]>([
  "delete_node",
  "delete_edge",
  "delete_object",
  "delete_view",
  "delete_relation",
  "remove_object_from_view",
]);
type OperationActor = "agent" | "user";

const userOnlyUpdateRoots = new Set(["permissions"]);
const positionFields = new Set(["x", "y", "width", "height", "rotation"]);
const relationPresentationKeys = new Set([
  "sourceHandle",
  "targetHandle",
  "edgeType",
  "strokeColor",
  "strokeWidth",
  "lineStyle",
  "startArrow",
  "endArrow",
]);

export function validateAgentResponse(response: unknown): AgentResponse {
  return agentResponseSchema.parse(response);
}

export function isDestructiveOperation(operation: WorkspaceOperation): boolean {
  return destructiveOperations.has(operation.type);
}

export function applyOperations(workspace: Workspace, operations: WorkspaceOperation[], actor: OperationActor = "agent"): Workspace {
  if (operations.length === 0) return workspace;

  let next = migrateLegacyWorkspaceToV2(workspace);

  operations.forEach((operation) => {
    const parsed = workspaceOperationSchema.parse(operation);
    next = applyOperation(next, parsed as WorkspaceOperation, actor);
  });

  next = validateWorkspaceComponentProps(syncBindings(next));
  next.version += 1;
  next.updatedAt = nowIso();
  return validateWorkspace(syncLegacyPagesFromV2(next));
}

function applyOperation(workspace: Workspace, operation: WorkspaceOperation, actor: OperationActor): Workspace {
  switch (operation.type) {
    case "create_object":
      return createObject(workspace, operation.object, actor);
    case "update_object":
      return updateObject(workspace, operation.objectId, operation.patch, actor);
    case "delete_object":
      return deleteObject(workspace, operation.objectId, actor);
    case "create_view":
      if (workspace.views[operation.view.id]) throw new Error(`View id already exists: ${operation.view.id}`);
      return { ...workspace, views: { ...workspace.views, [operation.view.id]: operation.view } };
    case "update_view":
      return updateView(workspace, operation.viewId, operation.patch);
    case "delete_view":
      return deleteView(workspace, operation.viewId);
    case "place_object_in_view":
      return placeObjectInView(workspace, operation.viewId ?? workspace.activeViewId, operation.objectId, operation.layout);
    case "remove_object_from_view":
      return removeObjectFromView(workspace, operation.viewId ?? workspace.activeViewId, operation.objectId);
    case "update_view_layout":
      return updateViewLayout(workspace, operation.viewId ?? workspace.activeViewId, operation.objectId, operation.patch, actor);
    case "create_relation":
      return createRelation(workspace, operation.relation, actor);
    case "update_relation":
      return updateRelation(workspace, operation.relationId, operation.patch, actor);
    case "delete_relation":
      return deleteRelation(workspace, operation.relationId);
    case "create_node": {
      const timestamp = nowIso();
      const object = canvasNodeToWorkspaceObject(operation.node, timestamp, timestamp);
      const withObject = createObject(workspace, object, actor);
      return placeObjectInView(withObject, workspace.activeViewId, operation.node.id, {
        objectId: operation.node.id,
        rendererType: operation.node.type,
        position: operation.node.position,
      });
    }
    case "update_node":
      return updateLegacyNode(workspace, operation.nodeId, operation.patch, actor);
    case "delete_node":
      return deleteObject(workspace, operation.nodeId, actor);
    case "move_node":
      return updateViewLayout(
        workspace,
        workspace.activeViewId,
        operation.nodeId,
        Object.fromEntries(Object.entries(operation.position).map(([key, value]) => [`position.${key}`, value])),
        actor,
      );
    case "create_edge":
      return createRelation(workspace, canvasEdgeToWorkspaceRelation(operation.edge, nowIso(), nowIso()), actor);
    case "update_edge":
      return updateRelation(workspace, operation.edgeId, edgePatchToRelationPatch(operation.patch), actor);
    case "delete_edge":
      return deleteRelation(workspace, operation.edgeId);
    case "group_nodes":
      return [...new Set(operation.nodeIds)].reduce((current, nodeId) => {
        requireObject(current, nodeId);
        return updateObject(current, nodeId, { "state.groupName": operation.name }, actor);
      }, workspace);
    case "set_variable":
      return {
        ...workspace,
        variables: { ...workspace.variables, [operation.key]: operation.variable },
      };
    default:
      return workspace;
  }
}

function createObject(workspace: Workspace, object: WorkspaceObject, actor: OperationActor): Workspace {
  if (workspace.objects[object.id]) throw new Error(`Object id already exists: ${object.id}`);
  const nextObject = validateObjectComponentProps(withObjectMetadata(object, actor));
  return {
    ...workspace,
    objects: {
      ...workspace.objects,
      [nextObject.id]: nextObject,
    },
  };
}

function updateObject(workspace: Workspace, objectId: string, patch: Record<string, unknown>, actor: OperationActor): Workspace {
  assertObjectPatchCanBeApplied(patch, actor);
  const target = requireObject(workspace, objectId);
  assertCanEdit(target, actor);

  const patched = Object.entries(patch).reduce<WorkspaceObject>((current, [path, value]) => {
    return setAtPath(current as unknown as Record<string, unknown>, path, value) as unknown as WorkspaceObject;
  }, markObjectUpdated(target, actor));
  const nextObject = validateObjectComponentProps(patched);

  return {
    ...workspace,
    objects: {
      ...workspace.objects,
      [objectId]: nextObject,
    },
  };
}

function deleteObject(workspace: Workspace, objectId: string, actor: OperationActor): Workspace {
  const target = requireObject(workspace, objectId);
  assertCanDelete(target, actor);

  const objects = { ...workspace.objects };
  delete objects[objectId];

  const relations = Object.fromEntries(
    Object.entries(workspace.relations).filter(([, relation]) => relation.sourceObjectId !== objectId && relation.targetObjectId !== objectId),
  );
  const remainingRelationIds = new Set(Object.keys(relations));

  const views = Object.fromEntries(
    Object.entries(workspace.views).map(([viewId, view]) => {
      if (view.kind === "canvas") {
        const layouts = { ...view.layouts };
        delete layouts[objectId];
        return [viewId, { ...view, objectIds: view.objectIds.filter((id) => id !== objectId), layouts }];
      }
      if (view.kind === "graph") {
        return [
          viewId,
          {
            ...view,
            objectIds: view.objectIds.filter((id) => id !== objectId),
            relationIds: view.relationIds.filter((id) => remainingRelationIds.has(id)),
          },
        ];
      }
      return [viewId, { ...view, objectIds: view.objectIds.filter((id) => id !== objectId) }];
    }),
  ) as Workspace["views"];

  return { ...workspace, objects, views, relations };
}

function updateView(workspace: Workspace, viewId: string, patch: Record<string, unknown>): Workspace {
  const view = requireView(workspace, viewId);
  assertViewPatchCanBeApplied(patch);
  const nextView = Object.entries(patch).reduce<Workspace["views"][string]>((current, [path, value]) => {
    return setAtPath(current as unknown as Record<string, unknown>, path, value) as Workspace["views"][string];
  }, view);
  return { ...workspace, views: { ...workspace.views, [viewId]: nextView } };
}

function deleteView(workspace: Workspace, viewId: string): Workspace {
  requireView(workspace, viewId);
  if (Object.keys(workspace.views).length <= 1) throw new Error("Cannot delete the last view");

  const views = { ...workspace.views };
  delete views[viewId];
  const nextActiveViewId = workspace.activeViewId === viewId ? Object.keys(views)[0] : workspace.activeViewId;
  return { ...workspace, views, activeViewId: nextActiveViewId };
}

function placeObjectInView(workspace: Workspace, viewId: string, objectId: string, layout: CanvasObjectLayoutForEngine): Workspace {
  requireObject(workspace, objectId);
  const view = requireCanvasView(workspace, viewId);
  if (layout.objectId !== objectId) throw new Error(`Layout objectId must match placed object: ${objectId}`);

  return {
    ...workspace,
    views: {
      ...workspace.views,
      [viewId]: {
        ...view,
        objectIds: view.objectIds.includes(objectId) ? view.objectIds : [...view.objectIds, objectId],
        layouts: {
          ...view.layouts,
          [objectId]: layout,
        },
      },
    },
  };
}

function removeObjectFromView(workspace: Workspace, viewId: string, objectId: string): Workspace {
  const view = requireCanvasView(workspace, viewId);
  const layouts = { ...view.layouts };
  delete layouts[objectId];
  return {
    ...workspace,
    views: {
      ...workspace.views,
      [viewId]: {
        ...view,
        objectIds: view.objectIds.filter((id) => id !== objectId),
        layouts,
      },
    },
  };
}

function updateViewLayout(workspace: Workspace, viewId: string, objectId: string, patch: Record<string, unknown>, actor: OperationActor): Workspace {
  const object = requireObject(workspace, objectId);
  assertCanEdit(object, actor);
  assertLayoutPatchCanBeApplied(patch);
  const view = requireCanvasView(workspace, viewId);
  const layout = view.layouts[objectId];
  if (!layout) throw new Error(`Object is not placed in the active canvas view: ${objectId}`);

  const nextLayout = Object.entries(patch).reduce<typeof layout>((current, [path, value]) => {
    return setAtPath(current as unknown as Record<string, unknown>, path, value) as typeof layout;
  }, layout);

  return {
    ...workspace,
    views: {
      ...workspace.views,
      [viewId]: {
        ...view,
        layouts: {
          ...view.layouts,
          [objectId]: nextLayout,
        },
      },
    },
  };
}

function createRelation(workspace: Workspace, relation: WorkspaceRelation, actor: OperationActor): Workspace {
  if (workspace.relations[relation.id]) throw new Error(`Relation id already exists: ${relation.id}`);
  assertRelationEndpointsExist(workspace, relation.sourceObjectId, relation.targetObjectId);
  const nextRelation = withRelationMetadata(relation, actor);
  return {
    ...workspace,
    relations: {
      ...workspace.relations,
      [nextRelation.id]: nextRelation,
    },
  };
}

function updateRelation(workspace: Workspace, relationId: string, patch: Partial<WorkspaceRelation>, actor: OperationActor): Workspace {
  const relation = workspace.relations[relationId];
  if (!relation) throw new Error(`Relation does not exist: ${relationId}`);
  const nextRelation = markRelationUpdated({ ...relation, ...patch, props: patch.props ? { ...relation.props, ...patch.props } : relation.props }, actor);
  assertRelationEndpointsExist(workspace, nextRelation.sourceObjectId, nextRelation.targetObjectId);
  return { ...workspace, relations: { ...workspace.relations, [relationId]: nextRelation } };
}

function deleteRelation(workspace: Workspace, relationId: string): Workspace {
  if (!workspace.relations[relationId]) throw new Error(`Relation does not exist: ${relationId}`);
  const relations = { ...workspace.relations };
  delete relations[relationId];
  const views = Object.fromEntries(
    Object.entries(workspace.views).map(([viewId, view]) => {
      if (view.kind !== "graph") return [viewId, view];
      return [viewId, { ...view, relationIds: view.relationIds.filter((id) => id !== relationId) }];
    }),
  ) as Workspace["views"];
  return { ...workspace, relations, views };
}

function updateLegacyNode(workspace: Workspace, nodeId: string, patch: Record<string, unknown>, actor: OperationActor): Workspace {
  assertLegacyNodePatchCanBeApplied(patch, actor);
  requireObject(workspace, nodeId);

  let next = workspace;
  const objectPatch: Record<string, unknown> = {};
  const layoutPatch: Record<string, unknown> = {};

  Object.entries(patch).forEach(([path, value]) => {
    if (path === "name" || path.startsWith("props.") || path.startsWith("state.") || path.startsWith("permissions.")) {
      objectPatch[path] = value;
      return;
    }
    if (path.startsWith("position.")) {
      layoutPatch[path] = value;
    }
  });

  if (Object.keys(objectPatch).length > 0) next = updateObject(next, nodeId, objectPatch, actor);
  if (Object.keys(layoutPatch).length > 0) next = updateViewLayout(next, next.activeViewId, nodeId, layoutPatch, actor);
  return next;
}

export function validateWorkspaceComponentProps(workspace: Workspace): Workspace {
  getCanvasViews(workspace).forEach((view) => {
    getCanvasNodesForView(workspace, view.id).forEach((node) => validateComponentProps(node));
  });
  return workspace;
}

function requireObject(workspace: Workspace, objectId: string): WorkspaceObject {
  const object = workspace.objects[objectId];
  if (!object) throw new Error(`Node does not exist on the active page: ${objectId}`);
  return object;
}

function requireView(workspace: Workspace, viewId: string): Workspace["views"][string] {
  const view = workspace.views[viewId];
  if (!view) throw new Error(`View does not exist: ${viewId}`);
  return view;
}

function requireCanvasView(workspace: Workspace, viewId: string): CanvasWorkspaceView {
  const view = requireView(workspace, viewId);
  if (view.kind !== "canvas") throw new Error(`View is not a canvas view: ${viewId}`);
  return view;
}

type CanvasObjectLayoutForEngine = CanvasWorkspaceView["layouts"][string];

function assertLegacyNodePatchCanBeApplied(patch: Record<string, unknown>, actor: OperationActor): void {
  Object.keys(patch).forEach((path) => {
    const [root, ...rest] = path.split(".");

    if (root === "name" && rest.length === 0) return;
    if ((root === "props" || root === "state") && rest.length > 0) return;
    if (root === "position" && rest.length === 1 && positionFields.has(rest[0])) return;

    if (userOnlyUpdateRoots.has(root)) {
      if (actor === "agent") throw new Error(`Agent cannot update node permissions: ${path}`);
      if (rest.length !== 1 || !["userEditable", "agentEditable", "deletable"].includes(rest[0])) {
        throw new Error(`Unsupported permission update path: ${path}`);
      }
      return;
    }

    throw new Error(`Node field cannot be updated with update_node: ${path}`);
  });
}

function assertObjectPatchCanBeApplied(patch: Record<string, unknown>, actor: OperationActor): void {
  Object.keys(patch).forEach((path) => {
    const [root, ...rest] = path.split(".");
    if (root === "name" && rest.length === 0) return;
    if ((root === "props" || root === "state") && rest.length > 0) return;
    if (root === "metadata" && rest.length === 1 && ["description", "tags"].includes(rest[0])) return;
    if (root === "permissions") {
      if (actor === "agent") throw new Error(`Agent cannot update object permissions: ${path}`);
      if (rest.length === 1 && ["userEditable", "agentEditable", "deletable"].includes(rest[0])) return;
    }
    throw new Error(`Object field cannot be updated with update_object: ${path}`);
  });
}

function assertLayoutPatchCanBeApplied(patch: Record<string, unknown>): void {
  Object.keys(patch).forEach((path) => {
    const [root, ...rest] = path.split(".");
    if (root === "position" && rest.length === 1 && positionFields.has(rest[0])) return;
    if (root === "localProps" && rest.length > 0) return;
    if (["hidden", "locked", "rendererType"].includes(root) && rest.length === 0) return;
    throw new Error(`Layout field cannot be updated with update_view_layout: ${path}`);
  });
}

function assertViewPatchCanBeApplied(patch: Record<string, unknown>): void {
  Object.keys(patch).forEach((path) => {
    const [root, ...rest] = path.split(".");
    if (root === "name" && rest.length === 0) return;
    if (root === "viewport" && rest.length === 1 && ["x", "y", "zoom"].includes(rest[0])) return;
    throw new Error(`View field cannot be updated with update_view: ${path}`);
  });
}

function withObjectMetadata(object: WorkspaceObject, actor: OperationActor): WorkspaceObject {
  const timestamp = nowIso();
  const defaultPermissions = { userEditable: true, agentEditable: true, deletable: true };
  return {
    ...object,
    permissions: actor === "agent" ? defaultPermissions : (object.permissions ?? defaultPermissions),
    metadata: {
      createdBy: actor,
      updatedBy: actor,
      createdAt: timestamp,
      updatedAt: timestamp,
      description: object.metadata?.description,
      tags: object.metadata?.tags,
    },
  };
}

function markObjectUpdated(object: WorkspaceObject, actor: OperationActor): WorkspaceObject {
  return {
    ...object,
    metadata: {
      ...object.metadata,
      createdBy: object.metadata.createdBy ?? "user",
      updatedBy: actor,
      createdAt: object.metadata.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    },
  };
}

function withRelationMetadata(relation: WorkspaceRelation, actor: OperationActor): WorkspaceRelation {
  const timestamp = nowIso();
  return {
    ...relation,
    metadata: {
      createdBy: actor,
      updatedBy: actor,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

function markRelationUpdated(relation: WorkspaceRelation, actor: OperationActor): WorkspaceRelation {
  return {
    ...relation,
    metadata: {
      ...relation.metadata,
      createdBy: relation.metadata.createdBy ?? "user",
      updatedBy: actor,
      createdAt: relation.metadata.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    },
  };
}

function assertCanEdit(object: WorkspaceObject, actor: OperationActor): void {
  const permissions = object.permissions ?? { userEditable: true, agentEditable: true, deletable: true };
  if (actor === "agent" && !permissions.agentEditable) {
    throw new Error(`Agent has no permission to edit "${object.name}"`);
  }
  if (actor === "user" && !permissions.userEditable) {
    throw new Error(`User has no permission to edit "${object.name}"`);
  }
}

function assertCanDelete(object: WorkspaceObject, actor: OperationActor): void {
  if (actor === "agent" && object.permissions?.agentEditable === false) {
    throw new Error(`Agent has no permission to delete locked object "${object.name}"`);
  }
  if (object.permissions?.deletable === false) {
    throw new Error(`"${object.name}" cannot be deleted`);
  }
}

function assertRelationEndpointsExist(workspace: Workspace, sourceObjectId: string, targetObjectId: string): void {
  if (sourceObjectId === targetObjectId) throw new Error("Relation cannot connect an object to itself");
  requireObject(workspace, sourceObjectId);
  requireObject(workspace, targetObjectId);
}

function validateObjectComponentProps(object: WorkspaceObject): WorkspaceObject {
  const canvasViews = Object.values(migrateLegacyWorkspaceToV2({ ...emptyWorkspace(), objects: { [object.id]: object }, views: {}, relations: {} }).views);
  void canvasViews;
  return object;
}

function emptyWorkspace(): Workspace {
  return {
    schemaVersion: 2,
    id: "validation",
    title: "Validation",
    version: 0,
    activeViewId: "validation_view",
    activePageId: "validation_view",
    objects: {},
    views: {},
    relations: {},
    variables: {},
    dataSources: {},
    pages: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function edgePatchToRelationPatch(patch: Partial<CanvasEdge>): Partial<WorkspaceRelation> {
  const relationPatch: Partial<WorkspaceRelation> = {};
  const props: Record<string, unknown> = {};

  Object.entries(patch).forEach(([key, value]) => {
    if (key === "sourceNodeId") relationPatch.sourceObjectId = value as string;
    else if (key === "targetNodeId") relationPatch.targetObjectId = value as string;
    else if (key === "type") {
      relationPatch.kind = relationKindForEdgeType(value as CanvasEdge["type"]);
      props.edgeType = value;
    } else if (key === "label") relationPatch.label = value as string;
    else if (relationPresentationKeys.has(key)) props[key] = value;
  });

  if (Object.keys(props).length > 0) relationPatch.props = props;
  return relationPatch;
}

function relationKindForEdgeType(type: CanvasEdge["type"]): WorkspaceRelation["kind"] {
  if (type === "data_flow") return "data_flow";
  if (type === "comment") return "comment";
  if (type === "dependency") return "dependency";
  return "reference";
}

function syncBindings(workspace: Workspace): Workspace {
  const view = getActiveCanvasView(workspace);
  const nodes = getCanvasNodesForView(workspace, view.id);
  let variables = { ...workspace.variables };

  nodes.forEach((node) => {
    node.bindings?.output?.forEach((binding) => {
      if (!binding.prop) return;
      const value = getNodeValue(node, binding.prop);
      if (typeof value === "undefined") return;
      variables = {
        ...variables,
        [binding.variable]: toWorkspaceVariable(value),
      };
    });
  });

  const objects = { ...workspace.objects };
  nodes.forEach((node) => {
    if (!node.bindings?.input?.length) return;
    const boundNode = node.bindings.input.reduce<CanvasNode>((current, binding) => {
      const variable = variables[binding.variable];
      if (!variable) return current;
      return applyInputBinding(current, binding.target, binding.variable, variable);
    }, node);
    validateComponentProps(boundNode);
    objects[node.id] = markObjectUpdated({ ...objects[node.id], props: boundNode.props }, "agent");
  });

  return {
    ...workspace,
    variables,
    objects,
  };
}

function getNodeValue(node: CanvasNode, prop: string): unknown {
  return prop.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, node.props);
}

function toWorkspaceVariable(value: unknown): WorkspaceVariable {
  if (typeof value === "number") return { type: "number", value };
  if (typeof value === "boolean") return { type: "boolean", value };
  if (typeof value === "string") return { type: "string", value };
  return { type: "string", value: JSON.stringify(value) };
}

function applyInputBinding(node: CanvasNode, target: string | undefined, variableName: string, variable: WorkspaceVariable): CanvasNode {
  if (node.type === "chart") {
    const currentData = Array.isArray(node.props.data) ? (node.props.data as number[]) : [];
    const baseData = Array.isArray(node.props.baseData) ? (node.props.baseData as number[]) : currentData;
    const numericValue = typeof variable.value === "number" ? variable.value : Number(variable.value);
    const baseValue = variableName === "sliderValue" ? 50 : 45000;
    const factor = Number.isFinite(numericValue) ? Math.max(0.1, numericValue / baseValue) : 1;
    const data = baseData.map((value) => Math.round(value * factor));
    return {
      ...node,
      props: {
        ...node.props,
        baseData,
        data,
        boundVariable: variableName,
      },
    };
  }

  if (node.type === "card") {
    return {
      ...node,
      props: {
        ...node.props,
        detail: `${formatVariableName(variableName)}: ${formatVariableValue(variable)}`,
      },
    };
  }

  if (!target) return node;
  return setAtPath(node as unknown as Record<string, unknown>, target, variable.value) as unknown as CanvasNode;
}

function formatVariableValue(variable: WorkspaceVariable): string {
  if (typeof variable.value === "number") return variable.value.toLocaleString("zh-CN");
  return String(variable.value);
}

function formatVariableName(variableName: string): string {
  if (variableName === "sliderValue") return "Slider value";
  if (variableName === "budget") return "Budget";
  return variableName;
}
