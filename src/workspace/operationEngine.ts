import { agentResponseSchema, workspaceOperationSchema } from "../agent/operationSchemas";
import type { AgentResponse, WorkspaceOperation } from "../agent/agentProtocol";
import type { CanvasNode, Workspace } from "./workspaceTypes";
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

  next.version += 1;
  next.updatedAt = nowIso();
  return next;
}

function applyOperation(workspace: Workspace, operation: WorkspaceOperation, actor: OperationActor): Workspace {
  const page = workspace.pages[0];

  switch (operation.type) {
    case "create_node": {
      const node = validateComponentProps(withMetadata(operation.node));
      return {
        ...workspace,
        pages: [
          {
            ...page,
            nodes: [...page.nodes.filter((item) => item.id !== operation.node.id), node],
          },
        ],
      };
    }
    case "update_node":
      return {
        ...workspace,
        pages: [
          {
            ...page,
            nodes: page.nodes.map((node) => {
              if (node.id !== operation.nodeId) return node;
              assertCanEdit(node, actor);
              const patched = Object.entries(operation.patch).reduce<CanvasNode>((current, [path, value]) => {
                return setAtPath(current as unknown as Record<string, unknown>, path, value) as unknown as CanvasNode;
              }, markUpdated(node));
              return validateComponentProps(patched);
            }),
          },
        ],
      };
    case "delete_node": {
      const target = page.nodes.find((node) => node.id === operation.nodeId);
      if (target) assertCanDelete(target);
      return {
        ...workspace,
        pages: [
          {
            ...page,
            nodes: page.nodes.filter((node) => node.id !== operation.nodeId),
            edges: page.edges.filter((edge) => edge.sourceNodeId !== operation.nodeId && edge.targetNodeId !== operation.nodeId),
          },
        ],
      };
    }
    case "move_node":
      return {
        ...workspace,
        pages: [
          {
            ...page,
            nodes: page.nodes.map((node) => {
              if (node.id !== operation.nodeId) return node;
              assertCanEdit(node, actor);
              return markUpdated({ ...node, position: { ...node.position, ...operation.position } });
            }),
          },
        ],
      };
    case "create_edge":
      return {
        ...workspace,
        pages: [{ ...page, edges: [...page.edges.filter((edge) => edge.id !== operation.edge.id), operation.edge] }],
      };
    case "delete_edge":
      return {
        ...workspace,
        pages: [{ ...page, edges: page.edges.filter((edge) => edge.id !== operation.edgeId) }],
      };
    case "group_nodes":
      return {
        ...workspace,
        pages: [
          {
            ...page,
            nodes: page.nodes.map((node) => {
              if (!operation.nodeIds.includes(node.id)) return node;
              assertCanEdit(node, actor);
              return markUpdated({ ...node, state: { ...node.state, groupName: operation.name } });
            }),
          },
        ],
      };
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

function markUpdated(node: CanvasNode): CanvasNode {
  return {
    ...node,
    metadata: {
      createdBy: node.metadata?.createdBy ?? "user",
      updatedBy: "user",
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

function assertCanDelete(node: CanvasNode): void {
  if (node.permissions?.deletable === false) {
    throw new Error(`「${node.name}」不允许删除。`);
  }
}
