import { Copy, Download, FileImage, FileText, LockKeyhole, Maximize2, Minus, MousePointer2, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { Button } from "../ui/Button";
import { Tooltip } from "../ui/Tooltip";
import { useWorkspaceStore } from "../workspace/workspaceStore";

type CanvasToolbarProps = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
};

export function CanvasToolbar({ zoom, onZoomIn, onZoomOut, onFit }: CanvasToolbarProps) {
  const selectedNodeIds = useWorkspaceStore((state) => state.selectedNodeIds);
  const undo = useWorkspaceStore((state) => state.undo);
  const redo = useWorkspaceStore((state) => state.redo);
  const duplicateSelectedNodes = useWorkspaceStore((state) => state.duplicateSelectedNodes);
  const deleteSelectedNodes = useWorkspaceStore((state) => state.deleteSelectedNodes);
  const toggleLockSelectedNodes = useWorkspaceStore((state) => state.toggleLockSelectedNodes);
  const exportWorkspaceJson = useWorkspaceStore((state) => state.exportWorkspaceJson);
  const exportWorkspacePng = useWorkspaceStore((state) => state.exportWorkspacePng);
  const exportWorkspacePdf = useWorkspaceStore((state) => state.exportWorkspacePdf);
  const hasSelection = selectedNodeIds.length > 0;

  return (
    <div className="canvas-toolbar">
      <div className="toolbar-section">
        <MousePointer2 size={14} />
        <span>{selectedNodeIds.length ? `${selectedNodeIds.length} 个对象` : "未选择"}</span>
      </div>
      <div className="toolbar-section">
        <Tooltip label="缩小">
          <Button onClick={onZoomOut} aria-label="缩小">
            <Minus size={14} />
          </Button>
        </Tooltip>
        <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
        <Tooltip label="放大">
          <Button onClick={onZoomIn} aria-label="放大">
            <Plus size={14} />
          </Button>
        </Tooltip>
        <Tooltip label="适配屏幕">
          <Button onClick={onFit} aria-label="适配屏幕">
            <Maximize2 size={14} />
          </Button>
        </Tooltip>
      </div>
      <div className="toolbar-section">
        <Tooltip label="复制选中对象">
          <Button onClick={duplicateSelectedNodes} disabled={!hasSelection} aria-label="复制选中对象">
            <Copy size={14} />
          </Button>
        </Tooltip>
        <Tooltip label="删除选中对象">
          <Button onClick={deleteSelectedNodes} disabled={!hasSelection} aria-label="删除选中对象">
            <Trash2 size={14} />
          </Button>
        </Tooltip>
        <Tooltip label="锁定或解锁 Agent 修改">
          <Button onClick={toggleLockSelectedNodes} disabled={!hasSelection} aria-label="锁定或解锁 Agent 修改">
            <LockKeyhole size={14} />
          </Button>
        </Tooltip>
        <Tooltip label="导出 workspace JSON">
          <Button onClick={exportWorkspaceJson} aria-label="导出 workspace JSON">
            <Download size={14} />
          </Button>
        </Tooltip>
        <Tooltip label="导出当前页面 PNG">
          <Button onClick={() => void exportWorkspacePng()} aria-label="导出当前页面 PNG">
            <FileImage size={14} />
          </Button>
        </Tooltip>
        <Tooltip label="导出当前页面 PDF">
          <Button onClick={exportWorkspacePdf} aria-label="导出当前页面 PDF">
            <FileText size={14} />
          </Button>
        </Tooltip>
        <Tooltip label="撤销">
          <Button onClick={undo} aria-label="撤销">
            <Undo2 size={14} />
          </Button>
        </Tooltip>
        <Tooltip label="重做">
          <Button onClick={redo} aria-label="重做">
            <Redo2 size={14} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
