import { z } from "zod";
import type { ZodType } from "zod";
import type { CanvasNode, CanvasNodeType } from "../workspace/workspaceTypes";

export type ComponentDefinition = {
  type: CanvasNodeType;
  displayName: string;
  defaultProps: Record<string, unknown>;
  schema: ZodType<Record<string, unknown>>;
  getContextSummary: (node: CanvasNode) => string;
};

const textLikeSchema = z
  .object({
    title: z.string().optional(),
    text: z.string().optional(),
  })
  .catchall(z.unknown());

const cardLikeSchema = z
  .object({
    title: z.string().optional(),
    value: z.union([z.string(), z.number()]).optional(),
    detail: z.string().optional(),
  })
  .catchall(z.unknown());

export const componentRegistry: Record<CanvasNodeType, ComponentDefinition> = {
  text: {
    type: "text",
    displayName: "文本",
    defaultProps: { title: "文本", text: "" },
    schema: textLikeSchema,
    getContextSummary: (node) => `${node.name}: ${String(node.props.text ?? node.props.title ?? "")}`,
  },
  button: {
    type: "button",
    displayName: "按钮",
    defaultProps: { label: "按钮", action: "noop" },
    schema: z.object({ label: z.string().optional(), action: z.string().optional() }).catchall(z.unknown()),
    getContextSummary: (node) => `${node.name}: ${String(node.props.label ?? "按钮")}`,
  },
  slider: {
    type: "slider",
    displayName: "滑块",
    defaultProps: { label: "滑块", min: 0, max: 100, step: 1, value: 50 },
    schema: z
      .object({
        label: z.string().optional(),
        min: z.number(),
        max: z.number(),
        step: z.number().positive(),
        value: z.number(),
        unit: z.string().optional(),
      })
      .catchall(z.unknown()),
    getContextSummary: (node) => `${node.name}: 当前值 ${String(node.props.value ?? "")}`,
  },
  chart: {
    type: "chart",
    displayName: "图表",
    defaultProps: { title: "图表", chartType: "bar", data: [], labels: [] },
    schema: z
      .object({
        title: z.string().optional(),
        chartType: z.enum(["bar", "line", "pie", "scatter"]).or(z.string()),
        data: z.array(z.number()),
        labels: z.array(z.string()).optional(),
      })
      .catchall(z.unknown()),
    getContextSummary: (node) => `${node.name}: ${String(node.props.title ?? "图表")}`,
  },
  flowchart: {
    type: "flowchart",
    displayName: "流程图",
    defaultProps: { title: "流程", steps: [] },
    schema: z.object({ title: z.string().optional(), steps: z.array(z.string()) }).catchall(z.unknown()),
    getContextSummary: (node) => `${node.name}: ${String(node.props.title ?? "流程")}`,
  },
  table: {
    type: "table",
    displayName: "表格",
    defaultProps: { columns: [], rows: [] },
    schema: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.string())) }).catchall(z.unknown()),
    getContextSummary: (node) => `${node.name}: 表格`,
  },
  card: {
    type: "card",
    displayName: "卡片",
    defaultProps: { title: "指标", value: "", detail: "" },
    schema: cardLikeSchema,
    getContextSummary: (node) => `${node.name}: ${String(node.props.detail ?? node.props.value ?? "")}`,
  },
  container: {
    type: "container",
    displayName: "容器",
    defaultProps: { title: "容器", detail: "" },
    schema: cardLikeSchema,
    getContextSummary: (node) => `${node.name}: ${String(node.props.detail ?? "")}`,
  },
  agent_plan: {
    type: "agent_plan",
    displayName: "Agent 计划",
    defaultProps: { title: "计划", text: "" },
    schema: textLikeSchema,
    getContextSummary: (node) => `${node.name}: ${String(node.props.title ?? "")}`,
  },
  context_note: {
    type: "context_note",
    displayName: "上下文便签",
    defaultProps: { title: "便签", text: "" },
    schema: textLikeSchema,
    getContextSummary: (node) => `${node.name}: ${String(node.props.text ?? "")}`,
  },
};

export function validateComponentProps(node: CanvasNode): CanvasNode {
  componentRegistry[node.type].schema.parse(node.props);
  return node;
}
