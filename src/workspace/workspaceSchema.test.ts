import { describe, expect, it } from "vitest";
import { initialWorkspace } from "./initialWorkspace";
import { validateWorkspace } from "./workspaceSchema";

describe("workspaceSchema", () => {
  it("accepts the initial workspace", () => {
    expect(validateWorkspace(initialWorkspace)).toEqual(initialWorkspace);
  });

  it("rejects variables whose declared type does not match their value", () => {
    const workspace = structuredClone(initialWorkspace) as unknown as Record<string, unknown>;
    workspace.variables = { budget: { type: "number", value: "100" } };

    expect(() => validateWorkspace(workspace)).toThrow();
  });

  it("rejects edges that reference missing nodes", () => {
    const workspace = structuredClone(initialWorkspace);
    workspace.pages[0].edges[0].targetNodeId = "missing_node";

    expect(() => validateWorkspace(workspace)).toThrow(/连接终点不存在/);
  });

  it("rejects edges that connect a node to itself", () => {
    const workspace = structuredClone(initialWorkspace);
    workspace.pages[0].edges[0].targetNodeId = workspace.pages[0].edges[0].sourceNodeId;

    expect(() => validateWorkspace(workspace)).toThrow(/连接不能指向自身/);
  });

  it("rejects duplicate node ids across pages", () => {
    const workspace = structuredClone(initialWorkspace);
    workspace.pages.push({
      id: "page_duplicate",
      name: "重复节点页面",
      nodes: [structuredClone(workspace.pages[0].nodes[0])],
      edges: [],
    });

    expect(() => validateWorkspace(workspace)).toThrow(/节点 ID 重复/);
  });

  it("requires the active page to exist", () => {
    const workspace = { ...structuredClone(initialWorkspace), activePageId: "missing_page" };

    expect(() => validateWorkspace(workspace)).toThrow(/当前页面不存在/);
  });
});
