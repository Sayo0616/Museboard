import { z } from "zod";
import { canvasEdgeSchema, canvasNodeSchema, workspaceVariableSchema } from "../agent/operationSchemas";
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

export const workspaceSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    version: z.number().int().nonnegative(),
    activePageId: z.string().min(1),
    pages: z.array(pageSchema).min(1),
    variables: z.record(z.string(), workspaceVariableSchema),
    dataSources: z.record(z.string(), z.unknown()),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .superRefine((workspace, context) => {
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
  });

export function validateWorkspace(value: unknown): Workspace {
  return workspaceSchema.parse(value) as Workspace;
}
