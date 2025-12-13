import { EventEmitter } from 'events';
import path from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import { app } from 'electron';
import { AUTO_BUILD_PATHS, DEFAULT_CHANGELOG_PATH } from '../shared/constants';
import type {
  ChangelogTask,
  TaskSpecContent,
  ChangelogGenerationRequest,
  ChangelogGenerationResult,
  ChangelogSaveRequest,
  ChangelogSaveResult,
  ChangelogGenerationProgress,
  ExistingChangelog,
  Task,
  ImplementationPlan
} from '../shared/types';

/**
 * Service for generating changelogs from completed tasks
 */
export class ChangelogService extends EventEmitter {
  private pythonPath: string = 'python3';
  private claudePath: string = 'claude';
  private autoBuildSourcePath: string = '';
  private generationProcesses: Map<string, ReturnType<typeof spawn>> = new Map();
  private cachedEnv: Record<string, string> | null = null;
  private debugEnabled: boolean | null = null;

  constructor() {
    super();
    this.detectClaudePath();
    this.debug('ChangelogService initialized');
  }

  /**
   * Detect the full path to the claude CLI
   * Electron apps don't inherit shell PATH, so we need to find it explicitly
   */
  private detectClaudePath(): void {
    const possiblePaths = [
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
      path.join(process.env.HOME || '', '.local/bin/claude'),
      path.join(process.env.HOME || '', 'bin/claude'),
      // Also check if claude is in system PATH
      'claude'
    ];

    for (const claudePath of possiblePaths) {
      if (claudePath === 'claude' || existsSync(claudePath)) {
        this.claudePath = claudePath;
        this.debug('Claude CLI found at:', claudePath);
        return;
      }
    }

    this.debug('Claude CLI not found in common locations, using default');
  }

  /**
   * Check if debug mode is enabled
   * Checks DEBUG from auto-claude/.env and AUTO_CLAUDE_DEBUG from process.env
   */
  private isDebugEnabled(): boolean {
    // Cache the result after first check
    if (this.debugEnabled !== null) {
      return this.debugEnabled;
    }

    // Check process.env first
    if (
      process.env.DEBUG === 'true' ||
      process.env.DEBUG === '1' ||
      process.env.AUTO_CLAUDE_DEBUG === 'true' ||
      process.env.AUTO_CLAUDE_DEBUG === '1'
    ) {
      this.debugEnabled = true;
      return true;
    }

    // Check auto-claude .env file
    const env = this.loadAutoBuildEnv();
    this.debugEnabled = env.DEBUG === 'true' || env.DEBUG === '1';
    return this.debugEnabled;
  }

  /**
   * Debug logging - only logs when DEBUG=true in auto-claude/.env or AUTO_CLAUDE_DEBUG is set
   */
  private debug(...args: unknown[]): void {
    if (this.isDebugEnabled()) {
      console.log('[ChangelogService]', ...args);
    }
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
    if (this.autoBuildSourcePath && existsSync(this.autoBuildSourcePath)) {
      return this.autoBuildSourcePath;
    }

    const possiblePaths = [
      path.resolve(__dirname, '..', '..', '..', 'auto-claude'),
      path.resolve(app.getAppPath(), '..', 'auto-claude'),
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
   * Load environment variables from auto-claude .env file
   */
  private loadAutoBuildEnv(): Record<string, string> {
    const autoBuildSource = this.getAutoBuildSourcePath();
    if (!autoBuildSource) return {};

    const envPath = path.join(autoBuildSource, '.env');
    if (!existsSync(envPath)) return {};

    try {
      const envContent = readFileSync(envPath, 'utf-8');
      const envVars: Record<string, string> = {};

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

          envVars[key] = value;
        }
      }

      return envVars;
    } catch {
      return {};
    }
  }

