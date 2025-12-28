import type { Task } from '../../shared/types/task';

export interface DependencyValidationResult {
  valid: boolean;
  error?: string;
}

export interface DependencyCheckResult {
  ready: boolean;
  reason?: string;
}

export interface DependencyStatusResult {
  total: number;
  met: number;
  unmet: number;
  deleted: number;
  unmetTasks: string[];
  deletedIds: string[];
}

/**
 * Validate dependencies for a task
 * Checks for:
 * - Circular dependencies
 * - Duplicate dependencies
 * - Invalid task IDs
 */
export function validateDependencies(
  taskId: string,
  dependsOn: string[],
  allTasks: Task[]
): DependencyValidationResult {
  // Check for empty dependencies
  if (!dependsOn || dependsOn.length === 0) {
    return { valid: true };
  }

  // Check for duplicate dependencies
  const uniqueDeps = new Set(dependsOn);
  if (uniqueDeps.size !== dependsOn.length) {
    return {
      valid: false,
      error: 'Duplicate dependencies detected. Please remove duplicates.',
    };
  }

  // Check for self-dependency
  if (dependsOn.includes(taskId)) {
    return {
      valid: false,
      error: 'A task cannot depend on itself.',
    };
  }

  // Check for circular dependencies
  const circularDep = findCircularDependency(taskId, dependsOn, allTasks);
  if (circularDep) {
    return {
      valid: false,
      error: `Circular dependency detected: ${circularDep.join(' → ')}`,
    };
  }

  // Warn about non-existent tasks (but don't block - they might be created later)
  const missingTasks = dependsOn.filter(
    depId => !allTasks.find(t => t.id === depId || t.specId === depId)
  );

  if (missingTasks.length > 0) {
    return {
      valid: false,
      error: `The following task IDs do not exist: ${missingTasks.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Find circular dependencies using Depth-First Search (DFS)
 * Returns the circular path if found, or null if no cycles
 */
export function findCircularDependency(
  taskId: string,
  dependsOn: string[],
  allTasks: Task[]
): string[] | null {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(currentId: string, path: string[]): string[] | null {
    // If we've hit the original task, we have a cycle
    if (currentId === taskId && path.length > 0) {
      return [...path, taskId];
    }

    // If we're in the recursion stack, we have a cycle
    if (recursionStack.has(currentId)) {
      return [...path, currentId];
    }

    // If we've already visited this node and it's not in recursion stack, no cycle from here
    if (visited.has(currentId)) {
      return null;
    }

    visited.add(currentId);
    recursionStack.add(currentId);

    // Find the task and check its dependencies
    const task = allTasks.find(t => t.id === currentId || t.specId === currentId);
    const dependencies = task?.dependsOn || (currentId === taskId ? dependsOn : []);

    for (const depId of dependencies) {
      const result = dfs(depId, [...path, currentId]);
      if (result) {
        return result;
      }
    }

    recursionStack.delete(currentId);
    return null;
  }

  // Check all direct dependencies
  for (const depId of dependsOn) {
    const result = dfs(depId, [taskId]);
    if (result) {
      return result;
    }
  }

  return null;
}

/**
 * Check if all dependencies for a task are met
 * Dependencies are met if:
 * 1. The task exists
 * 2. The task is merged (stagedInMainProject = true)
 */
export function checkDependenciesMet(
  task: Task,
  allTasks: Task[]
): DependencyCheckResult {
  if (!task.dependsOn || task.dependsOn.length === 0) {
    return { ready: true };
  }

  const unmetDeps: string[] = [];
  const deletedDeps: string[] = [];

  for (const depId of task.dependsOn) {
    const depTask = allTasks.find(t => t.id === depId || t.specId === depId);

    if (!depTask) {
      deletedDeps.push(depId);
      continue;
    }

    // Dependency must be merged (stagedInMainProject = true)
    if (!depTask.stagedInMainProject) {
      unmetDeps.push(depTask.title || depTask.specId);
    }
  }

  if (deletedDeps.length > 0) {
    return {
      ready: false,
      reason: `Dependency deleted: ${deletedDeps.join(', ')}. Remove this dependency to unblock.`,
    };
  }

  if (unmetDeps.length > 0) {
    return {
      ready: false,
      reason: `Waiting for ${unmetDeps.length} ${unmetDeps.length === 1 ? 'dependency' : 'dependencies'} to be merged: ${unmetDeps.join(', ')}`,
    };
  }

  return { ready: true };
}

/**
 * Get detailed dependency status for a task
 */
export function getDependencyStatus(
  task: Task,
  allTasks: Task[]
): DependencyStatusResult {
  if (!task.dependsOn || task.dependsOn.length === 0) {
    return {
      total: 0,
      met: 0,
      unmet: 0,
      deleted: 0,
      unmetTasks: [],
      deletedIds: [],
    };
  }

  const unmetTasks: string[] = [];
  const deletedIds: string[] = [];
  let metCount = 0;

  for (const depId of task.dependsOn) {
    const depTask = allTasks.find(t => t.id === depId || t.specId === depId);

    if (!depTask) {
      deletedIds.push(depId);
      continue;
    }

    if (depTask.stagedInMainProject) {
      metCount++;
    } else {
      unmetTasks.push(depTask.title || depTask.specId);
    }
  }

  return {
    total: task.dependsOn.length,
    met: metCount,
    unmet: unmetTasks.length,
    deleted: deletedIds.length,
    unmetTasks,
    deletedIds,
  };
}

/**
 * Get count of unmet dependencies for a task
 */
export function getUnmetDependenciesCount(task: Task, allTasks: Task[]): number {
  const status = getDependencyStatus(task, allTasks);
  return status.unmet + status.deleted;
}

/**
 * Get human-readable dependency summary for display
 */
export function getDependencySummary(task: Task, allTasks: Task[]): string {
  if (!task.dependsOn || task.dependsOn.length === 0) {
    return 'No dependencies';
  }

  const status = getDependencyStatus(task, allTasks);

  if (status.deleted > 0) {
    return `${status.deleted} deleted`;
  }

  if (status.unmet === 0) {
    return `All ${status.total} met`;
  }

  return `${status.met}/${status.total} met`;
}
