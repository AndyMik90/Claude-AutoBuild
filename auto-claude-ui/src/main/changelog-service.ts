import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import { app } from 'electron';
import { AUTO_BUILD_PATHS, DEFAULT_CHANGELOG_PATH } from '../shared/constants';
import { execSync } from 'child_process';
import { detectRateLimit, createSDKRateLimitInfo, getProfileEnv, getActiveProfileId } from './rate-limit-detector';
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
  ImplementationPlan,
  GitBranchInfo,
  GitTagInfo,
  GitCommit,
  GitHistoryOptions,
  BranchDiffOptions
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
    const homeDir = os.homedir();

    // Platform-specific possible paths
    const possiblePaths = process.platform === 'win32'
      ? [
          // Windows paths
          path.join(homeDir, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
          path.join(homeDir, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
          path.join(homeDir, '.local', 'bin', 'claude.exe'),
          'C:\\Program Files\\Claude\\claude.exe',
          'C:\\Program Files (x86)\\Claude\\claude.exe',
          // Also check if claude is in system PATH
          'claude'
        ]
      : [
          // Unix paths (macOS/Linux)
          '/usr/local/bin/claude',
          '/opt/homebrew/bin/claude',
          path.join(homeDir, '.local/bin/claude'),
          path.join(homeDir, 'bin/claude'),
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

      // Handle both Unix (\n) and Windows (\r\n) line endings
      for (const line of envContent.split(/\r?\n/)) {
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
      .filter(task => task.status === 'done' && !task.metadata?.archivedAt)
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

  // ============================================
  // Git Data Retrieval Methods
  // ============================================

  /**
   * Get list of branches for changelog git mode
   */
  getBranches(projectPath: string): GitBranchInfo[] {
    try {
      // Get current branch
      let currentBranch = '';
      try {
        currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: projectPath,
          encoding: 'utf-8'
        }).trim();
      } catch {
        // Ignore - might be in detached HEAD
      }

      // Get all branches (local and remote)
      const output = execSync('git branch -a --format="%(refname:short)|%(HEAD)"', {
        cwd: projectPath,
        encoding: 'utf-8'
      });

      const branches: GitBranchInfo[] = [];
      const seenNames = new Set<string>();

      // Handle both Unix (\n) and Windows (\r\n) line endings
      for (const line of output.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const [name, head] = trimmed.split('|');
        if (!name) continue;

        // Skip HEAD references
        if (name === 'HEAD' || name.includes('HEAD')) continue;

        // Parse remote branches (origin/xxx) and mark as remote
        const isRemote = name.startsWith('origin/') || name.includes('/');
        const displayName = isRemote ? name.replace(/^origin\//, '') : name;

        // Skip duplicates (prefer local over remote)
        if (seenNames.has(displayName) && isRemote) continue;
        seenNames.add(displayName);

        branches.push({
          name: displayName,
          isRemote,
          isCurrent: head === '*' || displayName === currentBranch
        });
      }

      // Sort: current first, then local branches, then remote
      return branches.sort((a, b) => {
        if (a.isCurrent && !b.isCurrent) return -1;
        if (!a.isCurrent && b.isCurrent) return 1;
        if (!a.isRemote && b.isRemote) return -1;
        if (a.isRemote && !b.isRemote) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      this.debug('Error getting branches:', error);
      return [];
    }
  }

  /**
   * Get list of tags for changelog git mode
   */
  getTags(projectPath: string): GitTagInfo[] {
    try {
      // Get tags sorted by creation date (newest first)
      const output = execSync(
        'git tag -l --sort=-creatordate --format="%(refname:short)|%(creatordate:iso-strict)|%(objectname:short)"',
        {
          cwd: projectPath,
          encoding: 'utf-8'
        }
      );

      const tags: GitTagInfo[] = [];

      // Handle both Unix (\n) and Windows (\r\n) line endings
      for (const line of output.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parts = trimmed.split('|');
        const name = parts[0];
        const date = parts[1] || undefined;
        const commit = parts[2] || undefined;

        if (name) {
          tags.push({ name, date, commit });
        }
      }

      return tags;
    } catch (error) {
      this.debug('Error getting tags:', error);
      return [];
    }
  }

  /**
   * Get current branch name
   */
  getCurrentBranch(projectPath: string): string {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: projectPath,
        encoding: 'utf-8'
      }).trim();
    } catch {
      return 'main';
    }
  }

  /**
   * Get the default/main branch name
   */
  getDefaultBranch(projectPath: string): string {
    try {
      // Try to get from origin/HEAD
      const result = execSync('git rev-parse --abbrev-ref origin/HEAD', {
        cwd: projectPath,
        encoding: 'utf-8'
      }).trim();
      return result.replace('origin/', '');
    } catch {
      // Fallback: check if main or master exists
      try {
        execSync('git rev-parse --verify main', {
          cwd: projectPath,
          encoding: 'utf-8'
        });
        return 'main';
      } catch {
        try {
          execSync('git rev-parse --verify master', {
            cwd: projectPath,
            encoding: 'utf-8'
          });
          return 'master';
        } catch {
          return 'main';
        }
      }
    }
  }

  /**
   * Get commits for git-history mode
   */
  getCommits(projectPath: string, options: GitHistoryOptions): GitCommit[] {
    try {
      // Build the git log command based on options
      const format = '%h|%H|%s|%an|%ae|%aI';
      let command = `git log --pretty=format:"${format}"`;

      // Add merge commit handling
      if (!options.includeMergeCommits) {
        command += ' --no-merges';
      }

      // Add range/filters based on type
      switch (options.type) {
        case 'recent':
          command += ` -n ${options.count || 25}`;
          break;
        case 'since-date':
          if (options.sinceDate) {
            command += ` --since="${options.sinceDate}"`;
          }
          break;
        case 'tag-range':
          if (options.fromTag) {
            const toRef = options.toTag || 'HEAD';
            command += ` ${options.fromTag}..${toRef}`;
          }
          break;
        case 'since-version':
          // Get all commits since the specified version/tag up to HEAD
          if (options.fromTag) {
            command += ` ${options.fromTag}..HEAD`;
          }
          break;
      }

      this.debug('Getting commits with command:', command);

      const output = execSync(command, {
        cwd: projectPath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large histories
      });

      return this.parseGitLogOutput(output);
    } catch (error) {
      this.debug('Error getting commits:', error);
      return [];
    }
  }

  /**
   * Get commits between two branches (for branch-diff mode)
   */
  getBranchDiffCommits(projectPath: string, options: BranchDiffOptions): GitCommit[] {
    try {
      const format = '%h|%H|%s|%an|%ae|%aI';
      // Get commits in compareBranch that are not in baseBranch
      const command = `git log --pretty=format:"${format}" --no-merges ${options.baseBranch}..${options.compareBranch}`;

      this.debug('Getting branch diff commits with command:', command);

      const output = execSync(command, {
        cwd: projectPath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
      });

      return this.parseGitLogOutput(output);
    } catch (error) {
      this.debug('Error getting branch diff commits:', error);
      return [];
    }
  }

  /**
   * Parse git log output into GitCommit objects
   */
  private parseGitLogOutput(output: string): GitCommit[] {
    const commits: GitCommit[] = [];

    // Handle both Unix (\n) and Windows (\r\n) line endings
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split('|');
      if (parts.length < 6) continue;

      const [hash, fullHash, subject, author, authorEmail, date] = parts;

      commits.push({
        hash,
        fullHash,
        subject,
        body: undefined, // We don't fetch body for performance
        author,
        authorEmail,
        date
      });
    }

    return commits;
  }

  // ============================================
  // Changelog Generation
  // ============================================

  /**
   * Generate changelog using Claude AI
   * Supports multiple source modes: tasks (specs), git-history, or branch-diff
   */
  generateChangelog(
    projectId: string,
    projectPath: string,
    request: ChangelogGenerationRequest,
    specs?: TaskSpecContent[]
  ): void {
    const sourceMode = request.sourceMode || 'tasks';

    this.debug('generateChangelog called', {
      projectId,
      projectPath,
      sourceMode,
      taskCount: request.taskIds?.length || 0,
      version: request.version,
      format: request.format,
      audience: request.audience
    });

    // Kill existing process if any
    this.cancelGeneration(projectId);

    let prompt: string;
    let itemCount: number;

    // Handle different source modes
    if (sourceMode === 'git-history' && request.gitHistory) {
      // Git history mode
      this.emitProgress(projectId, {
        stage: 'loading_commits',
        progress: 10,
        message: 'Loading commits from git history...'
      });

      const commits = this.getCommits(projectPath, request.gitHistory);
      if (commits.length === 0) {
        this.emitError(projectId, 'No commits found for the specified range');
        return;
      }

      prompt = this.buildGitPrompt(request, commits);
      itemCount = commits.length;

    } else if (sourceMode === 'branch-diff' && request.branchDiff) {
      // Branch diff mode
      this.emitProgress(projectId, {
        stage: 'loading_commits',
        progress: 10,
        message: `Loading commits between ${request.branchDiff.baseBranch} and ${request.branchDiff.compareBranch}...`
      });

      const commits = this.getBranchDiffCommits(projectPath, request.branchDiff);
      if (commits.length === 0) {
        this.emitError(projectId, 'No commits found between the specified branches');
        return;
      }

      prompt = this.buildGitPrompt(request, commits);
      itemCount = commits.length;

    } else {
      // Tasks mode (original behavior)
      if (!specs || specs.length === 0) {
        this.emitError(projectId, 'No specs provided for changelog generation');
        return;
      }

      this.emitProgress(projectId, {
        stage: 'loading_specs',
        progress: 10,
        message: 'Preparing changelog generation...'
      });

      prompt = this.buildChangelogPrompt(request, specs);
      itemCount = specs.length;
    }
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
    const homeDir = os.homedir();
    const isWindows = process.platform === 'win32';

    // Build PATH with platform-appropriate separator and locations
    const pathAdditions = isWindows
      ? [
          path.join(homeDir, 'AppData', 'Local', 'Programs', 'claude'),
          path.join(homeDir, 'AppData', 'Roaming', 'npm'),
          path.join(homeDir, '.local', 'bin'),
          'C:\\Program Files\\Claude',
          'C:\\Program Files (x86)\\Claude'
        ]
      : [
          '/usr/local/bin',
          '/opt/homebrew/bin',
          path.join(homeDir, '.local/bin'),
          path.join(homeDir, 'bin')
        ];

    // Get active Claude profile environment (OAuth token preferred, falls back to CLAUDE_CONFIG_DIR)
    const profileEnv = getProfileEnv();
    this.debug('Active profile environment', {
      hasOAuthToken: !!profileEnv.CLAUDE_CODE_OAUTH_TOKEN,
      hasConfigDir: !!profileEnv.CLAUDE_CONFIG_DIR,
      authMethod: profileEnv.CLAUDE_CODE_OAUTH_TOKEN ? 'oauth-token' : (profileEnv.CLAUDE_CONFIG_DIR ? 'config-dir' : 'default')
    });

    const spawnEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...autoBuildEnv,
      ...profileEnv, // Include active Claude profile config
      // Ensure critical env vars are set for claude CLI
      // Use USERPROFILE on Windows, HOME on Unix
      ...(isWindows ? { USERPROFILE: homeDir } : { HOME: homeDir }),
      USER: process.env.USER || process.env.USERNAME || 'user',
      // Add common binary locations to PATH for claude CLI
      PATH: [process.env.PATH || '', ...pathAdditions].filter(Boolean).join(path.delimiter),
      PYTHONUNBUFFERED: '1'
    };

    this.debug('Spawn environment', {
      HOME: spawnEnv.HOME,
      USER: spawnEnv.USER,
      pathDirs: spawnEnv.PATH?.split(':').length,
      authMethod: spawnEnv.CLAUDE_CODE_OAUTH_TOKEN ? 'oauth-token' : (spawnEnv.CLAUDE_CONFIG_DIR ? `config-dir:${spawnEnv.CLAUDE_CONFIG_DIR}` : 'default')
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
          tasksIncluded: itemCount
        };

        this.debug('Generation complete, emitting result');
        this.emit('generation-complete', projectId, result);
      } else {
        // Combine all output for error analysis
        const combinedOutput = `${output}\n${errorOutput}`;
        const error = errorOutput || `Generation failed with exit code ${code}`;

        // Check for rate limit
        const rateLimitDetection = detectRateLimit(combinedOutput);
        if (rateLimitDetection.isRateLimited) {
          this.debug('Rate limit detected in changelog generation', {
            resetTime: rateLimitDetection.resetTime,
            limitType: rateLimitDetection.limitType,
            suggestedProfile: rateLimitDetection.suggestedProfile?.name
          });

          // Emit rate limit event
          const rateLimitInfo = createSDKRateLimitInfo('changelog', rateLimitDetection, { projectId });
          this.emit('rate-limit', projectId, rateLimitInfo);
        }

        this.debug('Generation failed', { error: error.substring(0, 500), isRateLimited: rateLimitDetection.isRateLimited });
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
    // Handle both Unix (\n) and Windows (\r\n) line endings
    const lines = spec.split(/\r?\n/);
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

CRITICAL: Output ONLY the raw changelog content. Do NOT include ANY introductory text, analysis, or explanation. Start directly with the changelog heading (## or #). No "Here's the changelog" or similar phrases.`;
  }

  /**
   * Build the prompt for git-based changelog generation
   * Categorizes commits by type (conventional commits) or keywords
   */
  private buildGitPrompt(
    request: ChangelogGenerationRequest,
    commits: GitCommit[]
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

    // Format commits for the prompt
    // Group by conventional commit type if detected
    const commitLines = commits.map(commit => {
      const hash = commit.hash;
      const subject = commit.subject;
      // Detect conventional commit format: type(scope): message
      const conventionalMatch = subject.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/);
      if (conventionalMatch) {
        const [, type, scope, message] = conventionalMatch;
        return `- ${hash}: [${type}${scope ? `/${scope}` : ''}] ${message}`;
      }
      return `- ${hash}: ${subject}`;
    }).join('\n');

    // Add context about branch/range if available
    let sourceContext = '';
    if (request.branchDiff) {
      sourceContext = `These commits are from branch "${request.branchDiff.compareBranch}" that are not in "${request.branchDiff.baseBranch}".`;
    } else if (request.gitHistory) {
      switch (request.gitHistory.type) {
        case 'recent':
          sourceContext = `These are the ${commits.length} most recent commits.`;
          break;
        case 'since-date':
          sourceContext = `These are commits since ${request.gitHistory.sinceDate}.`;
          break;
        case 'tag-range':
          sourceContext = `These are commits between tag "${request.gitHistory.fromTag}" and "${request.gitHistory.toTag || 'HEAD'}".`;
          break;
      }
    }

    return `${audienceInstructions[request.audience]}

${sourceContext}

Generate a changelog from these git commits. Group related changes together and categorize them appropriately.

Conventional commit types to recognize:
- feat/feature: New features → Added section
- fix/bugfix: Bug fixes → Fixed section
- docs: Documentation → Changed or separate Documentation section
- style: Styling/formatting → Changed section
- refactor: Code refactoring → Changed section
- perf: Performance → Changed or Performance section
- test: Tests → (usually omit unless significant)
- chore: Maintenance → (usually omit unless significant)

Format:
${formatInstructions[request.format]}

Git commits (${commits.length} total):
${commitLines}

${request.customInstructions ? `Note: ${request.customInstructions}` : ''}

CRITICAL: Output ONLY the raw changelog content. Do NOT include ANY introductory text, analysis, or explanation. Start directly with the changelog heading (## or #). No "Here's the changelog" or similar phrases. Intelligently group and summarize related commits - don't just list each commit individually.`;
  }

  /**
   * Create Python script for Claude generation
   */
  private createGenerationScript(prompt: string, _request: ChangelogGenerationRequest): string {
    // Convert prompt to base64 to avoid any string escaping issues in Python
    const base64Prompt = Buffer.from(prompt, 'utf-8').toString('base64');

    // Escape the claude path for Python string
    const escapedClaudePath = this.claudePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    return `
import subprocess
import sys
import base64

try:
    # Decode the base64 prompt to avoid string escaping issues
    prompt = base64.b64decode('${base64Prompt}').decode('utf-8')

    # Use Claude Code CLI to generate
    # stdin=DEVNULL prevents hanging when claude checks for interactive input
    result = subprocess.run(
        ['${escapedClaudePath}', '-p', prompt, '--output-format', 'text', '--model', 'haiku'],
        capture_output=True,
        text=True,
        stdin=subprocess.DEVNULL,
        timeout=300
    )

    if result.returncode == 0:
        print(result.stdout)
    else:
        # Print more detailed error info
        print(f"Claude CLI error (code {result.returncode}):", file=sys.stderr)
        if result.stderr:
            print(result.stderr, file=sys.stderr)
        if result.stdout:
            print(f"stdout: {result.stdout}", file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print(f"Python error: {type(e).__name__}: {e}", file=sys.stderr)
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

    // Find where the actual changelog starts (look for markdown heading)
    // This handles cases where AI includes preamble like "I'll analyze..." or "Here's the changelog:"
    const changelogStartPatterns = [
      /^(##\s*\[[\d.]+\])/m,           // Keep-a-changelog: ## [1.0.0]
      /^(##\s*What['']?s\s+New)/im,    // GitHub release: ## What's New
      /^(#\s*Release\s+v?[\d.]+)/im,   // Simple: # Release v1.0.0
      /^(#\s*Changelog)/im,             // # Changelog
      /^(##\s*v?[\d.]+)/m               // ## v1.0.0 or ## 1.0.0
    ];

    for (const pattern of changelogStartPatterns) {
      const match = changelog.match(pattern);
      if (match && match.index !== undefined) {
        // Found a changelog heading - extract from there
        changelog = changelog.substring(match.index);
        break;
      }
    }

    // Additional cleanup - remove common AI preambles if they somehow remain
    const prefixes = [
      /^I['']ll\s+analyze[^#]*(?=#)/is,
      /^I['']ll\s+generate[^#]*(?=#)/is,
      /^Here['']s the changelog[:\s]*/i,
      /^The changelog[:\s]*/i,
      /^Changelog[:\s]*/i,
      /^Based on[^#]*(?=#)/is,
      /^Let me[^#]*(?=#)/is
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
