import { useState } from "react";
import { ArrowUp, AtSign } from "lucide-react";
import { Button } from "../ui/Button";

type ChatInputProps = {
  onSubmit: (value: string) => void;
};

export function ChatInput({ onSubmit }: ChatInputProps) {
  const [value, setValue] = useState("");

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
        <span>支持引用选区和 /chart</span>
      </div>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="输入短指令，例如：添加预算分析面板"
      />
      <Button variant="primary" type="submit" aria-label="发送">
        <ArrowUp size={15} />
      </Button>
    </form>
  );
}
