import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { AgentStatus } from "./AgentStatus";
import { ChatInput } from "./ChatInput";

beforeEach(() => {
  useWorkspaceStore.setState({
    agentRequestStatus: "idle",
    activeAgentRequestId: null,
    agentRequestSequence: 0,
    pendingResponse: null,
  });
});

describe("agent request UI", () => {
  it("shows the running state and disables chat submission", () => {
    useWorkspaceStore.setState({ agentRequestStatus: "running", activeAgentRequestId: 1, agentRequestSequence: 1 });

    render(
      <>
        <AgentStatus />
        <ChatInput
          nodes={[]}
          selectedNodeIds={[]}
          isAgentRunning
          hasPendingResponse={false}
          onSubmit={vi.fn()}
        />
      </>,
    );

    expect(screen.getByText("Agent 正在处理")).toBeInTheDocument();
    expect(screen.getByText("Agent 正在处理，请稍候")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Agent 正在处理" })).toBeDisabled();
  });

  it("keeps input disabled while a response awaits confirmation", () => {
    render(
      <ChatInput
        nodes={[]}
        selectedNodeIds={[]}
        isAgentRunning={false}
        hasPendingResponse
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("请先接受或放弃待确认变更")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
