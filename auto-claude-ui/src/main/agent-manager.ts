import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { app } from 'electron';
import { projectStore } from './project-store';
import { detectRateLimit, createSDKRateLimitInfo, getProfileEnv } from './rate-limit-detector';

interface AgentProcess {
  taskId: string;
  process: ChildProcess;
  startedAt: Date;
  projectPath?: string; // For ideation processes to load session on completion
  spawnId: number; // Unique ID to identify this specific spawn
}

export interface ExecutionProgressData {
  phase: 'idle' | 'planning' | 'coding' | 'qa_review' | 'qa_fixing' | 'complete' | 'failed';
  phaseProgress: number;
  overallProgress: number;
  currentSubtask?: string;
  message?: string;
}

export type ProcessType = 'spec-creation' | 'task-execution' | 'qa-process';

export interface AgentManagerEvents {
  log: (taskId: string, log: string) => void;
  error: (taskId: string, error: string) => void;
  exit: (taskId: string, code: number | null, processType: ProcessType) => void;
  'execution-progress': (taskId: string, progress: ExecutionProgressData) => void;
}

/**
 * Manages Python subprocess spawning for auto-claude agents
 */
export class AgentManager extends EventEmitter {
  private processes: Map<string, AgentProcess> = new Map();
  private killedSpawnIds: Set<number> = new Set(); // Track spawn IDs whose processes were killed
  private spawnCounter: number = 0; // Unique ID for each spawn
  private pythonPath: string = 'python3';
  private autoBuildSourcePath: string = ''; // Source auto-claude repo location

  constructor() {
    super();
  }

  /**
   * Configure paths for Python and auto-claude source
   */
  configure(pythonPath?: string, autoBuildSourcePath?: string): void {
    if (pythonPath) {
      this.pythonPath = pythonPath;
    }
    if (autoBuildSourcePath) {
      this.autoBuildSourcePath = autoBuildSourcePath;
    }
  }

  /**
   * Get the auto-claude source path (detects automatically if not configured)
   */
  private getAutoBuildSourcePath(): string | null {
    // If manually configured, use that
    if (this.autoBuildSourcePath && existsSync(this.autoBuildSourcePath)) {
      return this.autoBuildSourcePath;
    }

    // Auto-detect from app location
    const possiblePaths = [
      // Dev mode: from dist/main -> ../../auto-claude (sibling to auto-claude-ui)
      path.resolve(__dirname, '..', '..', '..', 'auto-claude'),
      // Alternative: from app root
      path.resolve(app.getAppPath(), '..', 'auto-claude'),
      // If running from repo root
      path.resolve(process.cwd(), 'auto-claude')
    ];

    for (const p of possiblePaths) {
      if (existsSync(p) && existsSync(path.join(p, 'VERSION'))) {
        return p;
      }
    }
    return null;
  }

  /**
   * Get project-specific environment variables based on project settings
   */
  private getProjectEnvVars(projectPath: string): Record<string, string> {
    const env: Record<string, string> = {};

    // Find project by path
    const projects = projectStore.getProjects();
    const project = projects.find((p) => p.path === projectPath);

    if (project?.settings) {
      // Graphiti MCP integration
      if (project.settings.graphitiMcpEnabled) {
        const graphitiUrl = project.settings.graphitiMcpUrl || 'http://localhost:8000/mcp/';
        env['GRAPHITI_MCP_URL'] = graphitiUrl;
      }
    }

    return env;
  }

  /**
   * Load environment variables from auto-claude .env file
   */
  private loadAutoBuildEnv(): Record<string, string> {
    const autoBuildSource = this.getAutoBuildSourcePath();
    if (!autoBuildSource) {
      console.log('[loadAutoBuildEnv] No auto-build source path found');
      return {};
    }

    const envPath = path.join(autoBuildSource, '.env');
    console.log('[loadAutoBuildEnv] Looking for .env at:', envPath);
    if (!existsSync(envPath)) {
      console.log('[loadAutoBuildEnv] .env file does not exist');
      return {};
    }

    try {
      const envContent = readFileSync(envPath, 'utf-8');
      const envVars: Record<string, string> = {};

      // Handle both Unix (\n) and Windows (\r\n) line endings
      for (const line of envContent.split(/\r?\n/)) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          let value = trimmed.substring(eqIndex + 1).trim();

          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          envVars[key] = value;
        }
      }

