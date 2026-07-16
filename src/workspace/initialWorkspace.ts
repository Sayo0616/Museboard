import type { Workspace } from "./workspaceTypes";
import { migrateLegacyWorkspaceToV2 } from "./workspaceMigration";
import { nowIso } from "../utils/id";

const timestamp = nowIso();

const legacyInitialWorkspace = {
  id: "workspace_museboard",
  title: "Museboard 工作台",
  version: 1,
  activePageId: "page_main",
  createdAt: timestamp,
  updatedAt: timestamp,
  dataSources: {},
  variables: {
    sliderValue: {
      type: "number",
      value: 50,
    },
  },
  pages: [
    {
      id: "page_main",
      name: "主画板",
      viewport: { x: 0, y: 0, zoom: 1 },
      edges: [
        {
          id: "edge_slider_metric",
          sourceNodeId: "slider_budget",
          targetNodeId: "card_roi",
          type: "data_flow",
          label: "滑块影响指标",
        },
      ],
      nodes: [
        {
          id: "note_goal",
          type: "text",
          name: "工作台目标",
          position: { x: 80, y: 72, width: 320, height: 132 },
          props: {
            title: "销售分析工作台",
            text: "Agent 的结果应直接构建在画板上，对话区只保留短消息与确认。",
          },
          permissions: { userEditable: true, agentEditable: true, deletable: true },
          metadata: { createdBy: "agent", updatedBy: "agent", createdAt: timestamp, updatedAt: timestamp },
        },
        {
          id: "slider_budget",
          type: "slider",
          name: "通用滑块",
          position: { x: 80, y: 205, width: 340, height: 116 },
          props: {
            label: "数值",
            min: 0,
            max: 100,
            step: 1,
            value: 50,
            unit: "",
          },
          bindings: { output: [{ prop: "value", variable: "sliderValue" }] },
          permissions: { userEditable: true, agentEditable: true, deletable: true },
          metadata: { createdBy: "agent", updatedBy: "agent", createdAt: timestamp, updatedAt: timestamp },
        },
        {
          id: "chart_cost",
          type: "chart",
          name: "成本趋势图",
          position: { x: 470, y: 72, width: 420, height: 288 },
          props: {
            title: "月度成本",
            chartType: "bar",
            baseData: [42, 36, 48, 55, 61, 58],
            data: [42, 36, 48, 55, 61, 58],
            labels: ["1月", "2月", "3月", "4月", "5月", "6月"],
          },
          bindings: { input: [{ variable: "sliderValue", target: "props.data" }] },
          permissions: { userEditable: true, agentEditable: true, deletable: true },
          metadata: { createdBy: "agent", updatedBy: "agent", createdAt: timestamp, updatedAt: timestamp },
        },
        {
          id: "card_roi",
          type: "card",
          name: "ROI 指标卡",
          position: { x: 930, y: 84, width: 260, height: 132 },
          props: {
            title: "ROI",
            value: "128%",
            detail: "滑块数值变化后保持健康回报。",
          },
          bindings: { input: [{ variable: "sliderValue", target: "props.detail" }] },
          permissions: { userEditable: true, agentEditable: true, deletable: true },
          metadata: { createdBy: "agent", updatedBy: "agent", createdAt: timestamp, updatedAt: timestamp },
        },
        {
          id: "flow_approval",
          type: "mermaid",
          name: "审批流程",
          position: { x: 930, y: 252, width: 310, height: 222 },
          props: {
            title: "审批流程",
            diagramType: "flowchart",
            theme: "neutral",
            source: "flowchart TD\n  A[提交参数] --> B[财务复核]\n  B --> C[主管确认]",
          },
          permissions: { userEditable: true, agentEditable: true, deletable: true },
          metadata: { createdBy: "agent", updatedBy: "agent", createdAt: timestamp, updatedAt: timestamp },
        },
        {
          id: "table_plan",
          type: "table",
          name: "执行计划",
          position: { x: 80, y: 330, width: 560, height: 260 },
          props: {
            columns: ["事项", "负责人", "状态"],
            rows: [
              ["参数确认", "财务", "进行中"],
              ["渠道复盘", "增长", "待开始"],
              ["ROI 汇报", "运营", "已排期"],
            ],
            merges: [],
          },
          permissions: { userEditable: true, agentEditable: true, deletable: true },
          metadata: { createdBy: "agent", updatedBy: "agent", createdAt: timestamp, updatedAt: timestamp },
        },
      ],
    },
  ],
};

export const initialWorkspace: Workspace = migrateLegacyWorkspaceToV2(legacyInitialWorkspace);
