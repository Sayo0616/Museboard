import { z } from "zod";

const unsafePathSegments = new Set(["__proto__", "prototype", "constructor"]);

const safePathSchema = z
  .string()
  .min(1, "Path cannot be empty")
  .refine(
    (path) => {
      const segments = path.split(".");
      return segments.every((segment) => segment.length > 0 && !unsafePathSegments.has(segment));
    },
    { message: "Path contains an invalid or unsafe segment" },
  );

const bindingTargetSchema = safePathSchema.refine((path) => path.startsWith("props.") && path.length > "props.".length, {
  message: "Binding target must be a nested props path",
});

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

const edgeHandleSchema = z.enum(["top", "right", "bottom", "left"]);
const edgeArrowStyleSchema = z.enum(["none", "arrow", "circle", "diamond"]);
const edgeLineStyleSchema = z.enum(["solid", "dotted", "dashed"]);
const edgeTypeSchema = z.enum(["arrow", "data_flow", "dependency", "comment"]);
const edgeColorSchema = z.string().min(1).max(48);

export const canvasNodeSchema = z.object({
  id: z.string().min(1),
  type: nodeTypeSchema,
  name: z.string().min(1),
  position: positionSchema,
  props: z.record(z.string(), z.unknown()),
  state: z.record(z.string(), z.unknown()).optional(),
  bindings: z
    .object({
      input: z
        .array(z.object({ prop: safePathSchema.optional(), target: bindingTargetSchema.optional(), variable: z.string().min(1) }))
        .optional(),
      output: z
        .array(z.object({ prop: safePathSchema.optional(), target: bindingTargetSchema.optional(), variable: z.string().min(1) }))
        .optional(),
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
  sourceHandle: edgeHandleSchema.optional(),
  targetNodeId: z.string().min(1),
  targetHandle: edgeHandleSchema.optional(),
  type: edgeTypeSchema,
  label: z.string().optional(),
  strokeColor: edgeColorSchema.optional(),
  strokeWidth: z.number().min(1).max(12).optional(),
  lineStyle: edgeLineStyleSchema.optional(),
  startArrow: edgeArrowStyleSchema.optional(),
  endArrow: edgeArrowStyleSchema.optional(),
});

export const workspaceVariableSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("number"), value: z.number() }),
  z.object({ type: z.literal("string"), value: z.string() }),
  z.object({ type: z.literal("boolean"), value: z.boolean() }),
]);

const createNodeOperationSchema = z.object({
  type: z.literal("create_node"),
  node: canvasNodeSchema,
});

const patchPathSchema = z
  .string()
  .min(1, "Update path cannot be empty")
  .refine(
    (path) => {
      const segments = path.split(".");
      return segments.every((segment) => segment.length > 0 && !unsafePathSegments.has(segment));
    },
    { message: "Update path contains an invalid or unsafe segment" },
  );

const updateNodeOperationSchema = z.object({
  type: z.literal("update_node"),
  nodeId: z.string().min(1),
  patch: z.record(patchPathSchema, z.unknown()).refine((patch) => Object.keys(patch).length > 0, { message: "Update patch cannot be empty" }),
});

const deleteNodeOperationSchema = z.object({
  type: z.literal("delete_node"),
  nodeId: z.string().min(1),
});

const moveNodeOperationSchema = z.object({
  type: z.literal("move_node"),
  nodeId: z.string().min(1),
  position: positionSchema.partial().refine((position) => Object.keys(position).length > 0, { message: "Move position cannot be empty" }),
});

const createEdgeOperationSchema = z.object({
  type: z.literal("create_edge"),
  edge: canvasEdgeSchema,
});

const updateEdgePatchSchema = z
  .object({
    sourceNodeId: z.string().min(1).optional(),
    targetNodeId: z.string().min(1).optional(),
    type: edgeTypeSchema.optional(),
    label: z.string().optional(),
    sourceHandle: edgeHandleSchema.optional(),
    targetHandle: edgeHandleSchema.optional(),
    strokeColor: edgeColorSchema.optional(),
    strokeWidth: z.number().min(1).max(12).optional(),
    lineStyle: edgeLineStyleSchema.optional(),
    startArrow: edgeArrowStyleSchema.optional(),
    endArrow: edgeArrowStyleSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Update edge patch cannot be empty" });

const updateEdgeOperationSchema = z.object({
  type: z.literal("update_edge"),
  edgeId: z.string().min(1),
  patch: updateEdgePatchSchema,
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
  variable: workspaceVariableSchema,
});

export const workspaceOperationSchema = z.discriminatedUnion("type", [
  createNodeOperationSchema,
  updateNodeOperationSchema,
  deleteNodeOperationSchema,
  moveNodeOperationSchema,
  createEdgeOperationSchema,
  updateEdgeOperationSchema,
  deleteEdgeOperationSchema,
  groupNodesOperationSchema,
  setVariableOperationSchema,
]);

export const agentResponseSchema = z.object({
  message: z.string().min(1).max(120),
  operations: z.array(workspaceOperationSchema),
  requiresConfirmation: z.boolean().optional(),
});
