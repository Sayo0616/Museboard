import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { InspectorPanel } from "./InspectorPanel";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import type { CanvasNode, Workspace } from "../workspace/workspaceTypes";

const timestamp = "2026-01-01T00:00:00.000Z";

function createWorkspace(node: CanvasNode): Workspace {
  return {
    id: "workspace_test",
    title: "Test workspace",
    version: 1,
    activePageId: "page_test",
    pages: [{ id: "page_test", name: "Test page", nodes: [node], edges: [] }],
    variables: {},
    dataSources: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createMermaidNode(): CanvasNode {
  return {
    id: "mermaid_node",
    type: "mermaid",
    name: "Mermaid node",
    position: { x: 0, y: 0, width: 420, height: 280 },
    props: {
      title: "Pipeline",
      source: "flowchart TD\n  A[Input] --> B[Output]",
      diagramType: "flowchart",
      theme: "neutral",
    },
    permissions: { userEditable: true, agentEditable: true, deletable: true },
    metadata: { createdBy: "user", updatedBy: "user", createdAt: timestamp, updatedAt: timestamp },
  };
}

beforeEach(() => {
  const node = createMermaidNode();
  useWorkspaceStore.setState({
    workspace: createWorkspace(node),
    selectedNodeIds: [node.id],
    selectedEdgeIds: [],
    messages: [],
    recentUserEvents: [],
    mode: "edit",
    pendingResponse: null,
    lastAppliedResponse: null,
    versionHistory: [],
    past: [],
    future: [],
    userEditBase: null,
    userEditLabel: null,
    saveState: "dirty",
  });
});

describe("InspectorPanel Mermaid fields", () => {
  it("keeps Mermaid source as a multiline string", () => {
    render(<InspectorPanel />);

    const source = screen.getByLabelText("Source") as HTMLTextAreaElement;
    const nextSource = "sequenceDiagram\n  participant A\n  participant B\n  A->>B: Hello";

    fireEvent.focus(source);
    fireEvent.change(source, { target: { value: nextSource } });
    fireEvent.blur(source);

    const stored = useWorkspaceStore.getState().workspace.pages[0].nodes[0];
    expect(stored.props.source).toBe(nextSource);
  });
});
