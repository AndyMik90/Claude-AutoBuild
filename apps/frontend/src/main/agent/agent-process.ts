import { spawn } from 'child_process';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { app, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { AgentState } from './agent-state';
import { AgentEvents } from './agent-events';
import { ProcessType, ExecutionProgressData } from './types';
import { detectRateLimit, createSDKRateLimitInfo, getProfileEnv, detectAuthFailure } from '../rate-limit-detector';
import { projectStore } from '../project-store';
import { getClaudeProfileManager } from '../claude-profile-manager';
import { parsePythonCommand, validatePythonPath } from '../python-detector';
import { pythonEnvManager, getConfiguredPythonPath } from '../python-env-manager';
import { logBackendOutput } from '../ipc-handlers/logs-handlers';

// Essential environment variables needed for Python processes
// On Windows, passing the full process.env can cause ENAMETOOLONG errors
// because the environment block has a 32KB limit
const ESSENTIAL_ENV_VARS = new Set([
  // System essentials
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'USERNAME', 'USER',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
  // Python specific
  'PYTHONPATH', 'PYTHONHOME', 'PYTHONUNBUFFERED', 'PYTHONIOENCODING',
  'PYTHONDONTWRITEBYTECODE', 'PYTHONNOUSERSITE', 'PYTHONUTF8',
  'VIRTUAL_ENV', 'CONDA_PREFIX', 'CONDA_DEFAULT_ENV',
  // Claude/OAuth
  'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY',
  // Node.js
  'NODE_ENV', 'NODE_OPTIONS',
  // Git
  'GIT_EXEC_PATH', 'GIT_DIR',
  // Locale
  'LANG', 'LC_ALL', 'LC_CTYPE', 'LANGUAGE',
  // Terminal
  'TERM', 'COLORTERM', 'FORCE_COLOR', 'NO_COLOR',
  // OpenSSL/SSL
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE',
  // OS detection
  'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS'
]);

/**
 * Filter environment variables to only include essential ones.
 * This prevents ENAMETOOLONG errors on Windows where the environment
 * block has a 32KB limit.
 */
function filterEssentialEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const filtered: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;

    const upperKey = key.toUpperCase();
    // Include if it's in our essential set
    if (ESSENTIAL_ENV_VARS.has(upperKey)) {
      filtered[key] = value;
      continue;
    }
    // Also include any vars starting with PYTHON, CLAUDE, GRAPHITI, or AUTO_CLAUDE
    if (upperKey.startsWith('PYTHON') ||
        upperKey.startsWith('CLAUDE') ||
        upperKey.startsWith('GRAPHITI') ||
        upperKey.startsWith('AUTO_CLAUDE') ||
        upperKey.startsWith('ANTHROPIC')) {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Process spawning and lifecycle management
 */
export class AgentProcessManager {
  private state: AgentState;
  private events: AgentEvents;
  private emitter: EventEmitter;
  // Python path will be configured by pythonEnvManager after venv is ready
  // Use null to indicate not yet configured - getPythonPath() will use fallback
  private _pythonPath: string | null = null;
  private autoBuildSourcePath: string = '';
  
  // Static reference to getMainWindow for log streaming
  private static getMainWindow: (() => BrowserWindow | null) | null = null;

  constructor(state: AgentState, events: AgentEvents, emitter: EventEmitter) {
    this.state = state;
    this.events = events;
    this.emitter = emitter;
  }
  
  /**
   * Set the main window getter for log streaming
   */
  static setMainWindowGetter(getMainWindow: () => BrowserWindow | null): void {
    AgentProcessManager.getMainWindow = getMainWindow;
  }

  configure(pythonPath?: string, autoBuildSourcePath?: string): void {
    if (pythonPath) {
      const validation = validatePythonPath(pythonPath);
      if (validation.valid) {
        this._pythonPath = validation.sanitizedPath || pythonPath;
      } else {
        console.error(`[AgentProcess] Invalid Python path rejected: ${validation.reason}`);
        console.error(`[AgentProcess] Falling back to getConfiguredPythonPath()`);
        // Don't set _pythonPath - let getPythonPath() use getConfiguredPythonPath() fallback
      }
    }
    if (autoBuildSourcePath) {
      this.autoBuildSourcePath = autoBuildSourcePath;
    }
  }

  private setupProcessEnvironment(
    extraEnv: Record<string, string>
  ): NodeJS.ProcessEnv {
    const profileEnv = getProfileEnv();
    // Filter process.env to essential vars to prevent ENAMETOOLONG on Windows
    const filteredEnv = filterEssentialEnv(process.env);
    return {
      ...filteredEnv,
      ...extraEnv,
      ...profileEnv,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1'
    } as NodeJS.ProcessEnv;
  }

  private handleProcessFailure(
    taskId: string,
    allOutput: string,
    processType: ProcessType
  ): boolean {
    console.log('[AgentProcess] Checking for rate limit in output (last 500 chars):', allOutput.slice(-500));

    const rateLimitDetection = detectRateLimit(allOutput);
    console.log('[AgentProcess] Rate limit detection result:', {
      isRateLimited: rateLimitDetection.isRateLimited,
      resetTime: rateLimitDetection.resetTime,
      limitType: rateLimitDetection.limitType,
      profileId: rateLimitDetection.profileId,
      suggestedProfile: rateLimitDetection.suggestedProfile
    });

    if (rateLimitDetection.isRateLimited) {
      const wasHandled = this.handleRateLimitWithAutoSwap(
        taskId,
        rateLimitDetection,
        processType
      );
      if (wasHandled) return true;

      const source = processType === 'spec-creation' ? 'roadmap' : 'task';
      const rateLimitInfo = createSDKRateLimitInfo(source, rateLimitDetection, { taskId });
      console.log('[AgentProcess] Emitting sdk-rate-limit event (manual):', rateLimitInfo);
      this.emitter.emit('sdk-rate-limit', rateLimitInfo);
      return true;
    }

    return this.handleAuthFailure(taskId, allOutput);
  }

  private handleRateLimitWithAutoSwap(
    taskId: string,
    rateLimitDetection: ReturnType<typeof detectRateLimit>,
    processType: ProcessType
  ): boolean {
    const profileManager = getClaudeProfileManager();
    const autoSwitchSettings = profileManager.getAutoSwitchSettings();

    console.log('[AgentProcess] Auto-switch settings:', {
      enabled: autoSwitchSettings.enabled,
      autoSwitchOnRateLimit: autoSwitchSettings.autoSwitchOnRateLimit,
      proactiveSwapEnabled: autoSwitchSettings.proactiveSwapEnabled
    });

    if (!autoSwitchSettings.enabled || !autoSwitchSettings.autoSwitchOnRateLimit) {
      console.log('[AgentProcess] Auto-switch disabled - showing manual modal');
      return false;
    }

    const currentProfileId = rateLimitDetection.profileId;
    const bestProfile = profileManager.getBestAvailableProfile(currentProfileId);

    console.log('[AgentProcess] Best available profile:', bestProfile ? {
      id: bestProfile.id,
      name: bestProfile.name
    } : 'NONE');

    if (!bestProfile) {
      console.log('[AgentProcess] No alternative profile available - falling back to manual modal');
      return false;
    }

    console.log('[AgentProcess] AUTO-SWAP: Switching from', currentProfileId, 'to', bestProfile.id);
    profileManager.setActiveProfile(bestProfile.id);

    const source = processType === 'spec-creation' ? 'roadmap' : 'task';
    const rateLimitInfo = createSDKRateLimitInfo(source, rateLimitDetection, { taskId });
    rateLimitInfo.wasAutoSwapped = true;
    rateLimitInfo.swappedToProfile = { id: bestProfile.id, name: bestProfile.name };
    rateLimitInfo.swapReason = 'reactive';

    console.log('[AgentProcess] Emitting sdk-rate-limit event (auto-swapped):', rateLimitInfo);
    this.emitter.emit('sdk-rate-limit', rateLimitInfo);

    console.log('[AgentProcess] Emitting auto-swap-restart-task event for task:', taskId);
    this.emitter.emit('auto-swap-restart-task', taskId, bestProfile.id);
    return true;
  }

  private handleAuthFailure(taskId: string, allOutput: string): boolean {
    console.log('[AgentProcess] No rate limit detected - checking for auth failure');
    const authFailureDetection = detectAuthFailure(allOutput);

    if (authFailureDetection.isAuthFailure) {
      console.log('[AgentProcess] Auth failure detected:', authFailureDetection);
      this.emitter.emit('auth-failure', taskId, {
        profileId: authFailureDetection.profileId,
        failureType: authFailureDetection.failureType,
        message: authFailureDetection.message,
        originalError: authFailureDetection.originalError
      });
      return true;
    }

    console.log('[AgentProcess] Process failed but no rate limit or auth failure detected');
    return false;
  }

  /**
   * Get the configured Python path.
   * Returns explicitly configured path, or falls back to getConfiguredPythonPath()
   * which uses the venv Python if ready.
   */
  getPythonPath(): string {
    // If explicitly configured (by pythonEnvManager), use that
    if (this._pythonPath) {
      return this._pythonPath;
    }
    // Otherwise use the global configured path (venv if ready, else bundled/system)
    return getConfiguredPythonPath();
  }

  /**
   * Get the auto-claude source path (detects automatically if not configured)
   */
  getAutoBuildSourcePath(): string | null {
    // Use runners/spec_runner.py as the validation marker - this is the file actually needed
    const validatePath = (p: string): boolean => {
      return existsSync(p) && existsSync(path.join(p, 'runners', 'spec_runner.py'));
    };

    // If manually configured AND valid, use that
    if (this.autoBuildSourcePath && validatePath(this.autoBuildSourcePath)) {
      return this.autoBuildSourcePath;
    }

    // Auto-detect from app location (configured path was invalid or not set)
    const possiblePaths = [
      // Dev mode: from dist/main -> ../../backend (apps/frontend/out/main -> apps/backend)
      path.resolve(__dirname, '..', '..', '..', 'backend'),
      // Alternative: from app root -> apps/backend
      path.resolve(app.getAppPath(), '..', 'backend'),
      // If running from repo root with apps structure
      path.resolve(process.cwd(), 'apps', 'backend')
    ];

    for (const p of possiblePaths) {
      if (validatePath(p)) {
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

      // CLAUDE.md integration (enabled by default)
      if (project.settings.useClaudeMd !== false) {
        env['USE_CLAUDE_MD'] = 'true';
      }
    }

    return env;
  }

  /**
   * Load environment variables from project's .auto-claude/.env file
   * This contains frontend-configured settings like memory/Graphiti configuration
   */
  private loadProjectEnv(projectPath: string): Record<string, string> {
    // Find project by path to get autoBuildPath
    const projects = projectStore.getProjects();
    const project = projects.find((p) => p.path === projectPath);

    if (!project?.autoBuildPath) {
      return {};
    }

    const envPath = path.join(projectPath, project.autoBuildPath, '.env');
    if (!existsSync(envPath)) {
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
   * Load environment variables from auto-claude .env file
   */
  loadAutoBuildEnv(): Record<string, string> {
    const autoBuildSource = this.getAutoBuildSourcePath();
    if (!autoBuildSource) {
      return {};
    }

    const envPath = path.join(autoBuildSource, '.env');
    if (!existsSync(envPath)) {
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

  spawnProcess(
    taskId: string,
    cwd: string,
    args: string[],
    extraEnv: Record<string, string> = {},
    processType: ProcessType = 'task-execution'
  ): void {
    const isSpecRunner = processType === 'spec-creation';
    this.killProcess(taskId);

    const spawnId = this.state.generateSpawnId();
    const env = this.setupProcessEnvironment(extraEnv);

    // Get Python environment (PYTHONPATH for bundled packages, etc.)
    const pythonEnv = pythonEnvManager.getPythonEnv();

    // Parse Python command to handle space-separated commands like "py -3"
    const [pythonCommand, pythonBaseArgs] = parsePythonCommand(this.getPythonPath());
    const childProcess = spawn(pythonCommand, [...pythonBaseArgs, ...args], {
      cwd,
      env: {
        ...env, // Already includes process.env, extraEnv, profileEnv, PYTHONUNBUFFERED, PYTHONUTF8
        ...pythonEnv // Include Python environment (PYTHONPATH for bundled packages)
      }
    });

    this.state.addProcess(taskId, {
      taskId,
      process: childProcess,
      startedAt: new Date(),
      spawnId
    });

    let currentPhase: ExecutionProgressData['phase'] = isSpecRunner ? 'planning' : 'planning';
    let phaseProgress = 0;
    let currentSubtask: string | undefined;
    let lastMessage: string | undefined;
    let allOutput = '';
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let sequenceNumber = 0;

    this.emitter.emit('execution-progress', taskId, {
      phase: currentPhase,
      phaseProgress: 0,
      overallProgress: this.events.calculateOverallProgress(currentPhase, 0),
      message: isSpecRunner ? 'Starting spec creation...' : 'Starting build process...',
      sequenceNumber: ++sequenceNumber
    });

    const isDebug = ['true', '1', 'yes', 'on'].includes(process.env.DEBUG?.toLowerCase() ?? '');

    const processLog = (line: string) => {
      allOutput = (allOutput + line).slice(-10000);

      const hasMarker = line.includes('__EXEC_PHASE__');
      if (isDebug && hasMarker) {
        console.log(`[PhaseDebug:${taskId}] Found marker in line: "${line.substring(0, 200)}"`);
      }

      const phaseUpdate = this.events.parseExecutionPhase(line, currentPhase, isSpecRunner);

      if (isDebug && hasMarker) {
        console.log(`[PhaseDebug:${taskId}] Parse result:`, phaseUpdate);
      }

      if (phaseUpdate) {
        const phaseChanged = phaseUpdate.phase !== currentPhase;

        if (isDebug) {
          console.log(`[PhaseDebug:${taskId}] Phase update: ${currentPhase} -> ${phaseUpdate.phase} (changed: ${phaseChanged})`);
        }

        currentPhase = phaseUpdate.phase;

        if (phaseUpdate.currentSubtask) {
          currentSubtask = phaseUpdate.currentSubtask;
        }
        if (phaseUpdate.message) {
          lastMessage = phaseUpdate.message;
        }

        if (phaseChanged) {
          phaseProgress = 10;
        } else {
          phaseProgress = Math.min(90, phaseProgress + 5);
        }

        const overallProgress = this.events.calculateOverallProgress(currentPhase, phaseProgress);

        if (isDebug) {
          console.log(`[PhaseDebug:${taskId}] Emitting execution-progress:`, { phase: currentPhase, phaseProgress, overallProgress });
        }

        this.emitter.emit('execution-progress', taskId, {
          phase: currentPhase,
          phaseProgress,
          overallProgress,
          currentSubtask,
          message: lastMessage,
          sequenceNumber: ++sequenceNumber
        });
      }
    };

    const processBufferedOutput = (buffer: string, newData: string, isStderr: boolean = false): string => {
      if (isDebug && newData.includes('__EXEC_PHASE__')) {
        console.log(`[PhaseDebug:${taskId}] Raw chunk with marker (${newData.length} bytes): "${newData.substring(0, 300)}"`);
        console.log(`[PhaseDebug:${taskId}] Current buffer before append (${buffer.length} bytes): "${buffer.substring(0, 100)}"`);
      }

      buffer += newData;
      const lines = buffer.split('\n');
      const remaining = lines.pop() || '';

      if (isDebug && newData.includes('__EXEC_PHASE__')) {
        console.log(`[PhaseDebug:${taskId}] Split into ${lines.length} complete lines, remaining buffer: "${remaining.substring(0, 100)}"`);
      }

      for (const line of lines) {
        if (line.trim()) {
          this.emitter.emit('log', taskId, line + '\n');
          processLog(line);
          
          // Stream backend logs to LogViewer
          if (AgentProcessManager.getMainWindow) {
            const level = isStderr || line.toLowerCase().includes('error') ? 'error' :
                         line.toLowerCase().includes('warn') ? 'warn' :
                         line.toLowerCase().includes('debug') ? 'debug' : 'info';
            logBackendOutput(line, level, AgentProcessManager.getMainWindow);
          }
          
          if (isDebug) {
            console.log(`[Agent:${taskId}] ${line}`);
          }
        }
      }

      return remaining;
    };

    childProcess.stdout?.on('data', (data: Buffer) => {
      stdoutBuffer = processBufferedOutput(stdoutBuffer, data.toString('utf8'), false);
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      stderrBuffer = processBufferedOutput(stderrBuffer, data.toString('utf8'), true);
    });

    childProcess.on('exit', (code: number | null) => {
      if (stdoutBuffer.trim()) {
        this.emitter.emit('log', taskId, stdoutBuffer + '\n');
        processLog(stdoutBuffer);
      }
      if (stderrBuffer.trim()) {
        this.emitter.emit('log', taskId, stderrBuffer + '\n');
        processLog(stderrBuffer);
      }

      this.state.deleteProcess(taskId);

      if (this.state.wasSpawnKilled(spawnId)) {
        this.state.clearKilledSpawn(spawnId);
        return;
      }

      if (code !== 0) {
        console.log('[AgentProcess] Process failed with code:', code, 'for task:', taskId);
        const wasHandled = this.handleProcessFailure(taskId, allOutput, processType);
        if (wasHandled) {
          this.emitter.emit('exit', taskId, code, processType);
          return;
        }
      }

      if (code !== 0 && currentPhase !== 'complete' && currentPhase !== 'failed') {
        this.emitter.emit('execution-progress', taskId, {
          phase: 'failed',
          phaseProgress: 0,
          overallProgress: this.events.calculateOverallProgress(currentPhase, phaseProgress),
          message: `Process exited with code ${code}`,
          sequenceNumber: ++sequenceNumber
        });
      }

      this.emitter.emit('exit', taskId, code, processType);
    });

    // Handle process error
    childProcess.on('error', (err: Error) => {
      console.error('[AgentProcess] Process error:', err.message);
      this.state.deleteProcess(taskId);

      this.emitter.emit('execution-progress', taskId, {
        phase: 'failed',
        phaseProgress: 0,
        overallProgress: 0,
        message: `Error: ${err.message}`,
        sequenceNumber: ++sequenceNumber
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
   *
   * Priority (later sources override earlier):
   * 1. Backend source .env (apps/backend/.env) - CLI defaults
   * 2. Project's .auto-claude/.env - Frontend-configured settings (memory, integrations)
   * 3. Project settings (graphitiMcpUrl, useClaudeMd) - Runtime overrides
   */
  getCombinedEnv(projectPath: string): Record<string, string> {
    const autoBuildEnv = this.loadAutoBuildEnv();
    const projectFileEnv = this.loadProjectEnv(projectPath);
    const projectSettingsEnv = this.getProjectEnvVars(projectPath);
    return { ...autoBuildEnv, ...projectFileEnv, ...projectSettingsEnv };
  }
}
