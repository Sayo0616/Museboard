import { Sparkles } from "lucide-react";
import { useWorkspaceStore } from "../workspace/workspaceStore";

export function AgentStatus() {
  const agentRequestStatus = useWorkspaceStore((state) => state.agentRequestStatus);
  const pendingResponse = useWorkspaceStore((state) => state.pendingResponse);
  const workspace = useWorkspaceStore((state) => state.workspace);
  const statusText =
    agentRequestStatus === "running"
      ? "Agent 正在处理"
      : pendingResponse
        ? "等待确认"
        : "可自动应用安全操作";

  return (
    <div className="agent-status" aria-live="polite">
      <div>
        <Sparkles size={14} />
        <span>{statusText}</span>
      </div>
      <small>v{workspace.version}</small>
    </div>
  );
}
