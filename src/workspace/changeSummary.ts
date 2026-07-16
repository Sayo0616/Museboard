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
        case "create_object":
        case "create_view":
          summary.created += 1;
          break;
        case "update_node":
        case "update_object":
        case "update_view":
        case "update_view_layout":
        case "update_relation":
        case "group_nodes":
          summary.updated += 1;
          break;
        case "move_node":
        case "place_object_in_view":
        case "remove_object_from_view":
          summary.moved += 1;
          break;
        case "delete_node":
        case "delete_object":
        case "delete_view":
          summary.deleted += 1;
          break;
        case "set_variable":
          summary.variables += 1;
          break;
        case "create_edge":
        case "delete_edge":
        case "create_relation":
        case "delete_relation":
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
