import { describe, expect, it } from "vitest";
import { initialWorkspace } from "./initialWorkspace";
import { validateWorkspace } from "./workspaceSchema";

describe("workspaceSchema", () => {
  it("accepts the initial V2 workspace", () => {
    expect(validateWorkspace(initialWorkspace)).toEqual(initialWorkspace);
  });

  it("rejects variables whose declared type does not match their value", () => {
    const workspace = structuredClone(initialWorkspace) as unknown as Record<string, unknown>;
    workspace.variables = { budget: { type: "number", value: "100" } };

    expect(() => validateWorkspace(workspace)).toThrow();
  });

  it("rejects relations that reference missing objects", () => {
    const workspace = structuredClone(initialWorkspace);
    workspace.relations.edge_slider_metric.targetObjectId = "missing_object";

    expect(() => validateWorkspace(workspace)).toThrow(/关系终点对象不存在/);
  });

  it("rejects relations that connect an object to itself", () => {
    const workspace = structuredClone(initialWorkspace);
    workspace.relations.edge_slider_metric.targetObjectId = workspace.relations.edge_slider_metric.sourceObjectId;

    expect(() => validateWorkspace(workspace)).toThrow(/关系不能指向自身/);
  });

  it("rejects canvas layouts that reference objects outside the view", () => {
    const workspace = structuredClone(initialWorkspace);
    const view = workspace.views.page_main;
    if (view.kind !== "canvas") throw new Error("Missing canvas view");
    view.layouts.note_goal.objectId = "missing_object";

    expect(() => validateWorkspace(workspace)).toThrow(/布局引用的对象不存在/);
  });

  it("requires the active view to exist", () => {
    const workspace = { ...structuredClone(initialWorkspace), activeViewId: "missing_view" };

    expect(() => validateWorkspace(workspace)).toThrow(/当前视图不存在/);
  });

  it("rejects graph views that reference missing relations", () => {
    const workspace = structuredClone(initialWorkspace);
    workspace.views.graph_main = {
      id: "graph_main",
      kind: "graph",
      name: "Graph",
      objectIds: ["note_goal"],
      relationIds: ["missing_relation"],
    };

    expect(() => validateWorkspace(workspace)).toThrow(/关系图引用的关系不存在/);
  });
});
