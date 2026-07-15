import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceStore } from "./workspaceStore";
import { initialWorkspace } from "./initialWorkspace";

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
    pendingResponse: null,
    lastAppliedResponse: null,
  });
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
