# Workspace Object/View/Graph P0 重构设计

日期：2026-07-16

## 目标

Museboard 的长期信息架构已经明确为 **对象（Object）+ 多视图（View）+ 图关系（Graph）**，而不是 **文件（File）+ 文件夹（Folder）**。本次 P0 重构的目标不是一次性实现所有对象类型的完整 UI，而是先完成架构骨架：

- Workspace 的事实源从 `Page -> nodes/edges` 迁移到 `objects + views + relations`。
- `Page` 降级为一种兼容概念，长期由 `Canvas View` 承担。
- 画布节点成为对象在某个视图中的呈现，而不是对象本身。
- 关系从画布内连线升级为 Workspace 级引用、依赖、数据流和评论关系。
- Agent operation 能直接创建、修改对象、视图和关系，而不是只能操作当前页面节点。
- 旧数据、旧 operation 和现有组件渲染路径保持兼容，避免一次性重写 UI。

## 当前实现判断

当前实现已经具备稳定的前端画板 MVP：

- `Workspace` 以 `activePageId + pages[]` 为中心。
- 每个 `Page` 内有 `nodes` 和 `edges`。
- `CanvasNode` 同时承担业务对象、组件实例和画布布局。
- `CanvasEdge` 只连接当前 Page 内的节点。
- `componentRegistry` 已经包含 `Renderer`、`Inspector`、`defaultProps`、`schema`、`getContextSummary`。
- `operationEngine` 已经有 operation 校验、权限、删除确认、基础 bindings 和变量同步。
- `contextBuilder` 已经支持 selected nodes、mentioned nodes 和 workspace summary。

主要架构问题是：这些能力仍然绑定在当前页面和画布节点上，没有一等的 Workspace Object、View 和 Relation。

## P0 范围

P0 只做架构必需项。

### P0 必须完成

- 新增 Workspace V2 数据模型。
- 新增对象、视图、关系的 TypeScript 类型和 Zod schema。
- 新增旧 Workspace 到 V2 的迁移逻辑。
- 新增兼容 selector，让现有 `CanvasPanel`、Inspector、Chat 能继续基于 active canvas view 工作。
- 新增 Object/View/Relation operation，并保留旧 node/edge operation 的适配层。
- `contextBuilder` 输出对象、视图和关系摘要。
- `@` 引用从名称匹配升级为稳定对象引用格式。
- Graph 关系不再只存在于当前画布 edge。
- 增加 P0 测试覆盖迁移、schema、operation 和上下文。

### P0 不做

- 不完整实现 Timeline、Media、Dashboard、Graph View 的最终 UI。
- 不接入真实后端、多人协同或云端权限。
- 不重写 tldraw 承载层。
- 不删除旧 `create_node` / `update_node` operation；P0 先兼容，后续再收敛。
- 不要求所有组件一次性改成独立目录结构。

## 目标模型

### Workspace

```ts
type Workspace = {
  schemaVersion: 2;
  id: string;
  title: string;
  version: number;
  activeViewId: string;
  objects: Record<string, WorkspaceObject>;
  views: Record<string, WorkspaceView>;
  relations: Record<string, WorkspaceRelation>;
  variables: Record<string, WorkspaceVariable>;
  dataSources: Record<string, WorkspaceDataSource>;
  createdAt: string;
  updatedAt: string;

  // 迁移过渡期保留，加载后应迁移为 views.canvas。
  activePageId?: string;
  pages?: Page[];
};
```

设计原则：

- `objects` 是业务事实源。
- `views` 是对象集合的呈现方式。
- `relations` 是对象之间的 Workspace 级连接。
- `activeViewId` 替代长期的 `activePageId`。
- `pages` 只作为迁移输入和兼容层，不作为新功能依赖。

### WorkspaceObject

```ts
type WorkspaceObject = {
  id: string;
  kind:
    | "document"
    | "database_object"
    | "card"
    | "canvas"
    | "timeline"
    | "media"
    | "conversation"
    | "ai_artifact"
    | "dashboard";
  name: string;
  props: Record<string, unknown>;
  state?: Record<string, unknown>;
  permissions?: {
    userEditable: boolean;
    agentEditable: boolean;
    deletable: boolean;
  };
  metadata: {
    createdBy: "user" | "agent";
    updatedBy: "user" | "agent";
    createdAt: string;
    updatedAt: string;
    description?: string;
    tags?: string[];
  };
};
```

