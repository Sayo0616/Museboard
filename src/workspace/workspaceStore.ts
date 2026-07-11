import { create } from "zustand";
import type { AgentResponse } from "../agent/agentProtocol";
import { runAgent } from "../agent/agentClient";
import { buildWorkspaceContext, buildWorkspaceSummary } from "./contextBuilder";
import { applyOperations, isDestructiveOperation, validateAgentResponse } from "./operationEngine";
import { downloadWorkspaceJson, downloadWorkspacePdf, downloadWorkspacePng } from "./workspaceExport";
import { initialWorkspace } from "./initialWorkspace";
import { getActivePage, getActivePageIndex } from "./workspaceSelectors";
import type { AgentPermissionLevel, AgentTransport, ChatMessage, CanvasNode, Page, VersionSnapshot, Workspace, WorkspaceMode } from "./workspaceTypes";
import { createId, nowIso } from "../utils/id";
import { getAtPath } from "../utils/patch";

const storageKey = "museboard.workspace";

type OperationActor = "agent" | "user";

type WorkspaceState = {
  workspace: Workspace;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  messages: ChatMessage[];
  recentUserEvents: string[];
  mode: WorkspaceMode;
  agentPermissionLevel: AgentPermissionLevel;
  agentTransport: AgentTransport;
  agentEndpoint: string;
  pendingResponse: AgentResponse | null;
  lastAppliedResponse: AgentResponse | null;
  versionHistory: VersionSnapshot[];
  past: Workspace[];
  future: Workspace[];
  userEditBase: Workspace | null;
  userEditLabel: string | null;
  saveState: "saved" | "dirty";
  selectNode: (nodeId: string | null, append?: boolean) => void;
  selectEdge: (edgeId: string | null, append?: boolean) => void;
  setSelectedNodeIds: (nodeIds: string[]) => void;
  setMode: (mode: WorkspaceMode) => void;
  setAgentPermissionLevel: (level: AgentPermissionLevel) => void;
  setAgentTransport: (transport: AgentTransport) => void;
  setAgentEndpoint: (endpoint: string) => void;
  updateNode: (nodeId: string, patch: Record<string, unknown>, eventLabel?: string) => void;
  moveNode: (nodeId: string, x: number, y: number) => void;
  resizeNode: (nodeId: string, x: number, y: number, width: number, height: number) => void;
  duplicateSelectedNodes: () => void;
  deleteSelectedNodes: () => void;
  toggleLockSelectedNodes: () => void;
  createEdgeFromSelection: () => void;
  deleteEdgesForSelection: () => void;
  exportWorkspaceJson: () => void;
  exportWorkspacePng: () => Promise<void>;
  exportWorkspacePdf: () => void;
  createPage: () => void;
  duplicatePage: () => void;
  deletePage: (pageId: string) => void;
  setActivePage: (pageId: string) => void;
  restoreVersion: (versionId: string) => void;
  beginUserEdit: (eventLabel?: string) => void;
  previewUserEdit: (response: AgentResponse, eventLabel?: string) => void;
  commitUserEdit: (eventLabel?: string) => void;
  cancelUserEdit: () => void;
  submitMessage: (text: string) => Promise<void>;
  applyAgentResponse: (response: AgentResponse) => void;
  acceptPendingResponse: () => void;
  discardPendingResponse: () => void;
  clearLastAppliedResponse: () => void;
  undo: () => void;
  redo: () => void;
  saveWorkspace: () => void;
  loadWorkspace: () => void;
};

type StoreSet = (
  partial: Partial<WorkspaceState> | WorkspaceState | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState),
  replace?: false,
) => void;

