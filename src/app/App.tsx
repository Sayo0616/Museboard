import { Bot, ChevronDown, History, PanelRightClose, Play, Save, Share2 } from "lucide-react";
import { CanvasPanel } from "../canvas/CanvasPanel";
import { ChatPanel } from "../chat/ChatPanel";
import { InspectorPanel } from "../inspector/InspectorPanel";
import { WorkspaceProvider } from "../workspace/WorkspaceProvider";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { Button } from "../ui/Button";
import { Tooltip } from "../ui/Tooltip";

export function App() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const saveState = useWorkspaceStore((state) => state.saveState);
  const mode = useWorkspaceStore((state) => state.mode);
  const setMode = useWorkspaceStore((state) => state.setMode);
  const saveWorkspace = useWorkspaceStore((state) => state.saveWorkspace);
  const loadWorkspace = useWorkspaceStore((state) => state.loadWorkspace);

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
            <div className="segmented-control" aria-label="运行模式">
              {(["edit", "run", "agent"] as const).map((item) => (
                <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>
                  {item === "edit" ? "编辑" : item === "run" ? "运行" : "Agent"}
                </button>
              ))}
            </div>
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
            <Tooltip label="历史版本预留入口">
              <Button>
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

        <main className="main-layout">
          <section className="workspace-area">
            <CanvasPanel />
          </section>
          <aside className="side-area">
            <div className="side-header">
              <span>协作通道</span>
              <PanelRightClose size={15} />
            </div>
            <ChatPanel />
            <InspectorPanel />
          </aside>
        </main>
      </div>
    </WorkspaceProvider>
  );
}
