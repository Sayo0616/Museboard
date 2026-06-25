下面是一套**完整可行的交互式 Agent 前端方案**。核心思路是：**对话区只负责意图交流，画板区承载真实工作成果与上下文。Agent 的主要输出不是长文本，而是对画板的结构化修改。**

---

# 1. 产品形态

## 整体布局

```txt
┌──────────────────────────────────────────────────────────────┐
│   Top Bar：项目名 / 保存状态 / 运行模式 / 分享 / 历史版本       │
├──────────────────────────────────────────────┬───────────────┤
│                                              │               │
│                画板区域 Canvas                │  对话区域 Chat│
│                                              │               │
│  - 交互组件                                  │   - 简短对话   │
│  - 图表 / 流程图 / 表单 / 文本                │   - 用户指令   │
│  - 用户可直接编辑                             │  - Agent状态  │
│  - 作为 workspace context                    │               │
│                                              │               │
├──────────────────────────────────────────────┴───────────────┤
│  Bottom Bar：选择对象 / 坐标 / 缩放 / 最近操作 / Undo / Redo   │
└──────────────────────────────────────────────────────────────┘
```

推荐默认比例：

```txt
画板区域：70% - 80%
对话区域：20% - 30%
```

对话区可以折叠，但画板区应该始终是主工作区。

---

# 2. 核心设计原则

## 2.1 Agent 不“说”结果，而是“构建”结果

错误方式：

> Agent 在聊天区输出一大段图表说明、流程图描述、按钮配置。

正确方式：

> Agent 在画板中创建图表、流程图、按钮、滑块、文本块，并在对话区简短说明：“我已把流程图放到左侧，你可以直接拖动节点。”

---

## 2.2 画板是上下文，不是纯展示

画板里的每个组件都应该是结构化对象，而不是截图或普通 HTML。

例如一个滑块组件不是一段 HTML，而是：

```json
{
  "id": "slider_001",
  "type": "slider",
  "name": "预算滑块",
  "props": {
    "min": 0,
    "max": 100000,
    "step": 1000,
    "value": 30000,
    "label": "预算"
  },
  "position": {
    "x": 420,
    "y": 260,
    "width": 320,
    "height": 80
  }
}
```

这样 Agent 才能理解、修改、复用和引用它。

---

## 2.3 用户可以直接修改，Agent 必须感知修改

用户改动组件后，前端需要把事件同步给 Agent 上下文：

```json
{
  "event": "component_updated",
  "component_id": "slider_001",
  "changed": {
    "props.value": {
      "from": 30000,
      "to": 45000
    }
  }
}
```

这样用户拖动滑块后，Agent 后续回答应该知道预算已经变成 45000。

---

# 3. 画板区域设计

## 3.1 画板基础能力

画板建议采用**无限画布 Infinite Canvas**，支持：

| 能力   | 说明              |
| ---- | --------------- |
| 拖拽   | 用户可移动组件         |
| 缩放   | 支持放大、缩小、适配屏幕    |
| 多选   | 支持框选、组合、对齐      |
| 层级   | 支持置顶、置底、分组      |
| 编辑   | 文本可编辑，组件参数可调    |
| 锚点连接 | 流程图、数据流、逻辑链路    |
| 历史记录 | Undo / Redo     |
| 版本对比 | 查看 Agent 修改前后差异 |
| 快捷操作 | 复制、删除、锁定、隐藏     |

---

## 3.2 画板组件类型

第一版建议内置这些组件：

### A. 基础组件

| 类型          | 用途       |
| ----------- | -------- |
| `text`      | 标题、说明、备注 |
| `button`    | 触发动作     |
| `input`     | 文本输入     |
| `textarea`  | 多行输入     |
| `select`    | 下拉选择     |
| `checkbox`  | 开关选项     |
| `slider`    | 参数调节     |
| `table`     | 结构化数据    |
| `card`      | 信息卡片     |
| `container` | 分组布局     |

### B. 数据可视化组件