P0 中 `kind` 必须覆盖核心信息架构对象，但不要求每种对象都有完整渲染器。P0 至少要能保存、校验、迁移、引用和进入 Agent 上下文。

### WorkspaceView

```ts
type WorkspaceView =
  | CanvasWorkspaceView
  | TableWorkspaceView
  | TimelineWorkspaceView
  | DashboardWorkspaceView
  | GraphWorkspaceView;

type CanvasWorkspaceView = {
  id: string;
  kind: "canvas";
  name: string;
  objectIds: string[];
  layouts: Record<string, CanvasObjectLayout>;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
};

type CanvasObjectLayout = {
  objectId: string;
  rendererType: CanvasNodeType;
  position: CanvasPosition;
  localProps?: Record<string, unknown>;
  hidden?: boolean;
  locked?: boolean;
};
```

设计原则：

- 同一个对象可以出现在多个视图中。
- `rendererType` 允许同一个对象以不同组件方式呈现。
- 位置、尺寸、隐藏、视图内锁定属于 view layout，不属于业务对象。
- `localProps` 只保存视图呈现参数；业务字段仍在 object props。

### WorkspaceRelation

```ts
type WorkspaceRelation = {
  id: string;
  sourceObjectId: string;
  targetObjectId: string;
  kind: "reference" | "dependency" | "data_flow" | "comment" | "contains" | "derived_from";
  label?: string;
  props?: Record<string, unknown>;
  metadata: {
    createdBy: "user" | "agent";
    updatedBy: "user" | "agent";
    createdAt: string;
    updatedAt: string;
  };
};
```

设计原则：

- Canvas edge 是 relation 在 canvas view 中的视觉呈现。
- Relation 不应依赖某个 Page 或 CanvasNode 存在。
- Graph View 从 `relations` 派生，不从当前画布线条反推。

## 兼容策略

P0 不能破坏现有前端。过渡期采用三层兼容：

### 1. Legacy Workspace 加载迁移

加载旧数据时：

1. 每个旧 `CanvasNode` 迁移为一个 `WorkspaceObject`。
2. 每个旧 `Page` 迁移为一个 `CanvasWorkspaceView`。
3. 每个旧 `CanvasEdge` 迁移为一个 `WorkspaceRelation`。
4. 旧 node id 可作为 object id，降低迁移成本。
5. 旧 edge id 可作为 relation id。
6. 旧 `activePageId` 映射到 `activeViewId`。

### 2. Active Canvas Selector

新增 selector：

```ts
getActiveCanvasView(workspace): CanvasWorkspaceView
getCanvasNodesForView(workspace, viewId): CanvasNode[]
getCanvasEdgesForView(workspace, viewId): CanvasEdge[]
```

现有 `CanvasPanel` 可以继续接收 `CanvasNode[]` 和 `CanvasEdge[]`，但数据由 `objects + views + relations` 派生。

### 3. Legacy Operation Adapter

保留旧 operation：

- `create_node`
- `update_node`
- `delete_node`
- `move_node`
- `create_edge`
- `update_edge`
- `delete_edge`

在 engine 内部转换为新 operation：

- `create_object`
- `update_object`
- `delete_object`
- `place_object_in_view`
- `update_view_layout`
- `create_relation`
- `update_relation`
- `delete_relation`

这样现有本地 Agent、测试和 UI 操作可以逐步迁移。

## Operation 设计

### 新增 operation

```ts
type WorkspaceOperation =
  | CreateObjectOperation
  | UpdateObjectOperation
  | DeleteObjectOperation
  | CreateViewOperation
  | UpdateViewOperation
  | DeleteViewOperation
  | PlaceObjectInViewOperation
  | RemoveObjectFromViewOperation
  | UpdateViewLayoutOperation
  | CreateRelationOperation
  | UpdateRelationOperation
  | DeleteRelationOperation
  | SetVariableOperation
  | LegacyWorkspaceOperation;
```

### 权限规则