type StoreGet = () => WorkspaceState;

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: initialWorkspace,
  selectedNodeIds: ["slider_budget"],
  selectedEdgeIds: [],
  messages: [
    {
      id: "message_welcome",
      role: "agent",
      text: "画板已就绪，可以直接拖动组件或输入短指令。",
      createdAt: nowIso(),
    },
  ],
  recentUserEvents: [],
  mode: "edit",
  agentPermissionLevel: "confirm_destructive",
  agentTransport: "local",
  agentEndpoint: "",
  pendingResponse: null,
  lastAppliedResponse: null,
  versionHistory: [createVersionSnapshot(initialWorkspace, "初始版本", null)],
  past: [],
  future: [],
  userEditBase: null,
  userEditLabel: null,
  saveState: "dirty",
  selectNode: (nodeId, append = false) => {
    set((state) => {
      if (!nodeId) {
        return state.selectedNodeIds.length === 0 && state.selectedEdgeIds.length === 0
          ? state
          : { selectedNodeIds: [], selectedEdgeIds: [] };
      }
      if (append) {
        const exists = state.selectedNodeIds.includes(nodeId);
        return {
          selectedNodeIds: exists
            ? state.selectedNodeIds.filter((id) => id !== nodeId)
            : [...state.selectedNodeIds, nodeId],
          selectedEdgeIds: [],
        };
      }
      if (state.selectedNodeIds.length === 1 && state.selectedNodeIds[0] === nodeId) return state;
      return { selectedNodeIds: [nodeId], selectedEdgeIds: [] };
    });
  },
  selectEdge: (edgeId, append = false) => {
    set((state) => {
      if (!edgeId) return state.selectedEdgeIds.length === 0 ? state : { selectedEdgeIds: [] };
      if (append) {
        const exists = state.selectedEdgeIds.includes(edgeId);
        return {
          selectedNodeIds: [],
          selectedEdgeIds: exists ? state.selectedEdgeIds.filter((id) => id !== edgeId) : [...state.selectedEdgeIds, edgeId],
        };
      }
      if (state.selectedEdgeIds.length === 1 && state.selectedEdgeIds[0] === edgeId) return state;
      return { selectedNodeIds: [], selectedEdgeIds: [edgeId] };
    });
  },
  setSelectedNodeIds: (nodeIds) => {
    set((state) => {
      const uniqueNodeIds = [...new Set(nodeIds)];
      if (state.selectedNodeIds.length === uniqueNodeIds.length && state.selectedNodeIds.every((id, index) => id === uniqueNodeIds[index])) {
        return state;
      }
      return { selectedNodeIds: uniqueNodeIds, selectedEdgeIds: [] };
    });
  },
  setMode: (mode) => set({ mode }),
  setAgentPermissionLevel: (level) => set({ agentPermissionLevel: level }),
  setAgentTransport: (transport) => set({ agentTransport: transport }),
  setAgentEndpoint: (endpoint) => set({ agentEndpoint: endpoint }),
  updateNode: (nodeId, patch, eventLabel) => {
    const response: AgentResponse = {
      message: "本地更新",
      operations: [{ type: "update_node", nodeId, patch }],
    };
    commitResponse(response, set, get, false, "user", eventLabel ?? describePatch(get().workspace, nodeId, patch));
  },
  moveNode: (nodeId, x, y) => {
    const response: AgentResponse = {
      message: "本地移动",
      operations: [{ type: "move_node", nodeId, position: { x, y } }],
    };
    commitResponse(response, set, get, false, "user", `移动 ${nodeId} 到 (${Math.round(x)}, ${Math.round(y)})`);
  },
  resizeNode: (nodeId, x, y, width, height) => {
    const response: AgentResponse = {
      message: "本地缩放",
      operations: [{ type: "move_node", nodeId, position: { x, y, width, height } }],
    };
    commitResponse(
      response,
      set,
      get,
      false,
      "user",
      `缩放 ${nodeId} 到 ${Math.round(width)}x${Math.round(height)}`,
    );
  },
  duplicateSelectedNodes: () => {
    const state = get();
    const page = getActivePage(state.workspace);
    const selectedNodes = page.nodes.filter((node) => state.selectedNodeIds.includes(node.id));
    if (selectedNodes.length === 0) return;

    const operations = selectedNodes.map((node, index) => {
      const id = createId(node.type);
      return {
        type: "create_node" as const,
        node: {
          ...structuredClone(node),
          id,
          name: `${node.name} 副本`,
          position: {
            ...node.position,
            x: node.position.x + 28 + index * 12,
            y: node.position.y + 28 + index * 12,
          },
          metadata: { createdBy: "user" as const, updatedBy: "user" as const, createdAt: nowIso(), updatedAt: nowIso() },
        },
      };
    });

    commitResponse({ message: `已复制 ${operations.length} 个对象。`, operations }, set, get, false, "user", `复制 ${operations.length} 个对象`);
    set({ selectedNodeIds: operations.map((operation) => operation.node.id) });
  },
  deleteSelectedNodes: () => {
    const selectedNodeIds = get().selectedNodeIds;
    if (selectedNodeIds.length === 0) return;
    commitResponse(
      {
        message: `已删除 ${selectedNodeIds.length} 个对象。`,
        operations: selectedNodeIds.map((nodeId) => ({ type: "delete_node" as const, nodeId })),
      },
      set,
      get,
      false,
      "user",
      `删除 ${selectedNodeIds.length} 个对象`,
    );
    set({ selectedNodeIds: [], selectedEdgeIds: [] });
  },
  toggleLockSelectedNodes: () => {
    const state = get();
    const page = getActivePage(state.workspace);
    const selectedNodes = page.nodes.filter((node) => state.selectedNodeIds.includes(node.id));
    if (selectedNodes.length === 0) return;
    const shouldLock = selectedNodes.some((node) => node.permissions?.agentEditable !== false);

    commitResponse(
      {
        message: shouldLock ? "已锁定选中对象。" : "已解锁选中对象。",
        operations: selectedNodes.map((node) => ({
          type: "update_node" as const,
          nodeId: node.id,
          patch: {
            "permissions.userEditable": node.permissions?.userEditable ?? true,
            "permissions.agentEditable": !shouldLock,
            "permissions.deletable": node.permissions?.deletable ?? true,
          },
        })),
      },
      set,
      get,
      false,
      "user",
      shouldLock ? `锁定 ${selectedNodes.length} 个对象` : `解锁 ${selectedNodes.length} 个对象`,
    );
  },
  createEdgeFromSelection: () => {
    const state = get();
    const [sourceNodeId, targetNodeId] = state.selectedNodeIds;
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return;
    const page = getActivePage(state.workspace);
    const source = page.nodes.find((node) => node.id === sourceNodeId);
    const target = page.nodes.find((node) => node.id === targetNodeId);
    if (!source || !target) return;

    commitResponse(
      {
        message: `已连接 ${source.name} 和 ${target.name}。`,
        operations: [
          {
            type: "create_edge",
            edge: {
              id: createId("edge"),
              sourceNodeId,
              targetNodeId,
              type: "dependency",
              label: `${source.name} -> ${target.name}`,
            },
          },
        ],
      },
      set,
      get,
      false,
      "user",
      `连接 ${source.name} 和 ${target.name}`,
    );
  },
  deleteEdgesForSelection: () => {
    const state = get();
    if (state.selectedNodeIds.length === 0 && state.selectedEdgeIds.length === 0) return;
    const selected = new Set(state.selectedNodeIds);
    const selectedEdges = new Set(state.selectedEdgeIds);
    const edgeIds = getActivePage(state.workspace).edges
      .filter((edge) => selectedEdges.has(edge.id) || selected.has(edge.sourceNodeId) || selected.has(edge.targetNodeId))
      .map((edge) => edge.id);
    if (edgeIds.length === 0) return;

    commitResponse(
      {
        message: `已删除 ${edgeIds.length} 条连接。`,
        operations: edgeIds.map((edgeId) => ({ type: "delete_edge" as const, edgeId })),
      },
      set,
      get,
      false,
      "user",
      `删除 ${edgeIds.length} 条连接`,
    );
    set({ selectedEdgeIds: [] });
  },
  exportWorkspaceJson: () => {
    const workspace = get().workspace;
    downloadWorkspaceJson(workspace);
    set((state) => ({
      messages: [
        ...state.messages,
        { id: createId("message_export"), role: "system", text: "已导出 workspace JSON。", createdAt: nowIso() },
      ],
    }));
  },
  exportWorkspacePng: async () => {
    await downloadWorkspacePng(get().workspace);
    set((state) => ({
      messages: [
        ...state.messages,
        { id: createId("message_export"), role: "system", text: "已导出当前页面 PNG。", createdAt: nowIso() },
      ],
    }));
  },
  exportWorkspacePdf: () => {
    downloadWorkspacePdf(get().workspace);
    set((state) => ({
      messages: [
        ...state.messages,
        { id: createId("message_export"), role: "system", text: "已导出当前页面 PDF。", createdAt: nowIso() },
      ],
    }));
  },
  createPage: () => {
    const pageId = createId("page");
    const page: Page = { id: pageId, name: `页面 ${get().workspace.pages.length + 1}`, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
    set((state) => {
      const nextWorkspace = {
        ...state.workspace,
        activePageId: pageId,
        pages: [...state.workspace.pages, page],
        version: state.workspace.version + 1,
        updatedAt: nowIso(),
      };
      return commitWorkspaceState(state, nextWorkspace, "新增页面");
    });
  },
  duplicatePage: () => {
    set((state) => {
      const activePage = getActivePage(state.workspace);
      const pageId = createId("page");
      const nodeIdMap = new Map(activePage.nodes.map((node) => [node.id, createId(node.type)]));
      const page: Page = {
        ...structuredClone(activePage),
        id: pageId,
        name: `${activePage.name} 副本`,
        nodes: activePage.nodes.map((node) => ({ ...structuredClone(node), id: nodeIdMap.get(node.id) ?? createId(node.type), name: `${node.name} 副本` })),
        edges: activePage.edges.map((edge) => ({
          ...structuredClone(edge),
          id: createId("edge"),
          sourceNodeId: nodeIdMap.get(edge.sourceNodeId) ?? edge.sourceNodeId,
          targetNodeId: nodeIdMap.get(edge.targetNodeId) ?? edge.targetNodeId,
        })),
      };
      const nextWorkspace = {
        ...state.workspace,
        activePageId: pageId,
        pages: [...state.workspace.pages, page],
        version: state.workspace.version + 1,
        updatedAt: nowIso(),
      };
      return commitWorkspaceState(state, nextWorkspace, "复制页面");
    });
  },
  deletePage: (pageId) => {
    set((state) => {
      if (state.workspace.pages.length <= 1) return state;
      const nextPages = state.workspace.pages.filter((page) => page.id !== pageId);
      const nextActivePageId = state.workspace.activePageId === pageId ? nextPages[0].id : state.workspace.activePageId;
      const nextWorkspace = {
        ...state.workspace,
        activePageId: nextActivePageId,
        pages: nextPages,
        version: state.workspace.version + 1,
        updatedAt: nowIso(),
      };
      return { ...commitWorkspaceState(state, nextWorkspace, "删除页面"), selectedNodeIds: [], selectedEdgeIds: [] };
    });
  },
  setActivePage: (pageId) => {
    set((state) => {
      if (!state.workspace.pages.some((page) => page.id === pageId)) return state;
      return { workspace: { ...state.workspace, activePageId: pageId }, selectedNodeIds: [], selectedEdgeIds: [] };
    });
  },
  restoreVersion: (versionId) => {
    set((state) => {
      const snapshot = state.versionHistory.find((entry) => entry.id === versionId);
      if (!snapshot) return state;
      const workspace = structuredClone(snapshot.workspace);
      const nextWorkspace = { ...workspace, version: state.workspace.version + 1, updatedAt: nowIso() };
      return {
        ...commitWorkspaceState(state, nextWorkspace, `恢复 ${snapshot.label}`),
        selectedNodeIds: [],
        selectedEdgeIds: [],
        pendingResponse: null,
        lastAppliedResponse: null,
      };
    });
  },
  beginUserEdit: (eventLabel) => {
    set((state) => {
      if (state.userEditBase) {
        return { userEditLabel: eventLabel ?? state.userEditLabel };
      }
      return { userEditBase: state.workspace, userEditLabel: eventLabel ?? null };
    });
  },
  previewUserEdit: (response, eventLabel) => {
    previewResponse(response, set, get, eventLabel);
  },
  commitUserEdit: (eventLabel) => {
    set((state) => {
      if (!state.userEditBase) return state;
      const label = eventLabel ?? state.userEditLabel;
      const didChange = state.workspace !== state.userEditBase;
      if (!didChange) {
        return {
          userEditBase: null,
          userEditLabel: null,
        };
      }

      return {
        userEditBase: null,
        userEditLabel: null,
        past: [...state.past, state.userEditBase].slice(-40),
        future: [],
        versionHistory: pushVersionSnapshot(state.versionHistory, state.workspace, label ?? "本地编辑", state.userEditBase),
        recentUserEvents: label ? [...state.recentUserEvents, label].slice(-12) : state.recentUserEvents,
        saveState: "dirty",
      };
    });
  },
  cancelUserEdit: () => {
    set((state) => {
      if (!state.userEditBase) return state;
      return {
        workspace: state.userEditBase,
        userEditBase: null,
        userEditLabel: null,
      };
    });
  },
  submitMessage: async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: createId("message_user"),
      role: "user",
      text: trimmed,
      createdAt: nowIso(),
    };

    set((state) => ({ messages: [...state.messages, userMessage] }));

    try {
      if (trimmed === "/summary") {
        set((state) => ({
          messages: [
            ...state.messages,
            { id: createId("message_summary"), role: "agent", text: buildWorkspaceSummary(state.workspace), createdAt: nowIso() },
          ],
        }));
        return;
      }

      if (trimmed === "/export" || trimmed === "/export json") {
        get().exportWorkspaceJson();
        return;
      }

      if (trimmed === "/export png") {
        await get().exportWorkspacePng();
        return;
      }

      if (trimmed === "/export pdf") {
        get().exportWorkspacePdf();
        return;
      }

      const context = buildWorkspaceContext(get().workspace, get().selectedNodeIds, get().recentUserEvents, trimmed);
      const response = validateAgentResponse(
        await runAgent(trimmed, context, { transport: get().agentTransport, endpoint: get().agentEndpoint }),
      );
      get().applyAgentResponse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      set((state) => ({
        messages: [
          ...state.messages,
          { id: createId("message_error"), role: "system", text: `操作未通过校验：${message}`, createdAt: nowIso() },
        ],
      }));
    }
  },
  applyAgentResponse: (response) => {
    const safeResponse = validateAgentResponse(response);
    const hasDestructiveOperation = safeResponse.operations.some((operation) => isDestructiveOperation(operation));
    const permissionLevel = get().agentPermissionLevel;
    const requiresConfirmation =
      get().mode !== "agent" ||
      permissionLevel === "suggest" ||
      permissionLevel === "manual_only" ||
      (permissionLevel === "confirm_destructive" && (safeResponse.requiresConfirmation ?? hasDestructiveOperation)) ||
      (permissionLevel === "auto_apply_safe" && (safeResponse.requiresConfirmation ?? hasDestructiveOperation));

    if (requiresConfirmation) {
      set((state) => ({
        pendingResponse: safeResponse,
        lastAppliedResponse: null,
        messages: [
          ...state.messages,
          { id: createId("message_pending"), role: "agent", text: "这个修改需要确认后执行。", createdAt: nowIso() },
        ],
      }));
      return;
    }

    commitResponse(safeResponse, set, get, true, "agent");
  },
  acceptPendingResponse: () => {
    const pending = get().pendingResponse;
    if (!pending) return;
    commitResponse(pending, set, get, true, "agent");
    set({ pendingResponse: null });
  },
  discardPendingResponse: () => set({ pendingResponse: null }),
  clearLastAppliedResponse: () => set({ lastAppliedResponse: null }),
  undo: () => {
    set((state) => {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        workspace: previous,
        past: state.past.slice(0, -1),
        future: [state.workspace, ...state.future],
        selectedNodeIds: [],
        selectedEdgeIds: [],
        userEditBase: null,
        userEditLabel: null,
        lastAppliedResponse: null,
        saveState: "dirty",
      };
    });
  },
  redo: () => {
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        workspace: next,
        past: [...state.past, state.workspace],
        future: state.future.slice(1),
        selectedNodeIds: [],
        selectedEdgeIds: [],
        userEditBase: null,
        userEditLabel: null,
        lastAppliedResponse: null,
        saveState: "dirty",
      };
    });
  },
  saveWorkspace: () => {
    localStorage.setItem(storageKey, JSON.stringify(get().workspace, null, 2));
    set({ saveState: "saved" });
  },
  loadWorkspace: () => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const loaded = migrateLegacyWorkspace(JSON.parse(raw) as Workspace);
    const workspace = {
      ...loaded,
      activePageId: loaded.activePageId ?? loaded.pages[0]?.id ?? "page_main",
    };
    set((state) => ({
      workspace,
      past: [...state.past, state.workspace],
      future: [],
      versionHistory: pushVersionSnapshot(state.versionHistory, workspace, "加载 workspace", state.workspace),
      pendingResponse: null,
      lastAppliedResponse: null,
      userEditBase: null,
      userEditLabel: null,
      saveState: "saved",
      selectedNodeIds: [],
      selectedEdgeIds: [],
    }));
  },
}));