| 类型                | 推荐实现                |
| ----------------- | ------------------- |
| `bar_chart`       | Vega-Lite / ECharts |
| `line_chart`      | Vega-Lite / ECharts |
| `pie_chart`       | ECharts             |
| `scatter_plot`    | Vega-Lite           |
| `metric`          | 自定义 React 组件        |
| `dashboard_panel` | 组合组件                |

### C. 流程类组件

| 类型              | 推荐实现                |
| --------------- | ------------------- |
| `flowchart`     | React Flow          |
| `mindmap`       | React Flow / 自定义树布局 |
| `sequence`      | Mermaid 渲染后结构化保存    |
| `state_machine` | XState 可视化          |
| `decision_tree` | React Flow          |

### D. Agent 专用组件

| 类型             | 说明                 |
| -------------- | ------------------ |
| `agent_plan`   | Agent 任务计划         |
| `tool_status`  | 工具执行状态             |
| `context_note` | 用户或 Agent 添加的上下文便签 |
| `data_binding` | 数据源绑定节点            |

---

## 3.3 组件编辑方式

每个组件支持三种编辑入口：

### 1. 直接编辑

用户在画布上直接改：

* 拖动位置
* 调整大小
* 双击编辑文本
* 拖动滑块
* 点击按钮
* 修改表格单元格
* 连接流程图节点

### 2. 右侧 Inspector

选中组件后，画板右侧或浮层显示属性编辑器：

```txt
选中：预算滑块

名称：预算滑块
最小值：0
最大值：100000
步长：1000
当前值：45000
单位：元
是否锁定：否
是否暴露给 Agent：是
```

### 3. 通过对话修改

用户可以说：

> 把预算滑块最大值改成 20 万。
> 把这个图表改成柱状图。
> 把左边这三个节点连起来。
> 给这个按钮加一个“重新计算”的动作。

Agent 通过结构化命令修改画板。

---

# 4. 对话区域设计

对话区不是主要内容承载区，而是**控制台 + 协作通道**。

## 4.1 对话区内容规范

Agent 的消息应该短：

```txt
好的，我已在画板中添加预算滑块和收益图表。
```

```txt
我发现当前流程缺少审批节点，已用黄色标出。
```

```txt
这个修改会删除 3 个节点，是否继续？
```

避免：

```txt
下面是一个完整的流程图：
1. 用户输入……
2. 系统校验……
3. 管理员审批……
```

这些内容应该进入画板。

---

## 4.2 对话区功能

| 功能       | 说明                    |
| -------- | --------------------- |
| 用户输入     | 自然语言指令                |
| 引用画板对象   | 输入框支持 `@name`          |
| 引用选区     | 用户选中画板元素后说“优化这些”      |
| 快捷指令     | `/chart`、`/summary`、`/export` |
| Agent 状态 | 思考中、修改中、等待确认          |
| 操作卡片     | 显示 Agent 即将执行的变更      |
| 历史记录     | 用户和 Agent 的简短交流       |

---

# 5. 前端技术栈

## 推荐 MVP 技术栈

| 模块        | 技术                                   |
| --------- | ------------------------------------ |
| 框架        | React + TypeScript                   |
| 构建        | Vite 或 Next.js                       |
| 画板        | tldraw                                |
| 流程图       | React Flow                           |
| 图表        | Vega-Lite 或 ECharts                  |
| 富文本       | TipTap / ProseMirror                 |
| 状态管理      | Zustand                              |
| 服务端状态     | TanStack Query                       |
| 协同编辑      | Yjs，可第二阶段引入                          |
| 实时通信      | WebSocket / SSE                      |
| Schema 校验 | Zod                                  |
| 拖拽        | dnd-kit                              |
| 样式        | Tailwind CSS                         |
| 命令协议      | JSON Patch / 自定义 Workspace Operation |

---

## 推荐架构选型

如果想快速落地，建议：

```txt
React + TypeScript
+ tldraw 作为无限画布基础
+ 自定义 Shape 渲染 React 组件
+ Zustand 管理本地 workspace state
+ Zod 校验 Agent 操作
+ WebSocket 接收 Agent 的 workspace ops
```

原因：

