import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { app } from 'electron';
import { EventEmitter } from 'events';
import { AgentState } from './agent-state';
import { AgentEvents } from './agent-events';
import { ProcessType, ExecutionProgressData } from './types';
import { detectRateLimit, createSDKRateLimitInfo, getProfileEnv } from '../rate-limit-detector';
import { projectStore } from '../project-store';
import { getClaudeProfileManager } from '../claude-profile-manager';

/**
 * Process spawning and lifecycle management
 */
export class AgentProcessManager {
  private state: AgentState;
  private events: AgentEvents;
  private emitter: EventEmitter;
  private pythonPath: string = 'python3';
  private autoBuildSourcePath: string = '';

  constructor(state: AgentState, events: AgentEvents, emitter: EventEmitter) {
    this.state = state;
    this.events = events;
    this.emitter = emitter;
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
   * Get the configured Python path
   */
  getPythonPath(): string {
    return this.pythonPath;
  }

  /**
   * Get the auto-claude source path (detects automatically if not configured)
   */
  getAutoBuildSourcePath(): string | null {
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
      // Use requirements.txt as marker - it always exists in auto-claude source
      if (existsSync(p) && existsSync(path.join(p, 'requirements.txt'))) {
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
  loadAutoBuildEnv(): Record<string, string> {
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
   * Spawn a Python process for task execution
   */
  spawnProcess(
    taskId: string,
    cwd: string,
    args: string[],
    extraEnv: Record<string, string> = {},
    processType: ProcessType = 'task-execution'
  ): void {
    const isSpecRunner = processType === 'spec-creation';
    // Kill existing process for this task if any
    this.killProcess(taskId);

    // Generate unique spawn ID for this process instance
    const spawnId = this.state.generateSpawnId();

    console.log('[spawnProcess] Spawning with pythonPath:', this.pythonPath);
    console.log('[spawnProcess] cwd:', cwd);
    console.log('[spawnProcess] processType:', processType);
    console.log('[spawnProcess] spawnId:', spawnId);

    // Get active Claude profile environment (CLAUDE_CONFIG_DIR if not default)
    const profileEnv = getProfileEnv();

    const childProcess = spawn(this.pythonPath, args, {
      cwd,
      env: {
        ...process.env,
        ...extraEnv,
        ...profileEnv, // Include active Claude profile config
        PYTHONUNBUFFERED: '1', // Ensure real-time output
        PYTHONIOENCODING: 'utf-8' // Ensure UTF-8 encoding on Windows
      }
    });

    console.log('[spawnProcess] Process spawned, pid:', childProcess.pid);

    this.state.addProcess(taskId, {
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
    this.emitter.emit('execution-progress', taskId, {
      phase: currentPhase,
      phaseProgress: 0,
      overallProgress: this.events.calculateOverallProgress(currentPhase, 0),
      message: isSpecRunner ? 'Starting spec creation...' : 'Starting build process...'
    });

    const processLog = (log: string) => {
      // Collect output for rate limit detection (keep last 10KB)
      allOutput = (allOutput + log).slice(-10000);
      // Parse for phase transitions
      const phaseUpdate = this.events.parseExecutionPhase(log, currentPhase, isSpecRunner);

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

        const overallProgress = this.events.calculateOverallProgress(currentPhase, phaseProgress);

        this.emitter.emit('execution-progress', taskId, {
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
      this.emitter.emit('log', taskId, log);
      processLog(log);
    });

    // Handle stderr
    childProcess.stderr?.on('data', (data: Buffer) => {
      const log = data.toString();
      console.log('[spawnProcess] stderr:', log.substring(0, 200));
      // Some Python output goes to stderr (like progress bars)
      // so we treat it as log, not error
      this.emitter.emit('log', taskId, log);
      processLog(log);
    });

    // Handle process exit
    childProcess.on('exit', (code: number | null) => {
      console.log('[spawnProcess] Process exited with code:', code, 'spawnId:', spawnId);
      this.state.deleteProcess(taskId);

      // Check if this specific spawn was killed (vs exited naturally)
      // If killed, don't emit exit event to prevent race condition with new process
      if (this.state.wasSpawnKilled(spawnId)) {
        console.log('[spawnProcess] Process was killed, skipping exit event for spawnId:', spawnId);
        this.state.clearKilledSpawn(spawnId);
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

          // Check if auto-swap is enabled
          const profileManager = getClaudeProfileManager();
          const autoSwitchSettings = profileManager.getAutoSwitchSettings();

          if (autoSwitchSettings.enabled && autoSwitchSettings.autoSwitchOnRateLimit) {
            console.log('[spawnProcess] Reactive auto-swap enabled');

            const currentProfileId = rateLimitDetection.profileId;
            const bestProfile = profileManager.getBestAvailableProfile(currentProfileId);

            if (bestProfile) {
              console.log('[spawnProcess] Reactive swap to:', bestProfile.name);

              // Switch active profile
              profileManager.setActiveProfile(bestProfile.id);

              // Emit swap info (for modal)
              const source = processType === 'spec-creation' ? 'task' : 'task';
              const rateLimitInfo = createSDKRateLimitInfo(source, rateLimitDetection, {
                taskId
              });
              rateLimitInfo.wasAutoSwapped = true;
              rateLimitInfo.swappedToProfile = {
                id: bestProfile.id,
                name: bestProfile.name
              };
              rateLimitInfo.swapReason = 'reactive';
              this.emitter.emit('sdk-rate-limit', rateLimitInfo);

              // Restart task
              this.emitter.emit('auto-swap-restart-task', taskId, bestProfile.id);
              return;
            }
          }

          // Fall back to manual modal (no auto-swap or no alternative profile)
          const source = processType === 'spec-creation' ? 'task' : 'task';
          const rateLimitInfo = createSDKRateLimitInfo(source, rateLimitDetection, {
            taskId
          });
          this.emitter.emit('sdk-rate-limit', rateLimitInfo);
        }
      }

      // Emit final progress
      const finalPhase = code === 0 ? 'complete' : 'failed';
      this.emitter.emit('execution-progress', taskId, {
        phase: finalPhase,
        phaseProgress: 100,
        overallProgress: code === 0 ? 100 : this.events.calculateOverallProgress(currentPhase, phaseProgress),
        message: code === 0 ? 'Process completed successfully' : `Process exited with code ${code}`
      });

      this.emitter.emit('exit', taskId, code, processType);
    });

    // Handle process error
    childProcess.on('error', (err: Error) => {
      console.log('[spawnProcess] Process error:', err.message);
      this.state.deleteProcess(taskId);

      this.emitter.emit('execution-progress', taskId, {
        phase: 'failed',
        phaseProgress: 0,
        overallProgress: 0,
        message: `Error: ${err.message}`
      });

      this.emitter.emit('error', taskId, err.message);
    });
  }

  /**
   * Kill a specific task's process
   */
  killProcess(taskId: string): boolean {
    const agentProcess = this.state.getProcess(taskId);
    if (agentProcess) {
      try {
        // Mark this specific spawn as killed so its exit handler knows to ignore
        this.state.markSpawnAsKilled(agentProcess.spawnId);

        // Send SIGTERM first for graceful shutdown
        agentProcess.process.kill('SIGTERM');

        // Force kill after timeout
        setTimeout(() => {
          if (!agentProcess.process.killed) {
            agentProcess.process.kill('SIGKILL');
          }
        }, 5000);

        this.state.deleteProcess(taskId);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Kill all running processes
   */
  async killAllProcesses(): Promise<void> {
    const killPromises = this.state.getRunningTaskIds().map((taskId) => {
      return new Promise<void>((resolve) => {
        this.killProcess(taskId);
        resolve();
      });
    });
    await Promise.all(killPromises);
  }

  /**
   * Get combined environment variables for a project
   */
  getCombinedEnv(projectPath: string): Record<string, string> {
    const autoBuildEnv = this.loadAutoBuildEnv();
    const projectEnv = this.getProjectEnvVars(projectPath);
    return { ...autoBuildEnv, ...projectEnv };
  }
}