      return envVars;
    } catch {
      return {};
    }
  }

  /**
   * Start spec creation process
   */
  startSpecCreation(
    taskId: string,
    projectPath: string,
    taskDescription: string,
    specDir?: string,  // Optional spec directory (when task already has a directory created by UI)
    metadata?: { requireReviewBeforeCoding?: boolean }  // Task metadata to check for review requirement
  ): void {
    // Use source auto-claude path (the repo), not the project's auto-claude
    const autoBuildSource = this.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      this.emit('error', taskId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const specRunnerPath = path.join(autoBuildSource, 'spec_runner.py');

    if (!existsSync(specRunnerPath)) {
      this.emit('error', taskId, `Spec runner not found at: ${specRunnerPath}`);
      return;
    }

    // Load environment variables from auto-claude .env file and project settings
    const autoBuildEnv = this.loadAutoBuildEnv();
    const projectEnv = this.getProjectEnvVars(projectPath);
    const combinedEnv = { ...autoBuildEnv, ...projectEnv };

    // spec_runner.py will auto-start run.py after spec creation completes
    const args = [specRunnerPath, '--task', taskDescription, '--project-dir', projectPath];

    // Pass spec directory if provided (for UI-created tasks that already have a directory)
    if (specDir) {
      args.push('--spec-dir', specDir);
    }

    // Check if user requires review before coding
    // If requireReviewBeforeCoding is true, skip auto-approve to trigger review checkpoint
    if (!metadata?.requireReviewBeforeCoding) {
      // Auto-approve: When user starts a task from the UI without requiring review, that IS their approval
      // No need for interactive review checkpoint - user explicitly clicked "Start"
      args.push('--auto-approve');
    }
    // If requireReviewBeforeCoding is true, don't add --auto-approve, allowing the review checkpoint to appear

    // Note: This is spec-creation but it chains to task-execution via run.py
    // So we treat the whole thing as task-execution for status purposes
    this.spawnProcess(taskId, autoBuildSource, args, combinedEnv, 'task-execution');
  }

  /**
   * Start task execution (run.py)
   */
  startTaskExecution(
    taskId: string,
    projectPath: string,
    specId: string,
    options: { parallel?: boolean; workers?: number } = {}
  ): void {
    console.log('[AgentManager] startTaskExecution called for:', taskId, specId);
    // Use source auto-claude path (the repo), not the project's auto-claude
    const autoBuildSource = this.getAutoBuildSourcePath();

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

    // Load environment variables from auto-claude .env file and project settings
    const autoBuildEnv = this.loadAutoBuildEnv();
    const projectEnv = this.getProjectEnvVars(projectPath);
    const combinedEnv = { ...autoBuildEnv, ...projectEnv };

    const args = [runPath, '--spec', specId, '--project-dir', projectPath];

    // Always use auto-continue when running from UI (non-interactive)
    args.push('--auto-continue');

    // Force: When user starts a task from the UI, that IS their approval
    // The review checkpoint is for CLI users who need to review before building
    // UI users have already seen the spec in the interface before clicking "Start"
    args.push('--force');

    if (options.parallel && options.workers) {
      args.push('--parallel', options.workers.toString());
    }

    console.log('[AgentManager] Spawning process with args:', args);
    this.spawnProcess(taskId, autoBuildSource, args, combinedEnv, 'task-execution');
  }

  /**
   * Start QA process
   */
  startQAProcess(
    taskId: string,
    projectPath: string,
    specId: string
  ): void {
    // Use source auto-claude path (the repo), not the project's auto-claude
    const autoBuildSource = this.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      this.emit('error', taskId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const runPath = path.join(autoBuildSource, 'run.py');

    if (!existsSync(runPath)) {
      this.emit('error', taskId, `Run script not found at: ${runPath}`);
      return;
    }

    // Load environment variables from auto-claude .env file and project settings
    const autoBuildEnv = this.loadAutoBuildEnv();
    const projectEnv = this.getProjectEnvVars(projectPath);
    const combinedEnv = { ...autoBuildEnv, ...projectEnv };

    const args = [runPath, '--spec', specId, '--project-dir', projectPath, '--qa'];

    this.spawnProcess(taskId, autoBuildSource, args, combinedEnv, 'qa-process');
  }

  /**
   * Start roadmap generation process
   */
  startRoadmapGeneration(
    projectId: string,
    projectPath: string,
    refresh: boolean = false
  ): void {
    // Use source auto-claude path (the repo), not the project's auto-claude
    const autoBuildSource = this.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      this.emit('roadmap-error', projectId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const roadmapRunnerPath = path.join(autoBuildSource, 'roadmap_runner.py');

    if (!existsSync(roadmapRunnerPath)) {
      this.emit('roadmap-error', projectId, `Roadmap runner not found at: ${roadmapRunnerPath}`);
      return;
    }

    const args = [roadmapRunnerPath, '--project', projectPath];

    if (refresh) {
      args.push('--refresh');
    }

    // Use projectId as taskId for roadmap operations
    this.spawnRoadmapProcess(projectId, projectPath, args);
  }

  /**
   * Start ideation generation process
   */
  startIdeationGeneration(
    projectId: string,
    projectPath: string,
    config: {
      enabledTypes: string[];
      includeRoadmapContext: boolean;
      includeKanbanContext: boolean;
      maxIdeasPerType: number;
      append?: boolean;
    },
    refresh: boolean = false
  ): void {
    // Use source auto-claude path (the repo), not the project's auto-claude
    const autoBuildSource = this.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      this.emit('ideation-error', projectId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const ideationRunnerPath = path.join(autoBuildSource, 'ideation_runner.py');

    if (!existsSync(ideationRunnerPath)) {
      this.emit('ideation-error', projectId, `Ideation runner not found at: ${ideationRunnerPath}`);
      return;
    }

    const args = [ideationRunnerPath, '--project', projectPath];

    // Add enabled types as comma-separated list
    if (config.enabledTypes.length > 0) {
      args.push('--types', config.enabledTypes.join(','));
    }

    // Add context flags (script uses --no-roadmap/--no-kanban negative flags)
    if (!config.includeRoadmapContext) {
      args.push('--no-roadmap');
    }
    if (!config.includeKanbanContext) {
      args.push('--no-kanban');
    }

    // Add max ideas per type
    if (config.maxIdeasPerType) {
      args.push('--max-ideas', config.maxIdeasPerType.toString());
    }

    if (refresh) {
      args.push('--refresh');
    }

    // Add append flag to preserve existing ideas
    if (config.append) {
      args.push('--append');
    }

    // Use projectId as taskId for ideation operations
    this.spawnIdeationProcess(projectId, projectPath, args);
  }

  /**
   * Spawn a Python process for ideation generation
   */
  private spawnIdeationProcess(
    projectId: string,
    projectPath: string,
    args: string[]
  ): void {
    // Kill existing process for this project if any
    this.killTask(projectId);

    // Generate unique spawn ID for this process instance
    const spawnId = ++this.spawnCounter;

    // Run from auto-claude source directory so imports work correctly
    const autoBuildSource = this.getAutoBuildSourcePath();
    const cwd = autoBuildSource || process.cwd();

    // Load environment variables from auto-claude .env file and project settings
    const autoBuildEnv = this.loadAutoBuildEnv();
    const projectEnv = this.getProjectEnvVars(projectPath);
    const combinedEnv = { ...autoBuildEnv, ...projectEnv };

    // Get active Claude profile environment (CLAUDE_CONFIG_DIR if not default)
    const profileEnv = getProfileEnv();

    const childProcess = spawn(this.pythonPath, args, {
      cwd,
      env: {
        ...process.env,
        ...combinedEnv, // Include auto-claude .env variables and project-specific env vars
        ...profileEnv, // Include active Claude profile config
        PYTHONUNBUFFERED: '1'
      }
    });

    this.processes.set(projectId, {
      taskId: projectId,
      process: childProcess,
      startedAt: new Date(),
      projectPath, // Store project path for loading session on completion
      spawnId
    });

    // Track progress through output
    let progressPhase = 'analyzing';
    let progressPercent = 10;
    // Collect output for rate limit detection
    let allOutput = '';

    // Helper to emit logs - split multi-line output into individual log lines
    const emitLogs = (log: string) => {
      const lines = log.split('\n').filter(line => line.trim().length > 0);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          console.log('[Ideation]', trimmed);
          this.emit('ideation-log', projectId, trimmed);
        }
      }
    };

    console.log('[Ideation] Starting ideation process with args:', args);
    console.log('[Ideation] CWD:', cwd);
    console.log('[Ideation] Python path:', this.pythonPath);
    console.log('[Ideation] Env vars loaded:', Object.keys(autoBuildEnv));
    console.log('[Ideation] Has CLAUDE_CODE_OAUTH_TOKEN:', !!autoBuildEnv['CLAUDE_CODE_OAUTH_TOKEN']);

    // Track completed types for progress calculation
    const completedTypes = new Set<string>();
    const totalTypes = args.filter(a => a !== '--types').length > 0 ? 7 : 7; // Default all types

    // Handle stdout
    childProcess.stdout?.on('data', (data: Buffer) => {
      const log = data.toString();
      // Collect output for rate limit detection (keep last 10KB)
      allOutput = (allOutput + log).slice(-10000);

      // Emit all log lines for the activity log
      emitLogs(log);

      // Check for streaming type completion signals
      const typeCompleteMatch = log.match(/IDEATION_TYPE_COMPLETE:(\w+):(\d+)/);
      if (typeCompleteMatch) {
        const [, ideationType, ideasCount] = typeCompleteMatch;
        completedTypes.add(ideationType);
        console.log(`[Ideation] Type complete: ${ideationType} with ${ideasCount} ideas`);

        // Emit event for UI to load this type's ideas immediately
        this.emit('ideation-type-complete', projectId, ideationType, parseInt(ideasCount, 10));
      }

      const typeFailedMatch = log.match(/IDEATION_TYPE_FAILED:(\w+)/);
      if (typeFailedMatch) {
        const [, ideationType] = typeFailedMatch;
        completedTypes.add(ideationType);
        console.log(`[Ideation] Type failed: ${ideationType}`);
        this.emit('ideation-type-failed', projectId, ideationType);
      }

      // Parse progress from output - track phase transitions
      if (log.includes('PROJECT INDEX') || log.includes('PROJECT ANALYSIS')) {
        progressPhase = 'analyzing';
        progressPercent = 10;
      } else if (log.includes('CONTEXT GATHERING')) {
        progressPhase = 'discovering';
        progressPercent = 20;
      } else if (log.includes('GENERATING IDEAS (PARALLEL)') || log.includes('Starting') && log.includes('ideation agents in parallel')) {
        progressPhase = 'generating';
        progressPercent = 30;
      } else if (log.includes('MERGE') || log.includes('FINALIZE')) {
        progressPhase = 'finalizing';
        progressPercent = 90;
      } else if (log.includes('IDEATION COMPLETE')) {
        progressPhase = 'complete';
        progressPercent = 100;
      }

      // Update progress based on completed types during generation phase
      if (progressPhase === 'generating' && completedTypes.size > 0) {
        // Progress from 30% to 90% based on completed types
        progressPercent = 30 + Math.floor((completedTypes.size / totalTypes) * 60);
      }

      // Emit progress update with a clean message for the status bar
      const statusMessage = log.trim().split('\n')[0].substring(0, 200);
      this.emit('ideation-progress', projectId, {
        phase: progressPhase,
        progress: progressPercent,
        message: statusMessage,
        completedTypes: Array.from(completedTypes)
      });
    });

    // Handle stderr - also emit as logs
    childProcess.stderr?.on('data', (data: Buffer) => {
      const log = data.toString();
      // Collect stderr for rate limit detection too
      allOutput = (allOutput + log).slice(-10000);
      console.error('[Ideation STDERR]', log);
      emitLogs(log);
      this.emit('ideation-progress', projectId, {
        phase: progressPhase,
        progress: progressPercent,
        message: log.trim().split('\n')[0].substring(0, 200)
      });
    });

    // Handle process exit
    childProcess.on('exit', (code: number | null) => {
      console.log('[Ideation] Process exited with code:', code);

      // Get the stored project path before deleting from map
      const processInfo = this.processes.get(projectId);
      const storedProjectPath = processInfo?.projectPath;
      this.processes.delete(projectId);

      // Check for rate limit if process failed
      if (code !== 0) {
        const rateLimitDetection = detectRateLimit(allOutput);
        if (rateLimitDetection.isRateLimited) {
          console.log('[Ideation] Rate limit detected:', {
            projectId,
            resetTime: rateLimitDetection.resetTime,
            limitType: rateLimitDetection.limitType,
            suggestedProfile: rateLimitDetection.suggestedProfile?.name
          });

          const rateLimitInfo = createSDKRateLimitInfo('ideation', rateLimitDetection, {
            projectId
          });
          this.emit('sdk-rate-limit', rateLimitInfo);
        }
      }

      if (code === 0) {
        this.emit('ideation-progress', projectId, {
          phase: 'complete',
          progress: 100,
          message: 'Ideation generation complete'
        });

        // Load and emit the complete ideation session
        if (storedProjectPath) {
          try {
            const ideationFilePath = path.join(
              storedProjectPath,
              '.auto-claude',
              'ideation',
              'ideation.json'
            );
            if (existsSync(ideationFilePath)) {
              const content = readFileSync(ideationFilePath, 'utf-8');
              const session = JSON.parse(content);
              console.log('[Ideation] Emitting ideation-complete with session data');
              this.emit('ideation-complete', projectId, session);
            } else {
              console.warn('[Ideation] ideation.json not found at:', ideationFilePath);
            }
          } catch (err) {
            console.error('[Ideation] Failed to load ideation session:', err);
          }
        }
      } else {
        this.emit('ideation-error', projectId, `Ideation generation failed with exit code ${code}`);
      }
    });

    // Handle process error
    childProcess.on('error', (err: Error) => {
      console.error('[Ideation] Process error:', err.message);
      this.processes.delete(projectId);
      this.emit('ideation-error', projectId, err.message);
    });
  }

  /**
   * Spawn a Python process for roadmap generation
   */
  private spawnRoadmapProcess(
    projectId: string,
    projectPath: string,
    args: string[]
  ): void {
    // Kill existing process for this project if any
    this.killTask(projectId);

    // Generate unique spawn ID for this process instance
    const spawnId = ++this.spawnCounter;

    // Run from auto-claude source directory so imports work correctly
    const autoBuildSource = this.getAutoBuildSourcePath();
    const cwd = autoBuildSource || process.cwd();

    // Load environment variables from auto-claude .env file and project settings
    const autoBuildEnv = this.loadAutoBuildEnv();
    const projectEnv = this.getProjectEnvVars(projectPath);
    const combinedEnv = { ...autoBuildEnv, ...projectEnv };

    // Get active Claude profile environment (CLAUDE_CONFIG_DIR if not default)
    const ideationProfileEnv = getProfileEnv();

    const childProcess = spawn(this.pythonPath, args, {
      cwd,
      env: {
        ...process.env,
        ...combinedEnv, // Include auto-claude .env variables and project-specific env vars
        ...ideationProfileEnv, // Include active Claude profile config
        PYTHONUNBUFFERED: '1'
      }
    });

    this.processes.set(projectId, {
      taskId: projectId,
      process: childProcess,
      startedAt: new Date(),
      spawnId
    });

    // Track progress through output
    let progressPhase = 'analyzing';
    let progressPercent = 10;
    // Collect output for rate limit detection
    let allRoadmapOutput = '';

    // Handle stdout
    childProcess.stdout?.on('data', (data: Buffer) => {
      const log = data.toString();
      // Collect output for rate limit detection (keep last 10KB)
      allRoadmapOutput = (allRoadmapOutput + log).slice(-10000);

      // Parse progress from output
      if (log.includes('PROJECT ANALYSIS')) {
        progressPhase = 'analyzing';
        progressPercent = 20;
      } else if (log.includes('PROJECT DISCOVERY')) {
        progressPhase = 'discovering';
        progressPercent = 40;
      } else if (log.includes('FEATURE GENERATION')) {
        progressPhase = 'generating';
        progressPercent = 70;
      } else if (log.includes('ROADMAP GENERATED')) {
        progressPhase = 'complete';
        progressPercent = 100;
      }

      // Emit progress update
      this.emit('roadmap-progress', projectId, {
        phase: progressPhase,
        progress: progressPercent,
        message: log.trim().substring(0, 200) // Truncate long messages
      });
    });

    // Handle stderr
    childProcess.stderr?.on('data', (data: Buffer) => {
      const log = data.toString();
      // Collect stderr for rate limit detection too
      allRoadmapOutput = (allRoadmapOutput + log).slice(-10000);
      this.emit('roadmap-progress', projectId, {
        phase: progressPhase,
        progress: progressPercent,
        message: log.trim().substring(0, 200)
      });
    });

    // Handle process exit
    childProcess.on('exit', (code: number | null) => {
      this.processes.delete(projectId);

      // Check for rate limit if process failed
      if (code !== 0) {
        const rateLimitDetection = detectRateLimit(allRoadmapOutput);
        if (rateLimitDetection.isRateLimited) {
          console.log('[Roadmap] Rate limit detected:', {
            projectId,
            resetTime: rateLimitDetection.resetTime,
            limitType: rateLimitDetection.limitType,
            suggestedProfile: rateLimitDetection.suggestedProfile?.name
          });

          const rateLimitInfo = createSDKRateLimitInfo('roadmap', rateLimitDetection, {
            projectId
          });
          this.emit('sdk-rate-limit', rateLimitInfo);
        }
      }

      if (code === 0) {
        this.emit('roadmap-progress', projectId, {
          phase: 'complete',
          progress: 100,
          message: 'Roadmap generation complete'
        });
      } else {
        this.emit('roadmap-error', projectId, `Roadmap generation failed with exit code ${code}`);
      }
    });

    // Handle process error
    childProcess.on('error', (err: Error) => {
      this.processes.delete(projectId);
      this.emit('roadmap-error', projectId, err.message);
    });
  }

  /**
   * Parse log output to detect execution phase transitions
   */
  private parseExecutionPhase(
    log: string,
    currentPhase: ExecutionProgressData['phase'],
    isSpecRunner: boolean
  ): { phase: ExecutionProgressData['phase']; message?: string; currentSubtask?: string } | null {
    const lowerLog = log.toLowerCase();

    // Spec runner phase detection (all part of "planning")
    if (isSpecRunner) {
      if (lowerLog.includes('discovering') || lowerLog.includes('discovery')) {
        return { phase: 'planning', message: 'Discovering project context...' };
      }
      if (lowerLog.includes('requirements') || lowerLog.includes('gathering')) {
        return { phase: 'planning', message: 'Gathering requirements...' };
      }
      if (lowerLog.includes('writing spec') || lowerLog.includes('spec writer')) {
        return { phase: 'planning', message: 'Writing specification...' };
      }
      if (lowerLog.includes('validating') || lowerLog.includes('validation')) {
        return { phase: 'planning', message: 'Validating specification...' };
      }
      if (lowerLog.includes('spec complete') || lowerLog.includes('specification complete')) {
        return { phase: 'planning', message: 'Specification complete' };
      }
    }

    // Run.py phase detection
    // Planner agent running
    if (lowerLog.includes('planner agent') || lowerLog.includes('creating implementation plan')) {
      return { phase: 'planning', message: 'Creating implementation plan...' };
    }

    // Coder agent running
    if (lowerLog.includes('coder agent') || lowerLog.includes('starting coder')) {
      return { phase: 'coding', message: 'Implementing code changes...' };
    }

    // Subtask progress detection
    const subtaskMatch = log.match(/subtask[:\s]+(\d+(?:\/\d+)?|\w+[-_]\w+)/i);
    if (subtaskMatch && currentPhase === 'coding') {
      return { phase: 'coding', currentSubtask: subtaskMatch[1], message: `Working on subtask ${subtaskMatch[1]}...` };
    }

    // Subtask completion detection
    if (lowerLog.includes('subtask completed') || lowerLog.includes('subtask done')) {
      const completedSubtask = log.match(/subtask[:\s]+"?([^"]+)"?\s+completed/i);
      return {
        phase: 'coding',
        currentSubtask: completedSubtask?.[1],
        message: `Subtask ${completedSubtask?.[1] || ''} completed`
      };
    }

    // QA Review phase
    if (lowerLog.includes('qa reviewer') || lowerLog.includes('qa_reviewer') || lowerLog.includes('starting qa')) {
      return { phase: 'qa_review', message: 'Running QA review...' };
    }

    // QA Fixer phase
    if (lowerLog.includes('qa fixer') || lowerLog.includes('qa_fixer') || lowerLog.includes('fixing issues')) {
      return { phase: 'qa_fixing', message: 'Fixing QA issues...' };
    }

    // Completion detection - be conservative, require explicit success markers
    // The AI agent prints "=== BUILD COMPLETE ===" when truly done (from coder.md)
    // Only trust this pattern, not generic "all subtasks completed" which could be false positive
    if (lowerLog.includes('=== build complete ===') || lowerLog.includes('qa passed')) {
      return { phase: 'complete', message: 'Build completed successfully' };
    }

    // "All subtasks completed" is informational - don't change phase based on this alone
    // The coordinator may print this even when subtasks are blocked, so we stay in coding phase
    // and let the actual implementation_plan.json status drive the UI
    if (lowerLog.includes('all subtasks completed')) {
      return { phase: 'coding', message: 'Subtasks marked complete' };
    }

    // Incomplete build detection - when coordinator exits with pending subtasks
    if (lowerLog.includes('build incomplete') || lowerLog.includes('subtasks still pending')) {
      return { phase: 'coding', message: 'Build paused - subtasks still pending' };
    }

    // Error/failure detection
    if (lowerLog.includes('build failed') || lowerLog.includes('error:') || lowerLog.includes('fatal')) {
      return { phase: 'failed', message: log.trim().substring(0, 200) };
    }

    return null;
  }

  /**
   * Calculate overall progress based on phase and phase progress
   */
  private calculateOverallProgress(phase: ExecutionProgressData['phase'], phaseProgress: number): number {
    // Phase weight ranges (same as in constants.ts)
    const weights: Record<string, { start: number; end: number }> = {
      idle: { start: 0, end: 0 },
      planning: { start: 0, end: 20 },
      coding: { start: 20, end: 80 },
      qa_review: { start: 80, end: 95 },
      qa_fixing: { start: 80, end: 95 },
      complete: { start: 100, end: 100 },
      failed: { start: 0, end: 0 }
    };

    const phaseWeight = weights[phase] || { start: 0, end: 0 };
    const phaseRange = phaseWeight.end - phaseWeight.start;
    return Math.round(phaseWeight.start + (phaseRange * phaseProgress / 100));
  }

  /**
   * Spawn a Python process
   */
  private spawnProcess(
    taskId: string,
    cwd: string,
    args: string[],
    extraEnv: Record<string, string> = {},
    processType: ProcessType = 'task-execution'
  ): void {
    const isSpecRunner = processType === 'spec-creation';
    // Kill existing process for this task if any
    this.killTask(taskId);

    // Generate unique spawn ID for this process instance
    const spawnId = ++this.spawnCounter;

    console.log('[spawnProcess] Spawning with pythonPath:', this.pythonPath);
    console.log('[spawnProcess] cwd:', cwd);
    console.log('[spawnProcess] processType:', processType);
    console.log('[spawnProcess] spawnId:', spawnId);

    // Get active Claude profile environment (CLAUDE_CONFIG_DIR if not default)
    const spawnProfileEnv = getProfileEnv();

    const childProcess = spawn(this.pythonPath, args, {
      cwd,
      env: {
        ...process.env,
        ...extraEnv,
        ...spawnProfileEnv, // Include active Claude profile config
        PYTHONUNBUFFERED: '1' // Ensure real-time output
      }
    });

    console.log('[spawnProcess] Process spawned, pid:', childProcess.pid);

    this.processes.set(taskId, {
      taskId,
      process: childProcess,
      startedAt: new Date(),
      spawnId
    });

    // Track execution progress
    let currentPhase: ExecutionProgressData['phase'] = isSpecRunner ? 'planning' : 'planning';
    let phaseProgress = 0;
    let currentSubtask: string | undefined;
    let lastMessage: string | undefined;
    // Collect all output for rate limit detection
    let allOutput = '';

    // Emit initial progress
    this.emit('execution-progress', taskId, {
      phase: currentPhase,
      phaseProgress: 0,
      overallProgress: this.calculateOverallProgress(currentPhase, 0),
      message: isSpecRunner ? 'Starting spec creation...' : 'Starting build process...'
    });

    const processLog = (log: string) => {
      // Collect output for rate limit detection (keep last 10KB)
      allOutput = (allOutput + log).slice(-10000);
      // Parse for phase transitions
      const phaseUpdate = this.parseExecutionPhase(log, currentPhase, isSpecRunner);

      if (phaseUpdate) {
        const phaseChanged = phaseUpdate.phase !== currentPhase;
        currentPhase = phaseUpdate.phase;

        if (phaseUpdate.currentSubtask) {
          currentSubtask = phaseUpdate.currentSubtask;
        }
        if (phaseUpdate.message) {
          lastMessage = phaseUpdate.message;
        }

        // Reset phase progress on phase change, otherwise increment
        if (phaseChanged) {
          phaseProgress = 10; // Start new phase at 10%
        } else {
          phaseProgress = Math.min(90, phaseProgress + 5); // Increment within phase
        }

        const overallProgress = this.calculateOverallProgress(currentPhase, phaseProgress);

        this.emit('execution-progress', taskId, {
          phase: currentPhase,
          phaseProgress,
          overallProgress,
          currentSubtask,
          message: lastMessage
        });
      }
    };

    // Handle stdout
    childProcess.stdout?.on('data', (data: Buffer) => {
      const log = data.toString();
      console.log('[spawnProcess] stdout:', log.substring(0, 200));
      this.emit('log', taskId, log);
      processLog(log);
    });

    // Handle stderr
    childProcess.stderr?.on('data', (data: Buffer) => {
      const log = data.toString();
      console.log('[spawnProcess] stderr:', log.substring(0, 200));
      // Some Python output goes to stderr (like progress bars)
      // so we treat it as log, not error
      this.emit('log', taskId, log);
      processLog(log);
    });

    // Handle process exit
    childProcess.on('exit', (code: number | null) => {
      console.log('[spawnProcess] Process exited with code:', code, 'spawnId:', spawnId);
      this.processes.delete(taskId);

      // Check if this specific spawn was killed (vs exited naturally)
      // If killed, don't emit exit event to prevent race condition with new process
      if (this.killedSpawnIds.has(spawnId)) {
        console.log('[spawnProcess] Process was killed, skipping exit event for spawnId:', spawnId);
        this.killedSpawnIds.delete(spawnId);
        return;
      }

      // Check for rate limit if process failed
      if (code !== 0) {
        const rateLimitDetection = detectRateLimit(allOutput);
        if (rateLimitDetection.isRateLimited) {
          console.log('[spawnProcess] Rate limit detected in task output:', {
            taskId,
            resetTime: rateLimitDetection.resetTime,
            limitType: rateLimitDetection.limitType,
            suggestedProfile: rateLimitDetection.suggestedProfile?.name
          });

          // Determine source type based on processType
          const source = processType === 'spec-creation' ? 'task' : 'task';

          // Emit rate limit event
          const rateLimitInfo = createSDKRateLimitInfo(source, rateLimitDetection, {
            taskId
          });
          this.emit('sdk-rate-limit', rateLimitInfo);
        }
      }

      // Emit final progress
      const finalPhase = code === 0 ? 'complete' : 'failed';
      this.emit('execution-progress', taskId, {
        phase: finalPhase,
        phaseProgress: 100,
        overallProgress: code === 0 ? 100 : this.calculateOverallProgress(currentPhase, phaseProgress),
        message: code === 0 ? 'Process completed successfully' : `Process exited with code ${code}`
      });

      this.emit('exit', taskId, code, processType);
    });

    // Handle process error
    childProcess.on('error', (err: Error) => {
      console.log('[spawnProcess] Process error:', err.message);
      this.processes.delete(taskId);

      this.emit('execution-progress', taskId, {
        phase: 'failed',
        phaseProgress: 0,
        overallProgress: 0,
        message: `Error: ${err.message}`
      });

      this.emit('error', taskId, err.message);
    });
  }

  /**
   * Kill a specific task's process
   */
  killTask(taskId: string): boolean {
    const agentProcess = this.processes.get(taskId);
    if (agentProcess) {
      try {
        // Mark this specific spawn as killed so its exit handler knows to ignore
        this.killedSpawnIds.add(agentProcess.spawnId);

        // Send SIGTERM first for graceful shutdown
        agentProcess.process.kill('SIGTERM');

        // Force kill after timeout
        setTimeout(() => {
          if (!agentProcess.process.killed) {
            agentProcess.process.kill('SIGKILL');
          }
        }, 5000);

        this.processes.delete(taskId);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Stop ideation generation for a project
   */
  stopIdeation(projectId: string): boolean {
    const wasRunning = this.isRunning(projectId);
    if (wasRunning) {
      this.killTask(projectId);
      this.emit('ideation-stopped', projectId);
      return true;
    }
    return false;
  }

  /**
   * Check if ideation is running for a project
   */
  isIdeationRunning(projectId: string): boolean {
    return this.isRunning(projectId);
  }

  /**
   * Kill all running processes
   */
  async killAll(): Promise<void> {
    const killPromises = Array.from(this.processes.keys()).map((taskId) => {
      return new Promise<void>((resolve) => {
        this.killTask(taskId);
        resolve();
      });
    });
    await Promise.all(killPromises);
  }

  /**
   * Check if a task is running
   */
  isRunning(taskId: string): boolean {
    return this.processes.has(taskId);
  }

  /**
   * Get all running task IDs
   */
  getRunningTasks(): string[] {
    return Array.from(this.processes.keys());
  }
}
