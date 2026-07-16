import { z } from "zod";
import type { ComponentType } from "react";
import type { ZodType } from "zod";
import type { CanvasNode, CanvasNodeType } from "../workspace/workspaceTypes";
import {
  ButtonRenderer,
  CardRenderer,
  ChartRenderer,
  MermaidRenderer,
  SliderRenderer,
  TableRenderer,
  TextRenderer,
  type ComponentRendererProps,
} from "./renderers";

export type InspectorField =
  | {
      type: "text" | "number";
      label: string;
      path: string;
      min?: number;
      max?: number;
    }
  | {
      type: "textarea";
      label: string;
      path: string;
    }
  | {
      type: "select";
      label: string;
      path: string;
      options: string[];
    };

export type ComponentDefinition = {
  type: CanvasNodeType;
  displayName: string;
  Renderer: ComponentType<ComponentRendererProps>;
  Inspector: InspectorField[];
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

const tableMergeSchema = z.object({
  row: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
  rowSpan: z.number().int().min(1),
  colSpan: z.number().int().min(1),
});

const mermaidDiagramTypeSchema = z.enum(["flowchart", "sequence", "state", "class", "er", "gantt", "mindmap", "unknown"]);

const defaultMermaidSource = `flowchart TD
  A[Input] --> B[Process]
  B --> C[Output]`;

export const componentRegistry: Record<CanvasNodeType, ComponentDefinition> = {
  text: {
    type: "text",
    displayName: "文本",
    Renderer: TextRenderer,
    Inspector: [
      { type: "text", label: "标题", path: "props.title" },
      { type: "textarea", label: "文本", path: "props.text" },
    ],
    defaultProps: { title: "文本", text: "" },
    schema: textLikeSchema,
    getContextSummary: (node) => `${node.name}: ${String(node.props.text ?? node.props.title ?? "")}`,
  },
  button: {
    type: "button",
    displayName: "按钮",
    Renderer: ButtonRenderer,
    Inspector: [
      { type: "text", label: "标签", path: "props.label" },
      { type: "text", label: "动作", path: "props.action" },
    ],
    defaultProps: { label: "按钮", action: "noop" },
    schema: z.object({ label: z.string().optional(), action: z.string().optional() }).catchall(z.unknown()),
    getContextSummary: (node) => `${node.name}: ${String(node.props.label ?? "按钮")}`,
  },
  slider: {
    type: "slider",
    displayName: "滑块",
    Renderer: SliderRenderer,
    Inspector: [
      { type: "text", label: "标签", path: "props.label" },
      { type: "number", label: "最小", path: "props.min" },
      { type: "number", label: "最大", path: "props.max" },
      { type: "number", label: "步长", path: "props.step", min: Number.EPSILON },
      { type: "number", label: "当前", path: "props.value" },
      { type: "text", label: "单位", path: "props.unit" },
    ],
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
    Renderer: ChartRenderer,
    Inspector: [
      { type: "text", label: "标题", path: "props.title" },
      { type: "select", label: "类型", path: "props.chartType", options: ["bar", "line", "pie", "scatter"] },
      { type: "text", label: "数据", path: "props.data" },
      { type: "text", label: "标签", path: "props.labels" },
    ],
    defaultProps: { title: "图表", chartType: "bar", data: [], labels: [] },
    schema: z
      .object({
        title: z.string().optional(),
        chartType: z.enum(["bar", "line", "pie", "scatter"]).or(z.string()),
        data: z.array(z.number()),
        labels: z.array(z.string()).optional(),
        focusedIndex: z.number().int().nonnegative().nullable().optional(),
      })
      .catchall(z.unknown()),
    getContextSummary: (node) => `${node.name}: ${String(node.props.title ?? "图表")}`,
  },
  mermaid: {
    type: "mermaid",
    displayName: "Mermaid",
    Renderer: MermaidRenderer,
    Inspector: [
      { type: "text", label: "Title", path: "props.title" },
      {
        type: "select",
        label: "Diagram",
        path: "props.diagramType",
        options: ["flowchart", "sequence", "state", "class", "er", "gantt", "mindmap", "unknown"],
      },
      { type: "select", label: "Theme", path: "props.theme", options: ["neutral", "default"] },
      { type: "textarea", label: "Source", path: "props.source" },
    ],
    defaultProps: { title: "Mermaid diagram", source: defaultMermaidSource, diagramType: "flowchart", theme: "neutral" },
    schema: z
      .object({
        title: z.string().optional(),
        source: z.string().min(1),
        diagramType: mermaidDiagramTypeSchema.optional(),
        theme: z.enum(["neutral", "default"]).optional(),
      })
      .catchall(z.unknown()),
    getContextSummary: (node) => {
      const source = String(node.props.source ?? "");
      return `${node.name}: ${String(node.props.diagramType ?? "mermaid")} ${source.slice(0, 120)}`;
    },
  },
  table: {
    type: "table",
    displayName: "表格",
    Renderer: TableRenderer,
    Inspector: [
      { type: "text", label: "列", path: "props.columns" },
      { type: "textarea", label: "行", path: "props.rows" },
    ],
    defaultProps: { columns: [], rows: [], merges: [] },
    schema: z
      .object({
        columns: z.array(z.string()),
        rows: z.array(z.array(z.string())),
        merges: z.array(tableMergeSchema).optional(),
      })
      .catchall(z.unknown()),
    getContextSummary: (node) => `${node.name}: 表格`,
  },
  card: {
    type: "card",
    displayName: "卡片",
    Renderer: CardRenderer,
    Inspector: [
      { type: "text", label: "标题", path: "props.title" },
      { type: "text", label: "数值", path: "props.value" },
      { type: "textarea", label: "说明", path: "props.detail" },
    ],
    defaultProps: { title: "指标", value: "", detail: "" },
    schema: cardLikeSchema,
    getContextSummary: (node) => `${node.name}: ${String(node.props.detail ?? node.props.value ?? "")}`,
  },
  container: {
    type: "container",
    displayName: "容器",
    Renderer: CardRenderer,
    Inspector: [
      { type: "text", label: "标题", path: "props.title" },
      { type: "textarea", label: "说明", path: "props.detail" },
    ],
    defaultProps: { title: "容器", detail: "" },
    schema: cardLikeSchema,
    getContextSummary: (node) => `${node.name}: ${String(node.props.detail ?? "")}`,
  },
  agent_plan: {
    type: "agent_plan",
    displayName: "Agent 计划",
    Renderer: TextRenderer,
    Inspector: [
      { type: "text", label: "标题", path: "props.title" },
      { type: "textarea", label: "文本", path: "props.text" },
    ],
    defaultProps: { title: "计划", text: "" },
    schema: textLikeSchema,
    getContextSummary: (node) => `${node.name}: ${String(node.props.title ?? "")}`,
  },
  context_note: {
    type: "context_note",
    displayName: "上下文便签",
    Renderer: TextRenderer,
    Inspector: [
      { type: "text", label: "标题", path: "props.title" },
      { type: "textarea", label: "文本", path: "props.text" },
    ],
    defaultProps: { title: "便签", text: "" },
    schema: textLikeSchema,
    getContextSummary: (node) => `${node.name}: ${String(node.props.text ?? "")}`,
  },
};

export function validateComponentProps(node: CanvasNode): CanvasNode {
  componentRegistry[node.type].schema.parse(node.props);
  return node;
}
