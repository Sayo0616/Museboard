import { z } from "zod";
import { canvasEdgeSchema, canvasNodeSchema, nodeTypeSchema, workspaceVariableSchema } from "../agent/operationSchemas";
import { migrateLegacyWorkspaceToV2 } from "./workspaceMigration";
import type { Workspace } from "./workspaceTypes";

const pageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nodes: z.array(canvasNodeSchema),
  edges: z.array(canvasEdgeSchema),
  viewport: z
    .object({
      x: z.number(),
      y: z.number(),
      zoom: z.number().positive(),
    })
    .optional(),
});

const metadataSchema = z.object({
  createdBy: z.enum(["user", "agent"]),
  updatedBy: z.enum(["user", "agent"]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const permissionsSchema = z.object({
  userEditable: z.boolean(),
  agentEditable: z.boolean(),
  deletable: z.boolean(),
});

export const workspaceObjectSchema = z.object({
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
  position: canvasNodeSchema.shape.position,
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
  viewport: pageSchema.shape.viewport,
});

const objectListViewBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  objectIds: z.array(z.string().min(1)),
});

const graphViewSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("graph"),
  name: z.string().min(1),
  objectIds: z.array(z.string().min(1)),
  relationIds: z.array(z.string().min(1)),
});

export const workspaceViewSchema = z.discriminatedUnion("kind", [
  canvasViewSchema,
  objectListViewBaseSchema.extend({ kind: z.literal("table") }),
  objectListViewBaseSchema.extend({ kind: z.literal("timeline") }),
  objectListViewBaseSchema.extend({ kind: z.literal("dashboard") }),
  graphViewSchema,
]);

export const workspaceRelationSchema = z.object({
  id: z.string().min(1),
  sourceObjectId: z.string().min(1),
  targetObjectId: z.string().min(1),
  kind: z.enum(["reference", "dependency", "data_flow", "comment", "contains", "derived_from"]),
  label: z.string().optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  metadata: metadataSchema,
});

