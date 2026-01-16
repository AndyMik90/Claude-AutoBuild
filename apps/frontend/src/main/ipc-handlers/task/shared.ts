import type { Task, Project } from '../../../shared/types';
import { projectStore } from '../../project-store';

/**
 * Generate a spec ID from a spec number and title.
 * Creates a slug by lowercasing, replacing non-alphanumeric chars with dashes,
 * trimming leading/trailing dashes, and limiting to 50 chars.
 *
 * @param specNumber - The numeric spec number (will be zero-padded to 3 digits)
 * @param title - The task title to slugify
 * @returns Spec ID in format "NNN-slug" (e.g., "001-fix-login-bug")
 */
export function generateSpecId(specNumber: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  return `${String(specNumber).padStart(3, '0')}-${slug}`;
}

/**
 * Helper function to find task and project by taskId
 */
export const findTaskAndProject = (taskId: string): { task: Task | undefined; project: Project | undefined } => {
  const projects = projectStore.getProjects();
  let task: Task | undefined;
  let project: Project | undefined;

  for (const p of projects) {
    const tasks = projectStore.getTasks(p.id);
    task = tasks.find((t) => t.id === taskId || t.specId === taskId);
    if (task) {
      project = p;
      break;
    }
  }

  return { task, project };
};
