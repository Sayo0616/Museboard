import { Maximize2, Minus, MousePointer2, Plus, Redo2, Undo2 } from "lucide-react";
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

  return (
    <div className="canvas-toolbar">
      <div className="toolbar-section">
        <MousePointer2 size={14} />
        <span>{selectedNodeIds.length ? `${selectedNodeIds.length} 个对象` : "未选择"}</span>
      </div>
      <div className="toolbar-section">
        <Tooltip label="缩小">
          <Button onClick={onZoomOut}>
            <Minus size={14} />
          </Button>
        </Tooltip>
        <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
        <Tooltip label="放大">
          <Button onClick={onZoomIn}>
            <Plus size={14} />
          </Button>
        </Tooltip>
        <Tooltip label="适配屏幕">
          <Button onClick={onFit}>
            <Maximize2 size={14} />
          </Button>
        </Tooltip>
      </div>
      <div className="toolbar-section">
        <Tooltip label="撤销">
          <Button onClick={undo}>
            <Undo2 size={14} />
          </Button>
        </Tooltip>
        <Tooltip label="重做">
          <Button onClick={redo}>
            <Redo2 size={14} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
