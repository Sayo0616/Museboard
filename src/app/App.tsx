import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Bot, ChevronDown, History, PanelRightClose, Play, Save, Share2 } from "lucide-react";
import { CanvasPanel } from "../canvas/CanvasPanel";
import { ChatPanel } from "../chat/ChatPanel";
import { WorkspaceProvider } from "../workspace/WorkspaceProvider";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { Button } from "../ui/Button";
import { Tooltip } from "../ui/Tooltip";

const defaultSideWidth = 360;
const minSideWidth = 300;
const maxSideWidth = 560;
const minCanvasWidth = 720;

function constrainSideWidth(width: number, layoutWidth: number) {
  const availableMax = Math.max(minSideWidth, layoutWidth - minCanvasWidth);
  return Math.min(Math.max(width, minSideWidth), Math.min(maxSideWidth, availableMax));
}

export function App() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const saveState = useWorkspaceStore((state) => state.saveState);
  const mode = useWorkspaceStore((state) => state.mode);
  const setMode = useWorkspaceStore((state) => state.setMode);
  const saveWorkspace = useWorkspaceStore((state) => state.saveWorkspace);
  const loadWorkspace = useWorkspaceStore((state) => state.loadWorkspace);
  const layoutRef = useRef<HTMLElement | null>(null);
  const [sideWidth, setSideWidth] = useState(defaultSideWidth);
  const [isResizing, setIsResizing] = useState(false);

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
      if (event.button !== 0) return;
      event.preventDefault();
      setIsResizing(true);
      updateSideWidthFromPointer(event.clientX);
    },
    [updateSideWidthFromPointer],
  );

  useEffect(() => {
    if (!isResizing) return;

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
  }, [isResizing, updateSideWidthFromPointer]);

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

        <main
          ref={layoutRef}
          className={`main-layout ${isResizing ? "resizing" : ""}`}
          style={{ "--side-width": `${sideWidth}px` } as CSSProperties}
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
            tabIndex={0}
            onPointerDown={handleResizePointerDown}
            onKeyDown={(event) => {
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
          <aside className="side-area">
            <div className="side-header">
              <span>协作通道</span>
              <PanelRightClose size={15} />
            </div>
            <ChatPanel />
          </aside>
        </main>
      </div>
    </WorkspaceProvider>
  );
}
