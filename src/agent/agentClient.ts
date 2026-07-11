import type { AgentResponse } from "./agentProtocol";
import type { WorkspaceContext } from "../workspace/contextBuilder";
import type { AgentTransport } from "../workspace/workspaceTypes";
import { createId, nowIso } from "../utils/id";

type RunAgentOptions = {
  transport: AgentTransport;
  endpoint?: string;
};

export async function runAgent(message: string, context: WorkspaceContext, options: RunAgentOptions): Promise<AgentResponse> {
  if (options.transport === "local") {
    return runLocalAgent(message, context);
  }

  const endpoint = options.endpoint?.trim();
  if (!endpoint) {
    throw new Error("未配置 Agent endpoint。");
  }

  if (options.transport === "http") {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, context }),
    });
    if (!response.ok) {
      throw new Error(`Agent HTTP 请求失败：${response.status}`);
    }
    return (await response.json()) as AgentResponse;
  }

  if (options.transport === "websocket") {
    return runWebSocketAgent(endpoint, message, context);
  }

  return runSseAgent(endpoint, message, context);
}

function runSseAgent(endpoint: string, message: string, context: WorkspaceContext): Promise<AgentResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, window.location.href);
    url.searchParams.set("message", message);
    url.searchParams.set("context", JSON.stringify(context));

    const source = new EventSource(url.toString());
    const timeout = window.setTimeout(() => {
      source.close();
      reject(new Error("Agent SSE 响应超时。"));
    }, 30000);

    source.onmessage = (event) => {
      window.clearTimeout(timeout);
      source.close();
      resolve(JSON.parse(event.data) as AgentResponse);
    };

    source.onerror = () => {
      window.clearTimeout(timeout);
      source.close();
      reject(new Error("Agent SSE 连接失败。"));
    };
  });
}

function runWebSocketAgent(endpoint: string, message: string, context: WorkspaceContext): Promise<AgentResponse> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    const timeout = window.setTimeout(() => {
      socket.close();
      reject(new Error("Agent WebSocket 响应超时。"));
    }, 30000);

    socket.onopen = () => {
      socket.send(JSON.stringify({ message, context }));
    };

    socket.onmessage = (event) => {
      window.clearTimeout(timeout);
      socket.close();
      resolve(JSON.parse(event.data) as AgentResponse);
    };

    socket.onerror = () => {
      window.clearTimeout(timeout);
      socket.close();
      reject(new Error("Agent WebSocket 连接失败。"));
    };
  });
}

export async function runLocalAgent(message: string, context: WorkspaceContext): Promise<AgentResponse> {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes("滑块") || normalized.includes("slider") || normalized.includes("预算") || normalized.includes("budget")) {
    return {
      message: "已创建通用滑块。",
      operations: [
        {
          type: "create_node",
          node: {
            id: createId("slider"),
            type: "slider",
            name: "通用滑块",
            position: { x: 180, y: 180, width: 340, height: 116 },
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
            metadata: { createdBy: "agent", updatedBy: "agent", createdAt: nowIso(), updatedAt: nowIso() },
          },
        },
        {
          type: "set_variable",
          key: "sliderValue",
          variable: { type: "number", value: 50 },
        },
      ],
    };
  }

  if (
    normalized.includes("mermaid") ||
    normalized.includes("流程图") ||
    normalized.includes("flowchart") ||
    normalized.includes("数据流图") ||
    normalized.includes("data flow")
  ) {
    return {
      message: "已创建 Mermaid 图。",
      operations: [
        {
          type: "create_node",
          node: {
            id: createId("mermaid"),
            type: "mermaid",
            name: "Mermaid 图",
            position: { x: 520, y: 180, width: 420, height: 280 },
            props: {
              title: "Mermaid 图",
              diagramType: "flowchart",
              theme: "neutral",
              source: "flowchart TD\n  A[输入] --> B[处理]\n  B --> C[输出]",
            },
            permissions: { userEditable: true, agentEditable: true, deletable: true },
            metadata: { createdBy: "agent", updatedBy: "agent", createdAt: nowIso(), updatedAt: nowIso() },
          },
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

  const referencedNodeIds = [...context.selectedNodes, ...context.mentionedNodes].map((node) => node.id);

  if ((normalized.includes("优化") || context.mentionedNodes.length > 0) && referencedNodeIds.length > 0) {
    return {
      message: context.mentionedNodes.length > 0 ? "已更新引用对象。" : "已优化选中组件的命名与说明。",
      operations: [...new Set(referencedNodeIds)].map((nodeId) => ({
        type: "update_node",
        nodeId,
        patch: {
          "props.detail": context.mentionedNodes.length > 0 ? "已根据 @ 引用做轻量更新。" : "已根据当前选区做轻量优化。",
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
