/**
 * GitLab OAuth handlers using GitLab CLI (glab)
 * Provides OAuth flow similar to GitHub's gh CLI
 */

import { ipcMain, shell } from 'electron';
import { execSync, execFileSync, spawn } from 'child_process';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult } from '../../../shared/types';
import { getAugmentedEnv, findExecutable } from '../../env-utils';
import type { GitLabAuthStartResult } from './types';

const DEFAULT_GITLAB_URL = 'https://gitlab.com';

// Debug logging helper
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

/**
 * Logs a message to the console with a "[GitLab OAuth]" prefix when debug mode is enabled.
 *
 * @param message - The message to log
 * @param data - Optional additional data to include with the log
 */
function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.debug(`[GitLab OAuth] ${message}`, data);
    } else {
      console.debug(`[GitLab OAuth] ${message}`);
    }
  }
}

// Regex pattern to validate GitLab project format (group/project or group/subgroup/project)
const GITLAB_PROJECT_PATTERN = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/;

/**
 * Determines whether a string is a valid GitLab project identifier.
 *
 * @param project - A GitLab project identifier: either a numeric project ID or a namespaced path (e.g., "group/project" or "group/subgroup/project").
 * @returns `true` if `project` is a numeric ID or matches the expected namespaced path pattern, `false` otherwise.
 */
function isValidGitLabProject(project: string): boolean {
  // Allow numeric IDs
  if (/^\d+$/.test(project)) return true;
  return GITLAB_PROJECT_PATTERN.test(project);
}

/**
 * Return the hostname portion of a URL string.
 *
 * @returns The hostname extracted from `instanceUrl`, or `'gitlab.com'` if `instanceUrl` is not a valid URL.
 */
function getHostnameFromUrl(instanceUrl: string): string {
  try {
    return new URL(instanceUrl).hostname;
  } catch {
    return 'gitlab.com';
  }
}

/**
 * Register an IPC handler that checks whether the `glab` CLI is installed and, if present, returns its version.
 *
 * The handler listens on `IPC_CHANNELS.GITLAB_CHECK_CLI` and responds with an `IPCResult` whose `data` is
 * `{ installed: boolean; version?: string }`. `installed` is `true` when `glab` is found; `version`, when present,
 * contains the first line of the `glab --version` output.
 */
export function registerCheckGlabCli(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_CHECK_CLI,
    async (): Promise<IPCResult<{ installed: boolean; version?: string }>> => {
      debugLog('checkGitLabCli handler called');
      try {
        const glabPath = findExecutable('glab');
        if (!glabPath) {
          debugLog('glab CLI not found in PATH or common locations');
          return {
            success: true,
            data: { installed: false }
          };
        }
        debugLog('glab CLI found at:', glabPath);

        const versionOutput = execSync('glab --version', {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: getAugmentedEnv()
        });
        const version = versionOutput.trim().split('\n')[0];
        debugLog('glab version:', version);

        return {
          success: true,
          data: { installed: true, version }
        };
      } catch (error) {
        debugLog('glab CLI not found or error:', error instanceof Error ? error.message : error);
        return {
          success: true,
          data: { installed: false }
        };
      }
    }
  );
}

/**
 * Register an IPC handler that checks whether the user is authenticated with the glab CLI for an optional GitLab instance.
 *
 * The handler listens on IPC_CHANNELS.GITLAB_CHECK_AUTH. When invoked it runs `glab auth status` (scoped to the provided instance URL when given) to determine authentication state. If authenticated, it attempts to fetch the current username via `glab api user`; if that succeeds the username is included in the handler result.
 */
