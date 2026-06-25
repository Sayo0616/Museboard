import { AgentStatus } from "./AgentStatus";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { Button } from "../ui/Button";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { summarizeOperations } from "../workspace/changeSummary";

export function ChatPanel() {
  const messages = useWorkspaceStore((state) => state.messages);
  const submitMessage = useWorkspaceStore((state) => state.submitMessage);
  const pendingResponse = useWorkspaceStore((state) => state.pendingResponse);
  const acceptPendingResponse = useWorkspaceStore((state) => state.acceptPendingResponse);
  const discardPendingResponse = useWorkspaceStore((state) => state.discardPendingResponse);
  const summary = pendingResponse ? summarizeOperations(pendingResponse.operations) : null;

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
            <Button onClick={discardPendingResponse}>撤销</Button>
            <Button variant="primary" onClick={acceptPendingResponse}>
              接受
            </Button>
          </div>
        </div>
      ) : null}
      <ChatInput onSubmit={(value) => void submitMessage(value)} />
    </section>
  );
}