  /**
   * Get completed tasks from a project
   * @param projectPath - Project root path
   * @param tasks - List of tasks
   * @param specsBaseDir - Base specs directory (e.g., 'auto-claude/specs' or 'dev/auto-claude/specs')
   */
  getCompletedTasks(projectPath: string, tasks: Task[], specsBaseDir?: string): ChangelogTask[] {
    const specsDir = path.join(projectPath, specsBaseDir || AUTO_BUILD_PATHS.SPECS_DIR);

    return tasks
      .filter(task => task.status === 'done')
      .map(task => {
        const specDir = path.join(specsDir, task.specId);
        const hasSpecs = existsSync(specDir) && existsSync(path.join(specDir, AUTO_BUILD_PATHS.SPEC_FILE));

        return {
          id: task.id,
          specId: task.specId,
          title: task.title,
          description: task.description,
          completedAt: task.updatedAt,
          hasSpecs
        };
      })
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }

  /**
   * Load spec files for given tasks
   * @param projectPath - Project root path
   * @param taskIds - IDs of tasks to load specs for
   * @param tasks - List of all tasks
   * @param specsBaseDir - Base specs directory (e.g., 'auto-claude/specs' or 'dev/auto-claude/specs')
   */
  async loadTaskSpecs(projectPath: string, taskIds: string[], tasks: Task[], specsBaseDir?: string): Promise<TaskSpecContent[]> {
    const specsDir = path.join(projectPath, specsBaseDir || AUTO_BUILD_PATHS.SPECS_DIR);
    this.debug('loadTaskSpecs called', { projectPath, specsDir, taskCount: taskIds.length });

    const results: TaskSpecContent[] = [];

    for (const taskId of taskIds) {
      const task = tasks.find(t => t.id === taskId);
      if (!task) {
        this.debug('Task not found:', taskId);
        continue;
      }

      const specDir = path.join(specsDir, task.specId);
      this.debug('Loading spec for task', { taskId, specId: task.specId, specDir });

      const content: TaskSpecContent = {
        taskId,
        specId: task.specId
      };

      try {
        // Load spec.md
        const specPath = path.join(specDir, AUTO_BUILD_PATHS.SPEC_FILE);
        if (existsSync(specPath)) {
          content.spec = readFileSync(specPath, 'utf-8');
          this.debug('Loaded spec.md', { specId: task.specId, length: content.spec.length });
        }

        // Load requirements.json
        const requirementsPath = path.join(specDir, AUTO_BUILD_PATHS.REQUIREMENTS);
        if (existsSync(requirementsPath)) {
          content.requirements = JSON.parse(readFileSync(requirementsPath, 'utf-8'));
        }

        // Load qa_report.md
        const qaReportPath = path.join(specDir, AUTO_BUILD_PATHS.QA_REPORT);
        if (existsSync(qaReportPath)) {
          content.qaReport = readFileSync(qaReportPath, 'utf-8');
        }

        // Load implementation_plan.json
        const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
        if (existsSync(planPath)) {
          content.implementationPlan = JSON.parse(readFileSync(planPath, 'utf-8')) as ImplementationPlan;
        }
      } catch (error) {
        content.error = error instanceof Error ? error.message : 'Failed to load spec files';
        this.debug('Error loading spec', { specId: task.specId, error: content.error });
      }

      results.push(content);
    }

    this.debug('loadTaskSpecs complete', { loadedCount: results.length });
    return results;
  }

  /**
   * Generate changelog using Claude AI
   */
  generateChangelog(
    projectId: string,
    projectPath: string,
    request: ChangelogGenerationRequest,
    specs: TaskSpecContent[]
  ): void {
    this.debug('generateChangelog called', {
      projectId,
      projectPath,
      taskCount: request.taskIds.length,
      version: request.version,
      format: request.format,
      audience: request.audience
    });

    // Kill existing process if any
    this.cancelGeneration(projectId);

    // Emit initial progress
    this.emitProgress(projectId, {
      stage: 'loading_specs',
      progress: 10,
      message: 'Preparing changelog generation...'
    });

    // Build the prompt for Claude
    const prompt = this.buildChangelogPrompt(request, specs);
    this.debug('Prompt built', {
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 500) + '...'
    });

    // Use Claude Code SDK via subprocess
    const autoBuildSource = this.getAutoBuildSourcePath();
    if (!autoBuildSource) {
      this.debug('ERROR: Auto-build source path not found');
      this.emitError(projectId, 'Auto-build source path not found');
      return;
    }
    this.debug('Auto-build source path:', autoBuildSource);

