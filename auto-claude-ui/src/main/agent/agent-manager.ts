import { EventEmitter } from 'events';
import path from 'path';
import { existsSync } from 'fs';
import { AgentState } from './agent-state';
import { AgentEvents } from './agent-events';
import { AgentProcessManager } from './agent-process';
import { AgentQueueManager } from './agent-queue';
import { getClaudeProfileManager } from '../claude-profile-manager';
import {
  SpecCreationMetadata,
  TaskExecutionOptions,
  IdeationConfig,
  RoadmapConfig
} from './types';

/**
 * Main AgentManager - orchestrates agent process lifecycle
 * This is a slim facade that delegates to focused modules
 */
export class AgentManager extends EventEmitter {
  private state: AgentState;
  private events: AgentEvents;
  private processManager: AgentProcessManager;
  private queueManager: AgentQueueManager;
  private taskExecutionContext: Map<string, {
    projectPath: string;
    specId: string;
    options: TaskExecutionOptions;
    isSpecCreation?: boolean;
    taskDescription?: string;
    specDir?: string;
    metadata?: SpecCreationMetadata;
    swapCount: number;
  }> = new Map();

  constructor() {
    super();

    // Initialize modular components
    this.state = new AgentState();
    this.events = new AgentEvents();
    this.processManager = new AgentProcessManager(this.state, this.events, this);
    this.queueManager = new AgentQueueManager(this.state, this.events, this.processManager, this);

    // Listen for auto-swap restart events
    this.on('auto-swap-restart-task', (taskId: string, _newProfileId: string) => {
      this.restartTask(taskId);
    });

    // Listen for task completion to clean up context (prevent memory leak)
    this.on('exit', (taskId: string, code: number | null) => {
      // Clean up context when:
      // 1. Task completed successfully (code === 0), or
      // 2. Task failed and won't be restarted (handled by auto-swap logic)

      // Note: Auto-swap restart happens BEFORE this exit event is processed,
      // so we need a small delay to allow restart to preserve context
      setTimeout(() => {
        const context = this.taskExecutionContext.get(taskId);
        if (!context) return; // Already cleaned up or restarted

        // If task completed successfully, always clean up
        if (code === 0) {
          this.taskExecutionContext.delete(taskId);
          return;
        }

        // If task failed and hit max retries, clean up
        if (context.swapCount >= 2) {
          this.taskExecutionContext.delete(taskId);
        }
        // Otherwise keep context for potential restart
      }, 1000); // Delay to allow restart logic to run first
    });
  }

  /**
   * Configure paths for Python and auto-claude source
   */
  configure(pythonPath?: string, autoBuildSourcePath?: string): void {
    this.processManager.configure(pythonPath, autoBuildSourcePath);
  }