1. tldraw 已经解决了无限画布、缩放、拖动、多选、历史记录等复杂问题。
2. 自定义 shape 可以承载按钮、滑块、图表、流程图等 React 组件。
3. Agent 不直接操作 DOM，而是生成结构化操作，更安全、更稳定。

---

# 6. 前端核心模块

## 6.1 页面结构

```txt
<App>
  <WorkspaceProvider>
    <TopBar />
    <MainLayout>
      <CanvasPanel />
      <ChatPanel />
    </MainLayout>
    <InspectorPanel />
    <CommandPalette />
    <ChangePreviewModal />
  </WorkspaceProvider>
</App>
```

---

## 6.2 主要模块职责

| 模块                  | 职责                    |
| ------------------- | --------------------- |
| `CanvasPanel`       | 渲染画板、组件、选区、拖拽         |
| `ChatPanel`         | 显示短对话、接收用户指令          |
| `InspectorPanel`    | 编辑选中组件属性              |
| `WorkspaceStore`    | 管理画板状态                |
| `ComponentRegistry` | 注册组件类型和渲染器            |
| `AgentClient`       | 与 Agent 服务通信          |
| `OperationEngine`   | 执行 Agent 返回的画板操作      |
| `ContextBuilder`    | 从画板状态构建 Agent 上下文     |
| `HistoryManager`    | Undo / Redo / 版本 diff |
| `PermissionGuard`   | 控制 Agent 是否能自动修改画板    |

---

# 7. Workspace 数据模型

## 7.1 顶层结构

```ts
type Workspace = {
  id: string;
  title: string;
  version: number;
  pages: Page[];
  variables: Record<string, WorkspaceVariable>;
  dataSources: Record<string, DataSource>;
  createdAt: string;
  updatedAt: string;
};
```

---

## 7.2 页面模型

```ts
type Page = {
  id: string;
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
};
```

---

## 7.3 画板节点模型

```ts
type CanvasNode = {
  id: string;
  type:
    | "text"
    | "button"
    | "slider"
    | "chart"
    | "flowchart"
    | "table"
    | "container"
    | "agent_plan"
    | "context_note";

  name: string;

  position: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  };

  props: Record<string, unknown>;

  state?: Record<string, unknown>;

  bindings?: {
    input?: Binding[];
    output?: Binding[];
  };

  permissions?: {
    userEditable: boolean;
    agentEditable: boolean;
    deletable: boolean;
  };

  metadata?: {
    createdBy: "user" | "agent";
    updatedBy: "user" | "agent";
    createdAt: string;
    updatedAt: string;
    description?: string;
  };
};
```

---

## 7.4 边模型

```ts
type CanvasEdge = {
  id: string;
  sourceNodeId: string;
  sourceHandle?: string;
  targetNodeId: string;
  targetHandle?: string;
  type: "arrow" | "data_flow" | "dependency" | "comment";
  label?: string;
};
```

---

# 8. Agent 操作协议

这是整个系统的关键。

Agent 不应该直接返回 HTML、JSX 或任意代码，而应该返回**受控操作**。

## 8.1 Agent 响应格式

```ts
type AgentResponse = {
  message: string;
  operations: WorkspaceOperation[];
  requiresConfirmation?: boolean;
};
```

其中 `message` 用于对话区，必须短。

---

## 8.2 WorkspaceOperation 类型

```ts
type WorkspaceOperation =
  | CreateNodeOperation
  | UpdateNodeOperation
  | DeleteNodeOperation
  | MoveNodeOperation
  | CreateEdgeOperation
  | DeleteEdgeOperation
  | GroupNodesOperation
  | SetVariableOperation
  | FocusNodeOperation;
```

---

## 8.3 示例：创建滑块

```json
{
  "type": "create_node",
  "node": {
    "id": "slider_budget",
    "type": "slider",
    "name": "预算",
    "position": {
      "x": 120,
      "y": 160,
      "width": 320,
      "height": 80
    },
    "props": {
      "label": "预算",
      "min": 0,
      "max": 100000,
      "step": 1000,
      "value": 30000,
      "unit": "元"
    },
    "permissions": {
      "userEditable": true,
      "agentEditable": true,
      "deletable": true
    }
  }
}
```