    // Verify claude CLI is available
    if (this.claudePath !== 'claude' && !existsSync(this.claudePath)) {
      this.debug('ERROR: Claude CLI not found at:', this.claudePath);
      this.emitError(projectId, `Claude CLI not found. Please ensure Claude Code is installed. Looked for: ${this.claudePath}`);
      return;
    }
    this.debug('Using Claude CLI at:', this.claudePath);

    // Create a temporary Python script to call Claude
    const script = this.createGenerationScript(prompt, request);
    this.debug('Python script created', { scriptLength: script.length });

    this.emitProgress(projectId, {
      stage: 'generating',
      progress: 30,
      message: 'Generating changelog with Claude AI...'
    });

    const autoBuildEnv = this.loadAutoBuildEnv();
    this.debug('Environment loaded', {
      hasOAuthToken: !!autoBuildEnv.CLAUDE_CODE_OAUTH_TOKEN,
      envKeys: Object.keys(autoBuildEnv)
    });

    const startTime = Date.now();
    this.debug('Spawning Python process...');

    // Build environment with explicit critical variables
    // Electron apps may not inherit shell environment correctly
    const homeDir = process.env.HOME || app.getPath('home');
    const spawnEnv = {
      ...process.env,
      ...autoBuildEnv,
      // Ensure critical env vars are set for claude CLI
      HOME: homeDir,
      USER: process.env.USER || process.env.USERNAME || 'user',
      // Add common binary locations to PATH for claude CLI
      PATH: [
        process.env.PATH || '',
        '/usr/local/bin',
        '/opt/homebrew/bin',
        path.join(homeDir, '.local/bin'),
        path.join(homeDir, 'bin')
      ].filter(Boolean).join(':'),
      PYTHONUNBUFFERED: '1'
    };

    this.debug('Spawn environment', {
      HOME: spawnEnv.HOME,
      USER: spawnEnv.USER,
      pathDirs: spawnEnv.PATH?.split(':').length
    });

    const childProcess = spawn(this.pythonPath, ['-c', script], {
      cwd: autoBuildSource,
      env: spawnEnv
    });

    this.generationProcesses.set(projectId, childProcess);
    this.debug('Process spawned with PID:', childProcess.pid);

    let output = '';
    let errorOutput = '';

    childProcess.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      output += chunk;
      this.debug('stdout chunk received', { chunkLength: chunk.length, totalOutput: output.length });

