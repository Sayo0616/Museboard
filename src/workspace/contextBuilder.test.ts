import { describe, expect, it } from "vitest";
import { initialWorkspace } from "./initialWorkspace";
import { buildWorkspaceContext, buildWorkspaceSummary } from "./contextBuilder";

describe("contextBuilder V2 context", () => {
  it("summarizes active view, selected objects, stable mentions, and relations", () => {
    const context = buildWorkspaceContext(
      initialWorkspace,
      ["slider_budget"],
      ["Moved slider"],
      "Update @[ROI 指标卡](object:card_roi)",
    );

    expect(context.activeView).toMatchObject({
      id: "page_main",
      kind: "canvas",
    });
    expect(context.selectedObjects.map((object) => object.id)).toEqual(["slider_budget"]);
    expect(context.mentionedObjects.map((object) => object.id)).toEqual(["card_roi"]);
    expect(context.relations.map((relation) => relation.id)).toContain("edge_slider_metric");
    expect(context.selectedNodes).toBe(context.selectedObjects);
    expect(context.mentionedNodes).toBe(context.mentionedObjects);
  });

  it("includes related objects through one-hop workspace relations", () => {
    const context = buildWorkspaceContext(initialWorkspace, ["slider_budget"], [], "");

    expect(context.relatedObjects.map((object) => object.id)).toContain("card_roi");
  });

  it("resolves stable mention tokens from workspace objects outside the active canvas", () => {
    const workspace = structuredClone(initialWorkspace);
    workspace.objects.external_doc = {
      ...structuredClone(workspace.objects.note_goal),
      id: "external_doc",
      kind: "document",
      name: "External document",
      props: { title: "External", text: "Not placed in the active canvas" },
    };

    const context = buildWorkspaceContext(workspace, [], [], "Review @[External document](object:external_doc)");

    expect(context.mentionedObjects).toContainEqual(
      expect.objectContaining({
        id: "external_doc",
        type: "document",
        name: "External document",
      }),
    );
  });

  it("builds workspace-level summary from objects, views, and relations", () => {
    expect(buildWorkspaceSummary(initialWorkspace)).toContain("objects");
    expect(buildWorkspaceSummary(initialWorkspace)).toContain("views");
    expect(buildWorkspaceSummary(initialWorkspace)).toContain("relations");
  });
});
