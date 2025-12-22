import type { Task, Project } from '../../../shared/types';
import { projectStore } from '../../project-store';

/**
 * Helper function to find task and project by taskId
 * Searches across all registered projects for a task matching the given ID.
 *
 * @param taskId - The task ID or spec ID to search for
 * @returns The task and its project, or undefined values if not found
 */
export const findTaskAndProject = (taskId: string): { task: Task | undefined; project: Project | undefined } => {
  const projects = projectStore.getProjects();
  let task: Task | undefined;
  let project: Project | undefined;

  // Debug logging to help diagnose "Task not found" issues
  console.log(`[findTaskAndProject] Searching for task: ${taskId}`);
  console.log(`[findTaskAndProject] Searching across ${projects.length} projects`);

  for (const p of projects) {
    const tasks = projectStore.getTasks(p.id);
    console.log(`[findTaskAndProject] Project "${p.name}" (${p.path}): ${tasks.length} tasks`);

    task = tasks.find((t) => t.id === taskId || t.specId === taskId);
    if (task) {
      project = p;
      console.log(`[findTaskAndProject] Found task in project: ${p.name}`);
      break;
    }
  }

  if (!task) {
    console.warn(`[findTaskAndProject] Task not found: ${taskId}`);
    console.warn(`[findTaskAndProject] Projects searched:`, projects.map(p => ({
      name: p.name,
      path: p.path,
      autoBuildPath: p.autoBuildPath
    })));
  }

  return { task, project };
};

/**
 * Helper function to find parent task of a child task
 */
export const findParentTask = (task: Task, projectId: string): Task | undefined => {
  if (!task.parentTaskId) return undefined;
  const tasks = projectStore.getTasks(projectId);
  return tasks.find((t) => t.id === task.parentTaskId);
};

/**
 * Helper function to find all sibling tasks (same parent)
 */
export const findSiblingTasks = (task: Task, projectId: string): Task[] => {
  if (!task.parentTaskId) return [];
  const tasks = projectStore.getTasks(projectId);
  return tasks.filter((t) => t.parentTaskId === task.parentTaskId);
};

/**
 * Helper function to find all child tasks of a parent
 */
export const findChildTasks = (parentTaskId: string, projectId: string): Task[] => {
  const tasks = projectStore.getTasks(projectId);
  return tasks.filter((t) => t.parentTaskId === parentTaskId);
};

/**
 * Check if a task has children
 */
export const taskHasChildren = (taskId: string, projectId: string): boolean => {
  const children = findChildTasks(taskId, projectId);
  return children.length > 0;
};

/**
 * Check if all sibling tasks (including this one) are complete
 */
export const allSiblingsComplete = (task: Task, projectId: string): boolean => {
  const siblings = findSiblingTasks(task, projectId);
  if (siblings.length === 0) return false;
  return siblings.every((t) => t.status === 'done');
};

/**
 * Check if all children of a parent task are complete
 */
export const allChildrenComplete = (parentTaskId: string, projectId: string): boolean => {
  const children = findChildTasks(parentTaskId, projectId);
  if (children.length === 0) return false;
  return children.every((t) => t.status === 'done');
};
