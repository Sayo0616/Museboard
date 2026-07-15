import { agentResponseSchema, workspaceOperationSchema } from "../agent/operationSchemas";
import type { AgentResponse, WorkspaceOperation } from "../agent/agentProtocol";
import type { CanvasNode, Workspace, WorkspaceVariable } from "./workspaceTypes";
import { nowIso } from "../utils/id";
import { setAtPath } from "../utils/patch";
import { validateComponentProps } from "../components-registry/registry";

const destructiveOperations = new Set<WorkspaceOperation["type"]>(["delete_node", "delete_edge"]);
type OperationActor = "agent" | "user";

const userOnlyUpdateRoots = new Set(["permissions"]);
const positionFields = new Set(["x", "y", "width", "height", "rotation"]);

export function validateAgentResponse(response: unknown): AgentResponse {
  return agentResponseSchema.parse(response);
}

export function isDestructiveOperation(operation: WorkspaceOperation): boolean {
  return destructiveOperations.has(operation.type);
}

export function applyOperations(workspace: Workspace, operations: WorkspaceOperation[], actor: OperationActor = "agent"): Workspace {
  if (operations.length === 0) return workspace;

  let next = structuredClone(workspace);

  operations.forEach((operation) => {
    const parsed = workspaceOperationSchema.parse(operation);
    next = applyOperation(next, parsed as WorkspaceOperation, actor);
  });

  next = syncBindings(next);
  next.version += 1;
  next.updatedAt = nowIso();
  return next;
}

function applyOperation(workspace: Workspace, operation: WorkspaceOperation, actor: OperationActor): Workspace {
  const pageIndex = getActivePageIndex(workspace);
  const page = workspace.pages[pageIndex];
  const withPage = (nextPage: typeof page): Workspace => ({
    ...workspace,
    pages: workspace.pages.map((item, index) => (index === pageIndex ? nextPage : item)),
  });

  switch (operation.type) {
    case "create_node": {
      if (workspace.pages.some((item) => item.nodes.some((node) => node.id === operation.node.id))) {
        throw new Error(`Node id already exists: ${operation.node.id}`);
      }
      const node = validateComponentProps(withMetadata(operation.node, actor));
      return withPage({
        ...page,
        nodes: [...page.nodes, node],
      });
    }
    case "update_node": {
      assertPatchCanBeApplied(operation.patch, actor);
      const target = requireNode(page.nodes, operation.nodeId);
      assertCanEdit(target, actor);
      return withPage({
        ...page,
        nodes: page.nodes.map((node) => {
          if (node.id !== operation.nodeId) return node;
          assertCanEdit(node, actor);
          const patched = Object.entries(operation.patch).reduce<CanvasNode>((current, [path, value]) => {
            return setAtPath(current as unknown as Record<string, unknown>, path, value) as unknown as CanvasNode;
          }, markUpdated(node, actor));
          return validateComponentProps(patched);
        }),
      });
    }
    case "delete_node": {
      const target = requireNode(page.nodes, operation.nodeId);
      assertCanDelete(target, actor);
      return withPage({
        ...page,
        nodes: page.nodes.filter((node) => node.id !== operation.nodeId),
        edges: page.edges.filter((edge) => edge.sourceNodeId !== operation.nodeId && edge.targetNodeId !== operation.nodeId),
      });
    }
    case "move_node": {
      const target = requireNode(page.nodes, operation.nodeId);
      assertCanEdit(target, actor);
      return withPage({
        ...page,
        nodes: page.nodes.map((node) => {
          if (node.id !== operation.nodeId) return node;
          assertCanEdit(node, actor);
          return markUpdated({ ...node, position: { ...node.position, ...operation.position } }, actor);
        }),
      });
    }
    case "create_edge": {
      if (workspace.pages.some((item) => item.edges.some((edge) => edge.id === operation.edge.id))) {
        throw new Error(`Edge id already exists: ${operation.edge.id}`);
      }
      if (operation.edge.sourceNodeId === operation.edge.targetNodeId) {
        throw new Error("Edge cannot connect a node to itself");
      }
      requireNode(page.nodes, operation.edge.sourceNodeId);
      requireNode(page.nodes, operation.edge.targetNodeId);
      return withPage({ ...page, edges: [...page.edges, operation.edge] });
    }
    case "update_edge": {
      if (!page.edges.some((edge) => edge.id === operation.edgeId)) {
        throw new Error(`Edge does not exist on the active page: ${operation.edgeId}`);
      }
      return withPage({
        ...page,
        edges: page.edges.map((edge) => {
          if (edge.id !== operation.edgeId) return edge;
          const nextEdge = { ...edge, ...operation.patch };
          if (nextEdge.sourceNodeId === nextEdge.targetNodeId) {
            throw new Error("Edge cannot connect a node to itself");
          }
          requireNode(page.nodes, nextEdge.sourceNodeId);
          requireNode(page.nodes, nextEdge.targetNodeId);
          return nextEdge;
        }),
      });
    }
    case "delete_edge": {
      if (!page.edges.some((edge) => edge.id === operation.edgeId)) {
        throw new Error(`Edge does not exist on the active page: ${operation.edgeId}`);
      }
      return withPage({ ...page, edges: page.edges.filter((edge) => edge.id !== operation.edgeId) });
    }
    case "group_nodes": {
      [...new Set(operation.nodeIds)].forEach((nodeId) => requireNode(page.nodes, nodeId));
      return withPage({
        ...page,
        nodes: page.nodes.map((node) => {
          if (!operation.nodeIds.includes(node.id)) return node;
          assertCanEdit(node, actor);
          return markUpdated({ ...node, state: { ...node.state, groupName: operation.name } }, actor);
        }),
      });
    }
    case "set_variable":
      return {
        ...workspace,
        variables: { ...workspace.variables, [operation.key]: operation.variable },
      };
    default:
      return workspace;
  }
}