      this.emitProgress(projectId, {
        stage: 'generating',
        progress: 50,
        message: 'Generating changelog content...'
      });
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      errorOutput += chunk;
      this.debug('stderr chunk received', { chunk: chunk.substring(0, 200) });
    });

    childProcess.on('exit', (code: number | null) => {
      const duration = Date.now() - startTime;
      this.debug('Process exited', {
        code,
        duration: `${duration}ms`,
        outputLength: output.length,
        errorLength: errorOutput.length
      });

      this.generationProcesses.delete(projectId);

      if (code === 0 && output.trim()) {
        this.emitProgress(projectId, {
          stage: 'formatting',
          progress: 90,
          message: 'Formatting changelog...'
        });

        // Extract changelog from output
        const changelog = this.extractChangelog(output.trim());
        this.debug('Changelog extracted', { changelogLength: changelog.length });

        this.emitProgress(projectId, {
          stage: 'complete',
          progress: 100,
          message: 'Changelog generation complete'
        });

        const result: ChangelogGenerationResult = {
          success: true,
          changelog,
          version: request.version,
          tasksIncluded: request.taskIds.length
        };

        this.debug('Generation complete, emitting result');
        this.emit('generation-complete', projectId, result);
      } else {
        const error = errorOutput || `Generation failed with exit code ${code}`;
        this.debug('Generation failed', { error: error.substring(0, 500) });
        this.emitError(projectId, error);
      }
    });

    childProcess.on('error', (err: Error) => {
      this.debug('Process error', { error: err.message });
      this.generationProcesses.delete(projectId);
      this.emitError(projectId, err.message);
    });
  }

  /**
   * Extract the overview section from a spec (typically the first meaningful section)
   */
  private extractSpecOverview(spec: string): string {
    // Split into lines and find the Overview section
    const lines = spec.split('\n');
    let inOverview = false;
    let overview: string[] = [];

    for (const line of lines) {
      // Start capturing at Overview heading
      if (/^##\s*Overview/i.test(line)) {
        inOverview = true;
        continue;
      }
      // Stop at next major heading
      if (inOverview && /^##\s/.test(line)) {
        break;
      }
      if (inOverview && line.trim()) {
        overview.push(line);
      }
    }

    // If no overview found, take first paragraph after title
    if (overview.length === 0) {
      const paragraphs = spec.split(/\n\n+/).filter(p => !p.startsWith('#') && p.trim().length > 20);
      if (paragraphs.length > 0) {
        return paragraphs[0].substring(0, 300);
      }
    }

    return overview.join(' ').substring(0, 400);
  }

  /**
   * Build the prompt for changelog generation
   * Optimized to keep prompt size manageable for faster generation
   */
  private buildChangelogPrompt(
    request: ChangelogGenerationRequest,
    specs: TaskSpecContent[]
  ): string {
    const audienceInstructions = {
      'technical': `You are a technical documentation specialist creating a changelog for developers. Use precise technical language.`,
      'user-facing': `You are a product manager writing release notes for end users. Use clear, non-technical language focusing on user benefits.`,
      'marketing': `You are a marketing specialist writing release notes. Focus on outcomes and user impact with compelling language.`
    };

    const formatInstructions = {
      'keep-a-changelog': `## [${request.version}] - ${request.date}

### Added
- [New features]

### Changed
- [Modifications]

### Fixed
- [Bug fixes]`,
      'simple-list': `# Release v${request.version} (${request.date})

**New Features:**
- [List features]

**Improvements:**
- [List improvements]

**Bug Fixes:**
- [List fixes]`,
      'github-release': `## What's New in v${request.version}

### New Features
- **Feature Name**: Description

### Improvements
- Description

### Bug Fixes
- Fixed [issue]`
    };

    // Build CONCISE task summaries (key to avoiding timeout)
    const taskSummaries = specs.map(spec => {
      const parts: string[] = [`- **${spec.specId}**`];

      // Get workflow type if available
      if (spec.implementationPlan?.workflow_type) {
        parts.push(`(${spec.implementationPlan.workflow_type})`);
      }

      // Extract just the overview/purpose
      if (spec.spec) {
        const overview = this.extractSpecOverview(spec.spec);
        if (overview) {
          parts.push(`: ${overview}`);
        }
      }

      return parts.join('');
    }).join('\n');

    return `${audienceInstructions[request.audience]}

Format:
${formatInstructions[request.format]}

Completed tasks:
${taskSummaries}

${request.customInstructions ? `Note: ${request.customInstructions}` : ''}

Generate the changelog now. Output ONLY the formatted changelog, no preamble.`;
  }

  /**
   * Create Python script for Claude generation
   */
  private createGenerationScript(prompt: string, _request: ChangelogGenerationRequest): string {
    // Escape the prompt for Python string
    const escapedPrompt = prompt
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');

    // Escape the claude path for Python string
    const escapedClaudePath = this.claudePath.replace(/\\/g, '\\\\');

    return `
import subprocess
import sys
import os

print("SCRIPT_START", file=sys.stderr, flush=True)
print(f"HOME={os.environ.get('HOME')}", file=sys.stderr, flush=True)
print(f"Claude path: ${escapedClaudePath}", file=sys.stderr, flush=True)

prompt = """${escapedPrompt}"""

print(f"Prompt length: {len(prompt)}", file=sys.stderr, flush=True)
print("Starting subprocess.run...", file=sys.stderr, flush=True)

# Use Claude Code CLI to generate
# --max-turns 1: Single response (no back-and-forth needed)
# --model haiku: Faster model for simple text generation
try:
    result = subprocess.run(
        ['${escapedClaudePath}', '-p', prompt, '--output-format', 'text', '--max-turns', '1', '--model', 'haiku'],
        capture_output=True,
        text=True,
        timeout=180
    )
    print(f"subprocess.run completed with code {result.returncode}", file=sys.stderr, flush=True)

    if result.returncode == 0:
        print(result.stdout)
    else:
        print(f"STDERR from claude: {result.stderr}", file=sys.stderr, flush=True)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print(f"Exception: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
    sys.exit(1)
`;
  }

  /**
   * Extract changelog content from Claude output
   */
  private extractChangelog(output: string): string {
    // Claude output should be the changelog directly
    // Clean up any potential wrapper text
    let changelog = output.trim();

    // Remove any "Here's the changelog:" or similar prefixes
    const prefixes = [
      /^Here['']s the changelog[:\s]*/i,
      /^The changelog[:\s]*/i,
      /^Changelog[:\s]*/i
    ];

    for (const prefix of prefixes) {
      changelog = changelog.replace(prefix, '');
    }

    return changelog.trim();
  }

  /**
   * Save changelog to file
   */
  saveChangelog(
    projectPath: string,
    request: ChangelogSaveRequest
  ): ChangelogSaveResult {
    const filePath = request.filePath
      ? path.join(projectPath, request.filePath)
      : path.join(projectPath, DEFAULT_CHANGELOG_PATH);

    let finalContent = request.content;

    if (request.mode === 'prepend' && existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8');
      // Add separator between new and existing content
      finalContent = `${request.content}\n\n${existing}`;
    } else if (request.mode === 'append' && existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8');
      finalContent = `${existing}\n\n${request.content}`;
    }

    writeFileSync(filePath, finalContent, 'utf-8');

    return {
      filePath,
      bytesWritten: Buffer.byteLength(finalContent, 'utf-8')
    };
  }

  /**
   * Read existing changelog file
   */
  readExistingChangelog(projectPath: string): ExistingChangelog {
    const filePath = path.join(projectPath, DEFAULT_CHANGELOG_PATH);

    if (!existsSync(filePath)) {
      return { exists: false };
    }

    try {
      const content = readFileSync(filePath, 'utf-8');

      // Try to extract last version using common patterns
      const versionPatterns = [
        /##\s*\[(\d+\.\d+\.\d+)\]/,  // Keep-a-changelog format
        /v(\d+\.\d+\.\d+)/,           // v1.2.3 format
        /Version\s+(\d+\.\d+\.\d+)/i  // Version 1.2.3 format
      ];

      let lastVersion: string | undefined;
      for (const pattern of versionPatterns) {
        const match = content.match(pattern);
        if (match) {
          lastVersion = match[1];
          break;
        }
      }

      return {
        exists: true,
        content,
        lastVersion
      };
    } catch (error) {
      return {
        exists: true,
        error: error instanceof Error ? error.message : 'Failed to read changelog'
      };
    }
  }

  /**
   * Suggest next version based on task types
   */
  suggestVersion(specs: TaskSpecContent[], currentVersion?: string): string {
    // Default starting version
    if (!currentVersion) {
      return '1.0.0';
    }

    const parts = currentVersion.split('.').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      return '1.0.0';
    }

    let [major, minor, patch] = parts;

    // Analyze specs for version increment decision
    let hasBreakingChanges = false;
    let hasNewFeatures = false;

    for (const spec of specs) {
      const content = (spec.spec || '').toLowerCase();

      if (content.includes('breaking change') || content.includes('breaking:')) {
        hasBreakingChanges = true;
      }

      if (spec.implementationPlan?.workflow_type === 'new_feature' ||
          content.includes('new feature') ||
          content.includes('## added')) {
        hasNewFeatures = true;
      }
    }

    if (hasBreakingChanges) {
      return `${major + 1}.0.0`;
    } else if (hasNewFeatures) {
      return `${major}.${minor + 1}.0`;
    } else {
      return `${major}.${minor}.${patch + 1}`;
    }
  }

  /**
   * Cancel ongoing generation
   */
  cancelGeneration(projectId: string): boolean {
    const process = this.generationProcesses.get(projectId);
    if (process) {
      process.kill('SIGTERM');
      this.generationProcesses.delete(projectId);
      return true;
    }
    return false;
  }

  /**
   * Emit progress update
   */
  private emitProgress(projectId: string, progress: ChangelogGenerationProgress): void {
    this.emit('generation-progress', projectId, progress);
  }

  /**
   * Emit error
   */
  private emitError(projectId: string, error: string): void {
    this.emit('generation-progress', projectId, {
      stage: 'error',
      progress: 0,
      message: error,
      error
    });
    this.emit('generation-error', projectId, error);
  }
}

// Export singleton instance
export const changelogService = new ChangelogService();
