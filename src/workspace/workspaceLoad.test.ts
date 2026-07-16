import { beforeEach, describe, expect, it, vi } from "vitest";
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
    delete saved.objects[chart.id].props.data;
    localStorage.setItem(storageKey, JSON.stringify(saved));

    useWorkspaceStore.getState().loadWorkspace();

    expect(useWorkspaceStore.getState().workspace).toEqual(initialWorkspace);
    expect(useWorkspaceStore.getState().messages.at(-1)?.text).toMatch(/Workspace 加载失败/);
  });

  it("migrates legacy flowchart nodes before validation", () => {
    const saved = structuredClone(initialWorkspace);
    const diagram = saved.pages[0].nodes.find((node) => node.id === "flow_approval");
    if (!diagram) throw new Error("Missing diagram fixture");
    (diagram as unknown as Record<string, unknown>).type = "flowchart";
    diagram.props = { title: "旧流程图", steps: ["输入", "处理", "输出"] };
    localStorage.setItem(storageKey, JSON.stringify(saved));

    useWorkspaceStore.getState().loadWorkspace();

    const loaded = useWorkspaceStore.getState().workspace.pages[0].nodes.find((node) => node.id === "flow_approval");
    expect(loaded?.type).toBe("mermaid");
    expect(loaded?.props.source).toContain("flowchart TD");
  });

  it("handles storage access errors without replacing the workspace", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new Error("Storage blocked");
    });

    expect(() => useWorkspaceStore.getState().loadWorkspace()).not.toThrow();
    expect(useWorkspaceStore.getState().workspace).toEqual(initialWorkspace);
    expect(useWorkspaceStore.getState().messages.at(-1)?.text).toMatch(/Workspace 加载失败/);
    getItem.mockRestore();
  });
});
