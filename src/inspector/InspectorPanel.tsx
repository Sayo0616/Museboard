import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { PropertyField } from "./PropertyField";
import { componentRegistry } from "../components-registry/registry";
import { composeMarkdownSource, splitMarkdownSource } from "../components-registry/markdown";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { getActivePage } from "../workspace/workspaceSelectors";
import type { CanvasNode } from "../workspace/workspaceTypes";
import type { AgentResponse } from "../agent/agentProtocol";
import { getAtPath } from "../utils/patch";

export function InspectorPanel() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const activeNodeId = useWorkspaceStore((state) => state.activeNodeId);
  const activeEdgeId = useWorkspaceStore((state) => state.activeEdgeId);
  const beginUserEdit = useWorkspaceStore((state) => state.beginUserEdit);
  const previewUserEdit = useWorkspaceStore((state) => state.previewUserEdit);
  const commitUserEdit = useWorkspaceStore((state) => state.commitUserEdit);
  const cancelUserEdit = useWorkspaceStore((state) => state.cancelUserEdit);
  const updateNode = useWorkspaceStore((state) => state.updateNode);
  const deleteEdgesForSelection = useWorkspaceStore((state) => state.deleteEdgesForSelection);
  const activePage = getActivePage(workspace);
  const selectedNode = activePage.nodes.find((node) => node.id === activeNodeId);
  const selectedEdge = activePage.edges.find((edge) => edge.id === activeEdgeId);

  if (!selectedNode && selectedEdge) {
    const source = activePage.nodes.find((node) => node.id === selectedEdge.sourceNodeId);
    const target = activePage.nodes.find((node) => node.id === selectedEdge.targetNodeId);

    return (
      <section className="inspector-panel">
        <div className="panel-title">
          <SlidersHorizontal size={15} />
          <span>连接</span>
        </div>

        <div className="selected-summary">
          <strong>{selectedEdge.label ?? selectedEdge.id}</strong>
          <span>{selectedEdge.type}</span>
        </div>

        <div className="edge-inspector">
          <dl>
            <div>
              <dt>起点</dt>
              <dd>{source?.name ?? selectedEdge.sourceNodeId}</dd>
            </div>
            <div>
              <dt>终点</dt>
              <dd>{target?.name ?? selectedEdge.targetNodeId}</dd>
            </div>
            <div>
              <dt>ID</dt>
              <dd>{selectedEdge.id}</dd>
            </div>
          </dl>
          <button className="permission-toggle" type="button" onClick={deleteEdgesForSelection}>
            删除连接
          </button>
        </div>
      </section>
    );
  }

  if (!selectedNode) {
    return (
      <section className="inspector-panel empty">
        <div className="panel-title">
          <SlidersHorizontal size={15} />
          <span>属性</span>
        </div>
        <p>选择画板对象后编辑结构化属性。</p>
      </section>
    );
  }

  const definition = componentRegistry[selectedNode.type];
  const fieldBindings = (path: string, label?: string, parse?: (value: string | number) => unknown) => {
    const eventLabel = label ?? `${selectedNode.name} 更新 ${path}`;
    return {
      onEditStart: () => beginUserEdit(eventLabel),
      onPreview: (value: string | number) =>
        previewUserEdit(
          {
            message: "本地更新",
            operations: [{ type: "update_node", nodeId: selectedNode.id, patch: { [path]: parse ? parse(value) : value } }],
          },
          eventLabel,
        ),
      onCommit: () => commitUserEdit(eventLabel),
      onCancel: cancelUserEdit,
    };
  };

  if (selectedNode.type === "text") {
    return (
      <TextNodeInspector
        node={selectedNode}
        onEditStart={beginUserEdit}
        onPreview={previewUserEdit}
        onCommit={commitUserEdit}
        onCancel={cancelUserEdit}
        fieldBindings={fieldBindings}
      />
    );
  }

  return (
    <section className="inspector-panel">
      <div className="panel-title">
        <SlidersHorizontal size={15} />
        <span>属性</span>
      </div>

      <div className="selected-summary">
        <strong>{selectedNode.name}</strong>
        <span>{definition.displayName}</span>
      </div>

      <PropertyField
        label="名称"
        value={selectedNode.name}
        {...fieldBindings("name", `${selectedNode.name} 名称已更新`)}
      />

      <div className="property-grid">
        <PropertyField label="宽" type="number" min={80} value={selectedNode.position.width} {...fieldBindings("position.width")} />
        <PropertyField label="高" type="number" min={48} value={selectedNode.position.height} {...fieldBindings("position.height")} />
      </div>

      <div className="inspector-divider" />

      <div className="inspector-fields">
        {definition.Inspector.map((field) => {
          const rawValue = getAtPath(selectedNode as unknown as Record<string, unknown>, field.path);
          const eventLabel = `${selectedNode.name} 更新 ${field.label}`;

          if (field.type === "textarea") {
            return (
              <label className="property-field" key={field.path}>
                <span>{field.label}</span>
                <textarea
                  value={formatInspectorValue(rawValue)}
                  onFocus={() => beginUserEdit(eventLabel)}
                  onChange={(event) =>
                    previewUserEdit(
                      {
                        message: "本地更新",
                        operations: [
                          {
                            type: "update_node",
                            nodeId: selectedNode.id,
                            patch: { [field.path]: parseInspectorValue(field.path, event.target.value, rawValue) },
                          },
                        ],
                      },
                      eventLabel,
                    )
                  }
                  onBlur={() => commitUserEdit(eventLabel)}
                />
              </label>
            );
          }

          if (field.type === "select") {
            return (
              <label className="property-field" key={field.path}>
                <span>{field.label}</span>
                <select
                  value={String(rawValue ?? field.options[0] ?? "")}
                  onChange={(event) => updateNode(selectedNode.id, { [field.path]: event.target.value }, eventLabel)}
                >
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            );
          }

          const binding = fieldBindings(
            field.path,
            eventLabel,
            (value) => parseInspectorValue(field.path, value, rawValue),
          );

          return (
            <PropertyField
              key={field.path}
              label={field.label}
              type={field.type}
              min={field.min}
              max={field.max}
              value={formatInspectorValue(rawValue)}
              {...binding}
            />
          );
        })}
      </div>

      <div className="inspector-divider" />

      <div className="permissions-panel">
        <span>权限状态</span>
        <dl>
          <div>
            <dt>用户编辑</dt>
            <dd>{selectedNode.permissions?.userEditable === false ? "关闭" : "允许"}</dd>
          </div>
          <div>
            <dt>Agent 修改</dt>
            <dd>{selectedNode.permissions?.agentEditable === false ? "锁定" : "允许"}</dd>
          </div>
          <div>
            <dt>可删除</dt>
            <dd>{selectedNode.permissions?.deletable === false ? "关闭" : "允许"}</dd>
          </div>
        </dl>
        <button
          className="permission-toggle"
          type="button"
          onClick={() =>
            updateNode(
              selectedNode.id,
              {
                "permissions.userEditable": selectedNode.permissions?.userEditable ?? true,
                "permissions.agentEditable": selectedNode.permissions?.agentEditable === false,
                "permissions.deletable": selectedNode.permissions?.deletable ?? true,
              },
              selectedNode.permissions?.agentEditable === false ? `${selectedNode.name} 已解锁 Agent 修改` : `${selectedNode.name} 已锁定 Agent 修改`,
            )
          }
        >
          {selectedNode.permissions?.agentEditable === false ? "解锁 Agent 修改" : "锁定 Agent 修改"}
        </button>
      </div>

      <div className="context-summary">
        <span>Agent 上下文摘要</span>
        <p>{definition.getContextSummary(selectedNode)}</p>
      </div>
    </section>
  );
}