export const workspaceSchema = z
  .object({
    schemaVersion: z.literal(2),
    id: z.string().min(1),
    title: z.string().min(1),
    version: z.number().int().nonnegative(),
    activeViewId: z.string().min(1),
    objects: z.record(z.string(), workspaceObjectSchema),
    views: z.record(z.string(), workspaceViewSchema),
    relations: z.record(z.string(), workspaceRelationSchema),
    activePageId: z.string().min(1),
    pages: z.array(pageSchema),
    variables: z.record(z.string(), workspaceVariableSchema),
    dataSources: z.record(z.string(), z.record(z.string(), z.unknown())),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .superRefine((workspace, context) => {
    validateV2Integrity(workspace, context);
    validateLegacyProjection(workspace, context);
  });

export function validateWorkspace(value: unknown): Workspace {
  return workspaceSchema.parse(migrateLegacyWorkspaceToV2(value)) as Workspace;
}

function validateV2Integrity(workspace: z.infer<typeof workspaceSchema>, context: z.RefinementCtx): void {
  if (!workspace.views[workspace.activeViewId]) {
    context.addIssue({ code: "custom", path: ["activeViewId"], message: `当前视图不存在：${workspace.activeViewId}` });
  }

  Object.entries(workspace.objects).forEach(([key, object]) => {
    if (key !== object.id) {
      context.addIssue({ code: "custom", path: ["objects", key, "id"], message: `对象键与 ID 不一致：${key}` });
    }
  });

  Object.entries(workspace.views).forEach(([key, view]) => {
    if (key !== view.id) {
      context.addIssue({ code: "custom", path: ["views", key, "id"], message: `视图键与 ID 不一致：${key}` });
    }

    view.objectIds.forEach((objectId, index) => {
      if (!workspace.objects[objectId]) {
        context.addIssue({ code: "custom", path: ["views", key, "objectIds", index], message: `视图引用的对象不存在：${objectId}` });
      }
    });

    if (view.kind === "canvas") {
      Object.entries(view.layouts).forEach(([layoutKey, layout]) => {
        if (layoutKey !== layout.objectId) {
          context.addIssue({ code: "custom", path: ["views", key, "layouts", layoutKey, "objectId"], message: `布局键与对象 ID 不一致：${layoutKey}` });
        }
        if (!workspace.objects[layout.objectId]) {
          context.addIssue({ code: "custom", path: ["views", key, "layouts", layoutKey, "objectId"], message: `布局引用的对象不存在：${layout.objectId}` });
        }
        if (!view.objectIds.includes(layout.objectId)) {
          context.addIssue({ code: "custom", path: ["views", key, "layouts", layoutKey, "objectId"], message: `布局对象不在视图 objectIds 中：${layout.objectId}` });
        }
      });
    }

    if (view.kind === "graph") {
      view.relationIds.forEach((relationId, index) => {
        if (!workspace.relations[relationId]) {
          context.addIssue({ code: "custom", path: ["views", key, "relationIds", index], message: `关系图引用的关系不存在：${relationId}` });
        }
      });
    }
  });

  Object.entries(workspace.relations).forEach(([key, relation]) => {
    if (key !== relation.id) {
      context.addIssue({ code: "custom", path: ["relations", key, "id"], message: `关系键与 ID 不一致：${key}` });
    }
    if (relation.sourceObjectId === relation.targetObjectId) {
      context.addIssue({ code: "custom", path: ["relations", key, "targetObjectId"], message: `关系不能指向自身：${relation.sourceObjectId}` });
    }
    if (!workspace.objects[relation.sourceObjectId]) {
      context.addIssue({ code: "custom", path: ["relations", key, "sourceObjectId"], message: `关系起点对象不存在：${relation.sourceObjectId}` });
    }
    if (!workspace.objects[relation.targetObjectId]) {
      context.addIssue({ code: "custom", path: ["relations", key, "targetObjectId"], message: `关系终点对象不存在：${relation.targetObjectId}` });
    }
  });
}

function validateLegacyProjection(workspace: z.infer<typeof workspaceSchema>, context: z.RefinementCtx): void {
  const pageIds = new Set<string>();
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  workspace.pages.forEach((page, pageIndex) => {
    if (pageIds.has(page.id)) {
      context.addIssue({ code: "custom", path: ["pages", pageIndex, "id"], message: `页面 ID 重复：${page.id}` });
    }
    pageIds.add(page.id);

    const pageNodeIds = new Set(page.nodes.map((node) => node.id));
    page.nodes.forEach((node, nodeIndex) => {
      if (nodeIds.has(node.id)) {
        context.addIssue({ code: "custom", path: ["pages", pageIndex, "nodes", nodeIndex, "id"], message: `节点 ID 重复：${node.id}` });
      }
      nodeIds.add(node.id);
    });

    page.edges.forEach((edge, edgeIndex) => {
      if (edgeIds.has(edge.id)) {
        context.addIssue({ code: "custom", path: ["pages", pageIndex, "edges", edgeIndex, "id"], message: `连接 ID 重复：${edge.id}` });
      }
      edgeIds.add(edge.id);

      if (edge.sourceNodeId === edge.targetNodeId) {
        context.addIssue({
          code: "custom",
          path: ["pages", pageIndex, "edges", edgeIndex, "targetNodeId"],
          message: `连接不能指向自身：${edge.sourceNodeId}`,
        });
      }

      if (!pageNodeIds.has(edge.sourceNodeId)) {
        context.addIssue({
          code: "custom",
          path: ["pages", pageIndex, "edges", edgeIndex, "sourceNodeId"],
          message: `连接起点不存在：${edge.sourceNodeId}`,
        });
      }
      if (!pageNodeIds.has(edge.targetNodeId)) {
        context.addIssue({
          code: "custom",
          path: ["pages", pageIndex, "edges", edgeIndex, "targetNodeId"],
          message: `连接终点不存在：${edge.targetNodeId}`,
        });
      }
    });
  });

  if (!pageIds.has(workspace.activePageId)) {
    context.addIssue({ code: "custom", path: ["activePageId"], message: `当前页面不存在：${workspace.activePageId}` });
  }
}
