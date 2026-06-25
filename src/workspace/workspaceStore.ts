import { create } from "zustand";
import type { AgentResponse } from "../agent/agentProtocol";
import { runLocalAgent } from "../agent/agentClient";
import { buildWorkspaceContext } from "./contextBuilder";
import { applyOperations, isDestructiveOperation, validateAgentResponse } from "./operationEngine";
import { initialWorkspace } from "./initialWorkspace";
import type { ChatMessage, CanvasNode, Workspace, WorkspaceMode } from "./workspaceTypes";
import { createId, nowIso } from "../utils/id";
import { getAtPath } from "../utils/patch";

const storageKey = "museboard.workspace";

type OperationActor = "agent" | "user";

type WorkspaceState = {
  workspace: Workspace;
  selectedNodeIds: string[];
  messages: ChatMessage[];
  recentUserEvents: string[];
  mode: WorkspaceMode;
  pendingResponse: AgentResponse | null;
  past: Workspace[];
  future: Workspace[];
  saveState: "saved" | "dirty";
  selectNode: (nodeId: string | null, append?: boolean) => void;
  setMode: (mode: WorkspaceMode) => void;
  updateNode: (nodeId: string, patch: Record<string, unknown>, eventLabel?: string) => void;
  moveNode: (nodeId: string, x: number, y: number) => void;
  resizeNode: (nodeId: string, x: number, y: number, width: number, height: number) => void;
  submitMessage: (text: string) => Promise<void>;
  applyAgentResponse: (response: AgentResponse) => void;
  acceptPendingResponse: () => void;
  discardPendingResponse: () => void;
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
  pendingResponse: null,
  past: [],
  future: [],
  saveState: "dirty",
  selectNode: (nodeId, append = false) => {
    set((state) => {
      if (!nodeId) return { selectedNodeIds: [] };
      if (append) {
        const exists = state.selectedNodeIds.includes(nodeId);
        return {
          selectedNodeIds: exists
            ? state.selectedNodeIds.filter((id) => id !== nodeId)
            : [...state.selectedNodeIds, nodeId],
        };
      }
      return { selectedNodeIds: [nodeId] };
    });
  },
  setMode: (mode) => set({ mode }),
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
      const context = buildWorkspaceContext(get().workspace, get().selectedNodeIds, get().recentUserEvents);
      const response = validateAgentResponse(await runLocalAgent(trimmed, context));
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
    const requiresConfirmation =
      safeResponse.requiresConfirmation ?? safeResponse.operations.some((operation) => isDestructiveOperation(operation));

    if (requiresConfirmation) {
      set((state) => ({
        pendingResponse: safeResponse,
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
  undo: () => {
    set((state) => {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        workspace: previous,
        past: state.past.slice(0, -1),
        future: [state.workspace, ...state.future],
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
    const workspace = JSON.parse(raw) as Workspace;
    set((state) => ({
      workspace,
      past: [...state.past, state.workspace],
      future: [],
      saveState: "saved",
      selectedNodeIds: [],
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

function describePatch(workspace: Workspace, nodeId: string, patch: Record<string, unknown>): string {
  const node = workspace.pages[0].nodes.find((item: CanvasNode) => item.id === nodeId);
  const nodeName = node?.name ?? nodeId;
  const firstPath = Object.keys(patch)[0];
  const from = firstPath && node ? getAtPath(node as unknown as Record<string, unknown>, firstPath) : undefined;
  return `${nodeName} 更新 ${firstPath}: ${String(from)} -> ${String(patch[firstPath])}`;
}
