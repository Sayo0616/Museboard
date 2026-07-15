import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentResponse } from "../agent/agentProtocol";
import { runAgent } from "../agent/agentClient";
import { useWorkspaceStore } from "./workspaceStore";
import { initialWorkspace } from "./initialWorkspace";

vi.mock("../agent/agentClient", () => ({ runAgent: vi.fn() }));

beforeEach(() => {
  useWorkspaceStore.setState({
    workspace: initialWorkspace,
    selectedNodeIds: ["slider_budget"],
    selectedEdgeIds: [],
    activeNodeId: "slider_budget",
    activeEdgeId: null,
    hoveredNodeId: null,
    mode: "edit",
    agentPermissionLevel: "confirm_destructive",
    messages: [],
    agentRequestStatus: "idle",
    activeAgentRequestId: null,
    agentRequestSequence: 0,
    pendingResponse: null,
    lastAppliedResponse: null,
  });
  vi.mocked(runAgent).mockReset();
});

describe("workspace interaction state", () => {
  it("keeps the clicked node active when selecting", () => {
    useWorkspaceStore.getState().selectNode("chart_cost");

    expect(useWorkspaceStore.getState().selectedNodeIds).toEqual(["chart_cost"]);
    expect(useWorkspaceStore.getState().activeNodeId).toBe("chart_cost");
    expect(useWorkspaceStore.getState().activeEdgeId).toBeNull();
  });

  it("appends a node to the current selection", () => {
    useWorkspaceStore.getState().selectNode("note_goal", true);

    expect(useWorkspaceStore.getState().selectedNodeIds).toEqual(["slider_budget", "note_goal"]);
    expect(useWorkspaceStore.getState().activeNodeId).toBe("note_goal");
  });

  it("clears active state when canvas selection is cleared", () => {
    useWorkspaceStore.getState().selectNode(null);

    expect(useWorkspaceStore.getState().selectedNodeIds).toEqual([]);
    expect(useWorkspaceStore.getState().selectedEdgeIds).toEqual([]);
    expect(useWorkspaceStore.getState().activeNodeId).toBeNull();
    expect(useWorkspaceStore.getState().activeEdgeId).toBeNull();
  });

  it("tracks hover separately from selection and active state", () => {
    useWorkspaceStore.getState().setHoveredNode("note_goal");

    expect(useWorkspaceStore.getState().hoveredNodeId).toBe("note_goal");
    expect(useWorkspaceStore.getState().selectedNodeIds).toEqual(["slider_budget"]);
    expect(useWorkspaceStore.getState().activeNodeId).toBe("slider_budget");
  });
});

describe("agent operation confirmation", () => {
  it.each([
    {
      label: "delete_node",
      operation: { type: "delete_node" as const, nodeId: "note_goal" },
    },
    {
      label: "delete_edge",
      operation: { type: "delete_edge" as const, edgeId: "edge_slider_metric" },
    },
  ])("requires confirmation for $label even when the agent explicitly returns false", ({ operation }) => {
    useWorkspaceStore.setState({ mode: "agent", agentPermissionLevel: "auto_apply_safe" });

    useWorkspaceStore.getState().applyAgentResponse({
      message: "Delete requested",
      operations: [operation],
      requiresConfirmation: false,
    });

    const state = useWorkspaceStore.getState();
    expect(state.pendingResponse?.operations).toEqual([operation]);
    expect(state.workspace.pages[0].nodes.some((node) => node.id === "note_goal")).toBe(true);
    expect(state.workspace.pages[0].edges.some((edge) => edge.id === "edge_slider_metric")).toBe(true);
  });

  it("does not create undo or version history for an empty applied response", () => {
    useWorkspaceStore.setState({
      mode: "agent",
      agentPermissionLevel: "auto_apply_safe",
      past: [],
      future: [],
      versionHistory: [],
      saveState: "saved",
    });

    useWorkspaceStore.getState().applyAgentResponse({ message: "无需修改。", operations: [] });

    const state = useWorkspaceStore.getState();
    expect(state.past).toEqual([]);
    expect(state.versionHistory).toEqual([]);
    expect(state.workspace.version).toBe(initialWorkspace.version);
    expect(state.saveState).toBe("saved");
  });
});

describe("agent request concurrency", () => {
  it("serializes submissions while a request is running", async () => {
    const deferred = createDeferred<AgentResponse>();
    vi.mocked(runAgent).mockReturnValueOnce(deferred.promise);
    useWorkspaceStore.setState({ mode: "agent", agentPermissionLevel: "auto_apply_safe" });

    const firstRequest = useWorkspaceStore.getState().submitMessage("first request");

    expect(useWorkspaceStore.getState().agentRequestStatus).toBe("running");
    expect(useWorkspaceStore.getState().activeAgentRequestId).toBe(1);

    await useWorkspaceStore.getState().submitMessage("duplicate request");

    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(useWorkspaceStore.getState().messages.filter((message) => message.role === "user").map((message) => message.text)).toEqual([
      "first request",
    ]);

    deferred.resolve({ message: "first response", operations: [] });
    await firstRequest;

    const state = useWorkspaceStore.getState();
    expect(state.agentRequestStatus).toBe("idle");
    expect(state.activeAgentRequestId).toBeNull();
    expect(state.messages.some((message) => message.text === "first response")).toBe(true);
  });

  it("does not let an expired response mutate or finish a newer request", async () => {
    const deferred = createDeferred<AgentResponse>();
    vi.mocked(runAgent).mockReturnValueOnce(deferred.promise);

    const expiredRequest = useWorkspaceStore.getState().submitMessage("expired request");
    const expiredRequestId = useWorkspaceStore.getState().activeAgentRequestId;
    expect(expiredRequestId).toBe(1);

    useWorkspaceStore.setState({
      agentRequestStatus: "running",
      activeAgentRequestId: 2,
      agentRequestSequence: 2,
    });
    deferred.resolve({ message: "expired response", operations: [] });
    await expiredRequest;

    const state = useWorkspaceStore.getState();
    expect(state.agentRequestStatus).toBe("running");
    expect(state.activeAgentRequestId).toBe(2);
    expect(state.pendingResponse).toBeNull();
    expect(state.messages.some((message) => message.text === "expired response")).toBe(false);
  });

  it("does not replace a response that is waiting for confirmation", async () => {
    const deferred = createDeferred<AgentResponse>();
    vi.mocked(runAgent).mockReturnValueOnce(deferred.promise);

    const firstRequest = useWorkspaceStore.getState().submitMessage("review this change");
    deferred.resolve({ message: "pending response", operations: [] });
    await firstRequest;

    expect(useWorkspaceStore.getState().pendingResponse?.message).toBe("pending response");

    await useWorkspaceStore.getState().submitMessage("replace the pending response");

    const state = useWorkspaceStore.getState();
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(state.pendingResponse?.message).toBe("pending response");
    expect(state.messages.filter((message) => message.role === "user").map((message) => message.text)).toEqual([
      "review this change",
    ]);
  });

  it("ends the current request after an error", async () => {
    vi.mocked(runAgent).mockRejectedValueOnce(new Error("network down"));

    await useWorkspaceStore.getState().submitMessage("failing request");

    const state = useWorkspaceStore.getState();
    expect(state.agentRequestStatus).toBe("idle");
    expect(state.activeAgentRequestId).toBeNull();
    expect(state.messages.some((message) => message.role === "system" && message.text.includes("network down"))).toBe(true);
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