export function registerCheckGlabAuth(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_CHECK_AUTH,
    async (_event, instanceUrl?: string): Promise<IPCResult<{ authenticated: boolean; username?: string }>> => {
      debugLog('checkGitLabAuth handler called', { instanceUrl });
      const env = getAugmentedEnv();
      const hostname = instanceUrl ? getHostnameFromUrl(instanceUrl) : 'gitlab.com';

      try {
        // Check auth status for the specific host
        const args = ['auth', 'status'];
        if (hostname !== 'gitlab.com') {
          args.push('--hostname', hostname);
        }

        debugLog('Running: glab', args);
        execSync(`glab ${args.join(' ')}`, { encoding: 'utf-8', stdio: 'pipe', env });

        // Get username if authenticated
        try {
          const userArgs = ['api', 'user', '--jq', '.username'];
          if (hostname !== 'gitlab.com') {
            userArgs.push('--hostname', hostname);
          }
          const username = execSync(`glab ${userArgs.join(' ')}`, {
            encoding: 'utf-8',
            stdio: 'pipe',
            env
          }).trim();
          debugLog('Username:', username);

          return {
            success: true,
            data: { authenticated: true, username }
          };
        } catch {
          return {
            success: true,
            data: { authenticated: true }
          };
        }
      } catch (error) {
        debugLog('Auth check failed:', error instanceof Error ? error.message : error);
        return {
          success: true,
          data: { authenticated: false }
        };
      }
    }
  );
}

/**
 * Start GitLab OAuth flow using glab CLI
 */
export function registerStartGlabAuth(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_START_AUTH,
    async (_event, instanceUrl?: string): Promise<IPCResult<GitLabAuthStartResult>> => {
      debugLog('startGitLabAuth handler called', { instanceUrl });
      const hostname = instanceUrl ? getHostnameFromUrl(instanceUrl) : 'gitlab.com';
      const deviceUrl = instanceUrl
        ? `${instanceUrl.replace(/\/$/, '')}/-/profile/personal_access_tokens`
        : 'https://gitlab.com/-/profile/personal_access_tokens';

      return new Promise((resolve) => {
        try {
          // glab auth login with web flow
          const args = ['auth', 'login', '--web'];
          if (hostname !== 'gitlab.com') {
            args.push('--hostname', hostname);
          }

          debugLog('Spawning: glab', args);

          const glabProcess = spawn('glab', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: getAugmentedEnv()
          });

          let output = '';
          let errorOutput = '';
          let browserOpened = false;

          glabProcess.stdout?.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            debugLog('glab stdout:', chunk);

            // Try to open browser if URL detected
            const urlMatch = chunk.match(/https?:\/\/[^\s]+/);
            if (urlMatch && !browserOpened) {
              browserOpened = true;
              shell.openExternal(urlMatch[0]).catch((err) => {
                debugLog('Failed to open browser:', err);
              });
            }
          });

          glabProcess.stderr?.on('data', (data) => {
            const chunk = data.toString();
            errorOutput += chunk;
            debugLog('glab stderr:', chunk);
          });

          glabProcess.on('close', (code) => {
            debugLog('glab process exited with code:', code);

            if (code === 0) {
              resolve({
                success: true,
                data: {
                  deviceCode: '',
                  verificationUrl: deviceUrl,
                  userCode: ''
                }
              });
            } else {
              resolve({
                success: false,
                error: errorOutput || `Authentication failed with exit code ${code}`,
                data: {
                  deviceCode: '',
                  verificationUrl: deviceUrl,
                  userCode: ''
                }
              });
            }
          });

          glabProcess.on('error', (error) => {
            debugLog('glab process error:', error.message);
            resolve({
              success: false,
              error: error.message,
              data: {
                deviceCode: '',
                verificationUrl: deviceUrl,
                userCode: ''
              }
            });
          });
        } catch (error) {
          debugLog('Exception in startGitLabAuth:', error instanceof Error ? error.message : error);
          resolve({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: {
              deviceCode: '',
              verificationUrl: deviceUrl,
              userCode: ''
            }
          });
        }
      });
    }
  );
}

/**
 * Registers an IPC handler that retrieves the current GitLab authentication token using the glab CLI for an optional instance URL.
 *
 * The registered handler listens on IPC_CHANNELS.GITLAB_GET_TOKEN and returns an IPCResult containing the token on success or an error message on failure.
 */
export function registerGetGlabToken(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_GET_TOKEN,
    async (_event, instanceUrl?: string): Promise<IPCResult<{ token: string }>> => {
      debugLog('getGitLabToken handler called', { instanceUrl });
      const hostname = instanceUrl ? getHostnameFromUrl(instanceUrl) : 'gitlab.com';

      try {
        const args = ['auth', 'token'];
        if (hostname !== 'gitlab.com') {
          args.push('--hostname', hostname);
        }

        const token = execSync(`glab ${args.join(' ')}`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: getAugmentedEnv()
        }).trim();

        if (!token) {
          return {
            success: false,
            error: 'No token found. Please authenticate first.'
          };
        }

        return {
          success: true,
          data: { token }
        };
      } catch (error) {
        debugLog('Failed to get token:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get token'
        };
      }
    }
  );
}