type TextNodeInspectorProps = {
  node: CanvasNode;
  onEditStart: (eventLabel?: string) => void;
  onPreview: (response: AgentResponse, eventLabel?: string) => void;
  onCommit: (eventLabel?: string) => void;
  onCancel: () => void;
  fieldBindings: (path: string, label?: string, parse?: (value: string | number) => unknown) => {
    onEditStart: () => void;
    onPreview: (value: string | number) => void;
    onCommit: (value: string | number) => void;
    onCancel: () => void;
  };
};

function TextNodeInspector({ node, onEditStart, onPreview, onCommit, onCancel, fieldBindings }: TextNodeInspectorProps) {
  const markdownValue = composeMarkdownSource(node);
  const [draft, setDraft] = useState(markdownValue);
  const isEditingRef = useRef(false);
  const eventLabel = `${node.name} Markdown 已更新`;

  useEffect(() => {
    if (!isEditingRef.current) {
      setDraft(markdownValue);
    }
  }, [markdownValue]);

  const previewMarkdown = (value: string) => {
    const parsed = splitMarkdownSource(value);
    onPreview(
      {
        message: "本地更新",
        operations: [
          {
            type: "update_node",
            nodeId: node.id,
            patch: {
              "props.title": parsed.title,
              "props.text": parsed.text,
            },
          },
        ],
      },
      eventLabel,
    );
  };

  const beginMarkdownEdit = () => {
    if (isEditingRef.current) return;
    isEditingRef.current = true;
    onEditStart(eventLabel);
  };

  const commitMarkdownEdit = () => {
    if (!isEditingRef.current) return;
    isEditingRef.current = false;
    previewMarkdown(draft);
    onCommit(eventLabel);
  };

  const cancelMarkdownEdit = () => {
    isEditingRef.current = false;
    setDraft(markdownValue);
    onCancel();
  };

  return (
    <section className="inspector-panel text-inspector">
      <div className="panel-title">
        <SlidersHorizontal size={15} />
        <span>属性</span>
      </div>

      <div className="property-grid">
        <PropertyField label="宽" type="number" min={80} value={node.position.width} {...fieldBindings("position.width")} />
        <PropertyField label="高" type="number" min={48} value={node.position.height} {...fieldBindings("position.height")} />
      </div>

      <label className="property-field text-markdown-field">
        <span>文本</span>
        <textarea
          value={draft}
          onFocus={beginMarkdownEdit}
          onChange={(event) => {
            beginMarkdownEdit();
            const nextDraft = event.target.value;
            setDraft(nextDraft);
            previewMarkdown(nextDraft);
          }}
          onBlur={commitMarkdownEdit}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              commitMarkdownEdit();
              event.currentTarget.blur();
            }

            if (event.key === "Escape") {
              event.preventDefault();
              cancelMarkdownEdit();
              event.currentTarget.blur();
            }
          }}
        />
      </label>
    </section>
  );
}

function formatInspectorValue(value: unknown): string | number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (value.every((item) => Array.isArray(item))) {
      return value.map((row) => (row as unknown[]).join(", ")).join("\n");
    }
    return value.join(", ");
  }
  if (value === null || typeof value === "undefined") return "";
  return String(value);
}

function parseInspectorValue(path: string, value: string | number, previousValue: unknown): unknown {
  if (typeof previousValue === "number") return Number(value);
  if (!Array.isArray(previousValue)) return value;

  const text = String(value);
  if (path.endsWith(".data")) {
    return text
      .split(/[,\n]/)
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
  }
  if (previousValue.every((item) => Array.isArray(item))) {
    return text
      .split("\n")
      .map((row) => row.split(",").map((cell) => cell.trim()))
      .filter((row) => row.length > 0 && row.some(Boolean));
  }
  return text
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