- Agent 可以更新 `object.props`，但不能直接修改 `object.id`、`kind`、`metadata.createdBy`。
- Agent 不能绕过 `permissions.agentEditable === false`。
- 删除 object 必须同时检查引用它的 view layout 和 relation。
- 删除 relation 按危险程度低于删除 object，但仍需记录历史。
- 批量删除 object、删除 view、清空 relation 必须确认。

### 删除策略

P0 建议使用软删除或引用检查，不建议直接级联删除：

- 如果 object 仍被多个 view 使用，默认只从当前 view 移除。
- 如果用户或 Agent 明确删除 object，需要提示影响的 views 和 relations。
- Delete object operation 应返回可汇总的 change summary。

## Context Builder 设计

P0 后 Agent 上下文至少包含：

```ts
type WorkspaceContext = {
  activeView: {
    id: string;
    kind: WorkspaceView["kind"];
    name: string;
    visibleObjectIds: string[];
  };
  selectedObjects: ObjectContextSummary[];
  mentionedObjects: ObjectContextSummary[];
  relatedObjects: ObjectContextSummary[];
  relations: RelationContextSummary[];
  recentUserEvents: string[];
  summary: string;
};
```

关键变化：

- `selectedNodes` 改为 `selectedObjects`，节点只是 view selection。
- `mentionedObjects` 使用稳定 object id，而不是纯 `@name` 字符串包含判断。
- `relatedObjects` 从 `relations` 取一跳邻居，帮助 Agent 理解依赖。
- `summary` 统计对象类型、视图类型和关系类型，而不是只统计 active page nodes。

## 稳定引用设计

当前 `@name` 会遇到重名、改名、特殊字符问题。P0 改为显示名称和稳定 token 分离：

用户看到：

```txt
@预算滑块
```

输入框内部提交：

```txt
@[预算滑块](object:slider_budget)
```

解析结果：

```ts
type MentionToken = {
  objectId: string;
  label: string;
};
```

兼容策略：

- 新 mention menu 插入稳定 token。
- 仍兼容用户手打 `@名称`，但只作为 fallback。
- 重名时必须通过菜单选择，或提示用户选择目标对象。

## Graph View P0

P0 不实现完整图谱编辑器，但必须完成数据层：

- `relations` 独立存储。
- Canvas edge 创建时同步创建 relation。
- relation 删除时对应 canvas edge 消失。
- Graph View 可以用最小方式展示 relation 列表或简化节点边图。
- `contextBuilder` 能从 relations 取依赖和引用摘要。

Graph View 的 P0 验收不是视觉精美，而是数据关系已经不依赖当前 Page。

## 分阶段计划

### Phase 0：类型与文档冻结

产出：

- `workspaceTypes.ts` 增加 V2 类型。
- `workspaceSchema.ts` 增加 V2 schema。
- 明确 legacy 类型和 V2 类型边界。
- 新增本文件作为实施基准。

验收：

- TypeScript 能表达 `objects + views + relations`。
- 旧类型未删除，现有代码不需要大规模改动即可编译。

### Phase 1：迁移和兼容 selector

产出：

- `migrateLegacyWorkspaceToV2(value)`。
- `getActiveWorkspaceView()`。
- `getActiveCanvasView()`。
- `getCanvasNodesForView()`。
- `getCanvasEdgesForView()`。

验收：

- 旧 workspace 加载后能生成等价 active canvas。
- 初始数据迁移后首屏视觉和当前版本一致。
- `npm test` 覆盖迁移后的 node、edge、variable、active view。

### Phase 2：Operation Engine 双轨

产出：

- 新 Object/View/Relation operation schema。
- 新 operation 执行路径。
- legacy node/edge operation adapter。
- relation 引用完整性校验。

验收：

- 旧 `create_node` 仍能在画布创建可见节点。
- 新 `create_object + place_object_in_view` 能创建等价画布对象。
- `create_relation` 不依赖 active page。
- 删除 object 时能处理 view layouts 和 relations。

### Phase 3：UI 兼容切换

产出：

- `CanvasPanel` 改用 active canvas selector。
- Inspector 更新 object props 和 view layout 的职责边界。
- Chat change summary 能区分 object、view、relation。
- 页面管理 UI 改名或过渡为 View 管理。

