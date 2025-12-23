import { spawn } from 'child_process';
import path from 'path';
import { existsSync, promises as fsPromises } from 'fs';
import { EventEmitter } from 'events';
import { AgentState } from './agent-state';
import { AgentEvents } from './agent-events';
import { AgentProcessManager } from './agent-process';
import { RoadmapConfig } from './types';
import type { IdeationConfig, Idea } from '../../shared/types';
import { MODEL_ID_MAP } from '../../shared/constants';
import { detectRateLimit, createSDKRateLimitInfo, getProfileEnv } from '../rate-limit-detector';
import { debugLog, debugError } from '../../shared/utils/debug-logger';
import { parsePythonCommand } from '../python-detector';
import { transformIdeaFromSnakeCase, transformSessionFromSnakeCase } from '../ipc-handlers/ideation/transformers';
import { transformRoadmapFromSnakeCase } from '../ipc-handlers/roadmap/transformers';
import type { RawIdea } from '../ipc-handlers/ideation/types';

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
   *
   * @param refreshCompetitorAnalysis - Force refresh competitor analysis even if it exists.
   *   This allows refreshing competitor data independently of the general roadmap refresh.
   *   Use when user explicitly wants new competitor research.
   */
  startRoadmapGeneration(
    projectId: string,
    projectPath: string,
    refresh: boolean = false,
    enableCompetitorAnalysis: boolean = false,
    refreshCompetitorAnalysis: boolean = false,
    config?: RoadmapConfig
  ): void {
    debugLog('[Agent Queue] Starting roadmap generation:', {
      projectId,
      projectPath,
      refresh,
      enableCompetitorAnalysis,
      refreshCompetitorAnalysis,
      config
    });

    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      debugError('[Agent Queue] Auto-build source path not found');
      this.emitter.emit('roadmap-error', projectId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const roadmapRunnerPath = path.join(autoBuildSource, 'runners', 'roadmap_runner.py');

    if (!existsSync(roadmapRunnerPath)) {
      debugError('[Agent Queue] Roadmap runner not found at:', roadmapRunnerPath);
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

    // Add refresh competitor analysis flag if user wants fresh competitor data
    if (refreshCompetitorAnalysis) {
      args.push('--refresh-competitor-analysis');
    }

    // Add model and thinking level from config
    if (config?.model) {
      const modelId = MODEL_ID_MAP[config.model] || MODEL_ID_MAP['opus'];
      args.push('--model', modelId);
    }
    if (config?.thinkingLevel) {
      args.push('--thinking-level', config.thinkingLevel);
    }

    debugLog('[Agent Queue] Spawning roadmap process with args:', args);

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
    debugLog('[Agent Queue] Starting ideation generation:', {
      projectId,
      projectPath,
      config,
      refresh
    });

    const autoBuildSource = this.processManager.getAutoBuildSourcePath();

    if (!autoBuildSource) {
      debugError('[Agent Queue] Auto-build source path not found');
      this.emitter.emit('ideation-error', projectId, 'Auto-build source path not found. Please configure it in App Settings.');
      return;
    }

    const ideationRunnerPath = path.join(autoBuildSource, 'runners', 'ideation_runner.py');

    if (!existsSync(ideationRunnerPath)) {
      debugError('[Agent Queue] Ideation runner not found at:', ideationRunnerPath);
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

    // Add model and thinking level from config
    if (config.model) {
      const modelId = MODEL_ID_MAP[config.model] || MODEL_ID_MAP['opus'];
      args.push('--model', modelId);
    }
    if (config.thinkingLevel) {
      args.push('--thinking-level', config.thinkingLevel);
    }

    debugLog('[Agent Queue] Spawning ideation process with args:', args);

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
    debugLog('[Agent Queue] Spawning ideation process:', { projectId, projectPath });

    // Kill existing process for this project if any
    const wasKilled = this.processManager.killProcess(projectId);
    if (wasKilled) {
      debugLog('[Agent Queue] Killed existing process for project:', projectId);
    }

    // Generate unique spawn ID for this process instance
    const spawnId = this.state.generateSpawnId();
    debugLog('[Agent Queue] Generated spawn ID:', spawnId);

    // Run from auto-claude source directory so imports work correctly
    const autoBuildSource = this.processManager.getAutoBuildSourcePath();
    const cwd = autoBuildSource || process.cwd();

    // Get combined environment variables
    const combinedEnv = this.processManager.getCombinedEnv(projectPath);

    // Get active Claude profile environment (CLAUDE_CODE_OAUTH_TOKEN if not default)
    const profileEnv = getProfileEnv();

    // Get Python path from process manager (uses venv if configured)
    const pythonPath = this.processManager.getPythonPath();

    // Build final environment with proper precedence:
    // 1. process.env (system)
    // 2. combinedEnv (auto-claude/.env for CLI usage)
    // 3. profileEnv (Electron app OAuth token - highest priority)
    // 4. Our specific overrides
    const finalEnv = {
      ...process.env,
      ...combinedEnv,
      ...profileEnv,
      PYTHONPATH: autoBuildSource || '', // Allow imports from auto-claude directory
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1'
    };

    // Debug: Show OAuth token source
    const tokenSource = profileEnv['CLAUDE_CODE_OAUTH_TOKEN']
      ? 'Electron app profile'
      : (combinedEnv['CLAUDE_CODE_OAUTH_TOKEN'] ? 'auto-claude/.env' : 'not found');
    const oauthToken = (finalEnv as Record<string, string | undefined>)['CLAUDE_CODE_OAUTH_TOKEN'];
    const hasToken = !!oauthToken;
    debugLog('[Agent Queue] OAuth token status:', {
      source: tokenSource,
      hasToken,
      tokenPreview: hasToken ? oauthToken?.substring(0, 20) + '...' : 'none'
    });

    // Parse Python command to handle space-separated commands like "py -3"
    const [pythonCommand, pythonBaseArgs] = parsePythonCommand(pythonPath);
    const childProcess = spawn(pythonCommand, [...pythonBaseArgs, ...args], {
      cwd,
      env: finalEnv
    });

    this.state.addProcess(projectId, {
      taskId: projectId,
      process: childProcess,
      startedAt: new Date(),
      projectPath, // Store project path for loading session on completion
      spawnId,
      queueProcessType: 'ideation'
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
          this.emitter.emit('ideation-log', projectId, trimmed);
        }
      }
    };

    // Track completed types for progress calculation
    const completedTypes = new Set<string>();
    const totalTypes = 7; // Default all types

    // Handle stdout - explicitly decode as UTF-8 for cross-platform Unicode support
    childProcess.stdout?.on('data', (data: Buffer) => {
      const log = data.toString('utf8');
      // Collect output for rate limit detection (keep last 10KB)
      allOutput = (allOutput + log).slice(-10000);

      // Emit all log lines for the activity log
      emitLogs(log);

      const typeCompleteMatch = log.match(/IDEATION_TYPE_COMPLETE:(\w+):(\d+)/);
      if (typeCompleteMatch) {
        const [, ideationType, ideasCount] = typeCompleteMatch;
        completedTypes.add(ideationType);

        debugLog('[Agent Queue] Ideation type completed:', {
          projectId,
          ideationType,
          ideasCount: parseInt(ideasCount, 10),
          totalCompleted: completedTypes.size
        });

        const typeFilePath = path.join(
          projectPath,
          '.auto-claude',
          'ideation',
          `${ideationType}_ideas.json`
        );

        const loadIdeationType = async (): Promise<void> => {
          try {
            const content = await fsPromises.readFile(typeFilePath, 'utf-8');
            const data: Record<string, RawIdea[]> = JSON.parse(content);
            const rawIdeas: RawIdea[] = data[ideationType] || [];
            const ideas: Idea[] = rawIdeas.map(transformIdeaFromSnakeCase);
            debugLog('[Agent Queue] Loaded ideas for type:', {
              ideationType,
              loadedCount: ideas.length,
              filePath: typeFilePath
            });
            this.emitter.emit('ideation-type-complete', projectId, ideationType, ideas);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
              debugError('[Agent Queue] Ideas file not found:', typeFilePath);
            } else {
              debugError('[Agent Queue] Failed to load ideas for type:', ideationType, err);
            }
            this.emitter.emit('ideation-type-complete', projectId, ideationType, []);
          }
        };
        loadIdeationType().catch((err: unknown) => {
          debugError('[Agent Queue] Unhandled error in ideation type handler (event already emitted):', {
            ideationType,
            projectId,
            typeFilePath
          }, err);
        });
      }

      const typeFailedMatch = log.match(/IDEATION_TYPE_FAILED:(\w+)/);
      if (typeFailedMatch) {
        const [, ideationType] = typeFailedMatch;
        completedTypes.add(ideationType);

        debugError('[Agent Queue] Ideation type failed:', { projectId, ideationType });
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

    // Handle stderr - also emit as logs, explicitly decode as UTF-8
    childProcess.stderr?.on('data', (data: Buffer) => {
      const log = data.toString('utf8');
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
      debugLog('[Agent Queue] Ideation process exited:', { projectId, code, spawnId });

      // Check if this process was intentionally stopped by the user
      const wasIntentionallyStopped = this.state.wasSpawnKilled(spawnId);
      if (wasIntentionallyStopped) {
        debugLog('[Agent Queue] Ideation process was intentionally stopped, ignoring exit');
        this.state.clearKilledSpawn(spawnId);
        this.state.deleteProcess(projectId);
        // Emit stopped event to ensure UI updates
        this.emitter.emit('ideation-stopped', projectId);
        return;
      }

      // Get the stored project path before deleting from map
      const processInfo = this.state.getProcess(projectId);
      const storedProjectPath = processInfo?.projectPath;
      this.state.deleteProcess(projectId);

      // Check for rate limit if process failed
      if (code !== 0) {
        debugLog('[Agent Queue] Checking for rate limit (non-zero exit)');
        const rateLimitDetection = detectRateLimit(allOutput);
        if (rateLimitDetection.isRateLimited) {
          debugLog('[Agent Queue] Rate limit detected for ideation');
          const rateLimitInfo = createSDKRateLimitInfo('ideation', rateLimitDetection, {
            projectId
          });
          this.emitter.emit('sdk-rate-limit', rateLimitInfo);
        }
      }

      if (code === 0) {
        debugLog('[Agent Queue] Ideation generation completed successfully');
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
            debugLog('[Agent Queue] Loading ideation session from:', ideationFilePath);
            if (existsSync(ideationFilePath)) {
              const loadSession = async (): Promise<void> => {
                try {
                  const content = await fsPromises.readFile(ideationFilePath, 'utf-8');
                  const rawSession = JSON.parse(content);
                  const session = transformSessionFromSnakeCase(rawSession, projectId);
                  debugLog('[Agent Queue] Loaded ideation session:', {
                    totalIdeas: session.ideas?.length || 0
                  });
                  this.emitter.emit('ideation-complete', projectId, session);
                } catch (err) {
                  debugError('[Ideation] Failed to load ideation session:', err);
                  this.emitter.emit('ideation-error', projectId,
                    `Failed to load ideation session: ${err instanceof Error ? err.message : 'Unknown error'}`);
                }
              };
              loadSession().catch((err: unknown) => {
                debugError('[Agent Queue] Unhandled error loading ideation session:', err);
              });
            } else {
              debugError('[Ideation] ideation.json not found at:', ideationFilePath);
              this.emitter.emit('ideation-error', projectId,
                'Ideation completed but session file not found. Ideas may have been saved to individual type files.');
            }
          } catch (err) {
            debugError('[Ideation] Unexpected error in ideation completion:', err);
            this.emitter.emit('ideation-error', projectId,
              `Failed to load ideation session: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        } else {
          debugError('[Ideation] No project path available to load session');
          this.emitter.emit('ideation-error', projectId,
            'Ideation completed but project path unavailable');
        }
      } else {
        debugError('[Agent Queue] Ideation generation failed:', { projectId, code });
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
    debugLog('[Agent Queue] Spawning roadmap process:', { projectId, projectPath });

    // Kill existing process for this project if any
    const wasKilled = this.processManager.killProcess(projectId);
    if (wasKilled) {
      debugLog('[Agent Queue] Killed existing roadmap process for project:', projectId);
    }

    // Generate unique spawn ID for this process instance
    const spawnId = this.state.generateSpawnId();
    debugLog('[Agent Queue] Generated roadmap spawn ID:', spawnId);

    // Run from auto-claude source directory so imports work correctly
    const autoBuildSource = this.processManager.getAutoBuildSourcePath();
    const cwd = autoBuildSource || process.cwd();

    // Get combined environment variables
    const combinedEnv = this.processManager.getCombinedEnv(projectPath);

    // Get active Claude profile environment (CLAUDE_CODE_OAUTH_TOKEN if not default)
    const profileEnv = getProfileEnv();

    // Get Python path from process manager (uses venv if configured)
    const pythonPath = this.processManager.getPythonPath();

    // Build final environment with proper precedence:
    // 1. process.env (system)
    // 2. combinedEnv (auto-claude/.env for CLI usage)
    // 3. profileEnv (Electron app OAuth token - highest priority)
    // 4. Our specific overrides
    const finalEnv = {
      ...process.env,
      ...combinedEnv,
      ...profileEnv,
      PYTHONPATH: autoBuildSource || '', // Allow imports from auto-claude directory
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1'
    };

    // Debug: Show OAuth token source
    const tokenSource = profileEnv['CLAUDE_CODE_OAUTH_TOKEN']
      ? 'Electron app profile'
      : (combinedEnv['CLAUDE_CODE_OAUTH_TOKEN'] ? 'auto-claude/.env' : 'not found');
    const oauthToken = (finalEnv as Record<string, string | undefined>)['CLAUDE_CODE_OAUTH_TOKEN'];
    const hasToken = !!oauthToken;
    debugLog('[Agent Queue] OAuth token status:', {
      source: tokenSource,
      hasToken,
      tokenPreview: hasToken ? oauthToken?.substring(0, 20) + '...' : 'none'
    });

    // Parse Python command to handle space-separated commands like "py -3"
    const [pythonCommand, pythonBaseArgs] = parsePythonCommand(pythonPath);
    const childProcess = spawn(pythonCommand, [...pythonBaseArgs, ...args], {
      cwd,
      env: finalEnv
    });

    this.state.addProcess(projectId, {
      taskId: projectId,
      process: childProcess,
      startedAt: new Date(),
      projectPath, // Store project path for loading roadmap on completion
      spawnId,
      queueProcessType: 'roadmap'
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
          this.emitter.emit('roadmap-log', projectId, trimmed);
        }
      }
    };

    // Handle stdout - explicitly decode as UTF-8 for cross-platform Unicode support
    childProcess.stdout?.on('data', (data: Buffer) => {
      const log = data.toString('utf8');
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

    // Handle stderr - explicitly decode as UTF-8
    childProcess.stderr?.on('data', (data: Buffer) => {
      const log = data.toString('utf8');
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
      debugLog('[Agent Queue] Roadmap process exited:', { projectId, code, spawnId });

      // Check if this process was intentionally stopped by the user
      const wasIntentionallyStopped = this.state.wasSpawnKilled(spawnId);
      if (wasIntentionallyStopped) {
        debugLog('[Agent Queue] Roadmap process was intentionally stopped, ignoring exit');
        this.state.clearKilledSpawn(spawnId);
        this.state.deleteProcess(projectId);
        return;
      }

      // Get the stored project path before deleting from map
      const processInfo = this.state.getProcess(projectId);
      const storedProjectPath = processInfo?.projectPath;
      this.state.deleteProcess(projectId);

      // Check for rate limit if process failed
      if (code !== 0) {
        debugLog('[Agent Queue] Checking for rate limit (non-zero exit)');
        const rateLimitDetection = detectRateLimit(allRoadmapOutput);
        if (rateLimitDetection.isRateLimited) {
          debugLog('[Agent Queue] Rate limit detected for roadmap');
          const rateLimitInfo = createSDKRateLimitInfo('roadmap', rateLimitDetection, {
            projectId
          });
          this.emitter.emit('sdk-rate-limit', rateLimitInfo);
        }
      }

      if (code === 0) {
        debugLog('[Agent Queue] Roadmap generation completed successfully');
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
            debugLog('[Agent Queue] Loading roadmap from:', roadmapFilePath);
            if (existsSync(roadmapFilePath)) {
              const loadRoadmap = async (): Promise<void> => {
                try {
                  const content = await fsPromises.readFile(roadmapFilePath, 'utf-8');
                  const rawRoadmap = JSON.parse(content);
                  const transformedRoadmap = transformRoadmapFromSnakeCase(rawRoadmap, projectId);
                  debugLog('[Agent Queue] Loaded roadmap:', {
                    featuresCount: transformedRoadmap.features?.length || 0,
                    phasesCount: transformedRoadmap.phases?.length || 0
                  });
                  this.emitter.emit('roadmap-complete', projectId, transformedRoadmap);
                } catch (err) {
                  debugError('[Roadmap] Failed to load roadmap:', err);
                  this.emitter.emit('roadmap-error', projectId,
                    `Failed to load roadmap: ${err instanceof Error ? err.message : 'Unknown error'}`);
                }
              };
              loadRoadmap().catch((err: unknown) => {
                debugError('[Agent Queue] Unhandled error loading roadmap:', err);
              });
            } else {
              debugError('[Roadmap] roadmap.json not found at:', roadmapFilePath);
              this.emitter.emit('roadmap-error', projectId,
                'Roadmap completed but file not found.');
            }
          } catch (err) {
            debugError('[Roadmap] Unexpected error in roadmap completion:', err);
            this.emitter.emit('roadmap-error', projectId,
              `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        } else {
          debugError('[Roadmap] No project path available for roadmap completion');
          this.emitter.emit('roadmap-error', projectId, 'Roadmap completed but project path not found.');
        }
      } else {
        debugError('[Agent Queue] Roadmap generation failed:', { projectId, code });
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
    debugLog('[Agent Queue] Stop ideation requested:', { projectId });

    const processInfo = this.state.getProcess(projectId);
    const isIdeation = processInfo?.queueProcessType === 'ideation';
    debugLog('[Agent Queue] Process running?', { projectId, isIdeation, processType: processInfo?.queueProcessType });

    if (isIdeation) {
      debugLog('[Agent Queue] Killing ideation process:', projectId);
      this.processManager.killProcess(projectId);
      this.emitter.emit('ideation-stopped', projectId);
      return true;
    }
    debugLog('[Agent Queue] No running ideation process found for:', projectId);
    return false;
  }

  /**
   * Check if ideation is running for a project
   */
  isIdeationRunning(projectId: string): boolean {
    const processInfo = this.state.getProcess(projectId);
    return processInfo?.queueProcessType === 'ideation';
  }

  /**
   * Stop roadmap generation for a project
   */
  stopRoadmap(projectId: string): boolean {
    debugLog('[Agent Queue] Stop roadmap requested:', { projectId });

    const processInfo = this.state.getProcess(projectId);
    const isRoadmap = processInfo?.queueProcessType === 'roadmap';
    debugLog('[Agent Queue] Roadmap process running?', { projectId, isRoadmap, processType: processInfo?.queueProcessType });

    if (isRoadmap) {
      debugLog('[Agent Queue] Killing roadmap process:', projectId);
      this.processManager.killProcess(projectId);
      this.emitter.emit('roadmap-stopped', projectId);
      return true;
    }
    debugLog('[Agent Queue] No running roadmap process found for:', projectId);
    return false;
  }

  /**
   * Check if roadmap is running for a project
   */
  isRoadmapRunning(projectId: string): boolean {
    const processInfo = this.state.getProcess(projectId);
    return processInfo?.queueProcessType === 'roadmap';
  }
}
