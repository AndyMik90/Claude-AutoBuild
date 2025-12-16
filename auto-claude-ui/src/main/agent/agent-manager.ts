import { EventEmitter } from 'events';
import path from 'path';
import { existsSync } from 'fs';
import { AgentState } from './agent-state';
import { AgentEvents } from './agent-events';
import { AgentProcessManager } from './agent-process';
import { AgentQueueManager } from './agent-queue';
import {
  AgentManagerEvents,
  ExecutionProgressData,
  ProcessType,
  SpecCreationMetadata,
  TaskExecutionOptions,
  IdeationConfig
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

  constructor() {
    super();

    // Initialize modular components
    this.state = new AgentState();
    this.events = new AgentEvents();
    this.processManager = new AgentProcessManager(this.state, this.events, this);
    this.queueManager = new AgentQueueManager(this.state, this.events, this.processManager, this);
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
    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      this.emit('error', taskId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const specRunnerPath = path.join(autoBuildSource, 'spec_runner.py');

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
    console.log('[AgentManager] startTaskExecution called for:', taskId, specId);

    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      console.log('[AgentManager] ERROR: Auto-build source path not found');
      this.emit('error', taskId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const runPath = path.join(autoBuildSource, 'run.py');
    console.log('[AgentManager] runPath:', runPath);

    if (!existsSync(runPath)) {
      console.log('[AgentManager] ERROR: Run script not found at:', runPath);
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

    // Note: --parallel was removed from run.py CLI - parallel execution is handled internally by the agent
    // The options.parallel and options.workers are kept for future use or logging purposes

    console.log('[AgentManager] Spawning process with args:', args);
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
    enableCompetitorAnalysis: boolean = false
  ): void {
    this.queueManager.startRoadmapGeneration(projectId, projectPath, refresh, enableCompetitorAnalysis);
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
}
