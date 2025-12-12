import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Project, ProjectSettings, Task, TaskStatus, TaskMetadata, ImplementationPlan, ReviewReason } from '../shared/types';
import { DEFAULT_PROJECT_SETTINGS, AUTO_BUILD_PATHS, getSpecsDir } from '../shared/constants';
import { getAutoBuildPath } from './project-initializer';

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
    const project = this.getProject(projectId);
    if (!project) return [];

    // Use devMode-aware path for specs directory
    const devMode = project.settings.devMode ?? false;
    const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
    const specsDir = path.join(project.path, specsBaseDir);
    if (!existsSync(specsDir)) return [];

    const tasks: Task[] = [];

    try {
      const specDirs = readdirSync(specsDir, { withFileTypes: true });

      for (const dir of specDirs) {
        if (!dir.isDirectory()) continue;
        if (dir.name === '.gitkeep') continue;

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
            // Extract first paragraph after "## Overview"
            const overviewMatch = content.match(/## Overview\s*\n\n([^\n#]+)/);
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

        // Extract chunks from plan
        const chunks = plan?.phases.flatMap((phase) =>
          phase.chunks.map((chunk) => ({
            id: chunk.id,
            title: chunk.description,
            description: chunk.description,
            status: chunk.status,
            files: []
          }))
        ) || [];

        tasks.push({
          id: dir.name, // Use spec directory name as ID
          specId: dir.name,
          projectId,
          title: plan?.feature || dir.name,
          description,
          status,
          reviewReason,
          chunks,
          logs: [],
          metadata,
          createdAt: new Date(plan?.created_at || Date.now()),
          updatedAt: new Date(plan?.updated_at || Date.now())
        });
      }
    } catch {
      // Return empty array on error
    }

    return tasks;
  }

  /**
   * Determine task status and review reason based on plan and files.
   *
   * This method calculates the correct status from chunk progress and QA state,
   * providing backwards compatibility for existing tasks with incorrect status.
   *
   * Review reasons:
   * - 'completed': All chunks done, QA passed - ready for merge
   * - 'errors': Chunks failed during execution - needs attention
   * - 'qa_rejected': QA found issues that need fixing
   */
  private determineTaskStatusAndReason(
    plan: ImplementationPlan | null,
    specPath: string,
    metadata?: TaskMetadata
  ): { status: TaskStatus; reviewReason?: ReviewReason } {
    const allChunks = plan?.phases?.flatMap((p) => p.chunks) || [];

    let calculatedStatus: TaskStatus = 'backlog';
    let reviewReason: ReviewReason | undefined;

    if (allChunks.length > 0) {
      const completed = allChunks.filter((c) => c.status === 'completed').length;
      const inProgress = allChunks.filter((c) => c.status === 'in_progress').length;
      const failed = allChunks.filter((c) => c.status === 'failed').length;

      if (completed === allChunks.length) {
        // All chunks completed - check QA status
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
        // Some chunks failed - needs human attention
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
        'in_progress': 'in_progress',
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
        const isStoredStatusValid =
          (storedStatus === calculatedStatus) || // Matches calculated
          (storedStatus === 'human_review' && calculatedStatus === 'ai_review'); // Human review is more advanced than ai_review

        if (isStoredStatusValid) {
          // Preserve reviewReason for human_review status
          if (storedStatus === 'human_review' && !reviewReason) {
            // Infer reason from chunk states
            const hasFailedChunks = allChunks.some((c) => c.status === 'failed');
            const allCompleted = allChunks.length > 0 && allChunks.every((c) => c.status === 'completed');
            if (hasFailedChunks) {
              reviewReason = 'errors';
            } else if (allCompleted) {
              reviewReason = 'completed';
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
          // QA passed - if all chunks done, move to human_review
          if (allChunks.length > 0 && allChunks.every((c) => c.status === 'completed')) {
            return { status: 'human_review', reviewReason: 'completed' };
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    return { status: calculatedStatus, reviewReason: calculatedStatus === 'human_review' ? reviewReason : undefined };
  }
}

// Singleton instance
export const projectStore = new ProjectStore();