/**
 * Register an IPC handler that returns the authenticated GitLab user's username and name.
 *
 * The registered handler listens on IPC_CHANNELS.GITLAB_GET_USER and invokes the `glab api user`
 * command to obtain the currently authenticated user's information. The handler accepts an
 * optional `instanceUrl` argument to target a self-hosted GitLab instance; when provided the
 * hostname is derived and passed to `glab`.
 *
 * On success the handler responds with an IPCResult whose `data` contains `username` and an
 * optional `name`. On failure it responds with `success: false` and an `error` message.
 */
export function registerGetGlabUser(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_GET_USER,
    async (_event, instanceUrl?: string): Promise<IPCResult<{ username: string; name?: string }>> => {
      debugLog('getGitLabUser handler called', { instanceUrl });
      const hostname = instanceUrl ? getHostnameFromUrl(instanceUrl) : 'gitlab.com';

      try {
        const args = ['api', 'user'];
        if (hostname !== 'gitlab.com') {
          args.push('--hostname', hostname);
        }

        const userJson = execSync(`glab ${args.join(' ')}`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: getAugmentedEnv()
        });

        const user = JSON.parse(userJson);
        debugLog('Parsed user:', { username: user.username, name: user.name });

        return {
          success: true,
          data: {
            username: user.username,
            name: user.name
          }
        };
      } catch (error) {
        debugLog('Failed to get user info:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get user info'
        };
      }
    }
  );
}

/**
 * Register an IPC handler that lists GitLab projects accessible to the authenticated user.
 *
 * The handler is registered on the GITLAB_LIST_USER_PROJECTS channel and accepts an optional
 * `instanceUrl` to target a specific GitLab instance. When invoked it returns an IPCResult
 * containing `projects`, each with `pathWithNamespace`, `description`, and `visibility`.
 */
export function registerListUserProjects(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_LIST_USER_PROJECTS,
    async (_event, instanceUrl?: string): Promise<IPCResult<{ projects: Array<{ pathWithNamespace: string; description: string | null; visibility: string }> }>> => {
      debugLog('listUserProjects handler called', { instanceUrl });
      const hostname = instanceUrl ? getHostnameFromUrl(instanceUrl) : 'gitlab.com';

      try {
        const args = ['repo', 'list', '--mine', '-F', 'json'];
        if (hostname !== 'gitlab.com') {
          args.push('--hostname', hostname);
        }

        const output = execSync(`glab ${args.join(' ')}`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: getAugmentedEnv()
        });

        const projects = JSON.parse(output);
        debugLog('Found projects:', projects.length);

        const formattedProjects = projects.map((p: { path_with_namespace: string; description: string | null; visibility: string }) => ({
          pathWithNamespace: p.path_with_namespace,
          description: p.description,
          visibility: p.visibility
        }));

        return {
          success: true,
          data: { projects: formattedProjects }
        };
      } catch (error) {
        debugLog('Failed to list projects:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list projects'
        };
      }
    }
  );
}

/**
 * Register an IPC handler that detects a GitLab project and instance URL from a local repository's remote origin.
 *
 * The handler listens on IPC_CHANNELS.GITLAB_DETECT_PROJECT and expects a single argument `projectPath` (path to a local git repository). It returns an IPCResult containing `data` with `{ project, instanceUrl }` when a project path (e.g., "group/subgroup/project" or "group/project") and its GitLab instance URL are successfully parsed from the repository's `origin` remote; otherwise it returns an IPCResult with `success: false` and an `error` message.
 */
