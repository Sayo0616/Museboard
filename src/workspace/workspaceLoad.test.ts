import { beforeEach, describe, expect, it } from "vitest";
import { initialWorkspace } from "./initialWorkspace";
import { useWorkspaceStore } from "./workspaceStore";

const storageKey = "museboard.workspace";

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState({
    workspace: structuredClone(initialWorkspace),
    messages: [],
    past: [],
    future: [],
    pendingResponse: null,
    lastAppliedResponse: null,
    userEditBase: null,
    userEditLabel: null,
  });
});

describe("workspace loading", () => {
  it("loads a valid workspace after validation", () => {
    const saved = { ...structuredClone(initialWorkspace), title: "已加载工作区" };
    localStorage.setItem(storageKey, JSON.stringify(saved));

    useWorkspaceStore.getState().loadWorkspace();

    expect(useWorkspaceStore.getState().workspace.title).toBe("已加载工作区");
    expect(useWorkspaceStore.getState().messages).toEqual([]);
  });

  it("keeps the current workspace when saved JSON is malformed", () => {
    localStorage.setItem(storageKey, "{not-json");

    expect(() => useWorkspaceStore.getState().loadWorkspace()).not.toThrow();
    expect(useWorkspaceStore.getState().workspace.title).toBe(initialWorkspace.title);
    expect(useWorkspaceStore.getState().messages.at(-1)?.text).toMatch(/Workspace 加载失败/);
  });

  it("rejects invalid component props", () => {
    const saved = structuredClone(initialWorkspace);
    const chart = saved.pages[0].nodes.find((node) => node.type === "chart");
    if (!chart) throw new Error("Missing chart fixture");
    delete chart.props.data;
    localStorage.setItem(storageKey, JSON.stringify(saved));

    useWorkspaceStore.getState().loadWorkspace();

    expect(useWorkspaceStore.getState().workspace).toEqual(initialWorkspace);
    expect(useWorkspaceStore.getState().messages.at(-1)?.text).toMatch(/Workspace 加载失败/);
  });
});
