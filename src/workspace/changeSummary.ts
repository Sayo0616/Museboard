import type { WorkspaceOperation } from "../agent/agentProtocol";

export type ChangeSummary = {
  created: number;
  updated: number;
  moved: number;
  deleted: number;
  variables: number;
  edges: number;
};

export function summarizeOperations(operations: WorkspaceOperation[]): ChangeSummary {
  return operations.reduce<ChangeSummary>(
    (summary, operation) => {
      switch (operation.type) {
        case "create_node":
          summary.created += 1;
          break;
        case "update_node":
        case "group_nodes":
          summary.updated += 1;
          break;
        case "move_node":
          summary.moved += 1;
          break;
        case "delete_node":
          summary.deleted += 1;
          break;
        case "set_variable":
          summary.variables += 1;
          break;
        case "create_edge":
        case "delete_edge":
          summary.edges += 1;
          break;
        default:
          break;
      }
      return summary;
    },
    { created: 0, updated: 0, moved: 0, deleted: 0, variables: 0, edges: 0 },
  );
}
