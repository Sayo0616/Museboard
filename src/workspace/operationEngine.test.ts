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
    ).toThrow(`Node id already exists: ${existing.id}`);
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

  it("rejects operations whose target node does not exist", () => {
    expect(() =>
      applyOperations(workspaceFixture(), [{ type: "move_node", nodeId: "missing_node", position: { x: 10 } }]),
    ).toThrow(/Node does not exist/);
  });

  it("rejects edges with missing endpoints and duplicate edge ids", () => {
    expect(() =>
      applyOperations(workspaceFixture(), [
        {
          type: "create_edge",
          edge: { id: "edge_new", sourceNodeId: "note_goal", targetNodeId: "missing_node", type: "dependency" },
        },
      ]),
    ).toThrow(/Node does not exist/);

    expect(() =>
      applyOperations(workspaceFixture(), [
        {
          type: "create_edge",
          edge: { id: "edge_slider_metric", sourceNodeId: "note_goal", targetNodeId: "slider_budget", type: "dependency" },
        },
      ]),
    ).toThrow(/Edge id already exists/);
  });

  it("rejects self-connected edges", () => {
    expect(() =>
      applyOperations(workspaceFixture(), [
        {
          type: "create_edge",
          edge: { id: "edge_self", sourceNodeId: "note_goal", targetNodeId: "note_goal", type: "dependency" },
        },
      ]),
    ).toThrow(/cannot connect a node to itself/);
  });

  it("updates edge presentation fields through update_edge", () => {
    const updated = applyOperations(
      workspaceFixture(),
      [
        {
          type: "update_edge",
          edgeId: "edge_slider_metric",
          patch: {
            label: "Budget signal",
            sourceHandle: "bottom",
            targetHandle: "top",
            strokeColor: "#d86f45",
            strokeWidth: 3,
            lineStyle: "dotted",
            startArrow: "circle",
            endArrow: "diamond",
          },
        },
      ],
      "user",
    );

    expect(updated.pages[0].edges.find((edge) => edge.id === "edge_slider_metric")).toMatchObject({
      label: "Budget signal",
      sourceHandle: "bottom",
      targetHandle: "top",
      strokeColor: "#d86f45",
      strokeWidth: 3,
      lineStyle: "dotted",
      startArrow: "circle",
      endArrow: "diamond",
    });
  });

  it("updates edge endpoints through update_edge and rejects self-reconnects", () => {
    const updated = applyOperations(
      workspaceFixture(),
      [
        {
          type: "update_edge",
          edgeId: "edge_slider_metric",
          patch: {
            sourceNodeId: "note_goal",
            sourceHandle: "bottom",
            targetHandle: "left",
          },
        },
      ],
      "user",
    );

    expect(updated.pages[0].edges.find((edge) => edge.id === "edge_slider_metric")).toMatchObject({
      sourceNodeId: "note_goal",
      sourceHandle: "bottom",
      targetNodeId: "card_roi",
      targetHandle: "left",
    });

    expect(() =>
      applyOperations(
        workspaceFixture(),
        [
          {
            type: "update_edge",
            edgeId: "edge_slider_metric",
            patch: { targetNodeId: "slider_budget" },
          },
        ],
        "user",
      ),
    ).toThrow(/cannot connect a node to itself/);
  });

  it("does not create a version for an empty operation list", () => {
    const workspace = workspaceFixture();

    expect(applyOperations(workspace, [])).toBe(workspace);
    expect(workspace.version).toBe(initialWorkspace.version);
  });

  it("sanitizes permissions and audit metadata on agent-created nodes", () => {
    const template = structuredClone(workspaceFixture().pages[0].nodes[0]);
    const created = applyOperations(workspaceFixture(), [
      {
        type: "create_node",
        node: {
          ...template,
          id: "agent_created",
          permissions: { userEditable: false, agentEditable: false, deletable: false },
          metadata: {
            createdBy: "user",
            updatedBy: "user",
            createdAt: "2000-01-01T00:00:00.000Z",
            updatedAt: "2000-01-01T00:00:00.000Z",
          },
        },
      },
    ]).pages[0].nodes.find((node) => node.id === "agent_created");

    expect(created?.permissions).toEqual({ userEditable: true, agentEditable: true, deletable: true });
    expect(created?.metadata).toMatchObject({ createdBy: "agent", updatedBy: "agent" });
    expect(created?.metadata?.createdAt).not.toBe("2000-01-01T00:00:00.000Z");
  });

  it.each(["metadata.updatedBy", "permissions.deletable", "id", "props.__proto__.polluted"])(
    "rejects unsafe binding target %s",
    (target) => {
      const template = structuredClone(workspaceFixture().pages[0].nodes[0]);
      expect(() =>
        applyOperations(workspaceFixture(), [
          {
            type: "create_node",
            node: {
              ...template,
              id: `bound_${target}`,
              bindings: { input: [{ variable: "sliderValue", target }] },
            },
          },
        ]),
      ).toThrow();
    },
  );

  it("validates component props after applying an input binding", () => {
    const template = structuredClone(workspaceFixture().pages[0].nodes[0]);
    expect(() =>
      applyOperations(workspaceFixture(), [
        {
          type: "create_node",
          node: {
            ...template,
            id: "invalid_bound_text",
            bindings: { input: [{ variable: "sliderValue", target: "props.text" }] },
          },
        },
      ]),
    ).toThrow();
  });

  it("rejects empty update and move payloads", () => {
    expect(() => applyOperations(workspaceFixture(), [{ type: "update_node", nodeId: "note_goal", patch: {} }])).toThrow();
    expect(() => applyOperations(workspaceFixture(), [{ type: "move_node", nodeId: "note_goal", position: {} }])).toThrow();
  });
});
