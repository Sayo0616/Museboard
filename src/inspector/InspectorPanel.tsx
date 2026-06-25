import { SlidersHorizontal } from "lucide-react";
import { PropertyField } from "./PropertyField";
import { componentRegistry } from "../components-registry/registry";
import { useWorkspaceStore } from "../workspace/workspaceStore";

export function InspectorPanel() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const selectedNodeIds = useWorkspaceStore((state) => state.selectedNodeIds);
  const updateNode = useWorkspaceStore((state) => state.updateNode);
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
        onChange={(value) => updateNode(selectedNode.id, { name: String(value) }, `${selectedNode.name} 名称已更新`)}
      />

      <div className="property-grid">
        <PropertyField label="X" type="number" value={selectedNode.position.x} onChange={(value) => updateNode(selectedNode.id, { "position.x": Number(value) })} />
        <PropertyField label="Y" type="number" value={selectedNode.position.y} onChange={(value) => updateNode(selectedNode.id, { "position.y": Number(value) })} />
        <PropertyField label="宽" type="number" value={selectedNode.position.width} onChange={(value) => updateNode(selectedNode.id, { "position.width": Number(value) })} />
        <PropertyField label="高" type="number" value={selectedNode.position.height} onChange={(value) => updateNode(selectedNode.id, { "position.height": Number(value) })} />
      </div>

      <div className="inspector-divider" />

      {selectedNode.type === "slider" ? (
        <>
          <PropertyField label="标签" value={String(selectedNode.props.label ?? "")} onChange={(value) => updateNode(selectedNode.id, { "props.label": String(value) })} />
          <div className="property-grid">
            <PropertyField label="最小" type="number" value={Number(selectedNode.props.min ?? 0)} onChange={(value) => updateNode(selectedNode.id, { "props.min": Number(value) })} />
            <PropertyField label="最大" type="number" value={Number(selectedNode.props.max ?? 100)} onChange={(value) => updateNode(selectedNode.id, { "props.max": Number(value) })} />
            <PropertyField label="步长" type="number" value={Number(selectedNode.props.step ?? 1)} onChange={(value) => updateNode(selectedNode.id, { "props.step": Number(value) })} />
            <PropertyField label="当前" type="number" value={Number(selectedNode.props.value ?? 0)} onChange={(value) => updateNode(selectedNode.id, { "props.value": Number(value) })} />
          </div>
        </>
      ) : null}

      {selectedNode.type === "chart" ? (
        <>
          <PropertyField label="标题" value={String(selectedNode.props.title ?? "")} onChange={(value) => updateNode(selectedNode.id, { "props.title": String(value) })} />
          <PropertyField label="类型" value={String(selectedNode.props.chartType ?? "bar")} onChange={(value) => updateNode(selectedNode.id, { "props.chartType": String(value) })} />
        </>
      ) : null}

      {selectedNode.type === "text" || selectedNode.type === "context_note" || selectedNode.type === "agent_plan" ? (
        <>
          <PropertyField label="标题" value={String(selectedNode.props.title ?? "")} onChange={(value) => updateNode(selectedNode.id, { "props.title": String(value) })} />
          <label className="property-field">
            <span>文本</span>
            <textarea
              value={String(selectedNode.props.text ?? "")}
              onChange={(event) => updateNode(selectedNode.id, { "props.text": event.target.value })}
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
