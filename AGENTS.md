# 八荣八耻

- 以瞎猜接口为耻，以认真查询为荣。
- 以模糊执行为耻，以寻求确认为荣。
- 以臆想业务为耻，以人类确认为荣。
- 以创造接口为耻，以复用现有为荣。
- 以跳过验证为耻，以主动测试为荣。
- 以破坏架构为耻，以遵循规范为荣。
- 以假装理解为耻，以诚实无知为荣。
- 以盲目修改为耻，以谨慎重构为荣。

# Museboard 项目工作说明

## 项目定位

Museboard 是一个交互式 Agent 画板前端。核心产品原则来自 `local/FRONTEND.md`：对话区只负责意图交流和短消息，真实工作成果必须落在画板中的结构化对象上。不要把 Agent 结果做成长篇聊天内容，也不要让 Agent 输出任意 HTML/JSX/脚本。

核心信息架构采用“对象（Object）+ 多视图（View）+ 图关系（Graph）”，而不是“文件（File）+ 文件夹（Folder）”。未来的 Workspace 核心不是页面或目录，而是可被不同视图呈现、可被关系图连接、可被 AI 理解和操作的结构化对象。Document、Database Object、Card、Canvas、Timeline、Media、Conversation、AI Artifact、Dashboard、Graph View 都应被视为对象或对象视图，而不是孤立文件。

视觉风格来自 `local/前端风格.md`：浅色、极简、克制、低对比、低噪音、桌面应用感。默认使用白色/浅暖灰/浅粉灰、极淡边框、微弱阴影和少量低饱和橙色强调。不要做营销页、厚重后台、强渐变、大面积高饱和色或 Material Design 默认风格。

## 技术栈

- React + TypeScript + Vite。
- tldraw 作为无限画布底座。
- Zustand 管理本地 workspace 状态。
- Zod 校验 Agent response、workspace operation 和组件 props。
- lucide-react 用于线性图标。
- 当前没有后端服务；`src/agent/agentClient.ts` 是本地模拟 Agent，用于验证短消息 + operations 链路。

## 常用命令

- 安装依赖：`npm install`
- 开发服务：`npm run dev -- --port 5173`
- 生产构建：`npm run build`
- 预览构建：`npm run preview -- --port 4173`

构建时 tldraw 可能触发 Vite chunk size warning，这是体积警告，不等于构建失败。仍需确认 `npm run build` 退出码为 0。

## 目录职责

- `src/app/`：应用壳、顶栏、主布局。
- `src/canvas/`：画板区域、tldraw 适配、自定义 shape、节点渲染、画板底部工具栏。
- `src/chat/`：右侧对话窗口、短消息、输入框、Agent 状态、变更预览。
- `src/inspector/`：属性面板。当前应悬浮在画板区域右侧，可收纳/展开；不要放回右侧对话栏。
- `src/workspace/`：workspace 数据模型、初始数据、Zustand store、operation engine、上下文构建、变更统计。
- `src/agent/`：Agent 协议类型、Zod operation schema、本地 Agent client。
- `src/components-registry/`：组件注册表、默认 props、props schema、上下文摘要。
- `src/ui/`：轻量通用 UI 原语。
- `src/styles.css`：全局视觉系统和布局样式。

## 关键架构约束

- `Workspace JSON` 是业务事实源。画板节点必须是结构化 `CanvasNode`，不能变成截图或任意 HTML 片段。
- `Page` 只是 Workspace 对象集合的一种当前承载/视图，不是长期信息架构的中心。新增能力时优先建模对象、对象属性、对象关系和视图投影，不要退回文件夹式层级。
- 内容能力应落在对象模型或视图模型上：文档用于知识和 PRD，表格/列表用于结构化业务数据，卡片用于项目、任务、Issue 或实体概览，画布用于脑暴、架构和流程，时间轴用于路线图、计划和里程碑，媒体用于图片、视频、设计稿和 PDF，对话用于评论、决策和协作记录，AI Artifact 用于分析、总结、方案和工作流，Dashboard 用于指标聚合和状态监控，Graph View 用于引用与依赖关系展示。
- AI 的核心职责是围绕 Workspace 对象建立关联、提炼知识并推动工作流。Agent 输出应修改对象、视图或关系，而不是生成孤立页面、文件或长篇聊天内容。
- tldraw shape 只作为画布承载层。`src/canvas/TldrawNodeShape.tsx` 中的自定义 shape 用 `nodeId` 绑定 workspace 节点，节点内容仍由 `CanvasNodeContent` 渲染。
- Agent 只能返回 `AgentResponse = { message, operations, requiresConfirmation? }`。`message` 必须短，工作结果应通过 `WorkspaceOperation` 修改画板。
- 执行 Agent operation 前必须经过 `operationSchemas.ts` 和 `operationEngine.ts` 校验。
- 新增组件类型时，同步修改：
  - `CanvasNodeType`
  - `operationSchemas.ts` 的白名单
  - `components-registry/registry.ts` 的 `defaultProps`、`schema`、`getContextSummary`
  - `CanvasNodeContent.tsx` 的渲染分支
  - 必要时补 Inspector 编辑项
- 不允许添加 `custom_html`、脚本执行、任意代码组件或绕过白名单的节点类型。
- 删除、批量覆盖、外部动作等危险操作必须要求确认；安全新增和小范围更新可以自动应用。

## 当前布局约定

- 主布局是左侧画板 + 右侧对话窗口。
- 右侧栏必须完全留给对话窗口，不放属性面板或其他编辑器。
- 属性面板悬浮在画板区域右侧，支持点击收纳/展开。
- 画板底部工具栏显示选择对象、缩放、适配、Undo/Redo。
- 对话区只显示短消息、Agent 状态、变更预览和输入框。

## 验证要求

- 改 TypeScript/React 代码后至少运行 `npm run build`。
- 改布局、交互或样式后，使用浏览器验证 `http://localhost:5173/`：
  - 页面非空白，无明显控制台错误。
  - 画板与右侧对话栏比例正确。
  - 右侧栏只包含对话窗口。
  - 属性面板悬浮在画板内，收纳/展开可用。
  - Chat 输入短指令后，Agent operations 能更新画板。
- 遇到 API 不确定时，先查本地源码/类型或官方文档，不要猜接口。

## Git 与文件注意事项

- 仓库已初始化，默认分支当前为 `master`。
- `.gitignore` 已忽略 `node_modules/`、`dist/`、日志、`*.tsbuildinfo`、Vite 派生配置产物。
- 不要提交 `node_modules`、`dist`、`vite-dev*.log` 或 TypeScript build info。
- 工作树可能有用户或前序任务未提交改动。修改前先看 `git status --short`，不要回滚自己不理解的改动。
