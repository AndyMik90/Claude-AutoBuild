import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, Dirent } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Project, ProjectSettings, Task, TaskStatus, TaskMetadata, ImplementationPlan, ReviewReason, PlanSubtask } from '../shared/types';
import { DEFAULT_PROJECT_SETTINGS, AUTO_BUILD_PATHS, getSpecsDir } from '../shared/constants';
import { getAutoBuildPath, isInitialized } from './project-initializer';

interface StoreData {
  projects: Project[];
  settings: Record<string, unknown>;
}

/**
 * Persistent storage for projects and settings
 */
export class ProjectStore {
  private storePath: string;
  private data: StoreData;

  constructor() {
    // Store in app's userData directory
    const userDataPath = app.getPath('userData');
    const storeDir = path.join(userDataPath, 'store');

    // Ensure directory exists
    if (!existsSync(storeDir)) {
      mkdirSync(storeDir, { recursive: true });
    }

    this.storePath = path.join(storeDir, 'projects.json');
    this.data = this.load();
  }

  /**
   * Load store from disk
   */
  private load(): StoreData {
    if (existsSync(this.storePath)) {
      try {
        const content = readFileSync(this.storePath, 'utf-8');
        const data = JSON.parse(content);
        // Convert date strings back to Date objects
        data.projects = data.projects.map((p: Project) => ({
          ...p,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt)
        }));
        return data;
      } catch {
        return { projects: [], settings: {} };
      }
    }
    return { projects: [], settings: {} };
  }

  /**
   * Save store to disk
   */
  private save(): void {
    writeFileSync(this.storePath, JSON.stringify(this.data, null, 2));
  }

  /**
   * Add a new project
   */
  addProject(projectPath: string, name?: string): Project {
    // Check if project already exists
    const existing = this.data.projects.find((p) => p.path === projectPath);
    if (existing) {
      return existing;
    }

    // Derive name from path if not provided
    const projectName = name || path.basename(projectPath);

    // Determine auto-claude path (supports both 'auto-claude' and '.auto-claude')
    const autoBuildPath = getAutoBuildPath(projectPath) || '';

    const project: Project = {
      id: uuidv4(),
      name: projectName,
      path: projectPath,
      autoBuildPath,
      settings: { ...DEFAULT_PROJECT_SETTINGS },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.data.projects.push(project);
    this.save();

    return project;
  }

  /**
   * Update project's autoBuildPath after initialization
   */
  updateAutoBuildPath(projectId: string, autoBuildPath: string): Project | undefined {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (project) {
      project.autoBuildPath = autoBuildPath;
      project.updatedAt = new Date();
      this.save();
    }
    return project;
  }

  /**
   * Remove a project
   */
  removeProject(projectId: string): boolean {
    const index = this.data.projects.findIndex((p) => p.id === projectId);
    if (index !== -1) {
      this.data.projects.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Get all projects
   */
  getProjects(): Project[] {
    return this.data.projects;
  }

  /**
   * Validate all projects to ensure their .auto-claude folders still exist.
   * If a project has autoBuildPath set but the folder was deleted,
   * reset autoBuildPath to empty string so the UI prompts for reinitialization.
   *
   * @returns Array of project IDs that were reset due to missing .auto-claude folder
   */
  validateProjects(): string[] {
    const resetProjectIds: string[] = [];
    let hasChanges = false;

    for (const project of this.data.projects) {
      // Skip projects that aren't initialized (autoBuildPath is empty)
      if (!project.autoBuildPath) {
        continue;
      }

      // Check if the project path still exists
      if (!existsSync(project.path)) {
        console.warn(`[ProjectStore] Project path no longer exists: ${project.path}`);
        continue; // Don't reset - let user handle this case
      }

      // Check if .auto-claude folder still exists
      if (!isInitialized(project.path)) {
        console.warn(`[ProjectStore] .auto-claude folder missing for project "${project.name}" at ${project.path}`);
        project.autoBuildPath = '';
        project.updatedAt = new Date();
        resetProjectIds.push(project.id);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.save();
      console.warn(`[ProjectStore] Reset ${resetProjectIds.length} project(s) due to missing .auto-claude folder`);
    }

    return resetProjectIds;
  }

  /**
   * Get a project by ID
   */
  getProject(projectId: string): Project | undefined {
    return this.data.projects.find((p) => p.id === projectId);
  }

  /**
   * Update project settings
   */
  updateProjectSettings(
    projectId: string,
    settings: Partial<ProjectSettings>
  ): Project | undefined {
    const project = this.data.projects.find((p) => p.id === projectId);
    if (project) {
      project.settings = { ...project.settings, ...settings };
      project.updatedAt = new Date();
      this.save();
    }
    return project;
  }

  /**
   * Get tasks for a project by scanning specs directory
   */
  getTasks(projectId: string): Task[] {
    console.warn('[ProjectStore] getTasks called with projectId:', projectId);
    const project = this.getProject(projectId);
    if (!project) {
      console.warn('[ProjectStore] Project not found for id:', projectId);
      return [];
    }
    console.warn('[ProjectStore] Found project:', project.name, 'autoBuildPath:', project.autoBuildPath);

    // Get specs directory path
    const specsBaseDir = getSpecsDir(project.autoBuildPath);
    const specsDir = path.join(project.path, specsBaseDir);
    console.warn('[ProjectStore] specsDir:', specsDir, 'exists:', existsSync(specsDir));
    if (!existsSync(specsDir)) return [];

    const tasks: Task[] = [];
    let specDirs: Dirent[] = [];

    try {
      specDirs = readdirSync(specsDir, { withFileTypes: true });
    } catch (error) {
      console.error('[ProjectStore] Error reading specs directory:', error);
      return [];
    }

    for (const dir of specDirs) {
      if (!dir.isDirectory()) continue;
      if (dir.name === '.gitkeep') continue;

      try {
        const specPath = path.join(specsDir, dir.name);
        const planPath = path.join(specPath, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
        const specFilePath = path.join(specPath, AUTO_BUILD_PATHS.SPEC_FILE);

        // Try to read implementation plan
        let plan: ImplementationPlan | null = null;
        if (existsSync(planPath)) {
          try {
            const content = readFileSync(planPath, 'utf-8');
            plan = JSON.parse(content);
          } catch {
            // Ignore parse errors
          }
        }

        // Try to read spec file for description
        let description = '';
        if (existsSync(specFilePath)) {
          try {
            const content = readFileSync(specFilePath, 'utf-8');
            // Extract first paragraph after "## Overview" - handle both with and without blank line
            const overviewMatch = content.match(/## Overview\s*\n+([^\n#]+)/);
            if (overviewMatch) {
              description = overviewMatch[1].trim();
            }
          } catch {
            // Ignore read errors
          }
        }

        // Fallback: read description from implementation_plan.json if not found in spec.md
        if (!description && plan?.description) {
          description = plan.description;
        }

        // Fallback: read description from requirements.json if still not found
        if (!description) {
          const requirementsPath = path.join(specPath, AUTO_BUILD_PATHS.REQUIREMENTS);
          if (existsSync(requirementsPath)) {
            try {
              const reqContent = readFileSync(requirementsPath, 'utf-8');
              const requirements = JSON.parse(reqContent);
              if (requirements.task_description) {
                // Extract a clean summary from task_description (first line or first ~200 chars)
                const taskDesc = requirements.task_description;
                const firstLine = taskDesc.split('\n')[0].trim();
                // If the first line is a title like "Investigate GitHub Issue #36", use the next meaningful line
                if (firstLine.toLowerCase().startsWith('investigate') && taskDesc.includes('\n\n')) {
                  const sections = taskDesc.split('\n\n');
                  // Find the first paragraph that's not a title
                  for (const section of sections) {
                    const trimmed = section.trim();
                    // Skip headers and short lines
                    if (trimmed.startsWith('#') || trimmed.length < 20) continue;
                    // Skip the "Please analyze" instruction at the end
                    if (trimmed.startsWith('Please analyze')) continue;
                    description = trimmed.substring(0, 200).split('\n')[0];
                    break;
                  }
                }
                // If still no description, use a shortened version of task_description
                if (!description) {
                  description = firstLine.substring(0, 150);
                }
              }
            } catch {
              // Ignore parse errors
            }
          }
        }

        // Try to read task metadata
        const metadataPath = path.join(specPath, 'task_metadata.json');
        let metadata: TaskMetadata | undefined;
        if (existsSync(metadataPath)) {
          try {
            const content = readFileSync(metadataPath, 'utf-8');
            metadata = JSON.parse(content);
          } catch {
            // Ignore parse errors
          }
        }

        // Determine task status and review reason from plan
        const { status, reviewReason } = this.determineTaskStatusAndReason(plan, specPath, metadata);

        // Extract subtasks from plan (handle both 'subtasks' and 'chunks' naming)
        const subtasks = plan?.phases?.flatMap((phase) => {
          const items = phase.subtasks || (phase as { chunks?: PlanSubtask[] }).chunks || [];
          return items.map((subtask) => ({
            id: subtask.id,
            title: subtask.description,
            description: subtask.description,
            status: subtask.status,
            files: []
          }));
        }) || [];

        // Extract staged status from plan (set when changes are merged with --no-commit)
        const planWithStaged = plan as unknown as { stagedInMainProject?: boolean; stagedAt?: string } | null;
        const stagedInMainProject = planWithStaged?.stagedInMainProject;
        const stagedAt = planWithStaged?.stagedAt;

        // Determine title - check if feature looks like a spec ID (e.g., "054-something-something")
        let title = plan?.feature || plan?.title || dir.name;
        const looksLikeSpecId = /^\d{3}-/.test(title);
        if (looksLikeSpecId && existsSync(specFilePath)) {
          try {
            const specContent = readFileSync(specFilePath, 'utf-8');
            // Extract title from first # line, handling patterns like:
            // "# Quick Spec: Title" -> "Title"
            // "# Specification: Title" -> "Title"
            // "# Title" -> "Title"
            const titleMatch = specContent.match(/^#\s+(?:Quick Spec:|Specification:)?\s*(.+)$/m);
            if (titleMatch && titleMatch[1]) {
              title = titleMatch[1].trim();
            }
          } catch {
            // Keep the original title on error
          }
        }

        tasks.push({
          id: dir.name, // Use spec directory name as ID
          specId: dir.name,
          projectId,
          title,
          description,
          status,
          reviewReason,
          subtasks,
          logs: [],
          metadata,
          stagedInMainProject,
          stagedAt,
          createdAt: new Date(plan?.created_at || Date.now()),
          updatedAt: new Date(plan?.updated_at || Date.now())
        });
      } catch (error) {
        // Log error but continue processing other specs
        console.error(`[ProjectStore] Error loading spec ${dir.name}:`, error);
      }
    }

    console.warn('[ProjectStore] Returning', tasks.length, 'tasks out of', specDirs.filter(d => d.isDirectory() && d.name !== '.gitkeep').length, 'spec directories');
    return tasks;
  }

  /**
   * Determine task status and review reason based on plan and files.
   *
   * This method calculates the correct status from subtask progress and QA state,
   * providing backwards compatibility for existing tasks with incorrect status.
   *
   * Review reasons:
   * - 'completed': All subtasks done, QA passed - ready for merge
   * - 'errors': Subtasks failed during execution - needs attention
   * - 'qa_rejected': QA found issues that need fixing
   */
  private determineTaskStatusAndReason(
    plan: ImplementationPlan | null,
    specPath: string,
    metadata?: TaskMetadata
  ): { status: TaskStatus; reviewReason?: ReviewReason } {
    // Handle both 'subtasks' and 'chunks' naming conventions, filter out undefined
    const allSubtasks = plan?.phases?.flatMap((p) => p.subtasks || (p as { chunks?: PlanSubtask[] }).chunks || []).filter(Boolean) || [];

    let calculatedStatus: TaskStatus = 'backlog';
    let reviewReason: ReviewReason | undefined;

    if (allSubtasks.length > 0) {
      const completed = allSubtasks.filter((s) => s.status === 'completed').length;
      const inProgress = allSubtasks.filter((s) => s.status === 'in_progress').length;
      const failed = allSubtasks.filter((s) => s.status === 'failed').length;

      if (completed === allSubtasks.length) {
        // All subtasks completed - check QA status
        const qaSignoff = (plan as unknown as Record<string, unknown>)?.qa_signoff as { status?: string } | undefined;
        if (qaSignoff?.status === 'approved') {
          calculatedStatus = 'human_review';
          reviewReason = 'completed';
        } else {
          // Manual tasks skip AI review and go directly to human review
          calculatedStatus = metadata?.sourceType === 'manual' ? 'human_review' : 'ai_review';
          if (metadata?.sourceType === 'manual') {
            reviewReason = 'completed';
          }
        }
      } else if (failed > 0) {
        // Some subtasks failed - needs human attention
        calculatedStatus = 'human_review';
        reviewReason = 'errors';
      } else if (inProgress > 0 || completed > 0) {
        calculatedStatus = 'in_progress';
      }
    }

    // FIRST: Check for explicit user-set status from plan (takes highest priority)
    // This allows users to manually mark tasks as 'done' via drag-and-drop
    if (plan?.status) {
      const statusMap: Record<string, TaskStatus> = {
        'pending': 'backlog',
        'planning': 'in_progress', // Task is in planning phase (spec creation running)
        'in_progress': 'in_progress',
        'coding': 'in_progress', // Task is in coding phase
        'review': 'ai_review',
        'completed': 'done',
        'done': 'done',
        'human_review': 'human_review',
        'ai_review': 'ai_review',
        'backlog': 'backlog'
      };
      const storedStatus = statusMap[plan.status];

      // If user explicitly marked as 'done', always respect that
      if (storedStatus === 'done') {
        return { status: 'done' };
      }

      // For other stored statuses, validate against calculated status
      if (storedStatus) {
        // Planning/coding status from the backend should be respected even if subtasks aren't in progress yet
        // This happens when a task is in planning phase (creating spec) but no subtasks have been started
        const isActiveProcessStatus = (plan.status as string) === 'planning' || (plan.status as string) === 'coding';

        // Check if this is a plan review (spec approval stage before coding starts)
        // planStatus: "review" indicates spec creation is complete and awaiting user approval
        const isPlanReviewStage = (plan as unknown as { planStatus?: string })?.planStatus === 'review';

        const isStoredStatusValid =
          (storedStatus === calculatedStatus) || // Matches calculated
          (storedStatus === 'human_review' && calculatedStatus === 'ai_review') || // Human review is more advanced than ai_review
          (storedStatus === 'human_review' && isPlanReviewStage) || // Plan review stage (awaiting spec approval)
          (isActiveProcessStatus && storedStatus === 'in_progress'); // Planning/coding phases should show as in_progress

        if (isStoredStatusValid) {
          // Preserve reviewReason for human_review status
          if (storedStatus === 'human_review' && !reviewReason) {
            // Infer reason from subtask states or plan review stage
            const hasFailedSubtasks = allSubtasks.some((s) => s.status === 'failed');
            const allCompleted = allSubtasks.length > 0 && allSubtasks.every((s) => s.status === 'completed');
            if (hasFailedSubtasks) {
              reviewReason = 'errors';
            } else if (allCompleted) {
              reviewReason = 'completed';
            } else if (isPlanReviewStage) {
              reviewReason = 'plan_review';
            }
          }
          return { status: storedStatus, reviewReason: storedStatus === 'human_review' ? reviewReason : undefined };
        }
      }
    }

    // SECOND: Check QA report file for additional status info
    const qaReportPath = path.join(specPath, AUTO_BUILD_PATHS.QA_REPORT);
    if (existsSync(qaReportPath)) {
      try {
        const content = readFileSync(qaReportPath, 'utf-8');
        if (content.includes('REJECTED') || content.includes('FAILED')) {
          return { status: 'human_review', reviewReason: 'qa_rejected' };
        }
        if (content.includes('PASSED') || content.includes('APPROVED')) {
          // QA passed - if all subtasks done, move to human_review
          if (allSubtasks.length > 0 && allSubtasks.every((s) => s.status === 'completed')) {
            return { status: 'human_review', reviewReason: 'completed' };
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    return { status: calculatedStatus, reviewReason: calculatedStatus === 'human_review' ? reviewReason : undefined };
  }

  /**
   * Archive tasks by writing archivedAt to their metadata
   * @param projectId - Project ID
   * @param taskIds - IDs of tasks to archive
   * @param version - Version they were archived in (optional)
   */
  archiveTasks(projectId: string, taskIds: string[], version?: string): boolean {
    const project = this.getProject(projectId);
    if (!project) return false;

    const specsBaseDir = getSpecsDir(project.autoBuildPath);
    const specsDir = path.join(project.path, specsBaseDir);

    const archivedAt = new Date().toISOString();

    for (const taskId of taskIds) {
      const specPath = path.join(specsDir, taskId);
      const metadataPath = path.join(specPath, 'task_metadata.json');

      try {
        let metadata: TaskMetadata = {};
        if (existsSync(metadataPath)) {
          metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
        }

        // Add archive info
        metadata.archivedAt = archivedAt;
        if (version) {
          metadata.archivedInVersion = version;
        }

        writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      } catch {
        // Continue with other tasks even if one fails
      }
    }

    return true;
  }

  /**
   * Unarchive tasks by removing archivedAt from their metadata
   * @param projectId - Project ID
   * @param taskIds - IDs of tasks to unarchive
   */
  unarchiveTasks(projectId: string, taskIds: string[]): boolean {
    const project = this.getProject(projectId);
    if (!project) return false;

    const specsBaseDir = getSpecsDir(project.autoBuildPath);
    const specsDir = path.join(project.path, specsBaseDir);

    for (const taskId of taskIds) {
      const specPath = path.join(specsDir, taskId);
      const metadataPath = path.join(specPath, 'task_metadata.json');

      try {
        if (existsSync(metadataPath)) {
          const metadata: TaskMetadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
          delete metadata.archivedAt;
          delete metadata.archivedInVersion;
          writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        }
      } catch {
        // Continue with other tasks even if one fails
      }
    }

    return true;
  }
}

// Singleton instance
export const projectStore = new ProjectStore();