function requireNode(nodes: CanvasNode[], nodeId: string): CanvasNode {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`Node does not exist on the active page: ${nodeId}`);
  return node;
}

export function validateWorkspaceComponentProps(workspace: Workspace): Workspace {
  workspace.pages.forEach((page) => page.nodes.forEach((node) => validateComponentProps(node)));
  return workspace;
}

function assertPatchCanBeApplied(patch: Record<string, unknown>, actor: OperationActor): void {
  Object.keys(patch).forEach((path) => {
    const [root, ...rest] = path.split(".");

    if (root === "name" && rest.length === 0) {
      return;
    }

    if ((root === "props" || root === "state") && rest.length > 0) {
      return;
    }

    if (root === "position" && rest.length === 1 && positionFields.has(rest[0])) {
      return;
    }

    if (userOnlyUpdateRoots.has(root)) {
      if (actor === "agent") {
        throw new Error(`Agent cannot update node permissions: ${path}`);
      }
      if (rest.length !== 1 || !["userEditable", "agentEditable", "deletable"].includes(rest[0])) {
        throw new Error(`Unsupported permission update path: ${path}`);
      }
      return;
    }

    throw new Error(`Node field cannot be updated with update_node: ${path}`);
  });
}

function getActivePageIndex(workspace: Workspace): number {
  const index = workspace.pages.findIndex((page) => page.id === workspace.activePageId);
  return index >= 0 ? index : 0;
}

function withMetadata(node: CanvasNode, actor: OperationActor): CanvasNode {
  const timestamp = nowIso();
  const defaultPermissions = { userEditable: true, agentEditable: true, deletable: true };
  return {
    ...node,
    permissions: actor === "agent" ? defaultPermissions : (node.permissions ?? defaultPermissions),
    metadata: {
      createdBy: actor,
      updatedBy: actor,
      createdAt: timestamp,
      updatedAt: timestamp,
      description: node.metadata?.description,
    },
  };
}

function markUpdated(node: CanvasNode, actor: OperationActor): CanvasNode {
  return {
    ...node,
    metadata: {
      createdBy: node.metadata?.createdBy ?? "user",
      updatedBy: actor,
      createdAt: node.metadata?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      description: node.metadata?.description,
    },
  };
}

function assertCanEdit(node: CanvasNode, actor: OperationActor): void {
  const permissions = node.permissions ?? { userEditable: true, agentEditable: true, deletable: true };
  if (actor === "agent" && !permissions.agentEditable) {
    throw new Error(`Agent 无权编辑「${node.name}」。`);
  }
  if (actor === "user" && !permissions.userEditable) {
    throw new Error(`用户无权编辑「${node.name}」。`);
  }
}

function assertCanDelete(node: CanvasNode, actor: OperationActor): void {
  if (actor === "agent" && node.permissions?.agentEditable === false) {
    throw new Error(`Agent 无权删除已锁定的「${node.name}」。`);
  }
  if (node.permissions?.deletable === false) {
    throw new Error(`「${node.name}」不允许删除。`);
  }
}

function syncBindings(workspace: Workspace): Workspace {
  const pageIndex = getActivePageIndex(workspace);
  const page = workspace.pages[pageIndex];
  let variables = { ...workspace.variables };

  page.nodes.forEach((node) => {
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

  const nodes = page.nodes.map((node) => {
    if (!node.bindings?.input?.length) return node;

    const boundNode = node.bindings.input.reduce<CanvasNode>((current, binding) => {
      const variable = variables[binding.variable];
      if (!variable) return current;
      return applyInputBinding(current, binding.target, binding.variable, variable);
    }, node);
    return validateComponentProps(boundNode);
  });

  return {
    ...workspace,
    variables,
    pages: workspace.pages.map((item, index) => (index === pageIndex ? { ...page, nodes } : item)),
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
  if (variableName === "sliderValue") return "滑块数值";
  if (variableName === "budget") return "预算";
  return variableName;
}
