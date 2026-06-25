import type { AgentResponse } from "./agentProtocol";
import type { WorkspaceContext } from "../workspace/contextBuilder";
import { createId, nowIso } from "../utils/id";

export async function runLocalAgent(message: string, context: WorkspaceContext): Promise<AgentResponse> {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes("预算") || normalized.includes("budget")) {
    return {
      message: "已创建预算分析组件。",
      operations: [
        {
          type: "create_node",
          node: {
            id: createId("slider_budget"),
            type: "slider",
            name: "预算滑块",
            position: { x: 180, y: 180, width: 340, height: 116 },
            props: {
              label: "预算",
              min: 0,
              max: 200000,
              step: 5000,
              value: 60000,
              unit: "元",
            },
            bindings: { output: [{ prop: "value", variable: "budget" }] },
            permissions: { userEditable: true, agentEditable: true, deletable: true },
            metadata: { createdBy: "agent", updatedBy: "agent", createdAt: nowIso(), updatedAt: nowIso() },
          },
        },
        {
          type: "set_variable",
          key: "budget",
          variable: { type: "number", value: 60000 },
        },
      ],
    };
  }

  if (normalized.includes("图表") || normalized.includes("/chart") || normalized.includes("chart")) {
    return {
      message: "已在画板中添加趋势图。",
      operations: [
        {
          type: "create_node",
          node: {
            id: createId("chart_revenue"),
            type: "chart",
            name: "收入趋势图",
            position: { x: 520, y: 170, width: 420, height: 288 },
            props: {
              title: "收入趋势",
              chartType: "line",
              data: [28, 38, 34, 52, 63, 71],
              labels: ["1月", "2月", "3月", "4月", "5月", "6月"],
            },
            permissions: { userEditable: true, agentEditable: true, deletable: true },
            metadata: { createdBy: "agent", updatedBy: "agent", createdAt: nowIso(), updatedAt: nowIso() },
          },
        },
      ],
    };
  }

  if (normalized.includes("按钮") || normalized.includes("button")) {
    return {
      message: "已添加操作按钮。",
      operations: [
        {
          type: "create_node",
          node: {
            id: createId("button_action"),
            type: "button",
            name: "重新计算按钮",
            position: { x: 180, y: 360, width: 220, height: 92 },
            props: {
              label: "重新计算",
              action: "recalculate",
            },
            permissions: { userEditable: true, agentEditable: true, deletable: true },
            metadata: { createdBy: "agent", updatedBy: "agent", createdAt: nowIso(), updatedAt: nowIso() },
          },
        },
      ],
    };
  }

  if (normalized.includes("卡片") || normalized.includes("card")) {
    return {
      message: "已添加指标卡片。",
      operations: [
        {
          type: "create_node",
          node: {
            id: createId("card_metric"),
            type: "card",
            name: "关键指标卡",
            position: { x: 560, y: 420, width: 260, height: 132 },
            props: {
              title: "关键指标",
              value: "92%",
              detail: "当前指标处于健康区间。",
            },
            permissions: { userEditable: true, agentEditable: true, deletable: true },
            metadata: { createdBy: "agent", updatedBy: "agent", createdAt: nowIso(), updatedAt: nowIso() },
          },
        },
      ],
    };
  }

  if (normalized.includes("优化") && context.selectedNodeIds.length > 0) {
    return {
      message: "已优化选中组件的命名与说明。",
      operations: context.selectedNodeIds.map((nodeId) => ({
        type: "update_node",
        nodeId,
        patch: {
          "props.detail": "已根据当前选区做轻量优化。",
        },
      })),
    };
  }

  return {
    message: "已把指令记录为上下文便签。",
    operations: [
      {
        type: "create_node",
        node: {
          id: createId("context_note"),
          type: "context_note",
          name: "上下文便签",
          position: { x: 220, y: 520, width: 320, height: 128 },
          props: {
            title: "用户指令",
            text: message,
          },
          permissions: { userEditable: true, agentEditable: true, deletable: true },
          metadata: { createdBy: "agent", updatedBy: "agent", createdAt: nowIso(), updatedAt: nowIso() },
        },
      },
    ],
  };
}