---

## 8.4 示例：更新图表

```json
{
  "type": "update_node",
  "nodeId": "chart_revenue",
  "patch": {
    "props.chartType": "bar",
    "props.title": "月度收入对比"
  }
}
```

---

## 8.5 示例：对话区短消息

```json
{
  "message": "已把收入趋势图改成柱状图。",
  "operations": [
    {
      "type": "update_node",
      "nodeId": "chart_revenue",
      "patch": {
        "props.chartType": "bar"
      }
    }
  ]
}
```

---

# 9. 前端执行流程

## 9.1 用户通过对话让 Agent 修改画板

```txt
用户输入：
“帮我做一个预算分析面板，有预算滑块、成本图表和结论卡片。”
```

流程：

```txt
1. ChatPanel 接收用户输入
2. ContextBuilder 收集当前画板上下文
3. AgentClient 发送请求给 Agent
4. Agent 返回 message + operations
5. OperationEngine 校验 operations
6. WorkspaceStore 应用变更
7. CanvasPanel 自动更新
8. ChatPanel 显示短消息
```

---

## 9.2 用户直接修改画板

```txt
用户拖动滑块：30000 → 45000
```

流程：

```txt
1. Slider 触发 onChange
2. WorkspaceStore 更新 node.props.value
3. HistoryManager 记录变更
4. ContextBuilder 生成增量事件
5. Agent 上下文更新
6. 相关绑定组件可自动刷新
```

---

# 10. 上下文管理方案

Agent 需要理解画板，但不能每次都把完整 JSON 发给模型。建议使用三层上下文。

## 10.1 实时上下文

每次请求都发送：

```json
{
  "selectedNodeIds": ["slider_budget"],
  "recentUserEvents": [
    "用户把预算从 30000 改为 45000"
  ],
  "viewport": {
    "visibleNodeIds": ["slider_budget", "chart_cost", "card_summary"]
  }
}
```

---

## 10.2 结构化摘要

定期维护 workspace summary：

```json
{
  "summary": "当前画板是一个预算分析面板，包含预算滑块、成本柱状图、ROI 指标卡和结论文本。",
  "importantNodes": [
    {
      "id": "slider_budget",
      "name": "预算",
      "type": "slider",
      "currentValue": 45000
    },
    {
      "id": "chart_cost",
      "name": "成本图表",
      "type": "chart"
    }
  ]
}
```

---

## 10.3 完整状态

只有在这些情况下发送完整状态：

1. 用户要求总结整个画板。
2. Agent 要重构整个工作区。
3. 当前上下文摘要不足。
4. 出现冲突或不一致。
5. 用户显式说“基于整个画板”。

---

# 11. 组件注册机制

前端应该有一个 Component Registry。

```ts
type ComponentDefinition = {
  type: string;
  displayName: string;
  defaultProps: Record<string, unknown>;
  schema: ZodSchema;
  Renderer: React.ComponentType<ComponentRendererProps>;
  Inspector: React.ComponentType<ComponentInspectorProps>;
  getContextSummary?: (node: CanvasNode) => string;
};
```

示例：

```ts
const SliderComponent: ComponentDefinition = {
  type: "slider",
  displayName: "滑块",
  defaultProps: {
    label: "滑块",
    min: 0,
    max: 100,
    step: 1,
    value: 50
  },
  schema: SliderSchema,
  Renderer: SliderRenderer,
  Inspector: SliderInspector,
  getContextSummary: node => {
    return `${node.name}: 当前值为 ${node.props.value}`;
  }
};
```

这样新增组件时，只需要注册：

```ts
registry.register(SliderComponent);
registry.register(ChartComponent);
registry.register(FlowchartComponent);
registry.register(TableComponent);
```

---

# 12. 安全设计

因为 Agent 可以修改前端工作区，必须做安全约束。

## 12.1 不允许 Agent 直接写任意代码

不要允许：

