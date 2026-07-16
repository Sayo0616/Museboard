import { describe, expect, it } from "vitest";
import { initialWorkspace } from "./initialWorkspace";
import { migrateLegacyWorkspaceToV2 } from "./workspaceMigration";
import { getActiveCanvasView, getCanvasEdgesForView, getCanvasNodesForView } from "./workspaceSelectors";

describe("workspace V2 migration and selectors", () => {
  it("migrates legacy pages into objects, canvas views, and relations", () => {
    const legacy = {
      ...structuredClone(initialWorkspace),
      schemaVersion: undefined,
      activeViewId: undefined,
      objects: undefined,
      views: undefined,
      relations: undefined,
    };

    const migrated = migrateLegacyWorkspaceToV2(legacy);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.activeViewId).toBe("page_main");
    expect(migrated.objects.note_goal.name).toBe(initialWorkspace.objects.note_goal.name);
    expect(migrated.views.page_main.kind).toBe("canvas");
    expect(migrated.relations.edge_slider_metric).toMatchObject({
      sourceObjectId: "slider_budget",
      targetObjectId: "card_roi",
      kind: "data_flow",
    });
  });

  it("projects active canvas nodes and edges from V2 source data", () => {
    const workspace = structuredClone(initialWorkspace);
    workspace.objects.note_goal.name = "V2 object name";
    workspace.views.page_main.kind;
    if (workspace.views.page_main.kind !== "canvas") throw new Error("Missing canvas view");
    workspace.views.page_main.layouts.note_goal.position.x = 240;

    const activeView = getActiveCanvasView(workspace);
    const nodes = getCanvasNodesForView(workspace, activeView.id);
    const edges = getCanvasEdgesForView(workspace, activeView.id);

    expect(nodes.find((node) => node.id === "note_goal")).toMatchObject({
      name: "V2 object name",
      position: { x: 240 },
    });
    expect(edges.map((edge) => edge.id)).toContain("edge_slider_metric");
  });
});
