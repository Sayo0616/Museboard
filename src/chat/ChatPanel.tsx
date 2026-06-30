import { AgentStatus } from "./AgentStatus";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { Button } from "../ui/Button";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { summarizeOperations } from "../workspace/changeSummary";
import { getActivePage } from "../workspace/workspaceSelectors";

export function ChatPanel() {
  const messages = useWorkspaceStore((state) => state.messages);
  const submitMessage = useWorkspaceStore((state) => state.submitMessage);
  const pendingResponse = useWorkspaceStore((state) => state.pendingResponse);
  const lastAppliedResponse = useWorkspaceStore((state) => state.lastAppliedResponse);
  const workspace = useWorkspaceStore((state) => state.workspace);
  const selectedNodeIds = useWorkspaceStore((state) => state.selectedNodeIds);
  const acceptPendingResponse = useWorkspaceStore((state) => state.acceptPendingResponse);
  const discardPendingResponse = useWorkspaceStore((state) => state.discardPendingResponse);
  const clearLastAppliedResponse = useWorkspaceStore((state) => state.clearLastAppliedResponse);
  const undo = useWorkspaceStore((state) => state.undo);
  const summary = pendingResponse ? summarizeOperations(pendingResponse.operations) : null;
  const appliedSummary = !pendingResponse && lastAppliedResponse ? summarizeOperations(lastAppliedResponse.operations) : null;
  const nodes = getActivePage(workspace).nodes;

  return (
    <section className="chat-panel">
      <AgentStatus />
      <MessageList messages={messages} />
      {pendingResponse && summary ? (
        <div className="change-preview">
          <div>
            <strong>变更预览</strong>
            <span>{pendingResponse.operations.length} 个操作</span>
          </div>
          <p>{pendingResponse.message}</p>
          <dl className="change-counts">
            <div>
              <dt>新增</dt>
              <dd>{summary.created}</dd>
            </div>
            <div>
              <dt>修改</dt>
              <dd>{summary.updated}</dd>
            </div>
            <div>
              <dt>移动</dt>
              <dd>{summary.moved}</dd>
            </div>
            <div>
              <dt>删除</dt>
              <dd>{summary.deleted}</dd>
            </div>
          </dl>
          <div className="preview-actions">
            <Button onClick={discardPendingResponse}>放弃</Button>
            <Button variant="primary" onClick={acceptPendingResponse}>
              接受
            </Button>
          </div>
        </div>
      ) : null}
      {lastAppliedResponse && appliedSummary ? (
        <div className="change-preview applied">
          <div>
            <strong>已应用变更</strong>
            <span>{lastAppliedResponse.operations.length} 个操作</span>
          </div>
          <p>{lastAppliedResponse.message}</p>
          <dl className="change-counts">
            <div>
              <dt>新增</dt>
              <dd>{appliedSummary.created}</dd>
            </div>
            <div>
              <dt>修改</dt>
              <dd>{appliedSummary.updated}</dd>
            </div>
            <div>
              <dt>移动</dt>
              <dd>{appliedSummary.moved}</dd>
            </div>
            <div>
              <dt>删除</dt>
              <dd>{appliedSummary.deleted}</dd>
            </div>
          </dl>
          <div className="preview-actions">
            <Button onClick={clearLastAppliedResponse}>收起</Button>
            <Button onClick={undo}>撤销</Button>
          </div>
        </div>
      ) : null}
      <ChatInput nodes={nodes} selectedNodeIds={selectedNodeIds} onSubmit={(value) => void submitMessage(value)} />
    </section>
  );
}