function commitResponse(
  response: AgentResponse,
  set: StoreSet,
  get: StoreGet,
  showMessage: boolean,
  actor: OperationActor,
  eventLabel?: string,
) {
  try {
    const state = get();
    const nextWorkspace = applyOperations(state.workspace, response.operations, actor);
    const agentMessage: ChatMessage = {
      id: createId("message_agent"),
      role: "agent",
      text: response.message,
      createdAt: nowIso(),
    };

    set({
      workspace: nextWorkspace,
      past: [...state.past, state.workspace].slice(-40),
      future: [],
      messages: showMessage ? [...state.messages, agentMessage] : state.messages,
      lastAppliedResponse: showMessage && actor === "agent" ? response : state.lastAppliedResponse,
      versionHistory: pushVersionSnapshot(state.versionHistory, nextWorkspace, eventLabel ?? response.message, state.workspace),
      recentUserEvents: eventLabel ? [...state.recentUserEvents, eventLabel].slice(-12) : state.recentUserEvents,
      saveState: "dirty",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    const state = get();
    set({
      messages: [
        ...state.messages,
        { id: createId("message_error"), role: "system", text: `操作未通过校验：${message}`, createdAt: nowIso() },
      ],
    });
  }
}

function previewResponse(response: AgentResponse, set: StoreSet, get: StoreGet, eventLabel?: string) {
  try {
    const state = get();
    const baseWorkspace = state.userEditBase ?? state.workspace;
    const nextWorkspace = applyOperations(baseWorkspace, response.operations, "user");

    set({
      workspace: nextWorkspace,
      userEditBase: state.userEditBase ?? baseWorkspace,
      userEditLabel: eventLabel ?? state.userEditLabel,
      saveState: "dirty",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    const state = get();
    set({
      messages: [
        ...state.messages,
        { id: createId("message_error"), role: "system", text: `操作未通过校验：${message}`, createdAt: nowIso() },
      ],
      userEditBase: null,
      userEditLabel: null,
    });
  }
}

function describePatch(workspace: Workspace, nodeId: string, patch: Record<string, unknown>): string {
  const node = getActivePage(workspace).nodes.find((item: CanvasNode) => item.id === nodeId);
  const nodeName = node?.name ?? nodeId;
  const firstPath = Object.keys(patch)[0];
  const from = firstPath && node ? getAtPath(node as unknown as Record<string, unknown>, firstPath) : undefined;
  return `${nodeName} 更新 ${firstPath}: ${String(from)} -> ${String(patch[firstPath])}`;
}

function commitWorkspaceState(state: WorkspaceState, nextWorkspace: Workspace, label: string): Partial<WorkspaceState> {
  return {
    workspace: nextWorkspace,
    past: [...state.past, state.workspace].slice(-40),
    future: [],
    versionHistory: pushVersionSnapshot(state.versionHistory, nextWorkspace, label, state.workspace),
    userEditBase: null,
    userEditLabel: null,
    saveState: "dirty",
  };
}

function pushVersionSnapshot(
  history: VersionSnapshot[],
  workspace: Workspace,
  label: string,
  previousWorkspace: Workspace | null,
): VersionSnapshot[] {
  return [...history, createVersionSnapshot(workspace, label, previousWorkspace)].slice(-40);
}

function createVersionSnapshot(workspace: Workspace, label: string, previousWorkspace: Workspace | null): VersionSnapshot {
  return {
    id: createId("version"),
    version: workspace.version,
    label,
    createdAt: nowIso(),
    workspace: structuredClone(workspace),
    diff: diffWorkspaces(previousWorkspace, workspace),
  };
}

function migrateLegacyWorkspace(workspace: Workspace): Workspace {
  return {
    ...workspace,
    pages: workspace.pages.map((page) => ({
      ...page,
      nodes: page.nodes.map((node) => {
        if ((node.type as string) !== "flowchart") return node;
        return {
          ...node,
          type: "mermaid",
          props: migrateFlowchartProps(node.props),
        };
      }),
    })),
  };
}

function migrateFlowchartProps(props: Record<string, unknown>): Record<string, unknown> {
  if (typeof props.source === "string" && props.source.trim()) {
    return {
      ...props,
      diagramType: typeof props.diagramType === "string" ? props.diagramType : "flowchart",
      theme: props.theme === "default" ? "default" : "neutral",
    };
  }

  const steps = Array.isArray(props.steps) ? props.steps.map((step) => String(step).trim()).filter(Boolean) : [];
  const source =
    steps.length > 0
      ? ["flowchart TD", ...steps.map((step, index) => `  N${index + 1}[${escapeMermaidLabel(step)}]${index < steps.length - 1 ? ` --> N${index + 2}` : ""}`)].join("\n")
      : "flowchart TD\n  A[Input] --> B[Process]\n  B --> C[Output]";

  return {
    title: props.title,
    diagramType: "flowchart",
    theme: "neutral",
    source,
  };
}

function escapeMermaidLabel(label: string): string {
  return label.replace(/[\[\]]/g, "");
}

function diffWorkspaces(previousWorkspace: Workspace | null, nextWorkspace: Workspace): VersionSnapshot["diff"] {
  if (!previousWorkspace) {
    return {
      nodesAdded: countNodes(nextWorkspace),
      nodesRemoved: 0,
      nodesUpdated: 0,
      edgesAdded: countEdges(nextWorkspace),
      edgesRemoved: 0,
      variablesChanged: Object.keys(nextWorkspace.variables).length,
    };
  }

  const previousNodes = flattenNodes(previousWorkspace);
  const nextNodes = flattenNodes(nextWorkspace);
  const previousEdges = flattenEdges(previousWorkspace);
  const nextEdges = flattenEdges(nextWorkspace);
  let nodesAdded = 0;
  let nodesRemoved = 0;
  let nodesUpdated = 0;
  let edgesAdded = 0;
  let edgesRemoved = 0;

  nextNodes.forEach((node, nodeId) => {
    const previous = previousNodes.get(nodeId);
    if (!previous) {
      nodesAdded += 1;
      return;
    }
    if (JSON.stringify(previous) !== JSON.stringify(node)) nodesUpdated += 1;
  });
  previousNodes.forEach((_node, nodeId) => {
    if (!nextNodes.has(nodeId)) nodesRemoved += 1;
  });
  nextEdges.forEach((_edge, edgeId) => {
    if (!previousEdges.has(edgeId)) edgesAdded += 1;
  });
  previousEdges.forEach((_edge, edgeId) => {
    if (!nextEdges.has(edgeId)) edgesRemoved += 1;
  });

  return {
    nodesAdded,
    nodesRemoved,
    nodesUpdated,
    edgesAdded,
    edgesRemoved,
    variablesChanged: countChangedVariables(previousWorkspace, nextWorkspace),
  };
}

function flattenNodes(workspace: Workspace): Map<string, CanvasNode> {
  return new Map(workspace.pages.flatMap((page) => page.nodes.map((node) => [node.id, node] as const)));
}

function flattenEdges(workspace: Workspace) {
  return new Map(workspace.pages.flatMap((page) => page.edges.map((edge) => [edge.id, edge] as const)));
}

function countNodes(workspace: Workspace) {
  return workspace.pages.reduce((total, page) => total + page.nodes.length, 0);
}

function countEdges(workspace: Workspace) {
  return workspace.pages.reduce((total, page) => total + page.edges.length, 0);
}

function countChangedVariables(previousWorkspace: Workspace, nextWorkspace: Workspace) {
  const keys = new Set([...Object.keys(previousWorkspace.variables), ...Object.keys(nextWorkspace.variables)]);
  let changed = 0;
  keys.forEach((key) => {
    if (JSON.stringify(previousWorkspace.variables[key]) !== JSON.stringify(nextWorkspace.variables[key])) {
      changed += 1;
    }
  });
  return changed;
}
