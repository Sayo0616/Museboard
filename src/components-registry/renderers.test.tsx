import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { SliderRenderer, TableRenderer, TextRenderer, MermaidRenderer } from "./renderers";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import type { CanvasNode, CanvasNodeType, Workspace } from "../workspace/workspaceTypes";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({
  default: mermaidMock,
}));

const timestamp = "2026-01-01T00:00:00.000Z";

function createNode(type: CanvasNodeType, props: Record<string, unknown>, overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: `${type}_node`,
    type,
    name: `${type} node`,
    position: { x: 0, y: 0, width: 320, height: 160 },
    props,
    permissions: { userEditable: true, agentEditable: true, deletable: true },
    metadata: { createdBy: "user", updatedBy: "user", createdAt: timestamp, updatedAt: timestamp },
    ...overrides,
  };
}

function createWorkspace(nodes: CanvasNode[]): Workspace {
  return {
    id: "workspace_test",
    title: "Test workspace",
    version: 1,
    activePageId: "page_test",
    pages: [{ id: "page_test", name: "Test page", nodes, edges: [] }],
    variables: {},
    dataSources: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function seedWorkspace(node: CanvasNode) {
  useWorkspaceStore.setState({
    workspace: createWorkspace([node]),
    selectedNodeIds: [],
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
}

function storedNode<TProps extends Record<string, unknown>>(nodeId: string): CanvasNode & { props: TProps } {
  const page = useWorkspaceStore.getState().workspace.pages[0];
  const node = page.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`Missing test node: ${nodeId}`);
  return node as CanvasNode & { props: TProps };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const mermaidCodeExamples = [
  {
    diagramType: "flowchart",
    source: `flowchart TD
  Start([Start]) --> Plan[Plan release]
  Plan --> Review{Approved?}
  Review -- Yes --> Ship[Ship]
  Review -- No --> Plan`,
  },
  {
    diagramType: "sequence",
    source: `sequenceDiagram
  participant User
  participant Agent
  participant Board
  User->>Agent: Request diagram
  Agent->>Board: create_node
  Board-->>User: Mermaid node`,
  },
  {
    diagramType: "state",
    source: `stateDiagram-v2
  [*] --> Draft
  Draft --> Review: submit
  Review --> Published: approve
  Review --> Draft: revise
  Published --> [*]`,
  },
  {
    diagramType: "class",
    source: `classDiagram
  class CanvasNode {
    +string id
    +string type
    +object props
  }
  class MermaidNode
  CanvasNode <|-- MermaidNode
  MermaidNode : +string source
  MermaidNode : +string diagramType`,
  },
  {
    diagramType: "er",
    source: `erDiagram
  WORKSPACE ||--o{ PAGE : contains
  PAGE ||--o{ CANVAS_NODE : has
  CANVAS_NODE {
    string id
    string type
    string name
  }`,
  },
  {
    diagramType: "gantt",
    source: `gantt
  title Release Plan
  dateFormat  YYYY-MM-DD
  section Build
  Component tests :done, tests, 2026-07-11, 1d
  Manual QA :active, manual, after tests, 2d`,
  },
  {
    diagramType: "mindmap",
    source: `mindmap
  root((Museboard))
    Canvas
      Mermaid node
      Inspector
    Chat
      Short messages
      Operations`,
  },
] as const;

beforeEach(() => {
  mermaidMock.initialize.mockClear();
  mermaidMock.parse.mockReset();
  mermaidMock.render.mockReset();
  mermaidMock.parse.mockResolvedValue({ diagramType: "flowchart-v2" });
  mermaidMock.render.mockResolvedValue({ svg: "<svg><text>Mock Mermaid</text></svg>" });

  useWorkspaceStore.setState({
    workspace: createWorkspace([]),
    selectedNodeIds: [],
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

describe("MermaidRenderer", () => {
  it("renders Mermaid source through the Mermaid library", async () => {
    const node = createNode("mermaid", {
      title: "Pipeline",
      source: "flowchart TD\n  A[Input] --> B[Output]",
      diagramType: "flowchart",
      theme: "neutral",
    });
    seedWorkspace(node);

    render(<MermaidRenderer node={node} />);

    await waitFor(() => expect(screen.getByText("Mock Mermaid")).toBeInTheDocument());
    expect(mermaidMock.initialize).toHaveBeenCalledWith(expect.objectContaining({ startOnLoad: false, securityLevel: "strict", theme: "neutral" }));
    expect(mermaidMock.parse).toHaveBeenCalledWith("flowchart TD\n  A[Input] --> B[Output]");
    expect(mermaidMock.render).toHaveBeenCalledWith(expect.stringMatching(/^mermaid-mermaid_node-/), "flowchart TD\n  A[Input] --> B[Output]");
  });

  it.each(mermaidCodeExamples)("renders supported $diagramType Mermaid code examples", async ({ diagramType, source }) => {
    const node = createNode(
      "mermaid",
      {
        title: `${diagramType} example`,
        source,
        diagramType,
        theme: "neutral",
      },
      { id: `mermaid_${diagramType}_node` },
    );
    seedWorkspace(node);

    render(<MermaidRenderer node={node} />);

    await waitFor(() => expect(screen.getByText("Mock Mermaid")).toBeInTheDocument());
    expect(mermaidMock.parse).toHaveBeenCalledWith(source);
    expect(mermaidMock.render).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^mermaid-mermaid_${diagramType}_node-`)), source);
  });

  it("shows an empty-source error without loading Mermaid", async () => {
    const node = createNode("mermaid", {
      title: "Empty",
      source: "   \n  ",
      diagramType: "flowchart",
      theme: "neutral",
    });
    seedWorkspace(node);

    render(<MermaidRenderer node={node} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Mermaid source is empty.");
    expect(mermaidMock.initialize).not.toHaveBeenCalled();
    expect(mermaidMock.parse).not.toHaveBeenCalled();
    expect(mermaidMock.render).not.toHaveBeenCalled();
  });

  it("falls back to the neutral Mermaid theme for unsupported theme props", async () => {
    const node = createNode("mermaid", {
      title: "Unsupported theme",
      source: "sequenceDiagram\n  A->>B: Ping",
      diagramType: "sequence",
      theme: "forest",
    });
    seedWorkspace(node);

    render(<MermaidRenderer node={node} />);

    await waitFor(() => expect(screen.getByText("Mock Mermaid")).toBeInTheDocument());
    expect(mermaidMock.initialize).toHaveBeenCalledWith(expect.objectContaining({ theme: "neutral" }));
  });

  it("uses Mermaid default theme when explicitly configured", async () => {
    const node = createNode("mermaid", {
      title: "Default theme",
      source: "stateDiagram-v2\n  [*] --> Ready",
      diagramType: "state",
      theme: "default",
    });
    seedWorkspace(node);

    render(<MermaidRenderer node={node} />);

    await waitFor(() => expect(screen.getByText("Mock Mermaid")).toBeInTheDocument());
    expect(mermaidMock.initialize).toHaveBeenCalledWith(expect.objectContaining({ theme: "default" }));
  });

  it("re-renders when source changes and ignores stale async render results", async () => {
    const oldSource = "flowchart TD\n  A[Old] --> B[Result]";
    const nextSource = "flowchart TD\n  A[New] --> B[Result]";
    const oldParse = deferred<unknown>();
    const oldRender = deferred<{ svg: string }>();

    mermaidMock.parse.mockImplementation((source: string) => (source === oldSource ? oldParse.promise : Promise.resolve({ diagramType: "flowchart-v2" })));
    mermaidMock.render.mockImplementation((_id: string, source: string) =>
      source === oldSource ? oldRender.promise : Promise.resolve({ svg: "<svg><text>New Mermaid</text></svg>" }),
    );

    const node = createNode("mermaid", {
      title: "Changing",
      source: oldSource,
      diagramType: "flowchart",
      theme: "neutral",
    });
    seedWorkspace(node);

    const { rerender } = render(<MermaidRenderer node={node} />);
    await waitFor(() => expect(mermaidMock.parse).toHaveBeenCalledWith(oldSource));

    const updatedNode = {
      ...node,
      props: {
        ...node.props,
        source: nextSource,
      },
    };
    rerender(<MermaidRenderer node={updatedNode} />);

    expect(await screen.findByText("New Mermaid")).toBeInTheDocument();

    await act(async () => {
      oldParse.resolve({ diagramType: "flowchart-v2" });
      await Promise.resolve();
    });
    await waitFor(() => expect(mermaidMock.render).toHaveBeenCalledWith(expect.any(String), oldSource));

    await act(async () => {
      oldRender.resolve({ svg: "<svg><text>Old Mermaid</text></svg>" });
      await Promise.resolve();
    });

    expect(screen.getByText("New Mermaid")).toBeInTheDocument();
    expect(screen.queryByText("Old Mermaid")).not.toBeInTheDocument();
  });

  it("commits title edits to workspace JSON", () => {
    const node = createNode("mermaid", {
      title: "Pipeline",
      source: "flowchart TD\n  A[Input] --> B[Output]",
      diagramType: "flowchart",
      theme: "neutral",
    });
    seedWorkspace(node);

    render(<MermaidRenderer node={node} />);

    fireEvent.change(screen.getByDisplayValue("Pipeline"), { target: { value: "Release flow" } });

    expect(storedNode<{ title: string }>(node.id).props.title).toBe("Release flow");
  });

  it("shows a syntax error without clearing the node source", async () => {
    mermaidMock.parse.mockRejectedValueOnce(new Error("Parse failed"));
    const node = createNode("mermaid", {
      title: "Broken",
      source: "not a diagram",
      diagramType: "unknown",
      theme: "neutral",
    });
    seedWorkspace(node);

    render(<MermaidRenderer node={node} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Parse failed");
    expect(storedNode<{ source: string }>(node.id).props.source).toBe("not a diagram");
  });
});

describe("TextRenderer", () => {
  it("renders markdown preview and commits edited title and body to workspace JSON", () => {
    const node = createNode("text", {
      title: "Campaign brief",
      text: "Initial **bold** note",
    });
    seedWorkspace(node);

    render(<TextRenderer node={node} />);

    expect(screen.getByRole("heading", { name: "Campaign brief" })).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByRole("textbox"));
    const editor = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(editor.value).toContain("## Campaign brief");

    fireEvent.change(editor, { target: { value: "## Updated brief\n\nNext action list" } });
    fireEvent.blur(editor);

    expect(storedNode<{ title: string; text: string }>(node.id).props).toMatchObject({
      title: "Updated brief",
      text: "Next action list",
    });
  });

  it("cancels markdown editing with Escape without changing node props", () => {
    const node = createNode("text", {
      title: "Original title",
      text: "Original body",
    });
    seedWorkspace(node);

    render(<TextRenderer node={node} />);

    fireEvent.doubleClick(screen.getByRole("textbox"));
    const editor = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "## Draft title\n\nDraft body" } });
    fireEvent.keyDown(editor, { key: "Escape" });

    expect(storedNode<{ title: string; text: string }>(node.id).props).toMatchObject({
      title: "Original title",
      text: "Original body",
    });
  });

  it("can commit by blur again after a previous blur commit", () => {
    const node = createNode("text", {
      title: "First title",
      text: "First body",
    });
    seedWorkspace(node);

    const { rerender } = render(<TextRenderer node={node} />);

    fireEvent.doubleClick(screen.getByRole("textbox"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "## Second title\n\nSecond body" } });
    fireEvent.blur(screen.getByRole("textbox"));

    rerender(<TextRenderer node={storedNode(node.id)} />);
    fireEvent.doubleClick(screen.getByRole("textbox"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "## Third title\n\nThird body" } });
    fireEvent.blur(screen.getByRole("textbox"));

    expect(storedNode<{ title: string; text: string }>(node.id).props).toMatchObject({
      title: "Third title",
      text: "Third body",
    });
  });
});

describe("SliderRenderer", () => {
  it("previews range input changes and commits the user edit on blur", () => {
    const node = createNode("slider", {
      label: "Budget",
      min: 0,
      max: 100,
      step: 5,
      value: 25,
      unit: "%",
    });
    seedWorkspace(node);

    render(<SliderRenderer node={node} />);

    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(screen.getByText("Budget")).toBeInTheDocument();
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "100");
    expect(slider).toHaveAttribute("step", "5");

    fireEvent.input(slider, { target: { value: "80" } });
    expect(storedNode<{ value: number }>(node.id).props.value).toBe(80);
    expect(useWorkspaceStore.getState().userEditBase).not.toBeNull();

    fireEvent.blur(slider);
    expect(useWorkspaceStore.getState().userEditBase).toBeNull();
    expect(useWorkspaceStore.getState().past).toHaveLength(1);
  });

  it("disables invalid ranges and keeps the value unchanged", () => {
    const node = createNode("slider", {
      label: "Budget",
      min: 100,
      max: 0,
      step: 5,
      value: 25,
    });
    seedWorkspace(node);

    render(<SliderRenderer node={node} />);

    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider).toBeDisabled();
    expect(slider).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("最小值必须小于最大值");

    fireEvent.input(slider, { target: { value: "80" } });
    expect(storedNode<{ value: number }>(node.id).props.value).toBe(25);
  });
});

describe("TableRenderer", () => {
  it("renders columns and rows, then writes cell edits into table props", () => {
    const node = createNode("table", {
      columns: ["Task", "Owner"],
      rows: [
        ["Brief", "Design"],
        ["Launch", "Growth"],
      ],
      merges: [],
    });
    seedWorkspace(node);

    render(<TableRenderer node={node} />);

    expect(screen.getByDisplayValue("Task")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Design")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("编辑第 1 行第 2 列"), { target: { value: "Product" } });

    expect(storedNode<{ rows: string[][] }>(node.id).props.rows[0][1]).toBe("Product");
  });

  it("keeps table cells focused across rerenders so users can type continuously", () => {
    const node = createNode("table", {
      columns: ["Task", "Owner"],
      rows: [["Brief", "Design"]],
      merges: [],
    });
    seedWorkspace(node);

    const { rerender } = render(<TableRenderer node={node} />);

    const cell = screen.getByDisplayValue("Brief") as HTMLInputElement;
    cell.focus();
    expect(document.activeElement).toBe(cell);

    fireEvent.change(cell, { target: { value: "A" } });
    rerender(<TableRenderer node={storedNode(node.id)} />);

    const continuedCell = screen.getByDisplayValue("A") as HTMLInputElement;
    expect(document.activeElement).toBe(continuedCell);

    fireEvent.change(continuedCell, { target: { value: "AB" } });
    expect(storedNode<{ rows: string[][] }>(node.id).props.rows[0][0]).toBe("AB");
  });

  it("inserts rows and columns through the table context menu", () => {
    const node = createNode("table", {
      columns: ["Task", "Owner"],
      rows: [["Brief", "Design"]],
      merges: [],
    });
    seedWorkspace(node);

    render(<TableRenderer node={node} />);

    const firstCell = screen.getByLabelText("编辑第 1 行第 1 列").closest("td");
    if (!firstCell) throw new Error("Missing first table cell");

    fireEvent.contextMenu(firstCell);
    fireEvent.click(screen.getByRole("button", { name: "在下方插入行" }));
    expect(storedNode<{ rows: string[][] }>(node.id).props.rows).toHaveLength(2);

    fireEvent.contextMenu(firstCell);
    fireEvent.click(screen.getByRole("button", { name: "在右侧插入列" }));
    const stored = storedNode<{ columns: string[]; rows: string[][] }>(node.id);
    expect(stored.props.columns).toHaveLength(3);
    expect(stored.props.rows[0]).toHaveLength(3);
  });

  it("merges and unmerges cells while keeping table props structured", () => {
    const node = createNode("table", {
      columns: ["Task", "Owner"],
      rows: [
        ["Brief", "Design"],
        ["Launch", "Growth"],
      ],
      merges: [],
    });
    seedWorkspace(node);

    const { rerender } = render(<TableRenderer node={node} />);

    const firstCell = screen.getByLabelText("编辑第 1 行第 1 列").closest("td");
    if (!firstCell) throw new Error("Missing first table cell");

    fireEvent.contextMenu(firstCell);
    fireEvent.click(screen.getByRole("button", { name: "向右合并" }));

    expect(storedNode<{ merges: Array<{ row: number; column: number; rowSpan: number; colSpan: number }> }>(node.id).props.merges).toEqual([
      { row: 0, column: 0, rowSpan: 1, colSpan: 2 },
    ]);

    rerender(<TableRenderer node={storedNode(node.id)} />);
    const mergedCell = screen.getByLabelText("编辑第 1 行第 1 列").closest("td");
    if (!mergedCell) throw new Error("Missing merged table cell");

    fireEvent.contextMenu(mergedCell);
    fireEvent.click(screen.getByRole("button", { name: "拆分单元格" }));

    expect(storedNode<{ merges: unknown[] }>(node.id).props.merges).toEqual([]);
  });

  it("blocks moving columns that belong to merged cells", () => {
    const node = createNode("table", {
      columns: ["Task", "Owner", "Status"],
      rows: [
        ["Brief", "Design", "Ready"],
        ["Launch", "Growth", "Queued"],
      ],
      merges: [{ row: 0, column: 0, rowSpan: 1, colSpan: 2 }],
    });
    seedWorkspace(node);

    const { container } = render(<TableRenderer node={node} />);
    const mergedColumnHandle = container.querySelectorAll<HTMLButtonElement>(".table-column-handle")[1];
    if (!mergedColumnHandle) throw new Error("Missing merged column handle");

    fireEvent.contextMenu(mergedColumnHandle);

    expect(screen.getByText("不能移入或移出横向合并单元格所在列。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "左移整列" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "右移整列" })).toBeDisabled();
  });

  it("blocks moving regular columns into merged-cell columns", () => {
    const node = createNode("table", {
      columns: ["Task", "Owner", "Status", "Date"],
      rows: [
        ["Brief", "Design", "Ready", "Mon"],
        ["Launch", "Growth", "Queued", "Tue"],
      ],
      merges: [{ row: 0, column: 0, rowSpan: 1, colSpan: 2 }],
    });
    seedWorkspace(node);

    const { container } = render(<TableRenderer node={node} />);
    const regularColumnHandle = container.querySelectorAll<HTMLButtonElement>(".table-column-handle")[2];
    if (!regularColumnHandle) throw new Error("Missing regular column handle");

    fireEvent.contextMenu(regularColumnHandle);

    expect(screen.getByText("不能移入或移出横向合并单元格所在列。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "左移整列" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "右移整列" })).not.toBeDisabled();
  });

  it("allows moving columns that only contain vertical merges", () => {
    const node = createNode("table", {
      columns: ["Task", "Owner", "Status"],
      rows: [
        ["Brief", "Design", "Ready"],
        ["Launch", "", "Queued"],
      ],
      merges: [{ row: 0, column: 1, rowSpan: 2, colSpan: 1 }],
    });
    seedWorkspace(node);

    const { container } = render(<TableRenderer node={node} />);
    const verticalMergeColumnHandle = container.querySelectorAll<HTMLButtonElement>(".table-column-handle")[1];
    if (!verticalMergeColumnHandle) throw new Error("Missing vertical merge column handle");

    fireEvent.contextMenu(verticalMergeColumnHandle);
    expect(screen.queryByText("不能移入或移出横向合并单元格所在列。")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "右移整列" }));

    const stored = storedNode<{ columns: string[]; rows: string[][]; merges: Array<{ row: number; column: number; rowSpan: number; colSpan: number }> }>(
      node.id,
    );
    expect(stored.props.columns).toEqual(["Task", "Status", "Owner"]);
    expect(stored.props.rows[0]).toEqual(["Brief", "Ready", "Design"]);
    expect(stored.props.merges).toEqual([{ row: 0, column: 2, rowSpan: 2, colSpan: 1 }]);
  });

  it("allows moving rows that only contain horizontal merges", () => {
    const node = createNode("table", {
      columns: ["Task", "Owner", "Status"],
      rows: [
        ["Brief", "", "Ready"],
        ["Launch", "Growth", "Queued"],
      ],
      merges: [{ row: 0, column: 0, rowSpan: 1, colSpan: 2 }],
    });
    seedWorkspace(node);

    const { container } = render(<TableRenderer node={node} />);
    const horizontalMergeRowHandle = container.querySelectorAll<HTMLButtonElement>(".table-row-handle")[0];
    if (!horizontalMergeRowHandle) throw new Error("Missing horizontal merge row handle");

    fireEvent.contextMenu(horizontalMergeRowHandle);
    expect(screen.queryByText("不能移入或移出竖向合并单元格所在行。")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下移整行" }));

    const stored = storedNode<{ rows: string[][]; merges: Array<{ row: number; column: number; rowSpan: number; colSpan: number }> }>(node.id);
    expect(stored.props.rows).toEqual([
      ["Launch", "Growth", "Queued"],
      ["Brief", "", "Ready"],
    ]);
    expect(stored.props.merges).toEqual([{ row: 1, column: 0, rowSpan: 1, colSpan: 2 }]);
  });

  it("blocks inserting rows inside vertical merged cells", () => {
    const node = createNode("table", {
      columns: ["Task", "Owner"],
      rows: [
        ["Brief", "Design"],
        ["", "Growth"],
        ["Launch", "Ops"],
      ],
      merges: [{ row: 0, column: 0, rowSpan: 2, colSpan: 1 }],
    });
    seedWorkspace(node);

    const { container } = render(<TableRenderer node={node} />);
    const firstRowHandle = container.querySelectorAll<HTMLButtonElement>(".table-row-handle")[0];
    if (!firstRowHandle) throw new Error("Missing first row handle");

    fireEvent.contextMenu(firstRowHandle);

    expect(screen.getByText("不能在竖向合并单元格中间插入行。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "在下方插入行" })).toBeDisabled();

    expect(storedNode<{ rows: string[][]; merges: unknown[] }>(node.id).props.rows).toHaveLength(3);
    expect(storedNode<{ rows: string[][]; merges: unknown[] }>(node.id).props.merges).toEqual([{ row: 0, column: 0, rowSpan: 2, colSpan: 1 }]);
  });

  it("blocks inserting columns inside horizontal merged cells", () => {
    const node = createNode("table", {
      columns: ["Task", "Owner", "Status"],
      rows: [
        ["Brief", "", "Ready"],
        ["Launch", "Growth", "Queued"],
      ],
      merges: [{ row: 0, column: 0, rowSpan: 1, colSpan: 2 }],
    });
    seedWorkspace(node);

    const { container } = render(<TableRenderer node={node} />);
    const firstColumnHandle = container.querySelectorAll<HTMLButtonElement>(".table-column-handle")[0];
    if (!firstColumnHandle) throw new Error("Missing first column handle");

    fireEvent.contextMenu(firstColumnHandle);

    expect(screen.getByText("不能在横向合并单元格中间插入列。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "在右侧插入列" })).toBeDisabled();

    const stored = storedNode<{ columns: string[]; rows: string[][]; merges: unknown[] }>(node.id);
    expect(stored.props.columns).toEqual(["Task", "Owner", "Status"]);
    expect(stored.props.rows[0]).toEqual(["Brief", "", "Ready"]);
    expect(stored.props.merges).toEqual([{ row: 0, column: 0, rowSpan: 1, colSpan: 2 }]);
  });
});
