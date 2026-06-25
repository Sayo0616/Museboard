import type { ChatMessage } from "../workspace/workspaceTypes";

type MessageListProps = {
  messages: ChatMessage[];
};

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="message-list">
      {messages.map((message) => (
        <div key={message.id} className={`message-row ${message.role}`}>
          <span>{message.role === "user" ? "你" : message.role === "agent" ? "Agent" : "系统"}</span>
          <p>{message.text}</p>
        </div>
      ))}
    </div>
  );
}
