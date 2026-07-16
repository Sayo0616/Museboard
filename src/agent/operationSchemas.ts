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

const metadataSchema = z.object({
  createdBy: z.enum(["user", "agent"]),
  updatedBy: z.enum(["user", "agent"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const permissionsSchema = z.object({
  userEditable: z.boolean(),
  agentEditable: z.boolean(),
  deletable: z.boolean(),
});

const workspaceObjectSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["document", "database_object", "card", "canvas", "timeline", "media", "conversation", "ai_artifact", "dashboard"]),
  name: z.string().min(1),
  props: z.record(z.string(), z.unknown()),
  state: z.record(z.string(), z.unknown()).optional(),
  bindings: canvasNodeSchema.shape.bindings,
  permissions: permissionsSchema.optional(),
  metadata: metadataSchema,
});

const canvasObjectLayoutSchema = z.object({
  objectId: z.string().min(1),
  rendererType: nodeTypeSchema,
  position: positionSchema,
  localProps: z.record(z.string(), z.unknown()).optional(),
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
});

const canvasViewSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("canvas"),
  name: z.string().min(1),
  objectIds: z.array(z.string().min(1)),
  layouts: z.record(z.string(), canvasObjectLayoutSchema),
  viewport: z
    .object({
      x: z.number(),
      y: z.number(),
      zoom: z.number().positive(),
    })
    .optional(),
});

const objectListViewBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  objectIds: z.array(z.string().min(1)),
});

const workspaceViewSchema = z.discriminatedUnion("kind", [
  canvasViewSchema,
  objectListViewBaseSchema.extend({ kind: z.literal("table") }),
  objectListViewBaseSchema.extend({ kind: z.literal("timeline") }),
  objectListViewBaseSchema.extend({ kind: z.literal("dashboard") }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("graph"),
    name: z.string().min(1),
    objectIds: z.array(z.string().min(1)),
    relationIds: z.array(z.string().min(1)),
  }),
]);

const relationKindSchema = z.enum(["reference", "dependency", "data_flow", "comment", "contains", "derived_from"]);

const workspaceRelationSchema = z.object({
  id: z.string().min(1),
  sourceObjectId: z.string().min(1),
  targetObjectId: z.string().min(1),
  kind: relationKindSchema,
  label: z.string().optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  metadata: metadataSchema,
});

const createObjectOperationSchema = z.object({
  type: z.literal("create_object"),
  object: workspaceObjectSchema,
});

const updateObjectOperationSchema = z.object({
  type: z.literal("update_object"),
  objectId: z.string().min(1),
  patch: z.record(patchPathSchema, z.unknown()).refine((patch) => Object.keys(patch).length > 0, { message: "Update object patch cannot be empty" }),
});

const deleteObjectOperationSchema = z.object({
  type: z.literal("delete_object"),
  objectId: z.string().min(1),
});

const createViewOperationSchema = z.object({
  type: z.literal("create_view"),
  view: workspaceViewSchema,
});

const updateViewOperationSchema = z.object({
  type: z.literal("update_view"),
  viewId: z.string().min(1),
  patch: z.record(patchPathSchema, z.unknown()).refine((patch) => Object.keys(patch).length > 0, { message: "Update view patch cannot be empty" }),
});

const deleteViewOperationSchema = z.object({
  type: z.literal("delete_view"),
  viewId: z.string().min(1),
});

const placeObjectInViewOperationSchema = z.object({
  type: z.literal("place_object_in_view"),
  viewId: z.string().min(1).optional(),
  objectId: z.string().min(1),
  layout: canvasObjectLayoutSchema,
});

const removeObjectFromViewOperationSchema = z.object({
  type: z.literal("remove_object_from_view"),
  viewId: z.string().min(1).optional(),
  objectId: z.string().min(1),
});

const updateViewLayoutOperationSchema = z.object({
  type: z.literal("update_view_layout"),
  viewId: z.string().min(1).optional(),
  objectId: z.string().min(1),
  patch: z.record(patchPathSchema, z.unknown()).refine((patch) => Object.keys(patch).length > 0, { message: "Update layout patch cannot be empty" }),
});

const createRelationOperationSchema = z.object({
  type: z.literal("create_relation"),
  relation: workspaceRelationSchema,
});

const updateRelationOperationSchema = z.object({
  type: z.literal("update_relation"),
  relationId: z.string().min(1),
  patch: z
    .object({
      sourceObjectId: z.string().min(1).optional(),
      targetObjectId: z.string().min(1).optional(),
      kind: relationKindSchema.optional(),
      label: z.string().optional(),
      props: z.record(z.string(), z.unknown()).optional(),
    })
    .strict()
    .refine((patch) => Object.keys(patch).length > 0, { message: "Update relation patch cannot be empty" }),
});

const deleteRelationOperationSchema = z.object({
  type: z.literal("delete_relation"),
  relationId: z.string().min(1),
});

const createNodeOperationSchema = z.object({
  type: z.literal("create_node"),
  node: canvasNodeSchema,
});

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
  createObjectOperationSchema,
  updateObjectOperationSchema,
  deleteObjectOperationSchema,
  createViewOperationSchema,
  updateViewOperationSchema,
  deleteViewOperationSchema,
  placeObjectInViewOperationSchema,
  removeObjectFromViewOperationSchema,
  updateViewLayoutOperationSchema,
  createRelationOperationSchema,
  updateRelationOperationSchema,
  deleteRelationOperationSchema,
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