export function registerDetectGitLabProject(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_DETECT_PROJECT,
    async (_event, projectPath: string): Promise<IPCResult<{ project: string; instanceUrl: string }>> => {
      debugLog('detectGitLabProject handler called', { projectPath });
      try {
        const remoteUrl = execSync('git remote get-url origin', {
          encoding: 'utf-8',
          cwd: projectPath,
          stdio: 'pipe',
          env: getAugmentedEnv()
        }).trim();

        debugLog('Remote URL:', remoteUrl);

        // Parse GitLab project from URL
        // SSH: git@gitlab.example.com:group/project.git
        // HTTPS: https://gitlab.example.com/group/project.git
        let instanceUrl = DEFAULT_GITLAB_URL;
        let project = '';

        const sshMatch = remoteUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
        if (sshMatch) {
          instanceUrl = `https://${sshMatch[1]}`;
          project = sshMatch[2];
        }

        const httpsMatch = remoteUrl.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
        if (httpsMatch) {
          instanceUrl = `https://${httpsMatch[1]}`;
          project = httpsMatch[2];
        }

        if (project) {
          debugLog('Detected project:', { project, instanceUrl });
          return {
            success: true,
            data: { project, instanceUrl }
          };
        }

        return {
          success: false,
          error: 'Could not parse GitLab project from remote URL'
        };
      } catch (error) {
        debugLog('Failed to detect project:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to detect GitLab project'
        };
      }
    }
  );
}

/**
 * Register an IPC handler that retrieves the branch names for a GitLab project using the glab CLI.
 *
 * The registered handler listens on IPC_CHANNELS.GITLAB_GET_BRANCHES, validates the project identifier,
 * queries the project's repository branches, and returns an array of branch names or an error result.
 */
export function registerGetGitLabBranches(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_GET_BRANCHES,
    async (_event, project: string, instanceUrl: string): Promise<IPCResult<string[]>> => {
      debugLog('getGitLabBranches handler called', { project, instanceUrl });

      if (!isValidGitLabProject(project)) {
        return {
          success: false,
          error: 'Invalid project format'
        };
      }

      const hostname = getHostnameFromUrl(instanceUrl);
      const encodedProject = encodeURIComponent(project);

      try {
        const args = ['api', `projects/${encodedProject}/repository/branches`, '--paginate', '--jq', '.[].name'];
        if (hostname !== 'gitlab.com') {
          args.push('--hostname', hostname);
        }

        const output = execFileSync('glab', args, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: getAugmentedEnv()
        });

        const branches = output.trim().split('\n').filter(b => b.length > 0);
        debugLog('Found branches:', branches.length);

        return {
          success: true,
          data: branches
        };
      } catch (error) {
        debugLog('Failed to get branches:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get branches'
        };
      }
    }
  );
}

/**
 * Register an IPC handler that creates a new GitLab repository using the glab CLI.
 *
 * The registered handler validates the project name and accepts options for
 * source path, description, visibility, namespace (group), and an optional
 * GitLab instance URL. On success the handler returns an IPCResult with
 * `data` containing `pathWithNamespace` and `webUrl`. On failure it returns
 * an IPCResult with `success: false` and an `error` message.
 */
export function registerCreateGitLabProject(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_CREATE_PROJECT,
    async (
      _event,
      projectName: string,
      options: { description?: string; visibility?: string; projectPath: string; namespace?: string; instanceUrl?: string }
    ): Promise<IPCResult<{ pathWithNamespace: string; webUrl: string }>> => {
      debugLog('createGitLabProject handler called', { projectName, options });

      if (!/^[A-Za-z0-9_.-]+$/.test(projectName)) {
        return {
          success: false,
          error: 'Invalid project name'
        };
      }

      const hostname = options.instanceUrl ? getHostnameFromUrl(options.instanceUrl) : 'gitlab.com';

      try {
        const args = ['repo', 'create', projectName, '--source', options.projectPath];

        if (options.visibility) {
          args.push('--visibility', options.visibility);
        } else {
          args.push('--visibility', 'private');
        }

        if (options.description) {
          args.push('--description', options.description);
        }

        if (options.namespace) {
          args.push('--group', options.namespace);
        }

        if (hostname !== 'gitlab.com') {
          args.push('--hostname', hostname);
        }

        debugLog('Running: glab', args);
        const output = execFileSync('glab', args, {
          encoding: 'utf-8',
          cwd: options.projectPath,
          stdio: 'pipe',
          env: getAugmentedEnv()
        });

        debugLog('glab repo create output:', output);

        // Parse output to get project info
        const urlMatch = output.match(/https?:\/\/[^\s]+/);
        const webUrl = urlMatch ? urlMatch[0] : `https://${hostname}/${options.namespace || ''}/${projectName}`;
        const pathWithNamespace = options.namespace ? `${options.namespace}/${projectName}` : projectName;

        return {
          success: true,
          data: { pathWithNamespace, webUrl }
        };
      } catch (error) {
        debugLog('Failed to create project:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create project'
        };
      }
    }
  );
}

