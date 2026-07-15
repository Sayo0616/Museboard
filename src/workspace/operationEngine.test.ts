import { describe, expect, it } from "vitest";
import { initialWorkspace } from "./initialWorkspace";
import { applyOperations } from "./operationEngine";

function workspaceFixture() {
  return structuredClone(initialWorkspace);
}

describe("operation engine boundaries", () => {
  it("rejects create_node when its id already exists on the active page", () => {
    const workspace = workspaceFixture();
    const existing = workspace.pages[0].nodes[0];

    expect(() =>
      applyOperations(workspace, [{ type: "create_node", node: { ...structuredClone(existing), name: "Replacement" } }]),
    ).toThrow(`Node id already exists on the active page: ${existing.id}`);
    expect(workspace.pages[0].nodes[0].name).toBe(existing.name);
  });

  it.each(["id", "type", "metadata.updatedBy", "bindings.input", "props", "name.value", "position.width.value"])(
    "rejects structural or unsupported update path %s for every actor",
    (path) => {
      const operation = {
        type: "update_node" as const,
        nodeId: "note_goal",
        patch: { [path]: "tampered" },
      };

      expect(() => applyOperations(workspaceFixture(), [operation], "agent")).toThrow("Node field cannot be updated");
      expect(() => applyOperations(workspaceFixture(), [operation], "user")).toThrow("Node field cannot be updated");
    },
  );

  it("allows user permission edits but rejects the same edit from an agent", () => {
    const operation = {
      type: "update_node" as const,
      nodeId: "note_goal",
      patch: { "permissions.agentEditable": false },
    };

    const updated = applyOperations(workspaceFixture(), [operation], "user");
    expect(updated.pages[0].nodes.find((node) => node.id === "note_goal")?.permissions?.agentEditable).toBe(false);
    expect(() => applyOperations(workspaceFixture(), [operation], "agent")).toThrow("Agent cannot update node permissions");
  });

  it("keeps existing user inspector and local interaction paths valid", () => {
    const updated = applyOperations(
      workspaceFixture(),
      [
        {
          type: "update_node",
          nodeId: "note_goal",
          patch: {
            name: "Renamed",
            "position.width": 360,
            "props.title": "Updated title",
            "state.lastRunAt": "2026-07-15T00:00:00.000Z",
          },
        },
      ],
      "user",
    );
    const node = updated.pages[0].nodes.find((item) => item.id === "note_goal");

    expect(node).toMatchObject({
      name: "Renamed",
      position: { width: 360 },
      props: { title: "Updated title" },
      state: { lastRunAt: "2026-07-15T00:00:00.000Z" },
    });
  });

  it.each(["", ".props.title", "props..title", "props.__proto__.polluted", "props.constructor.prototype.polluted"])(
    "rejects invalid or unsafe patch path %j",
    (path) => {
      expect(() =>
        applyOperations(workspaceFixture(), [
          { type: "update_node", nodeId: "note_goal", patch: { [path]: "tampered" } },
        ]),
      ).toThrow();
    },
  );

  it("allows an agent to update component props", () => {
    const updated = applyOperations(workspaceFixture(), [
      { type: "update_node", nodeId: "note_goal", patch: { "props.title": "Agent result" } },
    ]);

    expect(updated.pages[0].nodes.find((node) => node.id === "note_goal")?.props.title).toBe("Agent result");
  });
});
