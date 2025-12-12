import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import path from 'path';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'fs';
import { spawn, execSync } from 'child_process';
import { IPC_CHANNELS, DEFAULT_APP_SETTINGS, AUTO_BUILD_PATHS, getSpecsDir } from '../shared/constants';
import type {
  Project,
  ProjectSettings,
  Task,
  TaskMetadata,
  TaskCategory,
  TaskComplexity,
  TaskImpact,
  TaskStatus,
  AppSettings,
  IPCResult,
  TaskStartOptions,
  ImplementationPlan,
  TerminalCreateOptions,
  AutoBuildVersionInfo,
  InitializationResult,
  Roadmap,
  RoadmapFeature,
  RoadmapFeatureStatus,
  RoadmapGenerationStatus,
  ProjectIndex,
  ProjectContextData,
  GraphitiMemoryStatus,
  GraphitiMemoryState,
  MemoryEpisode,
  ContextSearchResult,
  ProjectEnvConfig,
  ClaudeAuthResult,
  LinearIssue,
  LinearTeam,
  LinearProject,
  LinearImportResult,
  LinearSyncStatus,
  GitHubRepository,
  GitHubIssue,
  GitHubSyncStatus,
  GitHubImportResult,
  GitHubInvestigationResult,
  GitHubInvestigationStatus,
  IdeationSession,
  IdeationConfig,
  IdeationGenerationStatus,
  IdeationStatus,
  SourceEnvConfig,
  SourceEnvCheckResult
} from '../shared/types';
import { projectStore } from './project-store';
import { fileWatcher } from './file-watcher';
import { AgentManager } from './agent-manager';
import { TerminalManager } from './terminal-manager';
import {
  initializeProject,
  updateProject,
  checkVersion,
  hasCustomEnv,
  getAutoBuildPath
} from './project-initializer';
import {
  checkForUpdates as checkSourceUpdates,
  downloadAndApplyUpdate,
  getBundledVersion,
  getEffectiveSourcePath
} from './auto-claude-updater';
import { changelogService } from './changelog-service';
import { insightsService } from './insights-service';
import { taskLogService } from './task-log-service';
import type { AutoBuildSourceUpdateProgress, InsightsSession, InsightsChatStatus, InsightsStreamChunk, TaskLogs, TaskLogStreamChunk } from '../shared/types';

/**
 * Setup all IPC handlers
 */
