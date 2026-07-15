# Museboard 代码 Review

日期：2026-07-15

## 结论

项目可以正常测试和构建，但 Agent operation 的安全边界、Workspace 数据校验和编辑历史策略需要优先处理。

## 修复执行状态

已完成并集成到 `main`：

- P0 删除确认、重复 ID、patch 白名单与危险路径防护；
- Workspace schema、加载迁移、组件 props 与边引用校验；
- 无效 operation 目标检查、变量类型一致性、空 operation 历史保护；
- Chart、Mermaid、Card、Table 连续输入事务化；
- 删除空 Provider、未引用 renderer，并整理开发依赖。

已完成 Agent 请求串行化、运行状态展示和待确认响应保护。

后续项：binding adapter、真实画板导出、分包优化。

## 优先处理

### P0：删除确认可被绕过（已修复）

- 位置：[`workspaceStore.ts`](../src/workspace/workspaceStore.ts#L608)
- 问题：当 Agent 返回 `requiresConfirmation: false` 时，即使包含删除操作，也可能自动执行。
- 建议：确认条件改为 `hasDestructiveOperation || requiresConfirmation === true`。

### P0：同 ID 节点会被静默覆盖（已修复）

- 位置：[`operationEngine.ts`](../src/workspace/operationEngine.ts#L42)
- 问题：`create_node` 会先移除同 ID 节点，再插入新节点，可绕过删除确认和节点锁定。
- 建议：创建节点时检测 ID 冲突并拒绝操作。

### P0：节点补丁范围过大（已修复）

- 位置：[`operationSchemas.ts`](../src/agent/operationSchemas.ts#L70)、[`operationEngine.ts`](../src/workspace/operationEngine.ts#L49)
- 问题：`update_node.patch` 可修改 `id`、`type`、`permissions`、`metadata` 等结构字段。
- 建议：建立可更新字段白名单；结构变化使用独立 operation。

## 近期处理

### P1：缺少业务完整性校验（已修复）

- 位置：[`operationEngine.ts`](../src/workspace/operationEngine.ts#L70)
- 问题：不存在的节点可被静默更新；边可引用不存在的节点；`focus_node` 不执行任何行为，却仍增加版本和历史。
- 建议：操作前校验目标存在、边端点有效；无效操作应明确报错；实现或删除 `focus_node`。

### P1：Workspace 加载未校验（已修复）

- 位置：[`workspaceStore.ts`](../src/workspace/workspaceStore.ts#L681)
- 问题：本地数据经 `JSON.parse` 后直接当作 `Workspace` 使用，损坏数据可能导致页面崩溃。
- 建议：增加完整 Workspace Zod schema，在迁移前后校验，并处理解析失败。

### P1：输入编辑产生过多历史记录（已修复）

- 位置：[`renderers.tsx`](../src/components-registry/renderers.tsx#L282)、[`workspaceStore.ts`](../src/workspace/workspaceStore.ts#L728)
- 问题：部分输入每次按键都会克隆 Workspace、增加版本并创建历史快照，Undo 会按字符撤销。
- 建议：统一使用 `beginUserEdit / previewUserEdit / commitUserEdit`，在 blur 或 Enter 时只提交一次历史。

### P1：并发 Agent 请求可能丢失待确认响应（已修复）

- 位置：[`workspaceStore.ts`](../src/workspace/workspaceStore.ts#L552)
- 问题：多个请求并发返回时，后一个响应会覆盖现有 `pendingResponse`。
- 建议：增加请求状态和请求 ID，或使用待确认队列；请求进行中可暂时禁用重复提交。

## 后续优化

### P2：绑定逻辑与具体组件耦合

- 位置：[`operationEngine.ts`](../src/workspace/operationEngine.ts#L213)
- 问题：绑定引擎直接判断 `chart`、`card`，并包含 `50`、`45000` 等业务常量。
- 建议：把绑定转换逻辑放入组件注册表或独立 binding adapter。

### P2：冗余代码和重复渲染（部分完成）

- 空 `WorkspaceProvider` 和未引用的 `CanvasNodeRenderer` 已删除。
- [`workspaceExport.ts`](../src/workspace/workspaceExport.ts#L36) 重新实现简化画板渲染，PNG/PDF 与实际节点外观可能不一致。

建议删除无用途代码；导出能力尽量复用画布或组件注册表的渲染抽象。

### P2：关键路径缺少测试（核心路径已补）

当前测试主要覆盖组件交互，建议补充：

- destructive operation 确认策略；
- `requiresConfirmation: false` 场景；
- 节点 ID 冲突；
- 锁定节点和非法 patch；
- 无效边、无效节点；
- Workspace 加载和迁移失败；
- 并发 Agent 响应。

## 依赖与构建

- 未发现完全未使用的第三方依赖。
- `vite`、`typescript`、`@vitejs/plugin-react` 已移至 `devDependencies`。
- 生产构建存在较大的 chunk，主要来自 tldraw；当前是优化项，不影响构建成功。

## 验证结果

- `npm test`：82/82 通过。
- `npm run build`：通过。
- 主线修复均已提交；工作区仅保留用户原有的 `.gitignore` 修改。

## 修复排期

假设由 1 名前端开发执行。成本定义：S 不超过 0.5 人日，M 为 1～2 人日，L 为 3～5 人日。

| 顺序 | 工作项 | 严重程度 | 成本 | 前置依赖 | 批次 |
| --- | --- | --- | --- | --- | --- |
| 1 | 修复删除确认绕过 | P0 | S | 无 | 立即修复 |
| 2 | 拒绝同 ID 节点覆盖 | P0 | S | 无 | 立即修复 |
| 3 | 限制 `update_node.patch` 字段 | P0 | M | 明确允许修改的字段 | 立即修复 |
| 4 | 补充 P0 operation 测试 | P0 | M | 1～3 | 立即修复 |
| 5 | 建立 Workspace Zod schema | P1 | M | 无 | 第一阶段 |
| 6 | 加载、迁移时校验 Workspace | P1 | M | 5 | 第一阶段 |
| 7 | 校验节点、边和变量完整性 | P1 | M | 3、5 | 第一阶段 |
| 8 | 实现或删除 `focus_node` | P1 | S | 7 | 第一阶段 |
| 9 | 统一输入编辑事务 | P1 | M | 无 | 第二阶段 |
| 10 | 迁移图表、卡片、表格编辑 | P1 | M | 9 | 第二阶段 |
| 11 | 增加 Agent 请求状态和请求 ID | P1 | M | 无 | 第二阶段 |
| 12 | 防止待确认响应被覆盖 | P1 | M | 11 | 第二阶段 |
| 13 | 抽离 binding adapter | P2 | L | 3、7 | 后续优化 |
| 14 | 清理空 Provider 和未引用组件 | P2 | S | 无 | 后续优化 |
| 15 | 统一真实画板导出能力 | P2 | L | 13 可选 | 后续优化 |
| 16 | 调整开发依赖并评估分包 | P2 | S～M | 无 | 后续优化 |

### 批次建议

#### 立即修复：1～2 人日

目标：关闭确认和节点结构绕过路径。

- 完成工作项 1～4。
- 所有 destructive operation 必须确认。
- Agent 不能覆盖已有节点 ID，也不能修改节点 ID、类型或权限。
- 新增回归测试后再合并。

#### 第一阶段：2～3 人日

目标：让所有进入 Workspace 的数据都可靠。

- 完成工作项 5～8。
- 保存数据、加载数据和 Agent operation 使用一致的数据约束。
- 非法节点、边、变量或空页面应返回明确错误，不增加版本和历史。

#### 第二阶段：2～3 人日

目标：解决编辑性能、Undo 粒度和并发响应问题。

- 完成工作项 9～12。
- 一次连续输入只产生一个历史记录。
- Agent 请求状态对用户可见；多个响应不会相互覆盖。

#### 后续优化：4～8 人日

目标：降低核心引擎耦合并清理维护负担。

- 按 13、14、16、15 的顺序推进。
- binding 逻辑不再依赖具体组件类型或业务常量。
- PNG/PDF 输出与实际画板保持一致。

### 合并策略

- 每个批次单独提交或单独 PR，不把 P0 修复和大规模重构混在一起。
- 每项修复必须包含对应测试；每个批次结束运行 `npm test` 和 `npm run build`。
- 第一阶段完成前，不建议接入真实远程 Agent。