验收：

- 画布拖拽只更新 view layout。
- 修改标题、文本、图表数据更新 object props。
- 连接对象创建 Workspace relation。
- Undo/Redo 仍可用。

### Phase 4：Agent 上下文与引用

产出：

- `@objectId` 稳定 mention token。
- `contextBuilder` 输出 selected objects、mentioned objects、relations、related objects。
- 本地 Agent 改为基于 object id 更新。
- `/summary` 输出对象/视图/关系摘要。

验收：

- 重名对象可以被准确引用。
- 改名后旧 mention token 仍能定位对象。
- Agent 能根据选区和关系更新正确对象。

### Phase 5：P0 回归和收口

产出：

- 迁移测试。
- schema 测试。
- operation engine 测试。
- context builder 测试。
- 最小浏览器验证。

验收：

- `npm test` 通过。
- `npm run build` 通过。
- 页面非空白。
- 旧 JSON 加载后能继续编辑。
- 新 V2 JSON 保存再加载不丢对象、视图和关系。

## 文件影响清单

预计主要修改：

| 文件 | 工作 |
| --- | --- |
| `src/workspace/workspaceTypes.ts` | 增加 Object/View/Relation 类型 |
| `src/workspace/workspaceSchema.ts` | 增加 V2 schema 和完整性校验 |
| `src/workspace/workspaceSelectors.ts` | 增加 active view 和 canvas projection selector |
| `src/workspace/workspaceStore.ts` | 接入迁移、activeViewId、operation commit、history |
| `src/workspace/operationEngine.ts` | 增加新 operation 和 legacy adapter |
| `src/agent/agentProtocol.ts` | 扩展 operation 类型 |
| `src/agent/operationSchemas.ts` | 扩展 operation Zod schema |
| `src/workspace/contextBuilder.ts` | 改为 object/view/relation 上下文 |
| `src/components-registry/registry.ts` | 保持 renderer registry，补 object kind 映射 |
| `src/chat/ChatInput.tsx` | 稳定 mention token |
| `src/chat/ChatPanel.tsx` | change summary 展示 object/view/relation |
| `src/canvas/CanvasPanel.tsx` | 从 selector 读取 canvas projection |
| `src/inspector/InspectorPanel.tsx` | 区分 object props 和 view layout |
| `src/workspace/*.test.ts` | 新增/更新迁移、schema、operation、context 测试 |

## 风险与处理

### 风险：一次性改动过大

处理：

- 先加 V2 类型和 selector，不立刻删除 legacy page。
- Canvas UI 继续消费派生的 `CanvasNode[]`，减少重写面。

### 风险：object props 和 view layout 边界混乱

处理：

- 位置、尺寸、隐藏、视图内锁定归 view layout。
- 标题、正文、图表数据、表格数据归 object props。
- Inspector 明确分区显示。

### 风险：关系和画布边重复存储

处理：

- Workspace relation 是事实源。
- Canvas edge 是 relation 的 view projection。
- 迁移期可以保留 edge layout，但不能让 edge 成为唯一关系来源。

### 风险：旧 operation 行为不一致

处理：

- legacy adapter 必须有测试。
- 每个 legacy operation 都映射到新 operation，再执行统一校验。

## P0 完成定义

P0 完成时，应满足以下条件：

- Workspace 数据保存为 V2：`objects + views + relations`。
- 旧 Workspace 可以自动迁移，不丢节点、边、变量、页面和 active page。
- 当前画布体验基本不变。
- Page 不再是新增能力的主要扩展点。
- CanvasNode 不再是业务事实源，只是 canvas view projection。
- Graph relation 是 Workspace 级事实源。
- Agent 能通过稳定 object id 更新对象。
- 测试覆盖迁移、schema、operation、context。
- 构建通过，浏览器验证页面非空白。

## 建议执行顺序

1. 先实现 V2 类型、schema、迁移和 selector。
2. 再实现新 operation 和 legacy adapter。
3. 再切换 CanvasPanel、Inspector、Chat 到 selector。
4. 最后做 mention token、context builder 和 Graph relation 收口。

不要先做 Timeline、Media、Dashboard 的视觉组件。对象骨架稳定后，这些类型才能以低成本加入。