```json
{
  "type": "custom_html",
  "html": "<script>...</script>"
}
```

应该只允许白名单组件：

```txt
text
button
slider
chart
table
flowchart
container
card
```

---

## 12.2 所有 Agent 操作必须校验

前端执行前必须经过：

```txt
operation schema 校验
组件 type 白名单校验
props schema 校验
权限校验
危险操作确认
```

例如删除节点、批量覆盖、外部请求、执行按钮动作，都应该要求确认。

---

## 12.3 Agent 权限分级

| 权限级别                  | 说明            |
| --------------------- | ------------- |
| `suggest`             | Agent 只提出修改建议 |
| `auto_apply_safe`     | 安全操作自动应用      |
| `confirm_destructive` | 删除、覆盖、外部动作前确认 |
| `manual_only`         | 所有操作都需用户确认    |

推荐默认：

```txt
安全新增 / 小修改：自动应用
删除 / 批量替换 / 外部调用：确认后应用
```

---

# 13. 画板交互模式

建议提供三种模式。

## 13.1 编辑模式

用户可以自由编辑组件。

适合：

* 调整布局
* 修改组件属性
* 编辑文本
* 配置图表
* 调整流程

---

## 13.2 运行模式

用户与组件交互，但不改变布局。

适合：

* 拖动滑块观察图表变化
* 点击按钮触发计算
* 填写表单
* 模拟流程

---

## 13.3 Agent 模式

Agent 可以主动修改画板，但受权限限制。

适合：

* 生成 dashboard
* 重构流程图
* 自动排版
* 分析画板内容
* 补充组件

---

# 14. 数据绑定设计

画板组件之间需要能互相影响。

例如：

```txt
预算滑块 → 成本图表 → ROI 指标卡 → 结论文本
```

可以设计变量系统：

```json
{
  "variables": {
    "budget": {
      "type": "number",
      "value": 45000
    }
  }
}
```

滑块绑定变量：

```json
{
  "nodeId": "slider_budget",
  "bindings": {
    "output": [
      {
        "prop": "value",
        "variable": "budget"
      }
    ]
  }
}
```

图表读取变量：

```json
{
  "nodeId": "chart_cost",
  "bindings": {
    "input": [
      {
        "variable": "budget",
        "target": "props.data.budget"
      }
    ]
  }
}
```

---

# 15. 推荐前端目录结构

```txt
src/
  app/
    App.tsx
    routes.tsx

  workspace/
    WorkspaceProvider.tsx
    workspaceStore.ts
    workspaceTypes.ts
    operationEngine.ts
    historyManager.ts
    contextBuilder.ts

  canvas/
    CanvasPanel.tsx
    CanvasNodeRenderer.tsx
    CanvasToolbar.tsx
    SelectionLayer.tsx
    ViewportControls.tsx

  chat/
    ChatPanel.tsx
    ChatInput.tsx
    MessageList.tsx
    AgentStatus.tsx

  components-registry/
    registry.ts
    text/
    button/
    slider/
    chart/
    table/
    flowchart/
    card/
    container/

  inspector/
    InspectorPanel.tsx
    PropertyField.tsx

  agent/
    agentClient.ts
    agentProtocol.ts
    operationSchemas.ts

  ui/
    Button.tsx
    Input.tsx
    Modal.tsx
    Tooltip.tsx

  utils/
    id.ts
    patch.ts
    validation.ts
```

---

# 16. 关键用户体验细节

## 16.1 Agent 修改前后要可见

Agent 修改画板时，用户应该看到：

```txt
新增了 3 个组件
修改了 2 个组件
移动了 4 个组件
删除了 0 个组件
```

并支持：

```txt
查看变更
接受
撤销
```

---

## 16.2 选区上下文非常重要

用户选中几个组件后说：

> 优化一下这些。

前端应该发送：

```json
{
  "userMessage": "优化一下这些",
  "selectedNodes": [
    {
      "id": "chart_1",
      "type": "chart",
      "name": "收入图表"
    },
    {
      "id": "text_2",
      "type": "text",
      "name": "结论说明"
    }
  ]
}
```

