import { agentResponseSchema, workspaceOperationSchema } from "../agent/operationSchemas";
import type { AgentResponse, WorkspaceOperation } from "../agent/agentProtocol";
import type { CanvasNode, Workspace, WorkspaceVariable } from "./workspaceTypes";
import { nowIso } from "../utils/id";
import { setAtPath } from "../utils/patch";
import { validateComponentProps } from "../components-registry/registry";

const destructiveOperations = new Set<WorkspaceOperation["type"]>(["delete_node", "delete_edge"]);
type OperationActor = "agent" | "user";

export function validateAgentResponse(response: unknown): AgentResponse {
  return agentResponseSchema.parse(response);
}

export function isDestructiveOperation(operation: WorkspaceOperation): boolean {
  return destructiveOperations.has(operation.type);
}

export function applyOperations(workspace: Workspace, operations: WorkspaceOperation[], actor: OperationActor = "agent"): Workspace {
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
      const node = validateComponentProps(withMetadata(operation.node));
      return withPage({
        ...page,
        nodes: [...page.nodes.filter((item) => item.id !== operation.node.id), node],
      });
    }
    case "update_node":
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
    case "delete_node": {
      const target = page.nodes.find((node) => node.id === operation.nodeId);
      if (target) assertCanDelete(target, actor);
      return withPage({
        ...page,
        nodes: page.nodes.filter((node) => node.id !== operation.nodeId),
        edges: page.edges.filter((edge) => edge.sourceNodeId !== operation.nodeId && edge.targetNodeId !== operation.nodeId),
      });
    }
    case "move_node":
      return withPage({
        ...page,
        nodes: page.nodes.map((node) => {
          if (node.id !== operation.nodeId) return node;
          assertCanEdit(node, actor);
          return markUpdated({ ...node, position: { ...node.position, ...operation.position } }, actor);
        }),
      });
    case "create_edge":
      return withPage({ ...page, edges: [...page.edges.filter((edge) => edge.id !== operation.edge.id), operation.edge] });
    case "delete_edge":
      return withPage({ ...page, edges: page.edges.filter((edge) => edge.id !== operation.edgeId) });
    case "group_nodes":
      return withPage({
        ...page,
        nodes: page.nodes.map((node) => {
          if (!operation.nodeIds.includes(node.id)) return node;
          assertCanEdit(node, actor);
          return markUpdated({ ...node, state: { ...node.state, groupName: operation.name } }, actor);
        }),
      });
    case "set_variable":
      return {
        ...workspace,
        variables: { ...workspace.variables, [operation.key]: operation.variable },
      };
    case "focus_node":
      return workspace;
    default:
      return workspace;
  }
}

function getActivePageIndex(workspace: Workspace): number {
  const index = workspace.pages.findIndex((page) => page.id === workspace.activePageId);
  return index >= 0 ? index : 0;
}

function withMetadata(node: CanvasNode): CanvasNode {
  const timestamp = nowIso();
  return {
    ...node,
    permissions: node.permissions ?? { userEditable: true, agentEditable: true, deletable: true },
    metadata: {
      createdBy: node.metadata?.createdBy ?? "agent",
      updatedBy: node.metadata?.updatedBy ?? "agent",
      createdAt: node.metadata?.createdAt ?? timestamp,
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
        [binding.variable]: {
          type: inferVariableType(value),
          value: normalizeVariableValue(value),
        },
      };
    });
  });

  const nodes = page.nodes.map((node) => {
    if (!node.bindings?.input?.length) return node;

    return node.bindings.input.reduce<CanvasNode>((current, binding) => {
      const variable = variables[binding.variable];
      if (!variable) return current;
      return applyInputBinding(current, binding.target, binding.variable, variable);
    }, node);
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

function inferVariableType(value: unknown): WorkspaceVariable["type"] {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function normalizeVariableValue(value: unknown): WorkspaceVariable["value"] {
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  return JSON.stringify(value);
}

function applyInputBinding(node: CanvasNode, target: string | undefined, variableName: string, variable: WorkspaceVariable): CanvasNode {
  if (node.type === "chart") {
    const currentData = Array.isArray(node.props.data) ? (node.props.data as number[]) : [];
    const baseData = Array.isArray(node.props.baseData) ? (node.props.baseData as number[]) : currentData;
    const numericValue = typeof variable.value === "number" ? variable.value : Number(variable.value);
    const factor = Number.isFinite(numericValue) ? Math.max(0.1, numericValue / 45000) : 1;
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
        detail: `${variableName}: ${formatVariableValue(variable)}`,
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
