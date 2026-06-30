import type { CanvasNode } from "../workspace/workspaceTypes";
import { componentRegistry } from "../components-registry/registry";

export function CanvasNodeContent({ node }: { node: CanvasNode }) {
  const definition = componentRegistry[node.type];
  const Renderer = definition?.Renderer;

  if (!Renderer) {
    return <div className="empty-node">未注册组件</div>;
  }

  return <Renderer node={node} />;
}
