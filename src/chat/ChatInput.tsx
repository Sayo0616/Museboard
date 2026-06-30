import { useState } from "react";
import { ArrowUp, AtSign } from "lucide-react";
import { Button } from "../ui/Button";
import type { CanvasNode } from "../workspace/workspaceTypes";

type ChatInputProps = {
  nodes: CanvasNode[];
  selectedNodeIds: string[];
  onSubmit: (value: string) => void;
};

export function ChatInput({ nodes, selectedNodeIds, onSubmit }: ChatInputProps) {
  const [value, setValue] = useState("");
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

  return (
    <form
      className="chat-input"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
        setValue("");
      }}
    >
      <div className="input-meta">
        <AtSign size={13} />
        <span>{selectedNodeIds.length ? `已选 ${selectedNodeIds.length} 个对象，可输入“优化这些”` : "输入 @ 可引用画板对象"}</span>
      </div>
      {suggestions.length > 0 ? (
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
        onChange={(event) => setValue(event.target.value)}
        placeholder="输入短指令，例如：优化这些，或修改 @预算滑块"
      />
      <Button variant="primary" type="submit" aria-label="发送">
        <ArrowUp size={15} />
      </Button>
    </form>
  );
}

function getMentionQuery(value: string): string | null {
  const match = value.match(/(?:^|\s)@([^@\s]*)$/);
  return match ? match[1] : null;
}
