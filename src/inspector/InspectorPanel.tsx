import { SlidersHorizontal } from "lucide-react";
import { PropertyField } from "./PropertyField";
import { componentRegistry } from "../components-registry/registry";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { getActivePage } from "../workspace/workspaceSelectors";
import { getAtPath } from "../utils/patch";

export function InspectorPanel() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const selectedNodeIds = useWorkspaceStore((state) => state.selectedNodeIds);
  const beginUserEdit = useWorkspaceStore((state) => state.beginUserEdit);
  const previewUserEdit = useWorkspaceStore((state) => state.previewUserEdit);
  const commitUserEdit = useWorkspaceStore((state) => state.commitUserEdit);
  const cancelUserEdit = useWorkspaceStore((state) => state.cancelUserEdit);
  const updateNode = useWorkspaceStore((state) => state.updateNode);
  const selectedNode = getActivePage(workspace).nodes.find((node) => node.id === selectedNodeIds[0]);

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
        <PropertyField label="X" type="number" value={selectedNode.position.x} {...fieldBindings("position.x")} />
        <PropertyField label="Y" type="number" value={selectedNode.position.y} {...fieldBindings("position.y")} />
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
