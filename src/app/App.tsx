import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Bot, ChevronDown, Copy, History, PanelRightClose, PanelRightOpen, Play, Plus, Save, Share2, Trash2 } from "lucide-react";
import { CanvasPanel } from "../canvas/CanvasPanel";
import { ChatPanel } from "../chat/ChatPanel";
import { WorkspaceProvider } from "../workspace/WorkspaceProvider";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import type { AgentTransport } from "../workspace/workspaceTypes";
import { Button } from "../ui/Button";
import { Tooltip } from "../ui/Tooltip";

const defaultSideWidth = 360;
const minSideWidth = 300;
const maxSideWidth = 560;
const collapsedSideWidth = 48;
const minCanvasWidth = 720;

function constrainSideWidth(width: number, layoutWidth: number) {
  const availableMax = Math.max(minSideWidth, layoutWidth - minCanvasWidth);
  return Math.min(Math.max(width, minSideWidth), Math.min(maxSideWidth, availableMax));
}

export function App() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const saveState = useWorkspaceStore((state) => state.saveState);
  const mode = useWorkspaceStore((state) => state.mode);
  const agentPermissionLevel = useWorkspaceStore((state) => state.agentPermissionLevel);
  const agentTransport = useWorkspaceStore((state) => state.agentTransport);
  const agentEndpoint = useWorkspaceStore((state) => state.agentEndpoint);
  const versionHistory = useWorkspaceStore((state) => state.versionHistory);
  const setMode = useWorkspaceStore((state) => state.setMode);
  const setAgentPermissionLevel = useWorkspaceStore((state) => state.setAgentPermissionLevel);
  const setAgentTransport = useWorkspaceStore((state) => state.setAgentTransport);
  const setAgentEndpoint = useWorkspaceStore((state) => state.setAgentEndpoint);
  const createPage = useWorkspaceStore((state) => state.createPage);
  const duplicatePage = useWorkspaceStore((state) => state.duplicatePage);
  const deletePage = useWorkspaceStore((state) => state.deletePage);
  const setActivePage = useWorkspaceStore((state) => state.setActivePage);
  const restoreVersion = useWorkspaceStore((state) => state.restoreVersion);
  const saveWorkspace = useWorkspaceStore((state) => state.saveWorkspace);
  const loadWorkspace = useWorkspaceStore((state) => state.loadWorkspace);
  const layoutRef = useRef<HTMLElement | null>(null);
  const [sideWidth, setSideWidth] = useState(defaultSideWidth);
  const [isSideCollapsed, setIsSideCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const setConstrainedSideWidth = useCallback((nextWidth: number) => {
    const layoutWidth = layoutRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    setSideWidth(constrainSideWidth(nextWidth, layoutWidth));
  }, []);

  const updateSideWidthFromPointer = useCallback((clientX: number) => {
    const layoutRect = layoutRef.current?.getBoundingClientRect();
    if (!layoutRect) return;
    setSideWidth(constrainSideWidth(layoutRect.right - clientX, layoutRect.width));
  }, []);

  const handleResizePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (isSideCollapsed) return;
      if (event.button !== 0) return;
      event.preventDefault();
      setIsResizing(true);
      updateSideWidthFromPointer(event.clientX);
    },
    [isSideCollapsed, updateSideWidthFromPointer],
  );

  useEffect(() => {
    if (!isResizing || isSideCollapsed) return;

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      event.preventDefault();
      updateSideWidthFromPointer(event.clientX);
    };
    const stopResizing = () => setIsResizing(false);

    document.body.classList.add("layout-resizing");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);

    return () => {
      document.body.classList.remove("layout-resizing");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
    };
  }, [isResizing, isSideCollapsed, updateSideWidthFromPointer]);

  return (
    <WorkspaceProvider>
      <div className="app-shell">
        <header className="top-bar">
          <div className="brand-block">
            <div className="brand-mark">
              <Bot size={16} />
            </div>
            <div>
              <div className="brand-title">{workspace.title}</div>
              <div className="brand-subtitle">结构化 Agent 画板</div>
            </div>
          </div>

          <div className="top-actions">
            <span className={`status-pill ${saveState === "saved" ? "saved" : ""}`}>
              {saveState === "saved" ? "已保存" : "有未保存修改"}
            </span>
            <div className="page-controls" aria-label="页面管理">
              <select
                className="page-select"
                aria-label="当前页面"
                value={workspace.activePageId}
                onChange={(event) => setActivePage(event.target.value)}
              >
                {workspace.pages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                  </option>
                ))}
              </select>
              <Tooltip label="新增页面">
                <Button onClick={createPage} aria-label="新增页面">
                  <Plus size={15} />
                </Button>
              </Tooltip>
              <Tooltip label="复制当前页面">
                <Button onClick={duplicatePage} aria-label="复制当前页面">
                  <Copy size={15} />
                </Button>
              </Tooltip>
              <Tooltip label="删除当前页面">
                <Button
                  onClick={() => deletePage(workspace.activePageId)}
                  disabled={workspace.pages.length <= 1}
                  aria-label="删除当前页面"
                >
                  <Trash2 size={15} />
                </Button>
              </Tooltip>
            </div>
            <div className="segmented-control" aria-label="运行模式">
              {(["edit", "run", "agent"] as const).map((item) => (
                <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>
                  {item === "edit" ? "编辑" : item === "run" ? "运行" : "Agent"}
                </button>
              ))}
            </div>
            <select
              className="agent-permission-select"
              aria-label="Agent 权限级别"
              value={agentPermissionLevel}
              onChange={(event) => setAgentPermissionLevel(event.target.value as typeof agentPermissionLevel)}
            >
              <option value="suggest">仅建议</option>
              <option value="auto_apply_safe">安全自动</option>
              <option value="confirm_destructive">删除确认</option>
              <option value="manual_only">全部确认</option>
            </select>
            <select
              className="agent-transport-select"
              aria-label="Agent 连接方式"
              value={agentTransport}
              onChange={(event) => setAgentTransport(event.target.value as AgentTransport)}
            >
              <option value="local">Local</option>
              <option value="http">HTTP</option>
              <option value="sse">SSE</option>
              <option value="websocket">WS</option>
            </select>
            {agentTransport !== "local" ? (
              <input
                className="agent-endpoint-input"
                aria-label="Agent endpoint"
                placeholder={
                  agentTransport === "http"
                    ? "https://.../agent"
                    : agentTransport === "sse"
                      ? "https://.../events"
                      : "wss://.../agent"
                }
                value={agentEndpoint}
                onChange={(event) => setAgentEndpoint(event.target.value)}
              />
            ) : null}
            <Tooltip label="保存 workspace 到浏览器本地存储">
              <Button onClick={saveWorkspace}>
                <Save size={15} />
              </Button>
            </Tooltip>
            <Tooltip label="从本地存储加载 workspace">
              <Button onClick={loadWorkspace}>
                <ChevronDown size={15} />
              </Button>
            </Tooltip>
            <Tooltip label="历史版本">
              <Button onClick={() => setIsHistoryOpen((current) => !current)} aria-expanded={isHistoryOpen}>
                <History size={15} />
              </Button>
            </Tooltip>
            <Tooltip label="分享预留入口">
              <Button>
                <Share2 size={15} />
              </Button>
            </Tooltip>
            <Tooltip label="运行预览">
              <Button variant="primary">
                <Play size={15} />
              </Button>
            </Tooltip>
          </div>
        </header>
        {isHistoryOpen ? (
          <section className="history-popover" aria-label="历史版本">
            <div className="history-title">
              <strong>历史版本</strong>
              <span>{versionHistory.length} 条</span>
            </div>
            <div className="history-list">
              {[...versionHistory].reverse().map((snapshot) => (
                <article className="history-item" key={snapshot.id}>
                  <div>
                    <strong>{snapshot.label}</strong>
                    <span>
                      v{snapshot.version} · {new Date(snapshot.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p>
                    +{snapshot.diff.nodesAdded} 节点 / {snapshot.diff.nodesUpdated} 修改 / -{snapshot.diff.nodesRemoved} 删除 / +
                    {snapshot.diff.edgesAdded} 连线 / -{snapshot.diff.edgesRemoved} 连线 / {snapshot.diff.variablesChanged} 变量
                  </p>
                  <Button
                    onClick={() => {
                      restoreVersion(snapshot.id);
                      setIsHistoryOpen(false);
                    }}
                  >
                    恢复
                  </Button>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <main
          ref={layoutRef}
          className={`main-layout ${isResizing ? "resizing" : ""} ${isSideCollapsed ? "side-collapsed" : ""}`}
          style={{ "--side-width": `${isSideCollapsed ? collapsedSideWidth : sideWidth}px` } as CSSProperties}
        >
          <section className="workspace-area">
            <CanvasPanel />
          </section>
          <div
            className="layout-resizer"
            role="separator"
            aria-label="调整画板和对话窗口宽度"
            aria-orientation="vertical"
            aria-valuemin={minSideWidth}
            aria-valuemax={maxSideWidth}
            aria-valuenow={Math.round(sideWidth)}
            aria-disabled={isSideCollapsed}
            tabIndex={isSideCollapsed ? -1 : 0}
            onPointerDown={handleResizePointerDown}
            onKeyDown={(event) => {
              if (isSideCollapsed) return;
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setConstrainedSideWidth(sideWidth + 20);
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                setConstrainedSideWidth(sideWidth - 20);
              }
              if (event.key === "Home") {
                event.preventDefault();
                setConstrainedSideWidth(maxSideWidth);
              }
              if (event.key === "End") {
                event.preventDefault();
                setConstrainedSideWidth(minSideWidth);
              }
            }}
          />
          <aside className={`side-area ${isSideCollapsed ? "collapsed" : ""}`}>
            <div className="side-header">
              {!isSideCollapsed ? <span>协作通道</span> : null}
              <button
                className="side-toggle"
                type="button"
                aria-label={isSideCollapsed ? "展开对话窗口" : "收纳对话窗口"}
                aria-expanded={!isSideCollapsed}
                title={isSideCollapsed ? "展开对话窗口" : "收纳对话窗口"}
                onClick={() => setIsSideCollapsed((current) => !current)}
              >
                {isSideCollapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
              </button>
            </div>
            {!isSideCollapsed ? <ChatPanel /> : null}
          </aside>
        </main>
      </div>
    </WorkspaceProvider>
  );
}
