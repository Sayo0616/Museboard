import { useState } from "react";
import { ArrowUp, AtSign } from "lucide-react";
import { Button } from "../ui/Button";
import type { CanvasNode } from "../workspace/workspaceTypes";

type ChatInputProps = {
  nodes: CanvasNode[];
  selectedNodeIds: string[];
  isAgentRunning: boolean;
  hasPendingResponse: boolean;
  onSubmit: (value: string) => void;
};

export function ChatInput({ nodes, selectedNodeIds, isAgentRunning, hasPendingResponse, onSubmit }: ChatInputProps) {
  const [value, setValue] = useState("");
  const isDisabled = isAgentRunning || hasPendingResponse;
  const mentionQuery = getMentionQuery(value);
  const suggestions =
    mentionQuery === null
      ? []
      : nodes
          .filter((node) => node.name.toLowerCase().includes(mentionQuery.toLowerCase()) || node.id.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 5);

  const insertMention = (node: CanvasNode) => {
    const atIndex = value.lastIndexOf("@");
    const prefix = atIndex >= 0 ? value.slice(0, atIndex) : value;
    const next = `${prefix}@${node.name} `;
    setValue(next);
  };

  const inputHint = isAgentRunning
    ? "Agent 正在处理，请稍候"
    : hasPendingResponse
      ? "请先接受或放弃待确认变更"
      : selectedNodeIds.length
        ? `已选 ${selectedNodeIds.length} 个对象，可输入“优化这些”`
        : "输入 @ 可引用画板对象";

  return (
    <form
      className="chat-input"
      aria-busy={isAgentRunning}
      onSubmit={(event) => {
        event.preventDefault();
        if (isDisabled || !value.trim()) return;
        onSubmit(value);
        setValue("");
      }}
    >
      <div className="input-meta">
        <AtSign size={13} />
        <span>{inputHint}</span>
      </div>
      {suggestions.length > 0 && !isDisabled ? (
        <div className="mention-menu">
          {suggestions.map((node) => (
            <button key={node.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(node)}>
              <span>{node.name}</span>
              <small>{node.type}</small>
            </button>
          ))}
        </div>
      ) : null}
      <textarea
        value={value}
        disabled={isDisabled}
        onChange={(event) => setValue(event.target.value)}
        placeholder="输入短指令，例如：优化这些，或修改 @通用滑块"
      />
      <Button variant="primary" type="submit" disabled={isDisabled || !value.trim()} aria-label={isAgentRunning ? "Agent 正在处理" : "发送"}>
        <ArrowUp size={15} />
      </Button>
    </form>
  );
}

function getMentionQuery(value: string): string | null {
  const match = value.match(/(?:^|\s)@([^@\s]*)$/);
  return match ? match[1] : null;
}
