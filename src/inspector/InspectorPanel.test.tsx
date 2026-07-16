import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { InspectorPanel } from "./InspectorPanel";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { migrateLegacyWorkspaceToV2 } from "../workspace/workspaceMigration";
import type { CanvasNode, Workspace } from "../workspace/workspaceTypes";

const timestamp = "2026-01-01T00:00:00.000Z";

function createWorkspace(node: CanvasNode): Workspace {
  return migrateLegacyWorkspaceToV2({
    id: "workspace_test",
    title: "Test workspace",
    version: 1,
    activePageId: "page_test",
    pages: [{ id: "page_test", name: "Test page", nodes: [node], edges: [] }],
    variables: {},
    dataSources: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  });
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
    activeNodeId: node.id,
    activeEdgeId: null,
    hoveredNodeId: null,
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

  it("shows the active node instead of the first selected node", () => {
    const activeNode = createMermaidNode();
    const selectedOnlyNode = { ...createMermaidNode(), id: "selected_only", name: "Selected only" };

    useWorkspaceStore.setState({
      workspace: migrateLegacyWorkspaceToV2({
        id: "workspace_test",
        title: "Test workspace",
        version: 1,
        activePageId: "page_test",
        pages: [{ id: "page_test", name: "Test page", nodes: [activeNode, selectedOnlyNode], edges: [] }],
        variables: {},
        dataSources: {},
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
      selectedNodeIds: [selectedOnlyNode.id],
      activeNodeId: activeNode.id,
      activeEdgeId: null,
    });

    render(<InspectorPanel />);

    expect(screen.getByText("Mermaid node")).toBeInTheDocument();
    expect(screen.queryByText("Selected only")).not.toBeInTheDocument();
  });
});
