import { Sparkles } from "lucide-react";
import { useWorkspaceStore } from "../workspace/workspaceStore";

export function AgentStatus() {
  const pendingResponse = useWorkspaceStore((state) => state.pendingResponse);
  const workspace = useWorkspaceStore((state) => state.workspace);

  return (
    <div className="agent-status">
      <div>
        <Sparkles size={14} />
        <span>{pendingResponse ? "等待确认" : "可自动应用安全操作"}</span>
      </div>
      <small>v{workspace.version}</small>
    </div>
  );
}
