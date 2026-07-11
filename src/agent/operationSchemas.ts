import { z } from "zod";

export const nodeTypeSchema = z.enum([
  "text",
  "button",
  "slider",
  "chart",
  "mermaid",
  "table",
  "card",
  "container",
  "agent_plan",
  "context_note",
]);

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().min(80),
  height: z.number().min(48),
  rotation: z.number().optional(),
});

export const canvasNodeSchema = z.object({
  id: z.string().min(1),
  type: nodeTypeSchema,
  name: z.string().min(1),
  position: positionSchema,
  props: z.record(z.string(), z.unknown()),
  state: z.record(z.string(), z.unknown()).optional(),
  bindings: z
    .object({
      input: z.array(z.object({ prop: z.string().optional(), target: z.string().optional(), variable: z.string() })).optional(),
      output: z.array(z.object({ prop: z.string().optional(), target: z.string().optional(), variable: z.string() })).optional(),
    })
    .optional(),
  permissions: z
    .object({
      userEditable: z.boolean(),
      agentEditable: z.boolean(),
      deletable: z.boolean(),
    })
    .optional(),
  metadata: z
    .object({
      createdBy: z.enum(["user", "agent"]),
      updatedBy: z.enum(["user", "agent"]),
      createdAt: z.string(),
      updatedAt: z.string(),
      description: z.string().optional(),
    })
    .optional(),
});

export const canvasEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetNodeId: z.string().min(1),
  targetHandle: z.string().optional(),
  type: z.enum(["arrow", "data_flow", "dependency", "comment"]),
  label: z.string().optional(),
});

const createNodeOperationSchema = z.object({
  type: z.literal("create_node"),
  node: canvasNodeSchema,
});

const updateNodeOperationSchema = z.object({
  type: z.literal("update_node"),
  nodeId: z.string().min(1),
  patch: z.record(z.string(), z.unknown()),
});

const deleteNodeOperationSchema = z.object({
  type: z.literal("delete_node"),
  nodeId: z.string().min(1),
});

const moveNodeOperationSchema = z.object({
  type: z.literal("move_node"),
  nodeId: z.string().min(1),
  position: positionSchema.partial(),
});

const createEdgeOperationSchema = z.object({
  type: z.literal("create_edge"),
  edge: canvasEdgeSchema,
});

const deleteEdgeOperationSchema = z.object({
  type: z.literal("delete_edge"),
  edgeId: z.string().min(1),
});

const groupNodesOperationSchema = z.object({
  type: z.literal("group_nodes"),
  nodeIds: z.array(z.string().min(1)).min(1),
  name: z.string().min(1),
});

const setVariableOperationSchema = z.object({
  type: z.literal("set_variable"),
  key: z.string().min(1),
  variable: z.object({
    type: z.enum(["number", "string", "boolean"]),
    value: z.union([z.number(), z.string(), z.boolean()]),
  }),
});

const focusNodeOperationSchema = z.object({
  type: z.literal("focus_node"),
  nodeId: z.string().min(1),
});

export const workspaceOperationSchema = z.discriminatedUnion("type", [
  createNodeOperationSchema,
  updateNodeOperationSchema,
  deleteNodeOperationSchema,
  moveNodeOperationSchema,
  createEdgeOperationSchema,
  deleteEdgeOperationSchema,
  groupNodesOperationSchema,
  setVariableOperationSchema,
  focusNodeOperationSchema,
]);

export const agentResponseSchema = z.object({
  message: z.string().min(1).max(120),
  operations: z.array(workspaceOperationSchema),
  requiresConfirmation: z.boolean().optional(),
});