否则 Agent 不知道“这些”是什么。

---

## 16.3 支持画板对象引用

输入框支持：

```txt
@预算滑块
@成本图表
@审批流程
```

用户可以说：

```txt
把 @预算滑块 和 @ROI卡片 绑定起来。
```

---

## 16.4 组件应有语义名称

Agent 创建组件时，不要只生成：

```txt
node_1
node_2
node_3
```

而应该生成：

```txt
预算滑块
成本趋势图
ROI 指标卡
结论说明
```

这对用户理解和 Agent 后续引用都很重要。

---

# 17. MVP 版本范围

第一版不要做得太重。建议 MVP 包含：

## 必做

```txt
1. 左侧画板 + 右侧对话布局
2. 支持 text / button / slider / chart / flowchart / table
3. 用户可以拖动、缩放、选中、编辑组件
4. Agent 可以通过 JSON operations 创建和修改组件
5. Chat 区只显示短消息
6. 支持选区上下文
7. 支持 Undo / Redo
8. 支持操作校验
9. 支持保存和加载 workspace
```

## 暂缓

```txt
1. 多人协同
2. 插件市场
3. 任意代码组件
4. 复杂权限系统
5. 完整自动布局引擎
6. 多页面工作区
7. 复杂数据源连接
```

---

# 18. 建议实施路线

## Phase 1：基础画板

目标：搭出可编辑画布。

交付：

```txt
- 双栏布局
- 无限画布
- 节点拖拽
- 文本组件
- 卡片组件
- Inspector 属性面板
- Workspace JSON 保存 / 加载
```

---

## Phase 2：Agent 操作协议

目标：Agent 可以改画板。

交付：

```txt
- AgentResponse 协议
- WorkspaceOperation 协议
- OperationEngine
- Zod schema 校验
- create / update / delete / move 操作
- ChatPanel 展示短消息
```

---

## Phase 3：交互组件

目标：画板变成可交互工作区。

交付：

```txt
- Button
- Slider
- Table
- Chart
- Flowchart
- 数据绑定变量
- 运行模式
```

---

## Phase 4：上下文系统

目标：Agent 理解画板。

交付：

```txt
- selected nodes context
- visible viewport context
- recent events context
- workspace summary
- component context summary
```

---

## Phase 5：产品化

目标：稳定可用。

交付：

```txt
- 版本历史
- 变更预览
- Undo / Redo
- 危险操作确认
- 自动排版
- 导出 PNG / PDF / JSON
```

---

# 19. 一条典型用户路径

```txt
用户：
帮我做一个销售分析工作台。

Agent：
好的，我已创建销售分析工作台。

画板中出现：
- 月销售额折线图
- 区域销售柱状图
- 产品类别饼图
- 时间范围滑块
- 关键结论卡片

用户拖动时间范围滑块。

画板自动更新：
- 图表数据变化
- 结论卡片变化

用户：
把区域销售图改成地图，并突出华东区。

Agent：
已改成区域地图，并突出华东区。

用户选中结论卡片：
这段太长，压缩成三句话。

Agent：
已压缩结论内容。
```

重点是：**Agent 的输出始终主要发生在画板，聊天区只是协调。**

---

# 20. 最终方案

```txt
前端：
React + TypeScript + tldraw + Zustand + Zod

画板：
tldraw 无限画布 + 自定义 React Shape

组件：
Component Registry 管理 text / slider / chart / table / flowchart 等组件

Agent 通信：
WebSocket 或 SSE

Agent 输出：
短 message + workspace operations

状态：
Workspace JSON 是唯一事实源

上下文：
selected nodes + recent events + workspace summary

安全：
白名单组件 + schema 校验 + 危险操作确认
```

这个方案的优点是：

1. **可落地**：不用从零实现无限画布。
2. **可控**：Agent 不直接写代码，只输出结构化操作。
3. **可扩展**：新增组件只需要注册 renderer、inspector 和 schema。
4. **适合 Agent**：画板天然成为结构化上下文。
5. **用户体验清晰**：对话区保持简短，工作结果留在画板。