  /**
   * Start spec creation process
   */
  startSpecCreation(
    taskId: string,
    projectPath: string,
    taskDescription: string,
    specDir?: string,
    metadata?: SpecCreationMetadata
  ): void {
    // Pre-flight auth check: Verify active profile has valid authentication
    const profileManager = getClaudeProfileManager();
    if (!profileManager.hasValidAuth()) {
      this.emit('error', taskId, 'Claude authentication required. Please authenticate in Settings > Claude Profiles before starting tasks.');
      return;
    }

    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      this.emit('error', taskId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const specRunnerPath = path.join(autoBuildSource, 'runners', 'spec_runner.py');

    if (!existsSync(specRunnerPath)) {
      this.emit('error', taskId, `Spec runner not found at: ${specRunnerPath}`);
      return;
    }

    // Get combined environment variables
    const combinedEnv = this.processManager.getCombinedEnv(projectPath);

    // spec_runner.py will auto-start run.py after spec creation completes
    const args = [specRunnerPath, '--task', taskDescription, '--project-dir', projectPath];

    // Pass spec directory if provided (for UI-created tasks that already have a directory)
    if (specDir) {
      args.push('--spec-dir', specDir);
    }

    // Check if user requires review before coding
    if (!metadata?.requireReviewBeforeCoding) {
      // Auto-approve: When user starts a task from the UI without requiring review
      args.push('--auto-approve');
    }

    // Pass model and thinking level configuration
    // For auto profile, use phase-specific config; otherwise use single model/thinking
    if (metadata?.isAutoProfile && metadata.phaseModels && metadata.phaseThinking) {
      // Pass the spec phase model and thinking level to spec_runner
      args.push('--model', metadata.phaseModels.spec);
      args.push('--thinking-level', metadata.phaseThinking.spec);
    } else if (metadata?.model) {
      // Non-auto profile: use single model and thinking level
      args.push('--model', metadata.model);
      if (metadata.thinkingLevel) {
        args.push('--thinking-level', metadata.thinkingLevel);
      }
    }

    // Store context for potential restart
    this.storeTaskContext(taskId, projectPath, '', {}, true, taskDescription, specDir, metadata);

    // Note: This is spec-creation but it chains to task-execution via run.py
    this.processManager.spawnProcess(taskId, autoBuildSource, args, combinedEnv, 'task-execution');
  }

  /**
   * Start task execution (run.py)
   */
  startTaskExecution(
    taskId: string,
    projectPath: string,
    specId: string,
    options: TaskExecutionOptions = {}
  ): void {
    // Pre-flight auth check: Verify active profile has valid authentication
    const profileManager = getClaudeProfileManager();
    if (!profileManager.hasValidAuth()) {
      this.emit('error', taskId, 'Claude authentication required. Please authenticate in Settings > Claude Profiles before starting tasks.');
      return;
    }

    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      this.emit('error', taskId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const runPath = path.join(autoBuildSource, 'run.py');

    if (!existsSync(runPath)) {
      this.emit('error', taskId, `Run script not found at: ${runPath}`);
      return;
    }

    // Get combined environment variables
    const combinedEnv = this.processManager.getCombinedEnv(projectPath);

    const args = [runPath, '--spec', specId, '--project-dir', projectPath];

    // Always use auto-continue when running from UI (non-interactive)
    args.push('--auto-continue');

    // Force: When user starts a task from the UI, that IS their approval
    args.push('--force');

    // Pass base branch if specified (ensures worktrees are created from the correct branch)
    if (options.baseBranch) {
      args.push('--base-branch', options.baseBranch);
    }

    // Note: --parallel was removed from run.py CLI - parallel execution is handled internally by the agent
    // The options.parallel and options.workers are kept for future use or logging purposes
    // Note: Model configuration is read from task_metadata.json by the Python scripts,
    // which allows per-phase configuration for planner, coder, and QA phases

    // Store context for potential restart
    this.storeTaskContext(taskId, projectPath, specId, options, false);

    this.processManager.spawnProcess(taskId, autoBuildSource, args, combinedEnv, 'task-execution');
  }

  /**
   * Start QA process
   */
  startQAProcess(
    taskId: string,
    projectPath: string,
    specId: string
  ): void {
    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      this.emit('error', taskId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const runPath = path.join(autoBuildSource, 'run.py');

    if (!existsSync(runPath)) {
      this.emit('error', taskId, `Run script not found at: ${runPath}`);
      return;
    }

    // Get combined environment variables
    const combinedEnv = this.processManager.getCombinedEnv(projectPath);

    const args = [runPath, '--spec', specId, '--project-dir', projectPath, '--qa'];

    this.processManager.spawnProcess(taskId, autoBuildSource, args, combinedEnv, 'qa-process');
  }

  /**
   * Start roadmap generation process
   */
  startRoadmapGeneration(
    projectId: string,
    projectPath: string,
    refresh: boolean = false,
    enableCompetitorAnalysis: boolean = false,
    refreshCompetitorAnalysis: boolean = false,
    config?: RoadmapConfig
  ): void {
    this.queueManager.startRoadmapGeneration(projectId, projectPath, refresh, enableCompetitorAnalysis, refreshCompetitorAnalysis, config);
  }

  /**
   * Start ideation generation process
   */
  startIdeationGeneration(
    projectId: string,
    projectPath: string,
    config: IdeationConfig,
    refresh: boolean = false
  ): void {
    this.queueManager.startIdeationGeneration(projectId, projectPath, config, refresh);
  }

  /**
   * Kill a specific task's process
   */
  killTask(taskId: string): boolean {
    return this.processManager.killProcess(taskId);
  }

  /**
   * Stop ideation generation for a project
   */
  stopIdeation(projectId: string): boolean {
    return this.queueManager.stopIdeation(projectId);
  }

  /**
   * Check if ideation is running for a project
   */
  isIdeationRunning(projectId: string): boolean {
    return this.queueManager.isIdeationRunning(projectId);
  }

  /**
   * Stop roadmap generation for a project
   */
  stopRoadmap(projectId: string): boolean {
    return this.queueManager.stopRoadmap(projectId);
  }

  /**
   * Check if roadmap is running for a project
   */
  isRoadmapRunning(projectId: string): boolean {
    return this.queueManager.isRoadmapRunning(projectId);
  }

  /**
   * Kill all running processes
   */
  async killAll(): Promise<void> {
    await this.processManager.killAllProcesses();
  }

  /**
   * Check if a task is running
   */
  isRunning(taskId: string): boolean {
    return this.state.hasProcess(taskId);
  }

  /**
   * Get all running task IDs
   */
  getRunningTasks(): string[] {
    return this.state.getRunningTaskIds();
  }

  /**
   * Store task execution context for potential restarts
   */
  private storeTaskContext(
    taskId: string,
    projectPath: string,
    specId: string,
    options: TaskExecutionOptions,
    isSpecCreation?: boolean,
    taskDescription?: string,
    specDir?: string,
    metadata?: SpecCreationMetadata
  ): void {
    // Preserve swapCount if context already exists (for restarts)
    const existingContext = this.taskExecutionContext.get(taskId);
    const swapCount = existingContext?.swapCount ?? 0;

    this.taskExecutionContext.set(taskId, {
      projectPath,
      specId,
      options,
      isSpecCreation,
      taskDescription,
      specDir,
      metadata,
      swapCount // Preserve existing count instead of resetting
    });
  }

  /**
   * Restart task after profile swap
   */
  restartTask(taskId: string): boolean {
    const context = this.taskExecutionContext.get(taskId);
    if (!context) {
      console.error('[AgentManager] No context for task:', taskId);
      return false;
    }

    // Prevent infinite swap loops
    if (context.swapCount >= 2) {
      console.error('[AgentManager] Max swap count reached for task:', taskId);
      return false;
    }

    context.swapCount++;

    // Kill current process
    this.killTask(taskId);

    // Wait for cleanup, then restart
    setTimeout(() => {
      if (context.isSpecCreation) {
        this.startSpecCreation(
          taskId,
          context.projectPath,
          context.taskDescription!,
          context.specDir,
          context.metadata
        );
      } else {
        this.startTaskExecution(
          taskId,
          context.projectPath,
          context.specId,
          context.options
        );
      }
    }, 500);

    return true;
  }
}
