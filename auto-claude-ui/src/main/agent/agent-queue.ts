import { spawn } from 'child_process';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { EventEmitter } from 'events';
import { AgentState } from './agent-state';
import { AgentEvents } from './agent-events';
import { AgentProcessManager } from './agent-process';
import { IdeationConfig } from './types';
import { detectRateLimit, createSDKRateLimitInfo, getProfileEnv } from '../rate-limit-detector';

/**
 * Queue management for ideation and roadmap generation
 */
export class AgentQueueManager {
  private state: AgentState;
  private events: AgentEvents;
  private processManager: AgentProcessManager;
  private emitter: EventEmitter;

  constructor(
    state: AgentState,
    events: AgentEvents,
    processManager: AgentProcessManager,
    emitter: EventEmitter
  ) {
    this.state = state;
    this.events = events;
    this.processManager = processManager;
    this.emitter = emitter;
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
    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      this.emitter.emit('roadmap-error', projectId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const roadmapRunnerPath = path.join(autoBuildSource, 'roadmap_runner.py');

    if (!existsSync(roadmapRunnerPath)) {
      this.emitter.emit('roadmap-error', projectId, `Roadmap runner not found at: ${roadmapRunnerPath}`);
      return;
    }

    const args = [roadmapRunnerPath, '--project', projectPath];

    if (refresh) {
      args.push('--refresh');
    }

    // Add competitor analysis flag if enabled
    if (enableCompetitorAnalysis) {
      args.push('--competitor-analysis');
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
    config: IdeationConfig,
    refresh: boolean = false
  ): void {
    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      this.emitter.emit('ideation-error', projectId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const ideationRunnerPath = path.join(autoBuildSource, 'ideation_runner.py');

    if (!existsSync(ideationRunnerPath)) {
      this.emitter.emit('ideation-error', projectId, `Ideation runner not found at: ${ideationRunnerPath}`);
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
    this.processManager.killProcess(projectId);

    // Generate unique spawn ID for this process instance
    const spawnId = this.state.generateSpawnId();

    // Run from auto-claude source directory so imports work correctly
    const autoBuildSource = this.processManager.getAutoBuildSourcePath();
    const cwd = autoBuildSource || process.cwd();

    // Get combined environment variables
    const combinedEnv = this.processManager.getCombinedEnv(projectPath);

    // Get active Claude profile environment (CLAUDE_CONFIG_DIR if not default)
    const profileEnv = getProfileEnv();

    // Get Python path from process manager (uses venv if configured)
    const pythonPath = this.processManager.getPythonPath();

    const childProcess = spawn(pythonPath, args, {
      cwd,
      env: {
        ...process.env,
        ...combinedEnv,
        ...profileEnv,
        PYTHONUNBUFFERED: '1'
      }
    });

    this.state.addProcess(projectId, {
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
          this.emitter.emit('ideation-log', projectId, trimmed);
        }
      }
    };

    console.log('[Ideation] Starting ideation process with args:', args);
    console.log('[Ideation] CWD:', cwd);

    // Track completed types for progress calculation
    const completedTypes = new Set<string>();
    const totalTypes = 7; // Default all types

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
        this.emitter.emit('ideation-type-complete', projectId, ideationType, parseInt(ideasCount, 10));
      }

      const typeFailedMatch = log.match(/IDEATION_TYPE_FAILED:(\w+)/);
      if (typeFailedMatch) {
        const [, ideationType] = typeFailedMatch;
        completedTypes.add(ideationType);
        console.log(`[Ideation] Type failed: ${ideationType}`);
        this.emitter.emit('ideation-type-failed', projectId, ideationType);
      }

      // Parse progress using AgentEvents
      const progressUpdate = this.events.parseIdeationProgress(
        log,
        progressPhase,
        progressPercent,
        completedTypes,
        totalTypes
      );
      progressPhase = progressUpdate.phase;
      progressPercent = progressUpdate.progress;

      // Emit progress update with a clean message for the status bar
      const statusMessage = log.trim().split('\n')[0].substring(0, 200);
      this.emitter.emit('ideation-progress', projectId, {
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
      this.emitter.emit('ideation-progress', projectId, {
        phase: progressPhase,
        progress: progressPercent,
        message: log.trim().split('\n')[0].substring(0, 200)
      });
    });

    // Handle process exit
    childProcess.on('exit', (code: number | null) => {
      console.log('[Ideation] Process exited with code:', code);

      // Get the stored project path before deleting from map
      const processInfo = this.state.getProcess(projectId);
      const storedProjectPath = processInfo?.projectPath;
      this.state.deleteProcess(projectId);

      // Check for rate limit if process failed
      if (code !== 0) {
        const rateLimitDetection = detectRateLimit(allOutput);
        if (rateLimitDetection.isRateLimited) {
          const rateLimitInfo = createSDKRateLimitInfo('ideation', rateLimitDetection, {
            projectId
          });
          this.emitter.emit('sdk-rate-limit', rateLimitInfo);
        }
      }

      if (code === 0) {
        this.emitter.emit('ideation-progress', projectId, {
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
              this.emitter.emit('ideation-complete', projectId, session);
            } else {
              console.warn('[Ideation] ideation.json not found at:', ideationFilePath);
            }
          } catch (err) {
            console.error('[Ideation] Failed to load ideation session:', err);
          }
        }
      } else {
        this.emitter.emit('ideation-error', projectId, `Ideation generation failed with exit code ${code}`);
      }
    });

    // Handle process error
    childProcess.on('error', (err: Error) => {
      console.error('[Ideation] Process error:', err.message);
      this.state.deleteProcess(projectId);
      this.emitter.emit('ideation-error', projectId, err.message);
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
    this.processManager.killProcess(projectId);

    // Generate unique spawn ID for this process instance
    const spawnId = this.state.generateSpawnId();

    // Run from auto-claude source directory so imports work correctly
    const autoBuildSource = this.processManager.getAutoBuildSourcePath();
    const cwd = autoBuildSource || process.cwd();

    // Get combined environment variables
    const combinedEnv = this.processManager.getCombinedEnv(projectPath);

    // Get active Claude profile environment (CLAUDE_CONFIG_DIR if not default)
    const profileEnv = getProfileEnv();

    // Get Python path from process manager (uses venv if configured)
    const pythonPath = this.processManager.getPythonPath();

    console.log('[Roadmap] Starting roadmap process with args:', args);
    console.log('[Roadmap] CWD:', cwd);
    console.log('[Roadmap] Python path:', pythonPath);

    const childProcess = spawn(pythonPath, args, {
      cwd,
      env: {
        ...process.env,
        ...combinedEnv,
        ...profileEnv,
        PYTHONUNBUFFERED: '1'
      }
    });

    this.state.addProcess(projectId, {
      taskId: projectId,
      process: childProcess,
      startedAt: new Date(),
      projectPath, // Store project path for loading roadmap on completion
      spawnId
    });

    // Track progress through output
    let progressPhase = 'analyzing';
    let progressPercent = 10;
    // Collect output for rate limit detection
    let allRoadmapOutput = '';

    // Helper to emit logs - split multi-line output into individual log lines
    const emitLogs = (log: string) => {
      const lines = log.split('\n').filter(line => line.trim().length > 0);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          console.log('[Roadmap]', trimmed);
          this.emitter.emit('roadmap-log', projectId, trimmed);
        }
      }
    };

    // Handle stdout
    childProcess.stdout?.on('data', (data: Buffer) => {
      const log = data.toString();
      // Collect output for rate limit detection (keep last 10KB)
      allRoadmapOutput = (allRoadmapOutput + log).slice(-10000);

      // Emit all log lines for debugging
      emitLogs(log);

      // Parse progress using AgentEvents
      const progressUpdate = this.events.parseRoadmapProgress(log, progressPhase, progressPercent);
      progressPhase = progressUpdate.phase;
      progressPercent = progressUpdate.progress;

      // Emit progress update
      this.emitter.emit('roadmap-progress', projectId, {
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
      console.error('[Roadmap STDERR]', log);
      emitLogs(log);
      this.emitter.emit('roadmap-progress', projectId, {
        phase: progressPhase,
        progress: progressPercent,
        message: log.trim().substring(0, 200)
      });
    });

    // Handle process exit
    childProcess.on('exit', (code: number | null) => {
      console.log('[Roadmap] Process exited with code:', code);

      // Get the stored project path before deleting from map
      const processInfo = this.state.getProcess(projectId);
      const storedProjectPath = processInfo?.projectPath;
      this.state.deleteProcess(projectId);

      // Check for rate limit if process failed
      if (code !== 0) {
        const rateLimitDetection = detectRateLimit(allRoadmapOutput);
        if (rateLimitDetection.isRateLimited) {
          const rateLimitInfo = createSDKRateLimitInfo('roadmap', rateLimitDetection, {
            projectId
          });
          this.emitter.emit('sdk-rate-limit', rateLimitInfo);
        }
      }

      if (code === 0) {
        console.log('[Roadmap] Roadmap generation completed successfully');
        this.emitter.emit('roadmap-progress', projectId, {
          phase: 'complete',
          progress: 100,
          message: 'Roadmap generation complete'
        });

        // Load and emit the complete roadmap
        if (storedProjectPath) {
          try {
            const roadmapFilePath = path.join(
              storedProjectPath,
              '.auto-claude',
              'roadmap',
              'roadmap.json'
            );
            if (existsSync(roadmapFilePath)) {
              const content = readFileSync(roadmapFilePath, 'utf-8');
              const roadmap = JSON.parse(content);
              console.log('[Roadmap] Emitting roadmap-complete with roadmap data');
              this.emitter.emit('roadmap-complete', projectId, roadmap);
            } else {
              console.warn('[Roadmap] roadmap.json not found at:', roadmapFilePath);
            }
          } catch (err) {
            console.error('[Roadmap] Failed to load roadmap:', err);
          }
        }
      } else {
        console.error('[Roadmap] Roadmap generation failed with exit code:', code);
        this.emitter.emit('roadmap-error', projectId, `Roadmap generation failed with exit code ${code}`);
      }
    });

    // Handle process error
    childProcess.on('error', (err: Error) => {
      console.error('[Roadmap] Process error:', err.message);
      this.state.deleteProcess(projectId);
      this.emitter.emit('roadmap-error', projectId, err.message);
    });
  }

  /**
   * Stop ideation generation for a project
   */
  stopIdeation(projectId: string): boolean {
    const wasRunning = this.state.hasProcess(projectId);
    if (wasRunning) {
      this.processManager.killProcess(projectId);
      this.emitter.emit('ideation-stopped', projectId);
      return true;
    }
    return false;
  }

  /**
   * Check if ideation is running for a project
   */
  isIdeationRunning(projectId: string): boolean {
    return this.state.hasProcess(projectId);
  }
}
