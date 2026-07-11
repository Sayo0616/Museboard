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
