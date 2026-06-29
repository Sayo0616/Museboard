import { SlidersHorizontal } from "lucide-react";
import { PropertyField } from "./PropertyField";
import { componentRegistry } from "../components-registry/registry";
import { useWorkspaceStore } from "../workspace/workspaceStore";

export function InspectorPanel() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const selectedNodeIds = useWorkspaceStore((state) => state.selectedNodeIds);
  const beginUserEdit = useWorkspaceStore((state) => state.beginUserEdit);
  const previewUserEdit = useWorkspaceStore((state) => state.previewUserEdit);
  const commitUserEdit = useWorkspaceStore((state) => state.commitUserEdit);
  const cancelUserEdit = useWorkspaceStore((state) => state.cancelUserEdit);
  const selectedNode = workspace.pages[0].nodes.find((node) => node.id === selectedNodeIds[0]);

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
  const fieldBindings = (path: string, label?: string) => {
    const eventLabel = label ?? `${selectedNode.name} 更新 ${path}`;
    return {
      onEditStart: () => beginUserEdit(eventLabel),
      onPreview: (value: string | number) =>
        previewUserEdit(
          {
            message: "本地更新",
            operations: [{ type: "update_node", nodeId: selectedNode.id, patch: { [path]: value } }],
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

      {selectedNode.type === "slider" ? (
        <>
          <PropertyField label="标签" value={String(selectedNode.props.label ?? "")} {...fieldBindings("props.label")} />
          <div className="property-grid">
            <PropertyField label="最小" type="number" value={Number(selectedNode.props.min ?? 0)} {...fieldBindings("props.min")} />
            <PropertyField label="最大" type="number" value={Number(selectedNode.props.max ?? 100)} {...fieldBindings("props.max")} />
            <PropertyField label="步长" type="number" min={Number.EPSILON} value={Number(selectedNode.props.step ?? 1)} {...fieldBindings("props.step")} />
            <PropertyField
              label="当前"
              type="number"
              min={Number(selectedNode.props.min ?? 0)}
              max={Number(selectedNode.props.max ?? 100)}
              value={Number(selectedNode.props.value ?? 0)}
              {...fieldBindings("props.value")}
            />
          </div>
        </>
      ) : null}

      {selectedNode.type === "chart" ? (
        <>
          <PropertyField label="标题" value={String(selectedNode.props.title ?? "")} {...fieldBindings("props.title")} />
          <PropertyField label="类型" value={String(selectedNode.props.chartType ?? "bar")} {...fieldBindings("props.chartType")} />
        </>
      ) : null}

      {selectedNode.type === "text" || selectedNode.type === "context_note" || selectedNode.type === "agent_plan" ? (
        <>
          <PropertyField label="标题" value={String(selectedNode.props.title ?? "")} {...fieldBindings("props.title")} />
          <label className="property-field">
            <span>文本</span>
            <textarea
              value={String(selectedNode.props.text ?? "")}
              onFocus={() => beginUserEdit(`${selectedNode.name} 文本已更新`)}
              onChange={(event) =>
                previewUserEdit(
                  {
                    message: "本地更新",
                    operations: [{ type: "update_node", nodeId: selectedNode.id, patch: { "props.text": event.target.value } }],
                  },
                  `${selectedNode.name} 文本已更新`,
                )
              }
              onBlur={() => commitUserEdit(`${selectedNode.name} 文本已更新`)}
            />
          </label>
        </>
      ) : null}

      <div className="context-summary">
        <span>Agent 上下文摘要</span>
        <p>{definition.getContextSummary(selectedNode)}</p>
      </div>
    </section>
  );
}