export function setupIpcHandlers(
  agentManager: AgentManager,
  terminalManager: TerminalManager,
  getMainWindow: () => BrowserWindow | null
): void {
  // ============================================
  // Project Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_ADD,
    async (_, projectPath: string): Promise<IPCResult<Project>> => {
      try {
        // Validate path exists
        if (!existsSync(projectPath)) {
          return { success: false, error: 'Directory does not exist' };
        }

        const project = projectStore.addProject(projectPath);
        return { success: true, data: project };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_REMOVE,
    async (_, projectId: string): Promise<IPCResult> => {
      const success = projectStore.removeProject(projectId);
      return { success };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_LIST,
    async (): Promise<IPCResult<Project[]>> => {
      const projects = projectStore.getProjects();
      return { success: true, data: projects };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_UPDATE_SETTINGS,
    async (
      _,
      projectId: string,
      settings: Partial<ProjectSettings>
    ): Promise<IPCResult> => {
      const project = projectStore.updateProjectSettings(projectId, settings);
      if (project) {
        return { success: true };
      }
      return { success: false, error: 'Project not found' };
    }
  );

  // ============================================
  // Project Initialization Operations
  // ============================================

  const settingsPath = path.join(app.getPath('userData'), 'settings.json');

  /**
   * Auto-detect the auto-claude source path relative to the app location
   * In dev: auto-claude-ui/../auto-claude
   * In prod: Could be bundled or configured
   */
  const detectAutoBuildSourcePath = (): string | null => {
    // Try relative to app directory (works in dev and if repo structure is maintained)
    // __dirname in main process points to out/main in dev
    const possiblePaths = [
      // Dev mode: from out/main -> ../../../auto-claude (sibling to auto-claude-ui)
      path.resolve(__dirname, '..', '..', '..', 'auto-claude'),
      // Alternative: from app root (useful in some packaged scenarios)
      path.resolve(app.getAppPath(), '..', 'auto-claude'),
      // If running from repo root
      path.resolve(process.cwd(), 'auto-claude'),
      // Try one more level up (in case of different build output structure)
      path.resolve(__dirname, '..', '..', 'auto-claude')
    ];

    for (const p of possiblePaths) {
      if (existsSync(p) && existsSync(path.join(p, 'VERSION'))) {
        return p;
      }
    }
    return null;
  };

  /**
   * Get the configured auto-claude source path from settings, or auto-detect
   */
  const getAutoBuildSourcePath = (): string | null => {
    // First check if manually configured
    if (existsSync(settingsPath)) {
      try {
        const content = readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(content);
        if (settings.autoBuildPath && existsSync(settings.autoBuildPath)) {
          return settings.autoBuildPath;
        }
      } catch {
        // Fall through to auto-detect
      }
    }

    // Auto-detect from app location
    return detectAutoBuildSourcePath();
  };

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_INITIALIZE,
    async (_, projectId: string): Promise<IPCResult<InitializationResult>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }

        const sourcePath = getAutoBuildSourcePath();
        if (!sourcePath) {
          return {
            success: false,
            error: 'Auto-build source path not configured. Please set it in App Settings.'
          };
        }

        const result = initializeProject(project.path, sourcePath);

        if (result.success) {
          // Update project's autoBuildPath
          projectStore.updateAutoBuildPath(projectId, '.auto-claude');
        }

        return { success: result.success, data: result, error: result.error };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_UPDATE_AUTOBUILD,
    async (_, projectId: string): Promise<IPCResult<InitializationResult>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }

        const sourcePath = getAutoBuildSourcePath();
        if (!sourcePath) {
          return {
            success: false,
            error: 'Auto-build source path not configured. Please set it in App Settings.'
          };
        }

        const result = updateProject(project.path, sourcePath);

        if (result.success) {
          // Refresh autoBuildPath in case it changed
          const newPath = getAutoBuildPath(project.path);
          if (newPath) {
            projectStore.updateAutoBuildPath(projectId, newPath);
          }
        }

        return { success: result.success, data: result, error: result.error };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_CHECK_VERSION,
    async (_, projectId: string): Promise<IPCResult<AutoBuildVersionInfo>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }

        const sourcePath = getAutoBuildSourcePath();
        if (!sourcePath) {
          // Return basic info without update check if no source configured
          const autoBuildPath = getAutoBuildPath(project.path);
          return {
            success: true,
            data: {
              isInitialized: !!autoBuildPath,
              updateAvailable: false
            }
          };
        }

        const versionInfo = checkVersion(project.path, sourcePath);

        // Add custom env check if initialized
        if (versionInfo.isInitialized && project.autoBuildPath) {
          const autoBuildFullPath = path.join(project.path, project.autoBuildPath);
          (versionInfo as AutoBuildVersionInfo).hasCustomEnv = hasCustomEnv(autoBuildFullPath);
        }

        return { success: true, data: versionInfo as AutoBuildVersionInfo };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  // ============================================
  // Task Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.TASK_LIST,
    async (_, projectId: string): Promise<IPCResult<Task[]>> => {
      const tasks = projectStore.getTasks(projectId);
      return { success: true, data: tasks };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_CREATE,
    async (
      _,
      projectId: string,
      title: string,
      description: string,
      metadata?: TaskMetadata
    ): Promise<IPCResult<Task>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // Generate a unique spec ID based on existing specs
      // Use devMode-aware path for specs directory
      const devMode = project.settings.devMode ?? false;
      const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
      const specsDir = path.join(project.path, specsBaseDir);

      // Find next available spec number
      let specNumber = 1;
      if (existsSync(specsDir)) {
        const existingDirs = readdirSync(specsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);

        // Extract numbers from spec directory names (e.g., "001-feature" -> 1)
        const existingNumbers = existingDirs
          .map(name => {
            const match = name.match(/^(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
          })
          .filter(n => n > 0);

        if (existingNumbers.length > 0) {
          specNumber = Math.max(...existingNumbers) + 1;
        }
      }

      // Create spec ID with zero-padded number and slugified title
      const slugifiedTitle = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
      const specId = `${String(specNumber).padStart(3, '0')}-${slugifiedTitle}`;

      // Create spec directory
      const specDir = path.join(specsDir, specId);
      mkdirSync(specDir, { recursive: true });

      // Build metadata with source type
      const taskMetadata: TaskMetadata = {
        sourceType: 'manual',
        ...metadata
      };

      // Process and save attached images
      if (taskMetadata.attachedImages && taskMetadata.attachedImages.length > 0) {
        const attachmentsDir = path.join(specDir, 'attachments');
        mkdirSync(attachmentsDir, { recursive: true });

        const savedImages: typeof taskMetadata.attachedImages = [];

        for (const image of taskMetadata.attachedImages) {
          if (image.data) {
            try {
              // Decode base64 and save to file
              const buffer = Buffer.from(image.data, 'base64');
              const imagePath = path.join(attachmentsDir, image.filename);
              writeFileSync(imagePath, buffer);

              // Store relative path instead of base64 data
              savedImages.push({
                id: image.id,
                filename: image.filename,
                mimeType: image.mimeType,
                size: image.size,
                path: `attachments/${image.filename}`
                // Don't include data or thumbnail to save space
              });
            } catch (err) {
              console.error(`Failed to save image ${image.filename}:`, err);
            }
          }
        }

        // Update metadata with saved image paths (without base64 data)
        taskMetadata.attachedImages = savedImages;
      }

      // Create initial implementation_plan.json (task is created but not started)
      const now = new Date().toISOString();
      const implementationPlan = {
        feature: title,
        description: description,
        created_at: now,
        updated_at: now,
        status: 'pending',
        phases: []
      };

      const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
      writeFileSync(planPath, JSON.stringify(implementationPlan, null, 2));

      // Save task metadata if provided
      if (taskMetadata) {
        const metadataPath = path.join(specDir, 'task_metadata.json');
        writeFileSync(metadataPath, JSON.stringify(taskMetadata, null, 2));
      }

      // Create requirements.json with attached images
      const requirements: Record<string, unknown> = {
        task_description: description,
        workflow_type: taskMetadata.category || 'feature'
      };

      // Add attached images to requirements if present
      if (taskMetadata.attachedImages && taskMetadata.attachedImages.length > 0) {
        requirements.attached_images = taskMetadata.attachedImages.map(img => ({
          filename: img.filename,
          path: img.path,
          description: '' // User can add descriptions later
        }));
      }

      const requirementsPath = path.join(specDir, AUTO_BUILD_PATHS.REQUIREMENTS);
      writeFileSync(requirementsPath, JSON.stringify(requirements, null, 2));

      // Create the task object
      const task: Task = {
        id: specId,
        specId: specId,
        projectId,
        title,
        description,
        status: 'backlog',
        chunks: [],
        logs: [],
        metadata: taskMetadata,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      return { success: true, data: task };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_DELETE,
    async (_, taskId: string): Promise<IPCResult> => {
      const { rm } = await import('fs/promises');

      // Find task and project
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

      if (!task || !project) {
        return { success: false, error: 'Task or project not found' };
      }

      // Check if task is currently running
      const isRunning = agentManager.isRunning(taskId);
      if (isRunning) {
        return { success: false, error: 'Cannot delete a running task. Stop the task first.' };
      }

      // Delete the spec directory - use devMode-aware path
      const devMode = project.settings.devMode ?? false;
      const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
      const specDir = path.join(project.path, specsBaseDir, task.specId);

      try {
        if (existsSync(specDir)) {
          await rm(specDir, { recursive: true, force: true });
          console.log(`[TASK_DELETE] Deleted spec directory: ${specDir}`);
        }
        return { success: true };
      } catch (error) {
        console.error('[TASK_DELETE] Error deleting spec directory:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete task files'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_UPDATE,
    async (
      _,
      taskId: string,
      updates: { title?: string; description?: string }
    ): Promise<IPCResult<Task>> => {
      try {
        // Find task and project
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

        if (!task || !project) {
          return { success: false, error: 'Task not found' };
        }

        const autoBuildDir = project.autoBuildPath || 'auto-claude';
        const specDir = path.join(project.path, autoBuildDir, 'specs', task.specId);

        if (!existsSync(specDir)) {
          return { success: false, error: 'Spec directory not found' };
        }

        // Update implementation_plan.json
        const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
        if (existsSync(planPath)) {
          try {
            const planContent = readFileSync(planPath, 'utf-8');
            const plan = JSON.parse(planContent);

            if (updates.title !== undefined) {
              plan.feature = updates.title;
            }
            if (updates.description !== undefined) {
              plan.description = updates.description;
            }
            plan.updated_at = new Date().toISOString();

            writeFileSync(planPath, JSON.stringify(plan, null, 2));
          } catch {
            // Plan file might not be valid JSON, continue anyway
          }
        }

        // Update spec.md if it exists
        const specPath = path.join(specDir, AUTO_BUILD_PATHS.SPEC_FILE);
        if (existsSync(specPath)) {
          try {
            let specContent = readFileSync(specPath, 'utf-8');

            // Update title (first # heading)
            if (updates.title !== undefined) {
              specContent = specContent.replace(
                /^#\s+.*$/m,
                `# ${updates.title}`
              );
            }

            // Update description (## Overview section content)
            if (updates.description !== undefined) {
              // Replace content between ## Overview and the next ## section
              specContent = specContent.replace(
                /(## Overview\n)([\s\S]*?)((?=\n## )|$)/,
                `$1${updates.description}\n\n$3`
              );
            }

            writeFileSync(specPath, specContent);
          } catch {
            // Spec file update failed, continue anyway
          }
        }

        // Build the updated task object
        const updatedTask: Task = {
          ...task,
          title: updates.title ?? task.title,
          description: updates.description ?? task.description,
          updatedAt: new Date()
        };

        return { success: true, data: updatedTask };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.on(
    IPC_CHANNELS.TASK_START,
    (_, taskId: string, options?: TaskStartOptions) => {
      console.log('[TASK_START] Received request for taskId:', taskId);
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        console.log('[TASK_START] No main window found');
        return;
      }

      // Find task and project
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

      if (!task || !project) {
        console.log('[TASK_START] Task or project not found for taskId:', taskId);
        mainWindow.webContents.send(
          IPC_CHANNELS.TASK_ERROR,
          taskId,
          'Task or project not found'
        );
        return;
      }

      console.log('[TASK_START] Found task:', task.specId, 'status:', task.status, 'chunks:', task.chunks.length);

      // Check if dev mode is enabled for this project
      const devMode = project.settings.devMode ?? false;
      console.log('[TASK_START] Dev mode:', devMode);

      // Start file watcher for this task
      // Use getSpecsDir helper to get correct path based on dev mode
      const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
      const specDir = path.join(
        project.path,
        specsBaseDir,
        task.specId
      );
      fileWatcher.watch(taskId, specDir);

      // Check if spec.md exists (indicates spec creation was already done or in progress)
      const specFilePath = path.join(specDir, AUTO_BUILD_PATHS.SPEC_FILE);
      const hasSpec = existsSync(specFilePath);

      // Check if this task needs spec creation first (no spec file = not yet created)
      // OR if it has a spec but no implementation plan chunks (spec created, needs planning/building)
      const needsSpecCreation = !hasSpec;
      const needsImplementation = hasSpec && task.chunks.length === 0;

      console.log('[TASK_START] hasSpec:', hasSpec, 'needsSpecCreation:', needsSpecCreation, 'needsImplementation:', needsImplementation);

      if (needsSpecCreation) {
        // No spec file - need to run spec_runner.py to create the spec
        const taskDescription = task.description || task.title;
        console.log('[TASK_START] Starting spec creation for:', task.specId, 'in:', specDir);

        // Start spec creation process - pass the existing spec directory
        // so spec_runner uses it instead of creating a new one
        agentManager.startSpecCreation(task.specId, project.path, taskDescription, specDir, devMode, task.metadata);
      } else if (needsImplementation) {
        // Spec exists but no chunks - run run.py to create implementation plan and execute
        // Read the spec.md to get the task description
        let taskDescription = task.description || task.title;
        try {
          taskDescription = readFileSync(specFilePath, 'utf-8');
        } catch {
          // Use default description
        }

        console.log('[TASK_START] Starting task execution (no chunks) for:', task.specId);
        // Start task execution which will create the implementation plan
        // Note: No parallel mode for planning phase - parallel only makes sense with multiple chunks
        agentManager.startTaskExecution(
          taskId,
          project.path,
          task.specId,
          {
            parallel: false,  // Sequential for planning phase
            workers: 1,
            devMode
          }
        );
      } else {
        // Task has chunks, start normal execution
        // Only enable parallel if there are multiple chunks AND user has parallel enabled
        const hasMultipleChunks = task.chunks.length > 1;
        const pendingChunks = task.chunks.filter(c => c.status === 'pending' || c.status === 'in_progress').length;
        const parallelEnabled = options?.parallel ?? project.settings.parallelEnabled;
        const useParallel = parallelEnabled && hasMultipleChunks && pendingChunks > 1;
        const workers = useParallel ? (options?.workers ?? project.settings.maxWorkers) : 1;

        console.log('[TASK_START] Starting task execution (has chunks) for:', task.specId);
        console.log('[TASK_START] Parallel decision:', {
          hasMultipleChunks,
          pendingChunks,
          parallelEnabled,
          useParallel,
          workers
        });

        agentManager.startTaskExecution(
          taskId,
          project.path,
          task.specId,
          {
            parallel: useParallel,
            workers,
            devMode
          }
        );
      }

      // Notify status change
      mainWindow.webContents.send(
        IPC_CHANNELS.TASK_STATUS_CHANGE,
        taskId,
        'in_progress'
      );
    }
  );

  ipcMain.on(IPC_CHANNELS.TASK_STOP, (_, taskId: string) => {
    agentManager.killTask(taskId);
    fileWatcher.unwatch(taskId);

    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(
        IPC_CHANNELS.TASK_STATUS_CHANGE,
        taskId,
        'backlog'
      );
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.TASK_REVIEW,
    async (
      _,
      taskId: string,
      approved: boolean,
      feedback?: string
    ): Promise<IPCResult> => {
      // Find task and project
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

      if (!task || !project) {
        return { success: false, error: 'Task not found' };
      }

      // Check if dev mode is enabled for this project
      const devMode = project.settings.devMode ?? false;
      const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
      const specDir = path.join(
        project.path,
        specsBaseDir,
        task.specId
      );

      if (approved) {
        // Write approval to QA report
        const qaReportPath = path.join(specDir, AUTO_BUILD_PATHS.QA_REPORT);
        writeFileSync(
          qaReportPath,
          `# QA Review\n\nStatus: APPROVED\n\nReviewed at: ${new Date().toISOString()}\n`
        );

        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(
            IPC_CHANNELS.TASK_STATUS_CHANGE,
            taskId,
            'done'
          );
        }
      } else {
        // Write feedback for QA fixer
        const fixRequestPath = path.join(specDir, 'QA_FIX_REQUEST.md');
        writeFileSync(
          fixRequestPath,
          `# QA Fix Request\n\nStatus: REJECTED\n\n## Feedback\n\n${feedback || 'No feedback provided'}\n\nCreated at: ${new Date().toISOString()}\n`
        );

        // Restart QA process with dev mode
        agentManager.startQAProcess(taskId, project.path, task.specId, devMode);

        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(
            IPC_CHANNELS.TASK_STATUS_CHANGE,
            taskId,
            'in_progress'
          );
        }
      }

      return { success: true };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TASK_UPDATE_STATUS,
    async (
      _,
      taskId: string,
      status: TaskStatus
    ): Promise<IPCResult> => {
      // Find task and project
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

      if (!task || !project) {
        return { success: false, error: 'Task not found' };
      }

      // Get the spec directory - use devMode-aware path
      const devMode = project.settings.devMode ?? false;
      const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
      const specDir = path.join(
        project.path,
        specsBaseDir,
        task.specId
      );

      // Update implementation_plan.json if it exists
      const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);

      try {
        if (existsSync(planPath)) {
          const planContent = readFileSync(planPath, 'utf-8');
          const plan = JSON.parse(planContent);

          // Store the exact UI status - project-store.ts will map it back
          plan.status = status;
          // Also store mapped version for Python compatibility
          plan.planStatus = status === 'done' ? 'completed'
            : status === 'in_progress' ? 'in_progress'
            : status === 'ai_review' ? 'review'
            : status === 'human_review' ? 'review'
            : 'pending';
          plan.updated_at = new Date().toISOString();

          writeFileSync(planPath, JSON.stringify(plan, null, 2));
        } else {
          // If no implementation plan exists yet, create a basic one
          const plan = {
            feature: task.title,
            description: task.description || '',
            created_at: task.createdAt.toISOString(),
            updated_at: new Date().toISOString(),
            status: status, // Store exact UI status for persistence
            planStatus: status === 'done' ? 'completed'
              : status === 'in_progress' ? 'in_progress'
              : status === 'ai_review' ? 'review'
              : status === 'human_review' ? 'review'
              : 'pending',
            phases: []
          };

          // Ensure spec directory exists
          if (!existsSync(specDir)) {
            mkdirSync(specDir, { recursive: true });
          }

          writeFileSync(planPath, JSON.stringify(plan, null, 2));
        }

        // Auto-start task when status changes to 'in_progress' and no process is running
        if (status === 'in_progress' && !agentManager.isRunning(taskId)) {
          const mainWindow = getMainWindow();
          console.log('[TASK_UPDATE_STATUS] Auto-starting task:', taskId);

          // Start file watcher for this task
          fileWatcher.watch(taskId, specDir);

          // Check if spec.md exists
          const specFilePath = path.join(specDir, AUTO_BUILD_PATHS.SPEC_FILE);
          const hasSpec = existsSync(specFilePath);
          const needsSpecCreation = !hasSpec;
          const needsImplementation = hasSpec && task.chunks.length === 0;

          console.log('[TASK_UPDATE_STATUS] hasSpec:', hasSpec, 'needsSpecCreation:', needsSpecCreation, 'needsImplementation:', needsImplementation);

          if (needsSpecCreation) {
            // No spec file - need to run spec_runner.py to create the spec
            const taskDescription = task.description || task.title;
            console.log('[TASK_UPDATE_STATUS] Starting spec creation for:', task.specId);
            agentManager.startSpecCreation(task.specId, project.path, taskDescription, specDir, devMode, task.metadata);
          } else if (needsImplementation) {
            // Spec exists but no chunks - run run.py to create implementation plan and execute
            console.log('[TASK_UPDATE_STATUS] Starting task execution (no chunks) for:', task.specId);
            agentManager.startTaskExecution(
              taskId,
              project.path,
              task.specId,
              {
                parallel: false,
                workers: 1,
                devMode
              }
            );
          } else {
            // Task has chunks, start normal execution
            const hasMultipleChunks = task.chunks.length > 1;
            const pendingChunks = task.chunks.filter(c => c.status === 'pending' || c.status === 'in_progress').length;
            const parallelEnabled = project.settings.parallelEnabled;
            const useParallel = parallelEnabled && hasMultipleChunks && pendingChunks > 1;
            const workers = useParallel ? project.settings.maxWorkers : 1;

            console.log('[TASK_UPDATE_STATUS] Starting task execution (has chunks) for:', task.specId);
            agentManager.startTaskExecution(
              taskId,
              project.path,
              task.specId,
              {
                parallel: useParallel,
                workers,
                devMode
              }
            );
          }

          // Notify renderer about status change
          if (mainWindow) {
            mainWindow.webContents.send(
              IPC_CHANNELS.TASK_STATUS_CHANGE,
              taskId,
              'in_progress'
            );
          }
        }

        return { success: true };
      } catch (error) {
        console.error('Failed to update task status:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update task status'
        };
      }
    }
  );

  // Handler to check if a task is actually running (has active process)
  ipcMain.handle(
    IPC_CHANNELS.TASK_CHECK_RUNNING,
    async (_, taskId: string): Promise<IPCResult<boolean>> => {
      const isRunning = agentManager.isRunning(taskId);
      return { success: true, data: isRunning };
    }
  );

  // Handler to recover a stuck task (status says in_progress but no process running)
  ipcMain.handle(
    IPC_CHANNELS.TASK_RECOVER_STUCK,
    async (
      _,
      taskId: string,
      options?: { targetStatus?: TaskStatus; autoRestart?: boolean }
    ): Promise<IPCResult<{ taskId: string; recovered: boolean; newStatus: TaskStatus; message: string; autoRestarted?: boolean }>> => {
      const targetStatus = options?.targetStatus;
      const autoRestart = options?.autoRestart ?? false;
      // Check if task is actually running
      const isActuallyRunning = agentManager.isRunning(taskId);

      if (isActuallyRunning) {
        return {
          success: false,
          error: 'Task is still running. Stop it first before recovering.',
          data: {
            taskId,
            recovered: false,
            newStatus: 'in_progress' as TaskStatus,
            message: 'Task is still running'
          }
        };
      }

      // Find task and project
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

      if (!task || !project) {
        return { success: false, error: 'Task not found' };
      }

      // Get the spec directory
      const autoBuildDir = project.autoBuildPath || 'auto-claude';
      const specDir = path.join(
        project.path,
        autoBuildDir,
        'specs',
        task.specId
      );

      // Update implementation_plan.json
      const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);

      try {
        // Read the plan to analyze chunk progress
        let plan: Record<string, unknown> | null = null;
        if (existsSync(planPath)) {
          const planContent = readFileSync(planPath, 'utf-8');
          plan = JSON.parse(planContent);
        }

        // Determine the target status intelligently based on chunk progress
        // If targetStatus is explicitly provided, use it; otherwise calculate from chunks
        let newStatus: TaskStatus = targetStatus || 'backlog';

        if (!targetStatus && plan?.phases && Array.isArray(plan.phases)) {
          // Analyze chunk statuses to determine appropriate recovery status
          const allChunks: Array<{ status: string }> = [];
          for (const phase of plan.phases as Array<{ chunks?: Array<{ status: string }> }>) {
            if (phase.chunks && Array.isArray(phase.chunks)) {
              allChunks.push(...phase.chunks);
            }
          }

          if (allChunks.length > 0) {
            const completedCount = allChunks.filter(c => c.status === 'completed').length;
            const allCompleted = completedCount === allChunks.length;

            if (allCompleted) {
              // All chunks completed - should go to review (ai_review or human_review based on source)
              // For recovery, human_review is safer as it requires manual verification
              newStatus = 'human_review';
            } else if (completedCount > 0) {
              // Some chunks completed, some still pending - task is in progress
              newStatus = 'in_progress';
            }
            // else: no chunks completed, stay with 'backlog'
          }
        }

        if (plan) {
          // Update status
          plan.status = newStatus;
          plan.planStatus = newStatus === 'done' ? 'completed'
            : newStatus === 'in_progress' ? 'in_progress'
            : newStatus === 'ai_review' ? 'review'
            : newStatus === 'human_review' ? 'review'
            : 'pending';
          plan.updated_at = new Date().toISOString();

          // Add recovery note
          plan.recoveryNote = `Task recovered from stuck state at ${new Date().toISOString()}`;

          // Reset in_progress and failed chunk statuses to 'pending' so they can be retried
          // Keep completed chunks as-is so run.py can resume from where it left off
          if (plan.phases && Array.isArray(plan.phases)) {
            for (const phase of plan.phases as Array<{ chunks?: Array<{ status: string; actual_output?: string; started_at?: string; completed_at?: string }> }>) {
              if (phase.chunks && Array.isArray(phase.chunks)) {
                for (const chunk of phase.chunks) {
                  // Reset in_progress chunks to pending (they were interrupted)
                  // Keep completed chunks as-is so run.py can resume
                  if (chunk.status === 'in_progress') {
                    chunk.status = 'pending';
                    // Clear execution data to maintain consistency
                    delete chunk.actual_output;
                    delete chunk.started_at;
                    delete chunk.completed_at;
                  }
                  // Also reset failed chunks so they can be retried
                  if (chunk.status === 'failed') {
                    chunk.status = 'pending';
                    // Clear execution data to maintain consistency
                    delete chunk.actual_output;
                    delete chunk.started_at;
                    delete chunk.completed_at;
                  }
                }
              }
            }
          }

          writeFileSync(planPath, JSON.stringify(plan, null, 2));
        }

        // Stop file watcher if it was watching this task
        fileWatcher.unwatch(taskId);

        // Auto-restart the task if requested
        let autoRestarted = false;
        if (autoRestart && project) {
          try {
            // Set status to in_progress for the restart
            newStatus = 'in_progress';
            
            // Update plan status for restart
            if (plan) {
              plan.status = 'in_progress';
              plan.planStatus = 'in_progress';
              writeFileSync(planPath, JSON.stringify(plan, null, 2));
            }

            // Start the task execution
            const devMode = project.settings.devMode ?? false;
            
            // Check if we should use parallel mode
            const hasMultipleChunks = task.chunks.length > 1;
            const pendingChunks = task.chunks.filter(c => c.status === 'pending').length;
            const parallelEnabled = project.settings.parallelEnabled;
            const useParallel = parallelEnabled && hasMultipleChunks && pendingChunks > 1;
            const workers = useParallel ? project.settings.maxWorkers : 1;

            // Start file watcher for this task
            const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
            const specDirForWatcher = path.join(project.path, specsBaseDir, task.specId);
            fileWatcher.watch(taskId, specDirForWatcher);
            
            agentManager.startTaskExecution(
              taskId,
              project.path,
              task.specId,
              {
                parallel: useParallel,
                workers,
                devMode
              }
            );
            
            autoRestarted = true;
            console.log(`[Recovery] Auto-restarted task ${taskId}`);
          } catch (restartError) {
            console.error('Failed to auto-restart task after recovery:', restartError);
            // Recovery succeeded but restart failed - still report success
          }
        }

        // Notify renderer of status change
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(
            IPC_CHANNELS.TASK_STATUS_CHANGE,
            taskId,
            newStatus
          );
        }

        return {
          success: true,
          data: {
            taskId,
            recovered: true,
            newStatus,
            message: autoRestarted 
              ? 'Task recovered and restarted successfully'
              : `Task recovered successfully and moved to ${newStatus}`,
            autoRestarted
          }
        };
      } catch (error) {
        console.error('Failed to recover stuck task:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to recover task'
        };
      }
    }
  );

  // ============================================
  // Workspace Management Operations (for human review)
  // ============================================

  /**
   * Helper function to find task and project by taskId
   */
  const findTaskAndProject = (taskId: string): { task: Task | undefined; project: Project | undefined } => {
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

  /**
   * Get the worktree status for a task
   * Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_STATUS,
    async (_, taskId: string): Promise<IPCResult<import('../shared/types').WorktreeStatus>> => {
      try {
        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          return { success: false, error: 'Task not found' };
        }

        // Per-spec worktree path: .worktrees/{spec-name}/
        const worktreePath = path.join(project.path, '.worktrees', task.specId);

        if (!existsSync(worktreePath)) {
          return {
            success: true,
            data: { exists: false }
          };
        }

        // Get branch info from git
        try {
          // Get current branch in worktree
          const branch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: worktreePath,
            encoding: 'utf-8'
          }).trim();

          // Get base branch (usually main or master)
          let baseBranch = 'main';
          try {
            // Try to get the default branch
            baseBranch = execSync('git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo main', {
              cwd: project.path,
              encoding: 'utf-8'
            }).trim().replace('origin/', '');
          } catch {
            baseBranch = 'main';
          }

          // Get commit count
          let commitCount = 0;
          try {
            const countOutput = execSync(`git rev-list --count ${baseBranch}..HEAD 2>/dev/null || echo 0`, {
              cwd: worktreePath,
              encoding: 'utf-8'
            }).trim();
            commitCount = parseInt(countOutput, 10) || 0;
          } catch {
            commitCount = 0;
          }

          // Get diff stats
          let filesChanged = 0;
          let additions = 0;
          let deletions = 0;

          try {
            const diffStat = execSync(`git diff --stat ${baseBranch}...HEAD 2>/dev/null || echo ""`, {
              cwd: worktreePath,
              encoding: 'utf-8'
            }).trim();

            // Parse the summary line (e.g., "3 files changed, 50 insertions(+), 10 deletions(-)")
            const summaryMatch = diffStat.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
            if (summaryMatch) {
              filesChanged = parseInt(summaryMatch[1], 10) || 0;
              additions = parseInt(summaryMatch[2], 10) || 0;
              deletions = parseInt(summaryMatch[3], 10) || 0;
            }
          } catch {
            // Ignore diff errors
          }

          return {
            success: true,
            data: {
              exists: true,
              worktreePath,
              branch,
              baseBranch,
              commitCount,
              filesChanged,
              additions,
              deletions
            }
          };
        } catch (gitError) {
          console.error('Git error getting worktree status:', gitError);
          return {
            success: true,
            data: { exists: true, worktreePath }
          };
        }
      } catch (error) {
        console.error('Failed to get worktree status:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get worktree status'
        };
      }
    }
  );

  /**
   * Get the diff for a task's worktree
   * Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_DIFF,
    async (_, taskId: string): Promise<IPCResult<import('../shared/types').WorktreeDiff>> => {
      try {
        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          return { success: false, error: 'Task not found' };
        }

        // Per-spec worktree path: .worktrees/{spec-name}/
        const worktreePath = path.join(project.path, '.worktrees', task.specId);

        if (!existsSync(worktreePath)) {
          return { success: false, error: 'No worktree found for this task' };
        }

        // Get base branch
        let baseBranch = 'main';
        try {
          baseBranch = execSync('git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo main', {
            cwd: project.path,
            encoding: 'utf-8'
          }).trim().replace('origin/', '');
        } catch {
          baseBranch = 'main';
        }

        // Get the diff with file stats
        const files: import('../shared/types').WorktreeDiffFile[] = [];

        try {
          // Get numstat for additions/deletions per file
          const numstat = execSync(`git diff --numstat ${baseBranch}...HEAD 2>/dev/null || echo ""`, {
            cwd: worktreePath,
            encoding: 'utf-8'
          }).trim();

          // Get name-status for file status
          const nameStatus = execSync(`git diff --name-status ${baseBranch}...HEAD 2>/dev/null || echo ""`, {
            cwd: worktreePath,
            encoding: 'utf-8'
          }).trim();

          // Parse name-status to get file statuses
          const statusMap: Record<string, 'added' | 'modified' | 'deleted' | 'renamed'> = {};
          nameStatus.split('\n').filter(Boolean).forEach((line: string) => {
            const [status, ...pathParts] = line.split('\t');
            const filePath = pathParts.join('\t'); // Handle files with tabs in name
            switch (status[0]) {
              case 'A': statusMap[filePath] = 'added'; break;
              case 'M': statusMap[filePath] = 'modified'; break;
              case 'D': statusMap[filePath] = 'deleted'; break;
              case 'R': statusMap[pathParts[1] || filePath] = 'renamed'; break;
              default: statusMap[filePath] = 'modified';
            }
          });

          // Parse numstat for additions/deletions
          numstat.split('\n').filter(Boolean).forEach((line: string) => {
            const [adds, dels, filePath] = line.split('\t');
            files.push({
              path: filePath,
              status: statusMap[filePath] || 'modified',
              additions: parseInt(adds, 10) || 0,
              deletions: parseInt(dels, 10) || 0
            });
          });
        } catch (diffError) {
          console.error('Error getting diff:', diffError);
        }

        // Generate summary
        const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
        const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
        const summary = `${files.length} files changed, ${totalAdditions} insertions(+), ${totalDeletions} deletions(-)`;

        return {
          success: true,
          data: { files, summary }
        };
      } catch (error) {
        console.error('Failed to get worktree diff:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get worktree diff'
        };
      }
    }
  );

  /**
   * Merge the worktree changes into the main branch
   * @param taskId - The task ID to merge
   * @param options - Merge options { noCommit?: boolean }
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_MERGE,
    async (_, taskId: string, options?: { noCommit?: boolean }): Promise<IPCResult<import('../shared/types').WorktreeMergeResult>> => {
      try {
        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          return { success: false, error: 'Task not found' };
        }

        // Use run.py --merge to handle the merge
        const sourcePath = getEffectiveSourcePath();
        if (!sourcePath) {
          return { success: false, error: 'Auto Claude source not found' };
        }

        const runScript = path.join(sourcePath, 'run.py');
        const specDir = path.join(project.path, project.autoBuildPath || '.auto-claude', 'specs', task.specId);

        if (!existsSync(specDir)) {
          return { success: false, error: 'Spec directory not found' };
        }

        const args = [
          runScript,
          '--spec', task.specId,
          '--project-dir', project.path,
          '--merge'
        ];

        // Add --no-commit flag if requested (stage changes without committing)
        if (options?.noCommit) {
          args.push('--no-commit');
        }

        return new Promise((resolve) => {
          const mergeProcess = spawn('python3', args, {
            cwd: sourcePath,
            env: {
              ...process.env,
              PYTHONUNBUFFERED: '1'
            }
          });

          let stdout = '';
          let stderr = '';

          mergeProcess.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          mergeProcess.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          mergeProcess.on('close', (code: number) => {
            if (code === 0) {
              // Persist the status change to implementation_plan.json
              const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
              try {
                if (existsSync(planPath)) {
                  const planContent = readFileSync(planPath, 'utf-8');
                  const plan = JSON.parse(planContent);
                  plan.status = 'done';
                  plan.planStatus = 'completed';
                  plan.updated_at = new Date().toISOString();
                  writeFileSync(planPath, JSON.stringify(plan, null, 2));
                }
              } catch (persistError) {
                console.error('Failed to persist task status:', persistError);
              }

              const mainWindow = getMainWindow();
              if (mainWindow) {
                mainWindow.webContents.send(IPC_CHANNELS.TASK_STATUS_CHANGE, taskId, 'done');
              }

              resolve({
                success: true,
                data: {
                  success: true,
                  message: 'Changes merged successfully'
                }
              });
            } else {
              // Check if there were conflicts
              const hasConflicts = stdout.includes('conflict') || stderr.includes('conflict');

              resolve({
                success: true,
                data: {
                  success: false,
                  message: hasConflicts ? 'Merge conflicts detected' : `Merge failed: ${stderr || stdout}`,
                  conflictFiles: hasConflicts ? [] : undefined
                }
              });
            }
          });

          mergeProcess.on('error', (err: Error) => {
            resolve({
              success: false,
              error: `Failed to run merge: ${err.message}`
            });
          });
        });
      } catch (error) {
        console.error('Failed to merge worktree:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to merge worktree'
        };
      }
    }
  );

  /**
   * Discard the worktree changes
   * Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_WORKTREE_DISCARD,
    async (_, taskId: string): Promise<IPCResult<import('../shared/types').WorktreeDiscardResult>> => {
      try {
        const { task, project } = findTaskAndProject(taskId);
        if (!task || !project) {
          return { success: false, error: 'Task not found' };
        }

        // Per-spec worktree path: .worktrees/{spec-name}/
        const worktreePath = path.join(project.path, '.worktrees', task.specId);

        if (!existsSync(worktreePath)) {
          return {
            success: true,
            data: {
              success: true,
              message: 'No worktree to discard'
            }
          };
        }

        try {
          // Get the branch name before removing
          const branch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: worktreePath,
            encoding: 'utf-8'
          }).trim();

          // Remove the worktree
          execSync(`git worktree remove --force "${worktreePath}"`, {
            cwd: project.path,
            encoding: 'utf-8'
          });

          // Delete the branch
          try {
            execSync(`git branch -D "${branch}"`, {
              cwd: project.path,
              encoding: 'utf-8'
            });
          } catch {
            // Branch might already be deleted or not exist
          }

          const mainWindow = getMainWindow();
          if (mainWindow) {
            mainWindow.webContents.send(IPC_CHANNELS.TASK_STATUS_CHANGE, taskId, 'backlog');
          }

          return {
            success: true,
            data: {
              success: true,
              message: 'Worktree discarded successfully'
            }
          };
        } catch (gitError) {
          console.error('Git error discarding worktree:', gitError);
          return {
            success: false,
            error: `Failed to discard worktree: ${gitError instanceof Error ? gitError.message : 'Unknown error'}`
          };
        }
      } catch (error) {
        console.error('Failed to discard worktree:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to discard worktree'
        };
      }
    }
  );

  /**
   * List all spec worktrees for a project
   * Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_LIST_WORKTREES,
    async (_, projectId: string): Promise<IPCResult<import('../shared/types').WorktreeListResult>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }

        const worktreesDir = path.join(project.path, '.worktrees');
        const worktrees: import('../shared/types').WorktreeListItem[] = [];

        if (!existsSync(worktreesDir)) {
          return { success: true, data: { worktrees } };
        }

        // Get all directories in .worktrees
        const entries = readdirSync(worktreesDir);
        for (const entry of entries) {
          const entryPath = path.join(worktreesDir, entry);
          const stat = statSync(entryPath);

          // Skip worker directories and non-directories
          if (!stat.isDirectory() || entry.startsWith('worker-')) {
            continue;
          }

          try {
            // Get branch info
            const branch = execSync('git rev-parse --abbrev-ref HEAD', {
              cwd: entryPath,
              encoding: 'utf-8'
            }).trim();

            // Get base branch
            let baseBranch = 'main';
            try {
              baseBranch = execSync('git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo main', {
                cwd: project.path,
                encoding: 'utf-8'
              }).trim().replace('origin/', '');
            } catch {
              baseBranch = 'main';
            }

            // Get commit count
            let commitCount = 0;
            try {
              const countOutput = execSync(`git rev-list --count ${baseBranch}..HEAD 2>/dev/null || echo 0`, {
                cwd: entryPath,
                encoding: 'utf-8'
              }).trim();
              commitCount = parseInt(countOutput, 10) || 0;
            } catch {
              commitCount = 0;
            }

            // Get diff stats
            let filesChanged = 0;
            let additions = 0;
            let deletions = 0;

            try {
              const diffStat = execSync(`git diff --shortstat ${baseBranch}...HEAD 2>/dev/null || echo ""`, {
                cwd: entryPath,
                encoding: 'utf-8'
              }).trim();

              const filesMatch = diffStat.match(/(\d+) files? changed/);
              const addMatch = diffStat.match(/(\d+) insertions?/);
              const delMatch = diffStat.match(/(\d+) deletions?/);

              if (filesMatch) filesChanged = parseInt(filesMatch[1], 10) || 0;
              if (addMatch) additions = parseInt(addMatch[1], 10) || 0;
              if (delMatch) deletions = parseInt(delMatch[1], 10) || 0;
            } catch {
              // Ignore diff errors
            }

            worktrees.push({
              specName: entry,
              path: entryPath,
              branch,
              baseBranch,
              commitCount,
              filesChanged,
              additions,
              deletions
            });
          } catch (gitError) {
            console.error(`Error getting info for worktree ${entry}:`, gitError);
            // Skip this worktree if we can't get git info
          }
        }

        return { success: true, data: { worktrees } };
      } catch (error) {
        console.error('Failed to list worktrees:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list worktrees'
        };
      }
    }
  );

  // ============================================
  // Task Phase Logs (collapsible by phase)
  // ============================================

  /**
   * Get task logs from spec directory
   * Returns logs organized by phase (planning, coding, validation)
   * Also checks worktree spec directory for coding/validation logs
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_LOGS_GET,
    async (_, projectId: string, specId: string): Promise<IPCResult<TaskLogs | null>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }

        // Get specs dir relative to project path
        const specsRelPath = getSpecsDir(project.autoBuildPath, project.settings.devMode);
        const specDir = path.join(project.path, specsRelPath, specId);

        if (!existsSync(specDir)) {
          return { success: false, error: 'Spec directory not found' };
        }

        // Pass project path and specs path so logs can be loaded from worktree too
        const logs = taskLogService.loadLogs(specDir, project.path, specsRelPath, specId);
        return { success: true, data: logs };
      } catch (error) {
        console.error('Failed to get task logs:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get task logs'
        };
      }
    }
  );

  /**
   * Start watching a spec for log changes
   * Emits TASK_LOGS_CHANGED and TASK_LOGS_STREAM events
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_LOGS_WATCH,
    async (_, projectId: string, specId: string): Promise<IPCResult> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }

        // Get specs dir relative to project path
        const specsRelPath = getSpecsDir(project.autoBuildPath, project.settings.devMode);
        const specDir = path.join(project.path, specsRelPath, specId);

        if (!existsSync(specDir)) {
          return { success: false, error: 'Spec directory not found' };
        }

        // Pass project path and specs relative path so the service can also watch
        // the worktree spec directory (where coding/validation logs are written)
        taskLogService.startWatching(specId, specDir, project.path, specsRelPath);
        return { success: true };
      } catch (error) {
        console.error('Failed to start watching task logs:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start watching'
        };
      }
    }
  );

  /**
   * Stop watching a spec for log changes
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_LOGS_UNWATCH,
    async (_, specId: string): Promise<IPCResult> => {
      try {
        taskLogService.stopWatching(specId);
        return { success: true };
      } catch (error) {
        console.error('Failed to stop watching task logs:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to stop watching'
        };
      }
    }
  );

  // Setup task log service event forwarding to renderer
  taskLogService.on('logs-changed', (specId: string, logs: TaskLogs) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_LOGS_CHANGED, specId, logs);
    }
  });

  taskLogService.on('stream-chunk', (specId: string, chunk: TaskLogStreamChunk) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_LOGS_STREAM, specId, chunk);
    }
  });

  // ============================================
  // Settings Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET,
    async (): Promise<IPCResult<AppSettings>> => {
      let settings = { ...DEFAULT_APP_SETTINGS };

      if (existsSync(settingsPath)) {
        try {
          const content = readFileSync(settingsPath, 'utf-8');
          settings = { ...settings, ...JSON.parse(content) };
        } catch {
          // Use defaults
        }
      }

      // If no manual autoBuildPath is set, try to auto-detect
      if (!settings.autoBuildPath) {
        const detectedPath = detectAutoBuildSourcePath();
        if (detectedPath) {
          settings.autoBuildPath = detectedPath;
        }
      }

      return { success: true, data: settings as AppSettings };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SAVE,
    async (_, settings: Partial<AppSettings>): Promise<IPCResult> => {
      try {
        let currentSettings = DEFAULT_APP_SETTINGS;
        if (existsSync(settingsPath)) {
          const content = readFileSync(settingsPath, 'utf-8');
          currentSettings = { ...currentSettings, ...JSON.parse(content) };
        }

        const newSettings = { ...currentSettings, ...settings };
        writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));

        // Apply Python path if changed
        if (settings.pythonPath || settings.autoBuildPath) {
          agentManager.configure(settings.pythonPath, settings.autoBuildPath);
        }

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save settings'
        };
      }
    }
  );

  // ============================================
  // Dialog Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.DIALOG_SELECT_DIRECTORY,
    async (): Promise<string | null> => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return null;

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Project Directory'
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    }
  );

  // ============================================
  // App Info
  // ============================================

  ipcMain.handle(IPC_CHANNELS.APP_VERSION, async (): Promise<string> => {
    return app.getVersion();
  });

  // ============================================
  // Terminal Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_CREATE,
    async (_, options: TerminalCreateOptions): Promise<IPCResult> => {
      return terminalManager.create(options);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_DESTROY,
    async (_, id: string): Promise<IPCResult> => {
      return terminalManager.destroy(id);
    }
  );

  ipcMain.on(
    IPC_CHANNELS.TERMINAL_INPUT,
    (_, id: string, data: string) => {
      terminalManager.write(id, data);
    }
  );

  ipcMain.on(
    IPC_CHANNELS.TERMINAL_RESIZE,
    (_, id: string, cols: number, rows: number) => {
      terminalManager.resize(id, cols, rows);
    }
  );

  ipcMain.on(
    IPC_CHANNELS.TERMINAL_INVOKE_CLAUDE,
    (_, id: string, cwd?: string) => {
      terminalManager.invokeClaude(id, cwd);
    }
  );

  // ============================================
  // Agent Manager Events → Renderer
  // ============================================

  agentManager.on('log', (taskId: string, log: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_LOG, taskId, log);
    }
  });

  agentManager.on('error', (taskId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_ERROR, taskId, error);
    }
  });

  agentManager.on('exit', (taskId: string, code: number | null, processType: import('./agent-manager').ProcessType) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Stop file watcher
      fileWatcher.unwatch(taskId);

      // Determine new status based on process type and exit code
      // Flow: Planning → In Progress → AI Review (QA agent) → Human Review (QA passed)
      let newStatus: TaskStatus;

      if (processType === 'task-execution') {
        // Task execution completed (includes spec_runner → run.py chain)
        // Success (code 0) = QA agent signed off → Human Review
        // Failure = needs human attention → Human Review
        newStatus = 'human_review';
      } else if (processType === 'qa-process') {
        // QA retry process completed
        newStatus = 'human_review';
      } else if (processType === 'spec-creation') {
        // Pure spec creation (shouldn't happen with current flow, but handle it)
        // Stay in backlog/planning
        console.log(`[Task ${taskId}] Spec creation completed with code ${code}`);
        return;
      } else {
        // Unknown process type
        newStatus = 'human_review';
      }

      mainWindow.webContents.send(
        IPC_CHANNELS.TASK_STATUS_CHANGE,
        taskId,
        newStatus
      );
    }
  });

  agentManager.on('execution-progress', (taskId: string, progress: import('./agent-manager').ExecutionProgressData) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_EXECUTION_PROGRESS, taskId, progress);

      // Auto-move task to AI Review when entering qa_review phase
      if (progress.phase === 'qa_review') {
        mainWindow.webContents.send(
          IPC_CHANNELS.TASK_STATUS_CHANGE,
          taskId,
          'ai_review'
        );
      }
    }
  });

  // ============================================
  // File Watcher Events → Renderer
  // ============================================

  fileWatcher.on('progress', (taskId: string, plan: ImplementationPlan) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_PROGRESS, taskId, plan);
    }
  });

  fileWatcher.on('error', (taskId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_ERROR, taskId, error);
    }
  });

  // ============================================
  // Roadmap Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.ROADMAP_GET,
    async (_, projectId: string): Promise<IPCResult<Roadmap | null>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const roadmapPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.ROADMAP_DIR,
        AUTO_BUILD_PATHS.ROADMAP_FILE
      );

      if (!existsSync(roadmapPath)) {
        return { success: true, data: null };
      }

      try {
        const content = readFileSync(roadmapPath, 'utf-8');
        const rawRoadmap = JSON.parse(content);

        // Transform snake_case to camelCase for frontend
        const roadmap: Roadmap = {
          id: rawRoadmap.id || `roadmap-${Date.now()}`,
          projectId,
          projectName: rawRoadmap.project_name || project.name,
          version: rawRoadmap.version || '1.0',
          vision: rawRoadmap.vision || '',
          targetAudience: {
            primary: rawRoadmap.target_audience?.primary || '',
            secondary: rawRoadmap.target_audience?.secondary || []
          },
          phases: (rawRoadmap.phases || []).map((phase: Record<string, unknown>) => ({
            id: phase.id,
            name: phase.name,
            description: phase.description,
            order: phase.order,
            status: phase.status || 'planned',
            features: phase.features || [],
            milestones: (phase.milestones as Array<Record<string, unknown>> || []).map((m) => ({
              id: m.id,
              title: m.title,
              description: m.description,
              features: m.features || [],
              status: m.status || 'planned',
              targetDate: m.target_date ? new Date(m.target_date as string) : undefined
            }))
          })),
          features: (rawRoadmap.features || []).map((feature: Record<string, unknown>) => ({
            id: feature.id,
            title: feature.title,
            description: feature.description,
            rationale: feature.rationale || '',
            priority: feature.priority || 'should',
            complexity: feature.complexity || 'medium',
            impact: feature.impact || 'medium',
            phaseId: feature.phase_id,
            dependencies: feature.dependencies || [],
            status: feature.status || 'idea',
            acceptanceCriteria: feature.acceptance_criteria || [],
            userStories: feature.user_stories || [],
            linkedSpecId: feature.linked_spec_id
          })),
          status: rawRoadmap.status || 'draft',
          createdAt: rawRoadmap.metadata?.created_at ? new Date(rawRoadmap.metadata.created_at) : new Date(),
          updatedAt: rawRoadmap.metadata?.updated_at ? new Date(rawRoadmap.metadata.updated_at) : new Date()
        };

        return { success: true, data: roadmap };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read roadmap'
        };
      }
    }
  );

  ipcMain.on(
    IPC_CHANNELS.ROADMAP_GENERATE,
    (_, projectId: string) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const project = projectStore.getProject(projectId);
      if (!project) {
        mainWindow.webContents.send(
          IPC_CHANNELS.ROADMAP_ERROR,
          projectId,
          'Project not found'
        );
        return;
      }

      // Start roadmap generation via agent manager
      agentManager.startRoadmapGeneration(projectId, project.path, false);

      // Send initial progress
      mainWindow.webContents.send(
        IPC_CHANNELS.ROADMAP_PROGRESS,
        projectId,
        {
          phase: 'analyzing',
          progress: 10,
          message: 'Analyzing project structure...'
        } as RoadmapGenerationStatus
      );
    }
  );

  ipcMain.on(
    IPC_CHANNELS.ROADMAP_REFRESH,
    (_, projectId: string) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const project = projectStore.getProject(projectId);
      if (!project) {
        mainWindow.webContents.send(
          IPC_CHANNELS.ROADMAP_ERROR,
          projectId,
          'Project not found'
        );
        return;
      }

      // Start roadmap regeneration with refresh flag
      agentManager.startRoadmapGeneration(projectId, project.path, true);

      // Send initial progress
      mainWindow.webContents.send(
        IPC_CHANNELS.ROADMAP_PROGRESS,
        projectId,
        {
          phase: 'analyzing',
          progress: 10,
          message: 'Refreshing roadmap...'
        } as RoadmapGenerationStatus
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ROADMAP_UPDATE_FEATURE,
    async (
      _,
      projectId: string,
      featureId: string,
      status: RoadmapFeatureStatus
    ): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const roadmapPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.ROADMAP_DIR,
        AUTO_BUILD_PATHS.ROADMAP_FILE
      );

      if (!existsSync(roadmapPath)) {
        return { success: false, error: 'Roadmap not found' };
      }

      try {
        const content = readFileSync(roadmapPath, 'utf-8');
        const roadmap = JSON.parse(content);

        // Find and update the feature
        const feature = roadmap.features?.find((f: { id: string }) => f.id === featureId);
        if (!feature) {
          return { success: false, error: 'Feature not found' };
        }

        feature.status = status;
        roadmap.metadata = roadmap.metadata || {};
        roadmap.metadata.updated_at = new Date().toISOString();

        writeFileSync(roadmapPath, JSON.stringify(roadmap, null, 2));

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update feature'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ROADMAP_CONVERT_TO_SPEC,
    async (
      _,
      projectId: string,
      featureId: string
    ): Promise<IPCResult<Task>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const roadmapPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.ROADMAP_DIR,
        AUTO_BUILD_PATHS.ROADMAP_FILE
      );

      if (!existsSync(roadmapPath)) {
        return { success: false, error: 'Roadmap not found' };
      }

      try {
        const content = readFileSync(roadmapPath, 'utf-8');
        const roadmap = JSON.parse(content);

        // Find the feature
        const feature = roadmap.features?.find((f: { id: string }) => f.id === featureId);
        if (!feature) {
          return { success: false, error: 'Feature not found' };
        }

        // Build task description from feature
        const taskDescription = `# ${feature.title}

${feature.description}

## Rationale
${feature.rationale || 'N/A'}

## User Stories
${(feature.user_stories || []).map((s: string) => `- ${s}`).join('\n') || 'N/A'}

## Acceptance Criteria
${(feature.acceptance_criteria || []).map((c: string) => `- [ ] ${c}`).join('\n') || 'N/A'}
`;

        // Generate task ID
        const taskId = `task-${Date.now()}`;

        // Start spec creation
        agentManager.startSpecCreation(taskId, project.path, taskDescription);

        // Update feature with linked spec
        feature.status = 'planned';
        feature.linked_spec_id = taskId;
        roadmap.metadata = roadmap.metadata || {};
        roadmap.metadata.updated_at = new Date().toISOString();
        writeFileSync(roadmapPath, JSON.stringify(roadmap, null, 2));

        // Create placeholder task
        const task: Task = {
          id: taskId,
          specId: '',
          projectId,
          title: feature.title,
          description: taskDescription,
          status: 'backlog',
          chunks: [],
          logs: [],
          createdAt: new Date(),
          updatedAt: new Date()
        };

        return { success: true, data: task };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to convert feature to spec'
        };
      }
    }
  );

  // ============================================
  // Roadmap Agent Events → Renderer
  // ============================================

  agentManager.on('roadmap-progress', (projectId: string, status: RoadmapGenerationStatus) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.ROADMAP_PROGRESS, projectId, status);
    }
  });

  agentManager.on('roadmap-complete', (projectId: string, roadmap: Roadmap) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.ROADMAP_COMPLETE, projectId, roadmap);
    }
  });

  agentManager.on('roadmap-error', (projectId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.ROADMAP_ERROR, projectId, error);
    }
  });

  // ============================================
  // Context Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.CONTEXT_GET,
    async (_, projectId: string): Promise<IPCResult<ProjectContextData>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      try {
        // Load project index
        let projectIndex: ProjectIndex | null = null;
        const indexPath = path.join(project.path, AUTO_BUILD_PATHS.PROJECT_INDEX);
        if (existsSync(indexPath)) {
          const content = readFileSync(indexPath, 'utf-8');
          projectIndex = JSON.parse(content);
        }

        // Load graphiti state from most recent spec or project root
        let memoryState: GraphitiMemoryState | null = null;
        let memoryStatus: GraphitiMemoryStatus = {
          enabled: false,
          available: false,
          reason: 'Graphiti not configured'
        };

        // Check for graphiti state in specs (use devMode-aware path)
        const devMode = project.settings.devMode ?? false;
        const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
        const specsDir = path.join(project.path, specsBaseDir);
        if (existsSync(specsDir)) {
          const specDirs = readdirSync(specsDir)
            .filter((f: string) => {
              const specPath = path.join(specsDir, f);
              return statSync(specPath).isDirectory();
            })
            .sort()
            .reverse();

          for (const specDir of specDirs) {
            const statePath = path.join(specsDir, specDir, AUTO_BUILD_PATHS.GRAPHITI_STATE);
            if (existsSync(statePath)) {
              const stateContent = readFileSync(statePath, 'utf-8');
              memoryState = JSON.parse(stateContent);

              // If we found a state, update memory status
              if (memoryState?.initialized) {
                memoryStatus = {
                  enabled: true,
                  available: true,
                  database: memoryState.database || 'auto_build_memory',
                  host: process.env.GRAPHITI_FALKORDB_HOST || 'localhost',
                  port: parseInt(process.env.GRAPHITI_FALKORDB_PORT || '6380', 10)
                };
              }
              break;
            }
          }
        }

        // Check environment for Graphiti config if not found in specs
        if (!memoryState) {
          // Load project .env file and global settings to check for Graphiti config
          let projectEnvVars: Record<string, string> = {};
          if (project.autoBuildPath) {
            const projectEnvPath = path.join(project.path, project.autoBuildPath, '.env');
            if (existsSync(projectEnvPath)) {
              try {
                const envContent = readFileSync(projectEnvPath, 'utf-8');
                // Parse .env file inline
                for (const line of envContent.split('\n')) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed.startsWith('#')) continue;
                  const eqIndex = trimmed.indexOf('=');
                  if (eqIndex > 0) {
                    const key = trimmed.substring(0, eqIndex).trim();
                    let value = trimmed.substring(eqIndex + 1).trim();
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                      value = value.slice(1, -1);
                    }
                    projectEnvVars[key] = value;
                  }
                }
              } catch {
                // Continue with empty vars
              }
            }
          }

          // Load global settings for OpenAI API key fallback
          let globalOpenAIKey: string | undefined;
          if (existsSync(settingsPath)) {
            try {
              const settingsContent = readFileSync(settingsPath, 'utf-8');
              const globalSettings = JSON.parse(settingsContent);
              globalOpenAIKey = globalSettings.globalOpenAIApiKey;
            } catch {
              // Continue without global settings
            }
          }

          // Check for Graphiti config: project .env > process.env
          const graphitiEnabled =
            projectEnvVars['GRAPHITI_ENABLED']?.toLowerCase() === 'true' ||
            process.env.GRAPHITI_ENABLED?.toLowerCase() === 'true';

          // Check for OpenAI key: project .env > global settings > process.env
          const hasOpenAI =
            !!projectEnvVars['OPENAI_API_KEY'] ||
            !!globalOpenAIKey ||
            !!process.env.OPENAI_API_KEY;

          // Get Graphiti connection details from project .env or process.env
          const graphitiHost = projectEnvVars['GRAPHITI_FALKORDB_HOST'] || process.env.GRAPHITI_FALKORDB_HOST || 'localhost';
          const graphitiPort = parseInt(projectEnvVars['GRAPHITI_FALKORDB_PORT'] || process.env.GRAPHITI_FALKORDB_PORT || '6380', 10);
          const graphitiDatabase = projectEnvVars['GRAPHITI_DATABASE'] || process.env.GRAPHITI_DATABASE || 'auto_build_memory';

          if (graphitiEnabled && hasOpenAI) {
            memoryStatus = {
              enabled: true,
              available: true,
              host: graphitiHost,
              port: graphitiPort,
              database: graphitiDatabase
            };
          } else if (graphitiEnabled && !hasOpenAI) {
            memoryStatus = {
              enabled: true,
              available: false,
              reason: 'OPENAI_API_KEY not set (required for Graphiti embeddings)'
            };
          }
        }

        // Load recent memories from file-based memory (session insights)
        const recentMemories: MemoryEpisode[] = [];
        if (existsSync(specsDir)) {
          const recentSpecDirs = readdirSync(specsDir)
            .filter((f: string) => {
              const specPath = path.join(specsDir, f);
              return statSync(specPath).isDirectory();
            })
            .sort()
            .reverse()
            .slice(0, 10); // Last 10 specs

          for (const specDir of recentSpecDirs) {
            // Look for session memory files
            const memoryDir = path.join(specsDir, specDir, 'memory');
            if (existsSync(memoryDir)) {
              const memoryFiles = readdirSync(memoryDir)
                .filter((f: string) => f.endsWith('.json'))
                .sort()
                .reverse();

              for (const memFile of memoryFiles.slice(0, 3)) {
                try {
                  const memPath = path.join(memoryDir, memFile);
                  const memContent = readFileSync(memPath, 'utf-8');
                  const memData = JSON.parse(memContent);

                  if (memData.insights) {
                    recentMemories.push({
                      id: `${specDir}-${memFile}`,
                      type: 'session_insight',
                      timestamp: memData.timestamp || new Date().toISOString(),
                      content: JSON.stringify(memData.insights, null, 2),
                      session_number: memData.session_number
                    });
                  }
                } catch {
                  // Skip invalid files
                }
              }
            }
          }
        }

        return {
          success: true,
          data: {
            projectIndex,
            memoryStatus,
            memoryState,
            recentMemories: recentMemories.slice(0, 20),
            isLoading: false
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load project context'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CONTEXT_REFRESH_INDEX,
    async (_, projectId: string): Promise<IPCResult<ProjectIndex>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      try {
        // Run the analyzer script to regenerate project_index.json
        const autoBuildSource = getAutoBuildSourcePath();

        if (!autoBuildSource) {
          return {
            success: false,
            error: 'Auto-build source path not configured'
          };
        }

        const analyzerPath = path.join(autoBuildSource, 'analyzer.py');
        const indexOutputPath = path.join(project.path, AUTO_BUILD_PATHS.PROJECT_INDEX);

        // Run analyzer
        await new Promise<void>((resolve, reject) => {
          const proc = spawn('python', [
            analyzerPath,
            '--project-dir', project.path,
            '--output', indexOutputPath
          ], {
            cwd: project.path,
            env: { ...process.env }
          });

          proc.on('close', (code: number) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Analyzer exited with code ${code}`));
            }
          });

          proc.on('error', reject);
        });

        // Read the new index
        if (existsSync(indexOutputPath)) {
          const content = readFileSync(indexOutputPath, 'utf-8');
          const projectIndex = JSON.parse(content);
          return { success: true, data: projectIndex };
        }

        return { success: false, error: 'Failed to generate project index' };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to refresh project index'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CONTEXT_MEMORY_STATUS,
    async (_, projectId: string): Promise<IPCResult<GraphitiMemoryStatus>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // Load project .env file to check for Graphiti config
      let projectEnvVars: Record<string, string> = {};
      if (project.autoBuildPath) {
        const projectEnvPath = path.join(project.path, project.autoBuildPath, '.env');
        if (existsSync(projectEnvPath)) {
          try {
            const envContent = readFileSync(projectEnvPath, 'utf-8');
            // Parse .env file inline
            for (const line of envContent.split('\n')) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith('#')) continue;
              const eqIndex = trimmed.indexOf('=');
              if (eqIndex > 0) {
                const key = trimmed.substring(0, eqIndex).trim();
                let value = trimmed.substring(eqIndex + 1).trim();
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                  value = value.slice(1, -1);
                }
                projectEnvVars[key] = value;
              }
            }
          } catch {
            // Continue with empty vars
          }
        }
      }

      // Load global settings for OpenAI API key fallback
      let globalOpenAIKey: string | undefined;
      if (existsSync(settingsPath)) {
        try {
          const settingsContent = readFileSync(settingsPath, 'utf-8');
          const globalSettings = JSON.parse(settingsContent);
          globalOpenAIKey = globalSettings.globalOpenAIApiKey;
        } catch {
          // Continue without global settings
        }
      }

      // Check for Graphiti config: project .env > process.env
      const graphitiEnabled =
        projectEnvVars['GRAPHITI_ENABLED']?.toLowerCase() === 'true' ||
        process.env.GRAPHITI_ENABLED?.toLowerCase() === 'true';

      // Check for OpenAI key: project .env > global settings > process.env
      const hasOpenAI =
        !!projectEnvVars['OPENAI_API_KEY'] ||
        !!globalOpenAIKey ||
        !!process.env.OPENAI_API_KEY;

      // Get Graphiti connection details from project .env or process.env
      const graphitiHost = projectEnvVars['GRAPHITI_FALKORDB_HOST'] || process.env.GRAPHITI_FALKORDB_HOST || 'localhost';
      const graphitiPort = parseInt(projectEnvVars['GRAPHITI_FALKORDB_PORT'] || process.env.GRAPHITI_FALKORDB_PORT || '6380', 10);
      const graphitiDatabase = projectEnvVars['GRAPHITI_DATABASE'] || process.env.GRAPHITI_DATABASE || 'auto_build_memory';

      if (!graphitiEnabled) {
        return {
          success: true,
          data: {
            enabled: false,
            available: false,
            reason: 'GRAPHITI_ENABLED not set to true'
          }
        };
      }

      if (!hasOpenAI) {
        return {
          success: true,
          data: {
            enabled: true,
            available: false,
            reason: 'OPENAI_API_KEY not set (required for embeddings)'
          }
        };
      }

      return {
        success: true,
        data: {
          enabled: true,
          available: true,
          host: graphitiHost,
          port: graphitiPort,
          database: graphitiDatabase
        }
      };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CONTEXT_SEARCH_MEMORIES,
    async (_, projectId: string, query: string): Promise<IPCResult<ContextSearchResult[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // For now, do simple text search in file-based memories
      // Graphiti search would require running Python subprocess
      const results: ContextSearchResult[] = [];
      const queryLower = query.toLowerCase();

      // Use devMode-aware path
      const devMode = project.settings.devMode ?? false;
      const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
      const specsDir = path.join(project.path, specsBaseDir);
      if (existsSync(specsDir)) {
        const allSpecDirs = readdirSync(specsDir)
          .filter((f: string) => {
            const specPath = path.join(specsDir, f);
            return statSync(specPath).isDirectory();
          });

        for (const specDir of allSpecDirs) {
          const memoryDir = path.join(specsDir, specDir, 'memory');
          if (existsSync(memoryDir)) {
            const memoryFiles = readdirSync(memoryDir)
              .filter((f: string) => f.endsWith('.json'));

            for (const memFile of memoryFiles) {
              try {
                const memPath = path.join(memoryDir, memFile);
                const memContent = readFileSync(memPath, 'utf-8');

                if (memContent.toLowerCase().includes(queryLower)) {
                  const memData = JSON.parse(memContent);
                  results.push({
                    content: JSON.stringify(memData.insights || memData, null, 2),
                    score: 1.0,
                    type: 'session_insight'
                  });
                }
              } catch {
                // Skip invalid files
              }
            }
          }
        }
      }

      return { success: true, data: results.slice(0, 20) };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CONTEXT_GET_MEMORIES,
    async (_, projectId: string, limit: number = 20): Promise<IPCResult<MemoryEpisode[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const memories: MemoryEpisode[] = [];

      // Use devMode-aware path
      const devMode = project.settings.devMode ?? false;
      const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
      const specsDir = path.join(project.path, specsBaseDir);

      if (existsSync(specsDir)) {
        const sortedSpecDirs = readdirSync(specsDir)
          .filter((f: string) => {
            const specPath = path.join(specsDir, f);
            return statSync(specPath).isDirectory();
          })
          .sort()
          .reverse();

        for (const specDir of sortedSpecDirs) {
          const memoryDir = path.join(specsDir, specDir, 'memory');
          if (existsSync(memoryDir)) {
            const memoryFiles = readdirSync(memoryDir)
              .filter((f: string) => f.endsWith('.json'))
              .sort()
              .reverse();

            for (const memFile of memoryFiles) {
              try {
                const memPath = path.join(memoryDir, memFile);
                const memContent = readFileSync(memPath, 'utf-8');
                const memData = JSON.parse(memContent);

                memories.push({
                  id: `${specDir}-${memFile}`,
                  type: memData.type || 'session_insight',
                  timestamp: memData.timestamp || new Date().toISOString(),
                  content: JSON.stringify(memData.insights || memData, null, 2),
                  session_number: memData.session_number
                });

                if (memories.length >= limit) {
                  break;
                }
              } catch {
                // Skip invalid files
              }
            }
          }

          if (memories.length >= limit) {
            break;
          }
        }
      }

      return { success: true, data: memories };
    }
  );

  // ============================================
  // Environment Configuration Operations
  // ============================================

  /**
   * Parse .env file into key-value object
   */
  const parseEnvFile = (content: string): Record<string, string> => {
    const result: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;

      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex > 0) {
        const key = trimmed.substring(0, equalsIndex).trim();
        let value = trimmed.substring(equalsIndex + 1).trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        result[key] = value;
      }
    }
    return result;
  };

  /**
   * Generate .env file content from config
   */
  const generateEnvContent = (
    config: Partial<ProjectEnvConfig>,
    existingContent?: string
  ): string => {
    // Parse existing content to preserve comments and structure
    const existingVars = existingContent ? parseEnvFile(existingContent) : {};

    // Update with new values
    if (config.claudeOAuthToken !== undefined) {
      existingVars['CLAUDE_CODE_OAUTH_TOKEN'] = config.claudeOAuthToken;
    }
    if (config.autoBuildModel !== undefined) {
      existingVars['AUTO_BUILD_MODEL'] = config.autoBuildModel;
    }
    if (config.linearApiKey !== undefined) {
      existingVars['LINEAR_API_KEY'] = config.linearApiKey;
    }
    if (config.linearTeamId !== undefined) {
      existingVars['LINEAR_TEAM_ID'] = config.linearTeamId;
    }
    if (config.linearProjectId !== undefined) {
      existingVars['LINEAR_PROJECT_ID'] = config.linearProjectId;
    }
    if (config.linearRealtimeSync !== undefined) {
      existingVars['LINEAR_REALTIME_SYNC'] = config.linearRealtimeSync ? 'true' : 'false';
    }
    // GitHub Integration
    if (config.githubToken !== undefined) {
      existingVars['GITHUB_TOKEN'] = config.githubToken;
    }
    if (config.githubRepo !== undefined) {
      existingVars['GITHUB_REPO'] = config.githubRepo;
    }
    if (config.githubAutoSync !== undefined) {
      existingVars['GITHUB_AUTO_SYNC'] = config.githubAutoSync ? 'true' : 'false';
    }
    if (config.graphitiEnabled !== undefined) {
      existingVars['GRAPHITI_ENABLED'] = config.graphitiEnabled ? 'true' : 'false';
    }
    if (config.openaiApiKey !== undefined) {
      existingVars['OPENAI_API_KEY'] = config.openaiApiKey;
    }
    if (config.graphitiFalkorDbHost !== undefined) {
      existingVars['GRAPHITI_FALKORDB_HOST'] = config.graphitiFalkorDbHost;
    }
    if (config.graphitiFalkorDbPort !== undefined) {
      existingVars['GRAPHITI_FALKORDB_PORT'] = String(config.graphitiFalkorDbPort);
    }
    if (config.graphitiFalkorDbPassword !== undefined) {
      existingVars['GRAPHITI_FALKORDB_PASSWORD'] = config.graphitiFalkorDbPassword;
    }
    if (config.graphitiDatabase !== undefined) {
      existingVars['GRAPHITI_DATABASE'] = config.graphitiDatabase;
    }
    if (config.enableFancyUi !== undefined) {
      existingVars['ENABLE_FANCY_UI'] = config.enableFancyUi ? 'true' : 'false';
    }

    // Generate content with sections
    let content = `# Auto Claude Framework Environment Variables
# Managed by Auto Claude UI

# Claude Code OAuth Token (REQUIRED)
CLAUDE_CODE_OAUTH_TOKEN=${existingVars['CLAUDE_CODE_OAUTH_TOKEN'] || ''}

# Model override (OPTIONAL)
${existingVars['AUTO_BUILD_MODEL'] ? `AUTO_BUILD_MODEL=${existingVars['AUTO_BUILD_MODEL']}` : '# AUTO_BUILD_MODEL=claude-opus-4-5-20251101'}

# =============================================================================
# LINEAR INTEGRATION (OPTIONAL)
# =============================================================================
${existingVars['LINEAR_API_KEY'] ? `LINEAR_API_KEY=${existingVars['LINEAR_API_KEY']}` : '# LINEAR_API_KEY='}
${existingVars['LINEAR_TEAM_ID'] ? `LINEAR_TEAM_ID=${existingVars['LINEAR_TEAM_ID']}` : '# LINEAR_TEAM_ID='}
${existingVars['LINEAR_PROJECT_ID'] ? `LINEAR_PROJECT_ID=${existingVars['LINEAR_PROJECT_ID']}` : '# LINEAR_PROJECT_ID='}
${existingVars['LINEAR_REALTIME_SYNC'] !== undefined ? `LINEAR_REALTIME_SYNC=${existingVars['LINEAR_REALTIME_SYNC']}` : '# LINEAR_REALTIME_SYNC=false'}

# =============================================================================
# GITHUB INTEGRATION (OPTIONAL)
# =============================================================================
${existingVars['GITHUB_TOKEN'] ? `GITHUB_TOKEN=${existingVars['GITHUB_TOKEN']}` : '# GITHUB_TOKEN='}
${existingVars['GITHUB_REPO'] ? `GITHUB_REPO=${existingVars['GITHUB_REPO']}` : '# GITHUB_REPO=owner/repo'}
${existingVars['GITHUB_AUTO_SYNC'] !== undefined ? `GITHUB_AUTO_SYNC=${existingVars['GITHUB_AUTO_SYNC']}` : '# GITHUB_AUTO_SYNC=false'}

# =============================================================================
# UI SETTINGS (OPTIONAL)
# =============================================================================
${existingVars['ENABLE_FANCY_UI'] !== undefined ? `ENABLE_FANCY_UI=${existingVars['ENABLE_FANCY_UI']}` : '# ENABLE_FANCY_UI=true'}

# =============================================================================
# GRAPHITI MEMORY INTEGRATION (OPTIONAL)
# =============================================================================
${existingVars['GRAPHITI_ENABLED'] ? `GRAPHITI_ENABLED=${existingVars['GRAPHITI_ENABLED']}` : '# GRAPHITI_ENABLED=false'}
${existingVars['OPENAI_API_KEY'] ? `OPENAI_API_KEY=${existingVars['OPENAI_API_KEY']}` : '# OPENAI_API_KEY='}
${existingVars['GRAPHITI_FALKORDB_HOST'] ? `GRAPHITI_FALKORDB_HOST=${existingVars['GRAPHITI_FALKORDB_HOST']}` : '# GRAPHITI_FALKORDB_HOST=localhost'}
${existingVars['GRAPHITI_FALKORDB_PORT'] ? `GRAPHITI_FALKORDB_PORT=${existingVars['GRAPHITI_FALKORDB_PORT']}` : '# GRAPHITI_FALKORDB_PORT=6380'}
${existingVars['GRAPHITI_FALKORDB_PASSWORD'] ? `GRAPHITI_FALKORDB_PASSWORD=${existingVars['GRAPHITI_FALKORDB_PASSWORD']}` : '# GRAPHITI_FALKORDB_PASSWORD='}
${existingVars['GRAPHITI_DATABASE'] ? `GRAPHITI_DATABASE=${existingVars['GRAPHITI_DATABASE']}` : '# GRAPHITI_DATABASE=auto_build_memory'}
`;

    return content;
  };

  ipcMain.handle(
    IPC_CHANNELS.ENV_GET,
    async (_, projectId: string): Promise<IPCResult<ProjectEnvConfig>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      if (!project.autoBuildPath) {
        return { success: false, error: 'Project not initialized' };
      }

      const envPath = path.join(project.path, project.autoBuildPath, '.env');

      // Load global settings for fallbacks
      let globalSettings: AppSettings = { ...DEFAULT_APP_SETTINGS };
      if (existsSync(settingsPath)) {
        try {
          const content = readFileSync(settingsPath, 'utf-8');
          globalSettings = { ...globalSettings, ...JSON.parse(content) };
        } catch {
          // Use defaults
        }
      }

      // Default config
      const config: ProjectEnvConfig = {
        claudeAuthStatus: 'not_configured',
        linearEnabled: false,
        githubEnabled: false,
        graphitiEnabled: false,
        enableFancyUi: true,
        claudeTokenIsGlobal: false,
        openaiKeyIsGlobal: false
      };

      // Parse project-specific .env if it exists
      let vars: Record<string, string> = {};
      if (existsSync(envPath)) {
        try {
          const content = readFileSync(envPath, 'utf-8');
          vars = parseEnvFile(content);
        } catch {
          // Continue with empty vars
        }
      }

      // Claude OAuth Token: project-specific takes precedence, then global
      if (vars['CLAUDE_CODE_OAUTH_TOKEN']) {
        config.claudeOAuthToken = vars['CLAUDE_CODE_OAUTH_TOKEN'];
        config.claudeAuthStatus = 'token_set';
        config.claudeTokenIsGlobal = false;
      } else if (globalSettings.globalClaudeOAuthToken) {
        config.claudeOAuthToken = globalSettings.globalClaudeOAuthToken;
        config.claudeAuthStatus = 'token_set';
        config.claudeTokenIsGlobal = true;
      }

      if (vars['AUTO_BUILD_MODEL']) {
        config.autoBuildModel = vars['AUTO_BUILD_MODEL'];
      }

      if (vars['LINEAR_API_KEY']) {
        config.linearEnabled = true;
        config.linearApiKey = vars['LINEAR_API_KEY'];
      }
      if (vars['LINEAR_TEAM_ID']) {
        config.linearTeamId = vars['LINEAR_TEAM_ID'];
      }
      if (vars['LINEAR_PROJECT_ID']) {
        config.linearProjectId = vars['LINEAR_PROJECT_ID'];
      }
      if (vars['LINEAR_REALTIME_SYNC']?.toLowerCase() === 'true') {
        config.linearRealtimeSync = true;
      }

      // GitHub config
      if (vars['GITHUB_TOKEN']) {
        config.githubEnabled = true;
        config.githubToken = vars['GITHUB_TOKEN'];
      }
      if (vars['GITHUB_REPO']) {
        config.githubRepo = vars['GITHUB_REPO'];
      }
      if (vars['GITHUB_AUTO_SYNC']?.toLowerCase() === 'true') {
        config.githubAutoSync = true;
      }

      if (vars['GRAPHITI_ENABLED']?.toLowerCase() === 'true') {
        config.graphitiEnabled = true;
      }

      // OpenAI API Key: project-specific takes precedence, then global
      if (vars['OPENAI_API_KEY']) {
        config.openaiApiKey = vars['OPENAI_API_KEY'];
        config.openaiKeyIsGlobal = false;
      } else if (globalSettings.globalOpenAIApiKey) {
        config.openaiApiKey = globalSettings.globalOpenAIApiKey;
        config.openaiKeyIsGlobal = true;
      }

      if (vars['GRAPHITI_FALKORDB_HOST']) {
        config.graphitiFalkorDbHost = vars['GRAPHITI_FALKORDB_HOST'];
      }
      if (vars['GRAPHITI_FALKORDB_PORT']) {
        config.graphitiFalkorDbPort = parseInt(vars['GRAPHITI_FALKORDB_PORT'], 10);
      }
      if (vars['GRAPHITI_FALKORDB_PASSWORD']) {
        config.graphitiFalkorDbPassword = vars['GRAPHITI_FALKORDB_PASSWORD'];
      }
      if (vars['GRAPHITI_DATABASE']) {
        config.graphitiDatabase = vars['GRAPHITI_DATABASE'];
      }

      if (vars['ENABLE_FANCY_UI']?.toLowerCase() === 'false') {
        config.enableFancyUi = false;
      }

      return { success: true, data: config };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ENV_UPDATE,
    async (_, projectId: string, config: Partial<ProjectEnvConfig>): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      if (!project.autoBuildPath) {
        return { success: false, error: 'Project not initialized' };
      }

      const envPath = path.join(project.path, project.autoBuildPath, '.env');

      try {
        // Read existing content if file exists
        let existingContent: string | undefined;
        if (existsSync(envPath)) {
          existingContent = readFileSync(envPath, 'utf-8');
        }

        // Generate new content
        const newContent = generateEnvContent(config, existingContent);

        // Write to file
        writeFileSync(envPath, newContent);

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update .env file'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ENV_CHECK_CLAUDE_AUTH,
    async (_, projectId: string): Promise<IPCResult<ClaudeAuthResult>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      try {
        // Check if Claude CLI is available and authenticated
        const result = await new Promise<ClaudeAuthResult>((resolve) => {
          const proc = spawn('claude', ['--version'], {
            cwd: project.path,
            env: { ...process.env },
            shell: true
          });

          let stdout = '';
          let stderr = '';

          proc.stdout?.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          proc.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          proc.on('close', (code: number | null) => {
            if (code === 0) {
              // Claude CLI is available, check if authenticated
              // Run a simple command that requires auth
              const authCheck = spawn('claude', ['api', '--help'], {
                cwd: project.path,
                env: { ...process.env },
                shell: true
              });

              authCheck.on('close', (authCode: number | null) => {
                resolve({
                  success: true,
                  authenticated: authCode === 0
                });
              });

              authCheck.on('error', () => {
                resolve({
                  success: true,
                  authenticated: false,
                  error: 'Could not verify authentication'
                });
              });
            } else {
              resolve({
                success: false,
                authenticated: false,
                error: 'Claude CLI not found. Please install it first.'
              });
            }
          });

          proc.on('error', () => {
            resolve({
              success: false,
              authenticated: false,
              error: 'Claude CLI not found. Please install it first.'
            });
          });
        });

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check Claude auth'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ENV_INVOKE_CLAUDE_SETUP,
    async (_, projectId: string): Promise<IPCResult<ClaudeAuthResult>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      try {
        // Run claude setup-token which will open browser for OAuth
        const result = await new Promise<ClaudeAuthResult>((resolve) => {
          const proc = spawn('claude', ['setup-token'], {
            cwd: project.path,
            env: { ...process.env },
            shell: true,
            stdio: 'inherit' // This allows the terminal to handle the interactive auth
          });

          proc.on('close', (code: number | null) => {
            if (code === 0) {
              resolve({
                success: true,
                authenticated: true
              });
            } else {
              resolve({
                success: false,
                authenticated: false,
                error: 'Setup cancelled or failed'
              });
            }
          });

          proc.on('error', (err: Error) => {
            resolve({
              success: false,
              authenticated: false,
              error: err.message
            });
          });
        });

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to invoke Claude setup'
        };
      }
    }
  );

  // ============================================
  // Linear Integration Operations
  // ============================================

  /**
   * Helper to get Linear API key from project env
   */
  const getLinearApiKey = (project: Project): string | null => {
    if (!project.autoBuildPath) return null;
    const envPath = path.join(project.path, project.autoBuildPath, '.env');
    if (!existsSync(envPath)) return null;

    try {
      const content = readFileSync(envPath, 'utf-8');
      const vars = parseEnvFile(content);
      return vars['LINEAR_API_KEY'] || null;
    } catch {
      return null;
    }
  };

  /**
   * Make a request to the Linear API
   */
  const linearGraphQL = async (
    apiKey: string,
    query: string,
    variables?: Record<string, unknown>
  ): Promise<unknown> => {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (result.errors) {
      throw new Error(result.errors[0]?.message || 'Linear API error');
    }

    return result.data;
  };

  ipcMain.handle(
    IPC_CHANNELS.LINEAR_CHECK_CONNECTION,
    async (_, projectId: string): Promise<IPCResult<LinearSyncStatus>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const apiKey = getLinearApiKey(project);
      if (!apiKey) {
        return {
          success: true,
          data: {
            connected: false,
            error: 'No Linear API key configured'
          }
        };
      }

      try {
        const query = `
          query {
            viewer {
              id
              name
            }
            teams {
              nodes {
                id
                name
                key
              }
            }
          }
        `;

        const data = await linearGraphQL(apiKey, query) as {
          viewer: { id: string; name: string };
          teams: { nodes: Array<{ id: string; name: string; key: string }> };
        };

        // Get issue count for the first team
        let issueCount = 0;
        let teamName: string | undefined;

        if (data.teams.nodes.length > 0) {
          teamName = data.teams.nodes[0].name;
          const countQuery = `
            query($teamId: String!) {
              team(id: $teamId) {
                issues {
                  totalCount: nodes { id }
                }
              }
            }
          `;
          // Get approximate count
          const issuesQuery = `
            query($teamId: String!) {
              issues(filter: { team: { id: { eq: $teamId } } }, first: 0) {
                pageInfo {
                  hasNextPage
                }
              }
            }
          `;

          // Simple count estimation - get first 250 issues
          const countData = await linearGraphQL(apiKey, `
            query($teamId: String!) {
              issues(filter: { team: { id: { eq: $teamId } } }, first: 250) {
                nodes { id }
              }
            }
          `, { teamId: data.teams.nodes[0].id }) as {
            issues: { nodes: Array<{ id: string }> };
          };
          issueCount = countData.issues.nodes.length;
        }

        return {
          success: true,
          data: {
            connected: true,
            teamName,
            issueCount,
            lastSyncedAt: new Date().toISOString()
          }
        };
      } catch (error) {
        return {
          success: true,
          data: {
            connected: false,
            error: error instanceof Error ? error.message : 'Failed to connect to Linear'
          }
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.LINEAR_GET_TEAMS,
    async (_, projectId: string): Promise<IPCResult<LinearTeam[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const apiKey = getLinearApiKey(project);
      if (!apiKey) {
        return { success: false, error: 'No Linear API key configured' };
      }

      try {
        const query = `
          query {
            teams {
              nodes {
                id
                name
                key
              }
            }
          }
        `;

        const data = await linearGraphQL(apiKey, query) as {
          teams: { nodes: LinearTeam[] };
        };

        return { success: true, data: data.teams.nodes };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch teams'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.LINEAR_GET_PROJECTS,
    async (_, projectId: string, teamId: string): Promise<IPCResult<LinearProject[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const apiKey = getLinearApiKey(project);
      if (!apiKey) {
        return { success: false, error: 'No Linear API key configured' };
      }

      try {
        const query = `
          query($teamId: String!) {
            team(id: $teamId) {
              projects {
                nodes {
                  id
                  name
                  state
                }
              }
            }
          }
        `;

        const data = await linearGraphQL(apiKey, query, { teamId }) as {
          team: { projects: { nodes: LinearProject[] } };
        };

        return { success: true, data: data.team.projects.nodes };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch projects'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.LINEAR_GET_ISSUES,
    async (_, projectId: string, teamId?: string, linearProjectId?: string): Promise<IPCResult<LinearIssue[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const apiKey = getLinearApiKey(project);
      if (!apiKey) {
        return { success: false, error: 'No Linear API key configured' };
      }

      try {
        // Build filter based on provided parameters
        const filters: string[] = [];
        if (teamId) {
          filters.push(`team: { id: { eq: "${teamId}" } }`);
        }
        if (linearProjectId) {
          filters.push(`project: { id: { eq: "${linearProjectId}" } }`);
        }

        const filterClause = filters.length > 0 ? `filter: { ${filters.join(', ')} }` : '';

        const query = `
          query {
            issues(${filterClause}, first: 250, orderBy: updatedAt) {
              nodes {
                id
                identifier
                title
                description
                state {
                  id
                  name
                  type
                }
                priority
                priorityLabel
                labels {
                  nodes {
                    id
                    name
                    color
                  }
                }
                assignee {
                  id
                  name
                  email
                }
                project {
                  id
                  name
                }
                createdAt
                updatedAt
                url
              }
            }
          }
        `;

        const data = await linearGraphQL(apiKey, query) as {
          issues: {
            nodes: Array<{
              id: string;
              identifier: string;
              title: string;
              description?: string;
              state: { id: string; name: string; type: string };
              priority: number;
              priorityLabel: string;
              labels: { nodes: Array<{ id: string; name: string; color: string }> };
              assignee?: { id: string; name: string; email: string };
              project?: { id: string; name: string };
              createdAt: string;
              updatedAt: string;
              url: string;
            }>;
          };
        };

        // Transform to our LinearIssue format
        const issues: LinearIssue[] = data.issues.nodes.map(issue => ({
          ...issue,
          labels: issue.labels.nodes
        }));

        return { success: true, data: issues };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch issues'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.LINEAR_IMPORT_ISSUES,
    async (_, projectId: string, issueIds: string[]): Promise<IPCResult<LinearImportResult>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const apiKey = getLinearApiKey(project);
      if (!apiKey) {
        return { success: false, error: 'No Linear API key configured' };
      }

      try {
        // First, fetch the full details of selected issues
        const query = `
          query($ids: [String!]!) {
            issues(filter: { id: { in: $ids } }) {
              nodes {
                id
                identifier
                title
                description
                state {
                  id
                  name
                  type
                }
                priority
                priorityLabel
                labels {
                  nodes {
                    id
                    name
                    color
                  }
                }
                url
              }
            }
          }
        `;

        const data = await linearGraphQL(apiKey, query, { ids: issueIds }) as {
          issues: {
            nodes: Array<{
              id: string;
              identifier: string;
              title: string;
              description?: string;
              state: { id: string; name: string; type: string };
              priority: number;
              priorityLabel: string;
              labels: { nodes: Array<{ id: string; name: string; color: string }> };
              url: string;
            }>;
          };
        };

        let imported = 0;
        let failed = 0;
        const errors: string[] = [];

        // Create tasks for each imported issue
        for (const issue of data.issues.nodes) {
          try {
            // Build description from Linear issue
            const labels = issue.labels.nodes.map(l => l.name).join(', ');
            const description = `# ${issue.title}

**Linear Issue:** [${issue.identifier}](${issue.url})
**Priority:** ${issue.priorityLabel}
**Status:** ${issue.state.name}
${labels ? `**Labels:** ${labels}` : ''}

## Description

${issue.description || 'No description provided.'}
`;

            // Generate task ID
            const taskId = `task-${Date.now()}-${imported}`;

            // Start spec creation for this issue
            agentManager.startSpecCreation(taskId, project.path, description);

            imported++;
          } catch (err) {
            failed++;
            errors.push(`Failed to import ${issue.identifier}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        }

        return {
          success: true,
          data: {
            success: failed === 0,
            imported,
            failed,
            errors: errors.length > 0 ? errors : undefined
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to import issues'
        };
      }
    }
  );

  // ============================================
  // GitHub Integration Operations
  // ============================================

  /**
   * Helper to get GitHub config from project env
   */
  const getGitHubConfig = (project: Project): { token: string; repo: string } | null => {
    if (!project.autoBuildPath) return null;
    const envPath = path.join(project.path, project.autoBuildPath, '.env');
    if (!existsSync(envPath)) return null;

    try {
      const content = readFileSync(envPath, 'utf-8');
      const vars = parseEnvFile(content);
      const token = vars['GITHUB_TOKEN'];
      const repo = vars['GITHUB_REPO'];

      if (!token || !repo) return null;
      return { token, repo };
    } catch {
      return null;
    }
  };

  /**
   * Make a request to the GitHub API
   */
  const githubFetch = async (
    token: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<unknown> => {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `https://api.github.com${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Auto-Claude-UI',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    return response.json();
  };

  ipcMain.handle(
    IPC_CHANNELS.GITHUB_CHECK_CONNECTION,
    async (_, projectId: string): Promise<IPCResult<GitHubSyncStatus>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getGitHubConfig(project);
      if (!config) {
        return {
          success: true,
          data: {
            connected: false,
            error: 'No GitHub token or repository configured'
          }
        };
      }

      try {
        // Fetch repo info
        const repoData = await githubFetch(
          config.token,
          `/repos/${config.repo}`
        ) as { full_name: string; description?: string };

        // Count open issues
        const issuesData = await githubFetch(
          config.token,
          `/repos/${config.repo}/issues?state=open&per_page=1`
        ) as unknown[];

        const openCount = Array.isArray(issuesData) ? issuesData.length : 0;

        return {
          success: true,
          data: {
            connected: true,
            repoFullName: repoData.full_name,
            repoDescription: repoData.description,
            issueCount: openCount,
            lastSyncedAt: new Date().toISOString()
          }
        };
      } catch (error) {
        return {
          success: true,
          data: {
            connected: false,
            error: error instanceof Error ? error.message : 'Failed to connect to GitHub'
          }
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GITHUB_GET_REPOSITORIES,
    async (_, projectId: string): Promise<IPCResult<GitHubRepository[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getGitHubConfig(project);
      if (!config) {
        return { success: false, error: 'No GitHub token configured' };
      }

      try {
        const repos = await githubFetch(
          config.token,
          '/user/repos?per_page=100&sort=updated'
        ) as Array<{
          id: number;
          name: string;
          full_name: string;
          description?: string;
          html_url: string;
          default_branch: string;
          private: boolean;
          owner: { login: string; avatar_url?: string };
        }>;

        const result: GitHubRepository[] = repos.map(repo => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          url: repo.html_url,
          defaultBranch: repo.default_branch,
          private: repo.private,
          owner: {
            login: repo.owner.login,
            avatarUrl: repo.owner.avatar_url
          }
        }));

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch repositories'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GITHUB_GET_ISSUES,
    async (_, projectId: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<IPCResult<GitHubIssue[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getGitHubConfig(project);
      if (!config) {
        return { success: false, error: 'No GitHub token or repository configured' };
      }

      try {
        const issues = await githubFetch(
          config.token,
          `/repos/${config.repo}/issues?state=${state}&per_page=100&sort=updated`
        ) as Array<{
          id: number;
          number: number;
          title: string;
          body?: string;
          state: 'open' | 'closed';
          labels: Array<{ id: number; name: string; color: string; description?: string }>;
          assignees: Array<{ login: string; avatar_url?: string }>;
          user: { login: string; avatar_url?: string };
          milestone?: { id: number; title: string; state: 'open' | 'closed' };
          created_at: string;
          updated_at: string;
          closed_at?: string;
          comments: number;
          url: string;
          html_url: string;
          pull_request?: unknown;
        }>;

        // Filter out pull requests
        const issuesOnly = issues.filter(issue => !issue.pull_request);

        const result: GitHubIssue[] = issuesOnly.map(issue => ({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          labels: issue.labels,
          assignees: issue.assignees.map(a => ({
            login: a.login,
            avatarUrl: a.avatar_url
          })),
          author: {
            login: issue.user.login,
            avatarUrl: issue.user.avatar_url
          },
          milestone: issue.milestone,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          closedAt: issue.closed_at,
          commentsCount: issue.comments,
          url: issue.url,
          htmlUrl: issue.html_url,
          repoFullName: config.repo
        }));

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch issues'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GITHUB_GET_ISSUE,
    async (_, projectId: string, issueNumber: number): Promise<IPCResult<GitHubIssue>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getGitHubConfig(project);
      if (!config) {
        return { success: false, error: 'No GitHub token or repository configured' };
      }

      try {
        const issue = await githubFetch(
          config.token,
          `/repos/${config.repo}/issues/${issueNumber}`
        ) as {
          id: number;
          number: number;
          title: string;
          body?: string;
          state: 'open' | 'closed';
          labels: Array<{ id: number; name: string; color: string; description?: string }>;
          assignees: Array<{ login: string; avatar_url?: string }>;
          user: { login: string; avatar_url?: string };
          milestone?: { id: number; title: string; state: 'open' | 'closed' };
          created_at: string;
          updated_at: string;
          closed_at?: string;
          comments: number;
          url: string;
          html_url: string;
        };

        const result: GitHubIssue = {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          labels: issue.labels,
          assignees: issue.assignees.map(a => ({
            login: a.login,
            avatarUrl: a.avatar_url
          })),
          author: {
            login: issue.user.login,
            avatarUrl: issue.user.avatar_url
          },
          milestone: issue.milestone,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          closedAt: issue.closed_at,
          commentsCount: issue.comments,
          url: issue.url,
          htmlUrl: issue.html_url,
          repoFullName: config.repo
        };

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch issue'
        };
      }
    }
  );

  ipcMain.on(
    IPC_CHANNELS.GITHUB_INVESTIGATE_ISSUE,
    async (_, projectId: string, issueNumber: number) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const project = projectStore.getProject(projectId);
      if (!project) {
        mainWindow.webContents.send(
          IPC_CHANNELS.GITHUB_INVESTIGATION_ERROR,
          projectId,
          'Project not found'
        );
        return;
      }

      const config = getGitHubConfig(project);
      if (!config) {
        mainWindow.webContents.send(
          IPC_CHANNELS.GITHUB_INVESTIGATION_ERROR,
          projectId,
          'No GitHub token or repository configured'
        );
        return;
      }

      try {
        // Send progress update: fetching issue
        mainWindow.webContents.send(
          IPC_CHANNELS.GITHUB_INVESTIGATION_PROGRESS,
          projectId,
          {
            phase: 'fetching',
            issueNumber,
            progress: 10,
            message: 'Fetching issue details...'
          } as GitHubInvestigationStatus
        );

        // Fetch the issue
        const issue = await githubFetch(
          config.token,
          `/repos/${config.repo}/issues/${issueNumber}`
        ) as {
          number: number;
          title: string;
          body?: string;
          labels: Array<{ name: string }>;
          html_url: string;
        };

        // Fetch issue comments for more context
        const comments = await githubFetch(
          config.token,
          `/repos/${config.repo}/issues/${issueNumber}/comments`
        ) as Array<{ body: string; user: { login: string } }>;

        // Build context for the AI investigation
        const issueContext = `
# GitHub Issue #${issue.number}: ${issue.title}

${issue.body || 'No description provided.'}

${comments.length > 0 ? `## Comments (${comments.length}):
${comments.map(c => `**${c.user.login}:** ${c.body}`).join('\n\n')}` : ''}

**Labels:** ${issue.labels.map(l => l.name).join(', ') || 'None'}
**URL:** ${issue.html_url}
`;

        // Send progress update: analyzing
        mainWindow.webContents.send(
          IPC_CHANNELS.GITHUB_INVESTIGATION_PROGRESS,
          projectId,
          {
            phase: 'analyzing',
            issueNumber,
            progress: 30,
            message: 'AI is analyzing the issue...'
          } as GitHubInvestigationStatus
        );

        // Build task description
        const taskDescription = `Investigate GitHub Issue #${issue.number}: ${issue.title}

${issueContext}

Please analyze this issue and provide:
1. A brief summary of what the issue is about
2. A proposed solution approach
3. The files that would likely need to be modified
4. Estimated complexity (simple/standard/complex)
5. Acceptance criteria for resolving this issue`;

        // Create a spec for this investigation
        const taskId = `github-${issueNumber}-${Date.now()}`;

        // Start spec creation with the issue context
        agentManager.startSpecCreation(taskId, project.path, taskDescription);

        // Send progress update: creating task
        mainWindow.webContents.send(
          IPC_CHANNELS.GITHUB_INVESTIGATION_PROGRESS,
          projectId,
          {
            phase: 'creating_task',
            issueNumber,
            progress: 70,
            message: 'Creating task from investigation...'
          } as GitHubInvestigationStatus
        );

        const investigationResult: GitHubInvestigationResult = {
          success: true,
          issueNumber,
          analysis: {
            summary: `Investigation of issue #${issueNumber}: ${issue.title}`,
            proposedSolution: 'Task has been created for AI agent to implement the solution.',
            affectedFiles: [],
            estimatedComplexity: 'standard',
            acceptanceCriteria: [
              `Issue #${issueNumber} requirements are met`,
              'All existing tests pass',
              'New functionality is tested'
            ]
          },
          taskId
        };

        // Send completion
        mainWindow.webContents.send(
          IPC_CHANNELS.GITHUB_INVESTIGATION_PROGRESS,
          projectId,
          {
            phase: 'complete',
            issueNumber,
            progress: 100,
            message: 'Investigation complete!'
          } as GitHubInvestigationStatus
        );

        mainWindow.webContents.send(
          IPC_CHANNELS.GITHUB_INVESTIGATION_COMPLETE,
          projectId,
          investigationResult
        );

      } catch (error) {
        mainWindow.webContents.send(
          IPC_CHANNELS.GITHUB_INVESTIGATION_ERROR,
          projectId,
          error instanceof Error ? error.message : 'Failed to investigate issue'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GITHUB_IMPORT_ISSUES,
    async (_, projectId: string, issueNumbers: number[]): Promise<IPCResult<GitHubImportResult>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getGitHubConfig(project);
      if (!config) {
        return { success: false, error: 'No GitHub token or repository configured' };
      }

      let imported = 0;
      let failed = 0;
      const errors: string[] = [];
      const tasks: Task[] = [];

      for (const issueNumber of issueNumbers) {
        try {
          const issue = await githubFetch(
            config.token,
            `/repos/${config.repo}/issues/${issueNumber}`
          ) as {
            number: number;
            title: string;
            body?: string;
            labels: Array<{ name: string }>;
            html_url: string;
          };

          const labels = issue.labels.map(l => l.name).join(', ');
          const description = `# ${issue.title}

**GitHub Issue:** [#${issue.number}](${issue.html_url})
${labels ? `**Labels:** ${labels}` : ''}

## Description

${issue.body || 'No description provided.'}
`;

          const taskId = `github-${issueNumber}-${Date.now()}`;
          agentManager.startSpecCreation(taskId, project.path, description);
          imported++;
        } catch (err) {
          failed++;
          errors.push(`Failed to import #${issueNumber}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      return {
        success: true,
        data: {
          success: failed === 0,
          imported,
          failed,
          errors: errors.length > 0 ? errors : undefined,
          tasks
        }
      };
    }
  );

  // ============================================
  // Auto Claude Source Update Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.AUTOBUILD_SOURCE_CHECK,
    async (): Promise<IPCResult<{ updateAvailable: boolean; currentVersion: string; latestVersion?: string; releaseNotes?: string; error?: string }>> => {
      try {
        const result = await checkSourceUpdates();
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check for updates'
        };
      }
    }
  );

  ipcMain.on(
    IPC_CHANNELS.AUTOBUILD_SOURCE_DOWNLOAD,
    () => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      // Start download in background
      downloadAndApplyUpdate((progress) => {
        mainWindow.webContents.send(
          IPC_CHANNELS.AUTOBUILD_SOURCE_PROGRESS,
          progress
        );
      }).then((result) => {
        if (result.success) {
          mainWindow.webContents.send(
            IPC_CHANNELS.AUTOBUILD_SOURCE_PROGRESS,
            {
              stage: 'complete',
              message: `Updated to version ${result.version}`
            } as AutoBuildSourceUpdateProgress
          );
        } else {
          mainWindow.webContents.send(
            IPC_CHANNELS.AUTOBUILD_SOURCE_PROGRESS,
            {
              stage: 'error',
              message: result.error || 'Update failed'
            } as AutoBuildSourceUpdateProgress
          );
        }
      }).catch((error) => {
        mainWindow.webContents.send(
          IPC_CHANNELS.AUTOBUILD_SOURCE_PROGRESS,
          {
            stage: 'error',
            message: error instanceof Error ? error.message : 'Update failed'
          } as AutoBuildSourceUpdateProgress
        );
      });

      // Send initial progress
      mainWindow.webContents.send(
        IPC_CHANNELS.AUTOBUILD_SOURCE_PROGRESS,
        {
          stage: 'checking',
          message: 'Starting update...'
        } as AutoBuildSourceUpdateProgress
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AUTOBUILD_SOURCE_VERSION,
    async (): Promise<IPCResult<string>> => {
      try {
        const version = getBundledVersion();
        return { success: true, data: version };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get version'
        };
      }
    }
  );

  // ============================================
  // Auto Claude Source Environment Operations
  // ============================================

  /**
   * Parse an .env file content into a key-value object
   */
  const parseSourceEnvFile = (content: string): Record<string, string> => {
    const vars: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        vars[key] = value;
      }
    }
    return vars;
  };

  ipcMain.handle(
    IPC_CHANNELS.AUTOBUILD_SOURCE_ENV_GET,
    async (): Promise<IPCResult<SourceEnvConfig>> => {
      try {
        const sourcePath = getEffectiveSourcePath();
        if (!sourcePath) {
          return {
            success: true,
            data: {
              hasClaudeToken: false,
              envExists: false,
              sourcePath: undefined
            }
          };
        }

        const envPath = path.join(sourcePath, '.env');
        const envExists = existsSync(envPath);

        if (!envExists) {
          return {
            success: true,
            data: {
              hasClaudeToken: false,
              envExists: false,
              sourcePath
            }
          };
        }

        const content = readFileSync(envPath, 'utf-8');
        const vars = parseSourceEnvFile(content);
        const hasToken = !!vars['CLAUDE_CODE_OAUTH_TOKEN'];

        return {
          success: true,
          data: {
            hasClaudeToken: hasToken,
            claudeOAuthToken: hasToken ? vars['CLAUDE_CODE_OAUTH_TOKEN'] : undefined,
            envExists: true,
            sourcePath
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get source env'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AUTOBUILD_SOURCE_ENV_UPDATE,
    async (_, config: { claudeOAuthToken?: string }): Promise<IPCResult> => {
      try {
        const sourcePath = getEffectiveSourcePath();
        if (!sourcePath) {
          return {
            success: false,
            error: 'Auto-Claude source path not found. Please configure it in App Settings.'
          };
        }

        const envPath = path.join(sourcePath, '.env');

        // Read existing content or start fresh
        let existingContent = '';
        const existingVars: Record<string, string> = {};

        if (existsSync(envPath)) {
          existingContent = readFileSync(envPath, 'utf-8');
          Object.assign(existingVars, parseSourceEnvFile(existingContent));
        }

        // Update the token
        if (config.claudeOAuthToken !== undefined) {
          existingVars['CLAUDE_CODE_OAUTH_TOKEN'] = config.claudeOAuthToken;
        }

        // Rebuild the .env file preserving comments and structure
        const lines = existingContent.split('\n');
        const processedKeys = new Set<string>();
        const outputLines: string[] = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) {
            outputLines.push(line);
            continue;
          }

          const eqIndex = trimmed.indexOf('=');
          if (eqIndex > 0) {
            const key = trimmed.substring(0, eqIndex).trim();
            if (key in existingVars) {
              outputLines.push(`${key}=${existingVars[key]}`);
              processedKeys.add(key);
            } else {
              outputLines.push(line);
            }
          } else {
            outputLines.push(line);
          }
        }

        // Add any new keys that weren't in the original file
        for (const [key, value] of Object.entries(existingVars)) {
          if (!processedKeys.has(key)) {
            outputLines.push(`${key}=${value}`);
          }
        }

        writeFileSync(envPath, outputLines.join('\n'));

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update source env'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AUTOBUILD_SOURCE_ENV_CHECK_TOKEN,
    async (): Promise<IPCResult<SourceEnvCheckResult>> => {
      try {
        const sourcePath = getEffectiveSourcePath();
        if (!sourcePath) {
          return {
            success: true,
            data: {
              hasToken: false,
              sourcePath: undefined,
              error: 'Auto-Claude source path not found'
            }
          };
        }

        const envPath = path.join(sourcePath, '.env');
        if (!existsSync(envPath)) {
          return {
            success: true,
            data: {
              hasToken: false,
              sourcePath,
              error: '.env file does not exist'
            }
          };
        }

        const content = readFileSync(envPath, 'utf-8');
        const vars = parseSourceEnvFile(content);
        const hasToken = !!vars['CLAUDE_CODE_OAUTH_TOKEN'] && vars['CLAUDE_CODE_OAUTH_TOKEN'].length > 0;

        return {
          success: true,
          data: {
            hasToken,
            sourcePath
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check source token'
        };
      }
    }
  );

  // ============================================
  // Ideation Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.IDEATION_GET,
    async (_, projectId: string): Promise<IPCResult<IdeationSession | null>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const ideationPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.IDEATION_DIR,
        AUTO_BUILD_PATHS.IDEATION_FILE
      );

      if (!existsSync(ideationPath)) {
        return { success: true, data: null };
      }

      try {
        const content = readFileSync(ideationPath, 'utf-8');
        const rawIdeation = JSON.parse(content);

        // Transform snake_case to camelCase for frontend
        const session: IdeationSession = {
          id: rawIdeation.id || `ideation-${Date.now()}`,
          projectId,
          config: {
            enabledTypes: rawIdeation.config?.enabled_types || rawIdeation.config?.enabledTypes || [],
            includeRoadmapContext: rawIdeation.config?.include_roadmap_context ?? rawIdeation.config?.includeRoadmapContext ?? true,
            includeKanbanContext: rawIdeation.config?.include_kanban_context ?? rawIdeation.config?.includeKanbanContext ?? true,
            maxIdeasPerType: rawIdeation.config?.max_ideas_per_type || rawIdeation.config?.maxIdeasPerType || 5
          },
          ideas: (rawIdeation.ideas || []).map((idea: Record<string, unknown>) => {
            const base = {
              id: idea.id as string,
              type: idea.type as string,
              title: idea.title as string,
              description: idea.description as string,
              rationale: idea.rationale as string,
              status: idea.status as string || 'draft',
              createdAt: idea.created_at ? new Date(idea.created_at as string) : new Date()
            };

            // Type-specific fields
            if (idea.type === 'low_hanging_fruit') {
              return {
                ...base,
                buildsUpon: idea.builds_upon || idea.buildsUpon || [],
                estimatedEffort: idea.estimated_effort || idea.estimatedEffort || 'small',
                affectedFiles: idea.affected_files || idea.affectedFiles || [],
                existingPatterns: idea.existing_patterns || idea.existingPatterns || []
              };
            } else if (idea.type === 'ui_ux_improvements') {
              return {
                ...base,
                category: idea.category || 'usability',
                affectedComponents: idea.affected_components || idea.affectedComponents || [],
                screenshots: idea.screenshots || [],
                currentState: idea.current_state || idea.currentState || '',
                proposedChange: idea.proposed_change || idea.proposedChange || '',
                userBenefit: idea.user_benefit || idea.userBenefit || ''
              };
            } else if (idea.type === 'high_value_features') {
              return {
                ...base,
                targetAudience: idea.target_audience || idea.targetAudience || '',
                problemSolved: idea.problem_solved || idea.problemSolved || '',
                valueProposition: idea.value_proposition || idea.valueProposition || '',
                competitiveAdvantage: idea.competitive_advantage || idea.competitiveAdvantage,
                estimatedImpact: idea.estimated_impact || idea.estimatedImpact || 'medium',
                complexity: idea.complexity || 'medium',
                dependencies: idea.dependencies || [],
                acceptanceCriteria: idea.acceptance_criteria || idea.acceptanceCriteria || []
              };
            }

            return base;
          }),
          projectContext: {
            existingFeatures: rawIdeation.project_context?.existing_features || rawIdeation.projectContext?.existingFeatures || [],
            techStack: rawIdeation.project_context?.tech_stack || rawIdeation.projectContext?.techStack || [],
            targetAudience: rawIdeation.project_context?.target_audience || rawIdeation.projectContext?.targetAudience,
            plannedFeatures: rawIdeation.project_context?.planned_features || rawIdeation.projectContext?.plannedFeatures || []
          },
          generatedAt: rawIdeation.generated_at ? new Date(rawIdeation.generated_at) : new Date(),
          updatedAt: rawIdeation.updated_at ? new Date(rawIdeation.updated_at) : new Date()
        };

        return { success: true, data: session };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read ideation'
        };
      }
    }
  );

  ipcMain.on(
    IPC_CHANNELS.IDEATION_GENERATE,
    (_, projectId: string, config: IdeationConfig) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const project = projectStore.getProject(projectId);
      if (!project) {
        mainWindow.webContents.send(
          IPC_CHANNELS.IDEATION_ERROR,
          projectId,
          'Project not found'
        );
        return;
      }

      // Start ideation generation via agent manager
      agentManager.startIdeationGeneration(projectId, project.path, config, false);

      // Send initial progress
      mainWindow.webContents.send(
        IPC_CHANNELS.IDEATION_PROGRESS,
        projectId,
        {
          phase: 'analyzing',
          progress: 10,
          message: 'Analyzing project structure...'
        } as IdeationGenerationStatus
      );
    }
  );

  ipcMain.on(
    IPC_CHANNELS.IDEATION_REFRESH,
    (_, projectId: string, config: IdeationConfig) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const project = projectStore.getProject(projectId);
      if (!project) {
        mainWindow.webContents.send(
          IPC_CHANNELS.IDEATION_ERROR,
          projectId,
          'Project not found'
        );
        return;
      }

      // Start ideation regeneration with refresh flag
      agentManager.startIdeationGeneration(projectId, project.path, config, true);

      // Send initial progress
      mainWindow.webContents.send(
        IPC_CHANNELS.IDEATION_PROGRESS,
        projectId,
        {
          phase: 'analyzing',
          progress: 10,
          message: 'Refreshing ideation...'
        } as IdeationGenerationStatus
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.IDEATION_UPDATE_IDEA,
    async (
      _,
      projectId: string,
      ideaId: string,
      status: IdeationStatus
    ): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const ideationPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.IDEATION_DIR,
        AUTO_BUILD_PATHS.IDEATION_FILE
      );

      if (!existsSync(ideationPath)) {
        return { success: false, error: 'Ideation not found' };
      }

      try {
        const content = readFileSync(ideationPath, 'utf-8');
        const ideation = JSON.parse(content);

        // Find and update the idea
        const idea = ideation.ideas?.find((i: { id: string }) => i.id === ideaId);
        if (!idea) {
          return { success: false, error: 'Idea not found' };
        }

        idea.status = status;
        ideation.updated_at = new Date().toISOString();

        writeFileSync(ideationPath, JSON.stringify(ideation, null, 2));

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update idea'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.IDEATION_DISMISS,
    async (_, projectId: string, ideaId: string): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const ideationPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.IDEATION_DIR,
        AUTO_BUILD_PATHS.IDEATION_FILE
      );

      if (!existsSync(ideationPath)) {
        return { success: false, error: 'Ideation not found' };
      }

      try {
        const content = readFileSync(ideationPath, 'utf-8');
        const ideation = JSON.parse(content);

        // Find and dismiss the idea
        const idea = ideation.ideas?.find((i: { id: string }) => i.id === ideaId);
        if (!idea) {
          return { success: false, error: 'Idea not found' };
        }

        idea.status = 'dismissed';
        ideation.updated_at = new Date().toISOString();

        writeFileSync(ideationPath, JSON.stringify(ideation, null, 2));

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to dismiss idea'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.IDEATION_CONVERT_TO_TASK,
    async (_, projectId: string, ideaId: string): Promise<IPCResult<Task>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const ideationPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.IDEATION_DIR,
        AUTO_BUILD_PATHS.IDEATION_FILE
      );

      if (!existsSync(ideationPath)) {
        return { success: false, error: 'Ideation not found' };
      }

      try {
        const content = readFileSync(ideationPath, 'utf-8');
        const ideation = JSON.parse(content);

        // Find the idea
        const idea = ideation.ideas?.find((i: { id: string }) => i.id === ideaId);
        if (!idea) {
          return { success: false, error: 'Idea not found' };
        }

        // Generate spec ID by finding next available number
        // Use devMode-aware path for specs directory
        const devMode = project.settings.devMode ?? false;
        const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
        const specsDir = path.join(project.path, specsBaseDir);

        // Ensure specs directory exists
        if (!existsSync(specsDir)) {
          mkdirSync(specsDir, { recursive: true });
        }

        // Find next spec number
        let nextNum = 1;
        try {
          const existingSpecs = readdirSync(specsDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => {
              const match = d.name.match(/^(\d+)-/);
              return match ? parseInt(match[1], 10) : 0;
            })
            .filter(n => n > 0);
          if (existingSpecs.length > 0) {
            nextNum = Math.max(...existingSpecs) + 1;
          }
        } catch {
          // Use default 1
        }

        // Create spec directory name from idea title
        const slugifiedTitle = idea.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50);
        const specId = `${String(nextNum).padStart(3, '0')}-${slugifiedTitle}`;
        const specDir = path.join(specsDir, specId);

        // Create the spec directory
        mkdirSync(specDir, { recursive: true });

        // Build task description based on idea type
        let taskDescription = `# ${idea.title}\n\n`;
        taskDescription += `${idea.description}\n\n`;
        taskDescription += `## Rationale\n${idea.rationale}\n\n`;

        if (idea.type === 'low_hanging_fruit') {
          if (idea.builds_upon?.length) {
            taskDescription += `## Builds Upon\n${idea.builds_upon.map((b: string) => `- ${b}`).join('\n')}\n\n`;
          }
          if (idea.affected_files?.length) {
            taskDescription += `## Affected Files\n${idea.affected_files.map((f: string) => `- ${f}`).join('\n')}\n\n`;
          }
          if (idea.existing_patterns?.length) {
            taskDescription += `## Patterns to Follow\n${idea.existing_patterns.map((p: string) => `- ${p}`).join('\n')}\n\n`;
          }
        } else if (idea.type === 'ui_ux_improvements') {
          taskDescription += `## Category\n${idea.category}\n\n`;
          taskDescription += `## Current State\n${idea.current_state}\n\n`;
          taskDescription += `## Proposed Change\n${idea.proposed_change}\n\n`;
          taskDescription += `## User Benefit\n${idea.user_benefit}\n\n`;
          if (idea.affected_components?.length) {
            taskDescription += `## Affected Components\n${idea.affected_components.map((c: string) => `- ${c}`).join('\n')}\n\n`;
          }
        } else if (idea.type === 'high_value_features') {
          taskDescription += `## Target Audience\n${idea.target_audience}\n\n`;
          taskDescription += `## Problem Solved\n${idea.problem_solved}\n\n`;
          taskDescription += `## Value Proposition\n${idea.value_proposition}\n\n`;
          if (idea.competitive_advantage) {
            taskDescription += `## Competitive Advantage\n${idea.competitive_advantage}\n\n`;
          }
          if (idea.acceptance_criteria?.length) {
            taskDescription += `## Acceptance Criteria\n${idea.acceptance_criteria.map((c: string) => `- ${c}`).join('\n')}\n\n`;
          }
          if (idea.dependencies?.length) {
            taskDescription += `## Dependencies\n${idea.dependencies.map((d: string) => `- ${d}`).join('\n')}\n\n`;
          }
        }

        // Create initial implementation_plan.json so task shows in kanban immediately
        const initialPlan: ImplementationPlan = {
          feature: idea.title,
          description: idea.description,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: 'backlog',
          planStatus: 'pending',
          phases: [],
          workflow_type: 'development',
          services_involved: [],
          final_acceptance: [],
          spec_file: 'spec.md'
        };
        writeFileSync(
          path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN),
          JSON.stringify(initialPlan, null, 2)
        );

        // Create initial spec.md with the task description
        const specContent = `# ${idea.title}

## Overview

${idea.description}

## Rationale

${idea.rationale}

---
*This spec was created from ideation and is pending detailed specification.*
`;
        writeFileSync(path.join(specDir, AUTO_BUILD_PATHS.SPEC_FILE), specContent);

        // Start spec creation to fill in the details (uses the spec directory name)
        agentManager.startSpecCreation(specId, project.path, taskDescription);

        // Update idea with converted status
        idea.status = 'converted';
        idea.linked_task_id = specId;
        ideation.updated_at = new Date().toISOString();
        writeFileSync(ideationPath, JSON.stringify(ideation, null, 2));

        // Build metadata from idea type
        const metadata: TaskMetadata = {
          sourceType: 'ideation',
          ideationType: idea.type,
          ideaId: idea.id,
          rationale: idea.rationale
        };

        // Map idea type to task category
        const ideaTypeToCategory: Record<string, TaskCategory> = {
          'low_hanging_fruit': 'feature',
          'ui_ux_improvements': 'ui_ux',
          'high_value_features': 'feature',
          'documentation_gaps': 'documentation',
          'security_hardening': 'security',
          'performance_optimizations': 'performance',
          'code_quality': 'refactoring'
        };
        metadata.category = ideaTypeToCategory[idea.type] || 'feature';

        // Extract type-specific metadata
        if (idea.type === 'low_hanging_fruit') {
          metadata.estimatedEffort = idea.estimated_effort;
          metadata.complexity = idea.estimated_effort; // trivial/small/medium
          metadata.affectedFiles = idea.affected_files;
        } else if (idea.type === 'ui_ux_improvements') {
          metadata.uiuxCategory = idea.category;
          metadata.affectedFiles = idea.affected_components;
          metadata.problemSolved = idea.current_state;
        } else if (idea.type === 'high_value_features') {
          metadata.impact = idea.estimated_impact as TaskImpact;
          metadata.complexity = idea.complexity as TaskComplexity;
          metadata.targetAudience = idea.target_audience;
          metadata.problemSolved = idea.problem_solved;
          metadata.dependencies = idea.dependencies;
          metadata.acceptanceCriteria = idea.acceptance_criteria;
        } else if (idea.type === 'documentation_gaps') {
          metadata.estimatedEffort = idea.estimated_effort;
          metadata.priority = idea.priority;
          metadata.targetAudience = idea.target_audience;
          metadata.affectedFiles = idea.affected_areas;
        } else if (idea.type === 'security_hardening') {
          metadata.securitySeverity = idea.severity;
          metadata.impact = idea.severity as TaskImpact; // Map severity to impact
          metadata.priority = idea.severity === 'critical' ? 'urgent' : idea.severity === 'high' ? 'high' : 'medium';
          metadata.affectedFiles = idea.affected_files;
        } else if (idea.type === 'performance_optimizations') {
          metadata.performanceCategory = idea.category;
          metadata.impact = idea.impact as TaskImpact;
          metadata.estimatedEffort = idea.estimated_effort;
          metadata.affectedFiles = idea.affected_areas;
        } else if (idea.type === 'code_quality') {
          metadata.codeQualitySeverity = idea.severity;
          metadata.estimatedEffort = idea.estimated_effort;
          metadata.affectedFiles = idea.affected_files;
          metadata.priority = idea.severity === 'critical' ? 'urgent' : idea.severity === 'major' ? 'high' : 'medium';
        }

        // Save metadata to a separate file for persistence
        const metadataPath = path.join(specDir, 'task_metadata.json');
        writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        // Create task object to return
        const task: Task = {
          id: specId,
          specId: specId,
          projectId,
          title: idea.title,
          description: taskDescription,
          status: 'backlog',
          chunks: [],
          logs: [],
          metadata,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        return { success: true, data: task };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to convert idea to task'
        };
      }
    }
  );

  // ============================================
  // Ideation Agent Events → Renderer
  // ============================================

  agentManager.on('ideation-progress', (projectId: string, status: IdeationGenerationStatus) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.IDEATION_PROGRESS, projectId, status);
    }
  });

  agentManager.on('ideation-log', (projectId: string, log: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.IDEATION_LOG, projectId, log);
    }
  });

  agentManager.on('ideation-complete', (projectId: string, session: IdeationSession) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.IDEATION_COMPLETE, projectId, session);
    }
  });

  agentManager.on('ideation-error', (projectId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.IDEATION_ERROR, projectId, error);
    }
  });

  // Handle streaming ideation type completion - load ideas for this type immediately
  agentManager.on('ideation-type-complete', (projectId: string, ideationType: string, ideasCount: number) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Read the type-specific ideas file and send to renderer
      const project = projectStore.getProject(projectId);
      if (project) {
        const typeFile = path.join(
          project.path,
          AUTO_BUILD_PATHS.IDEATION_DIR,
          `${ideationType}_ideas.json`
        );
        if (existsSync(typeFile)) {
          try {
            const content = readFileSync(typeFile, 'utf-8');
            const data = JSON.parse(content);
            const ideas = data[ideationType] || [];
            mainWindow.webContents.send(
              IPC_CHANNELS.IDEATION_TYPE_COMPLETE,
              projectId,
              ideationType,
              ideas
            );
          } catch (err) {
            console.error(`[Ideation] Failed to read ${ideationType} ideas:`, err);
          }
        }
      }
    }
  });

  agentManager.on('ideation-type-failed', (projectId: string, ideationType: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.IDEATION_TYPE_FAILED, projectId, ideationType);
    }
  });

  // ============================================
  // Changelog Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.CHANGELOG_GET_DONE_TASKS,
    async (_, projectId: string, rendererTasks?: import('../shared/types').Task[]): Promise<IPCResult<import('../shared/types').ChangelogTask[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // Use renderer tasks if provided (they have the correct UI status),
      // otherwise fall back to reading from filesystem
      const tasks = rendererTasks || projectStore.getTasks(projectId);

      // Use devMode-aware path for specs
      const devMode = project.settings.devMode ?? false;
      const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
      const doneTasks = changelogService.getCompletedTasks(project.path, tasks, specsBaseDir);

      return { success: true, data: doneTasks };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CHANGELOG_LOAD_TASK_SPECS,
    async (_, projectId: string, taskIds: string[]): Promise<IPCResult<import('../shared/types').TaskSpecContent[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const tasks = projectStore.getTasks(projectId);

      // Use devMode-aware path for specs
      const devMode = project.settings.devMode ?? false;
      const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
      const specs = await changelogService.loadTaskSpecs(project.path, taskIds, tasks, specsBaseDir);

      return { success: true, data: specs };
    }
  );

  ipcMain.on(
    IPC_CHANNELS.CHANGELOG_GENERATE,
    async (_, request: import('../shared/types').ChangelogGenerationRequest) => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const project = projectStore.getProject(request.projectId);
      if (!project) {
        mainWindow.webContents.send(
          IPC_CHANNELS.CHANGELOG_GENERATION_ERROR,
          request.projectId,
          'Project not found'
        );
        return;
      }

      // Load specs for selected tasks (use devMode-aware path)
      const tasks = projectStore.getTasks(request.projectId);
      const devMode = project.settings.devMode ?? false;
      const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
      const specs = await changelogService.loadTaskSpecs(project.path, request.taskIds, tasks, specsBaseDir);

      // Start generation
      changelogService.generateChangelog(request.projectId, project.path, request, specs);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CHANGELOG_SAVE,
    async (_, request: import('../shared/types').ChangelogSaveRequest): Promise<IPCResult<import('../shared/types').ChangelogSaveResult>> => {
      const project = projectStore.getProject(request.projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      try {
        const result = changelogService.saveChangelog(project.path, request);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save changelog'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CHANGELOG_READ_EXISTING,
    async (_, projectId: string): Promise<IPCResult<import('../shared/types').ExistingChangelog>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const result = changelogService.readExistingChangelog(project.path);
      return { success: true, data: result };
    }
  );

  // ============================================
  // Changelog Agent Events → Renderer
  // ============================================

  changelogService.on('generation-progress', (projectId: string, progress: import('../shared/types').ChangelogGenerationProgress) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.CHANGELOG_GENERATION_PROGRESS, projectId, progress);
    }
  });

  changelogService.on('generation-complete', (projectId: string, result: import('../shared/types').ChangelogGenerationResult) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.CHANGELOG_GENERATION_COMPLETE, projectId, result);
    }
  });

  changelogService.on('generation-error', (projectId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.CHANGELOG_GENERATION_ERROR, projectId, error);
    }
  });

  // ============================================
  // Insights Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_GET_SESSION,
    async (_, projectId: string): Promise<IPCResult<InsightsSession | null>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const session = insightsService.loadSession(projectId, project.path);
      return { success: true, data: session };
    }
  );

  ipcMain.on(
    IPC_CHANNELS.INSIGHTS_SEND_MESSAGE,
    async (_, projectId: string, message: string) => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(IPC_CHANNELS.INSIGHTS_ERROR, projectId, 'Project not found');
        }
        return;
      }

      // Configure insights service with paths
      const autoBuildSource = getAutoBuildSourcePath();
      if (autoBuildSource) {
        insightsService.configure(undefined, autoBuildSource);
      }

      insightsService.sendMessage(projectId, project.path, message);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_CLEAR_SESSION,
    async (_, projectId: string): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      insightsService.clearSession(projectId, project.path);
      return { success: true };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_CREATE_TASK,
    async (
      _,
      projectId: string,
      title: string,
      description: string,
      metadata?: TaskMetadata
    ): Promise<IPCResult<Task>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      if (!project.autoBuildPath) {
        return { success: false, error: 'Auto Claude not initialized for this project' };
      }

      try {
        // Generate a unique spec ID based on existing specs
        // Use devMode-aware path for specs directory
        const devMode = project.settings.devMode ?? false;
        const specsBaseDir = getSpecsDir(project.autoBuildPath, devMode);
        const specsDir = path.join(project.path, specsBaseDir);

        // Find next available spec number
        let specNumber = 1;
        if (existsSync(specsDir)) {
          const existingDirs = readdirSync(specsDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);

          const existingNumbers = existingDirs
            .map(name => {
              const match = name.match(/^(\d+)/);
              return match ? parseInt(match[1], 10) : 0;
            })
            .filter(n => n > 0);

          if (existingNumbers.length > 0) {
            specNumber = Math.max(...existingNumbers) + 1;
          }
        }

        // Create spec ID with zero-padded number and slugified title
        const slugifiedTitle = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50);
        const specId = `${String(specNumber).padStart(3, '0')}-${slugifiedTitle}`;

        // Create spec directory
        const specDir = path.join(specsDir, specId);
        mkdirSync(specDir, { recursive: true });

        // Build metadata with source type
        const taskMetadata: TaskMetadata = {
          sourceType: 'insights',
          ...metadata
        };

        // Create initial implementation_plan.json
        const now = new Date().toISOString();
        const implementationPlan = {
          feature: title,
          description: description,
          created_at: now,
          updated_at: now,
          status: 'pending',
          phases: []
        };

        const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
        writeFileSync(planPath, JSON.stringify(implementationPlan, null, 2));

        // Save task metadata
        const metadataPath = path.join(specDir, 'task_metadata.json');
        writeFileSync(metadataPath, JSON.stringify(taskMetadata, null, 2));

        // Create the task object
        const task: Task = {
          id: specId,
          specId: specId,
          projectId,
          title,
          description,
          status: 'backlog',
          chunks: [],
          logs: [],
          metadata: taskMetadata,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        return { success: true, data: task };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create task'
        };
      }
    }
  );

  // ============================================
  // Insights Agent Events → Renderer
  // ============================================

  insightsService.on('stream-chunk', (projectId: string, chunk: InsightsStreamChunk) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.INSIGHTS_STREAM_CHUNK, projectId, chunk);
    }
  });

  insightsService.on('status', (projectId: string, status: InsightsChatStatus) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.INSIGHTS_STATUS, projectId, status);
    }
  });

  insightsService.on('error', (projectId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.INSIGHTS_ERROR, projectId, error);
    }
  });
}