/**
 * Registers an IPC handler that adds or replaces the `origin` remote of a local git repository to point to a GitLab project.
 *
 * The handler validates the provided project path, constructs the GitLab remote URL using the optional instance URL (defaults to https://gitlab.com), removes any existing `origin` remote if present, and adds the new `origin`. The handler responds on the `GITLAB_ADD_REMOTE` IPC channel with an `IPCResult` containing the created `remoteUrl` on success or an error message on failure.
 */
export function registerAddGitLabRemote(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_ADD_REMOTE,
    async (
      _event,
      projectPath: string,
      projectFullPath: string,
      instanceUrl?: string
    ): Promise<IPCResult<{ remoteUrl: string }>> => {
      debugLog('addGitLabRemote handler called', { projectPath, projectFullPath, instanceUrl });

      if (!isValidGitLabProject(projectFullPath)) {
        return {
          success: false,
          error: 'Invalid project format'
        };
      }

      const baseUrl = (instanceUrl || DEFAULT_GITLAB_URL).replace(/\/$/, '');
      const remoteUrl = `${baseUrl}/${projectFullPath}.git`;

      try {
        // Check if origin exists
        try {
          execSync('git remote get-url origin', {
            cwd: projectPath,
            encoding: 'utf-8',
            stdio: 'pipe'
          });
          // Remove existing origin
          execSync('git remote remove origin', {
            cwd: projectPath,
            encoding: 'utf-8',
            stdio: 'pipe'
          });
        } catch {
          // No origin exists
        }

        execFileSync('git', ['remote', 'add', 'origin', remoteUrl], {
          cwd: projectPath,
          encoding: 'utf-8',
          stdio: 'pipe'
        });

        return {
          success: true,
          data: { remoteUrl }
        };
      } catch (error) {
        debugLog('Failed to add remote:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add remote'
        };
      }
    }
  );
}

/**
 * Register an IPC handler that lists GitLab groups accessible to the authenticated user.
 *
 * The handler listens on the GITLAB_LIST_GROUPS channel and calls the `glab api groups` command
 * (optionally scoped to a provided instance hostname). It parses each line of `glab` output as
 * JSON and returns an array of groups with `id`, `name`, `path`, and `fullPath`. On failure the
 * handler responds successfully with an empty `groups` array.
 */
export function registerListGitLabGroups(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_LIST_GROUPS,
    async (_event, instanceUrl?: string): Promise<IPCResult<{ groups: Array<{ id: number; name: string; path: string; fullPath: string }> }>> => {
      debugLog('listGitLabGroups handler called', { instanceUrl });
      const hostname = instanceUrl ? getHostnameFromUrl(instanceUrl) : 'gitlab.com';

      try {
        const args = ['api', 'groups', '--jq', '.[] | {id: .id, name: .name, path: .path, fullPath: .full_path}'];
        if (hostname !== 'gitlab.com') {
          args.push('--hostname', hostname);
        }

        const output = execSync(`glab ${args.join(' ')}`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          env: getAugmentedEnv()
        });

        const groups: Array<{ id: number; name: string; path: string; fullPath: string }> = [];
        const lines = output.trim().split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const group = JSON.parse(line);
            groups.push({
              id: group.id,
              name: group.name,
              path: group.path,
              fullPath: group.fullPath
            });
          } catch {
            // Skip invalid JSON
          }
        }

        return {
          success: true,
          data: { groups }
        };
      } catch (error) {
        debugLog('Failed to list groups:', error instanceof Error ? error.message : error);
        return {
          success: true,
          data: { groups: [] }
        };
      }
    }
  );
}

/**
 * Register all GitLab OAuth handlers
 */
export function registerGitlabOAuthHandlers(): void {
  debugLog('Registering GitLab OAuth handlers');
  registerCheckGlabCli();
  registerCheckGlabAuth();
  registerStartGlabAuth();
  registerGetGlabToken();
  registerGetGlabUser();
  registerListUserProjects();
  registerDetectGitLabProject();
  registerGetGitLabBranches();
  registerCreateGitLabProject();
  registerAddGitLabRemote();
  registerListGitLabGroups();
  debugLog('GitLab OAuth handlers registered');
}