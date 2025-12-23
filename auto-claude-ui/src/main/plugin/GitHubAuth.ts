import { safeStorage } from 'electron';
import { simpleGit, SimpleGit } from 'simple-git';
import { Octokit } from 'octokit';
import path from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';
import type {
  GitHubTokenValidation,
  GitHubRepoAccess,
  ParsedGitHubUrl,
  GitAvailability,
  PluginInstallProgress
} from '../../shared/types';

/** Minimum git version required */
const MINIMUM_GIT_VERSION = '2.1.0';

/** User agent for GitHub API requests */
const GITHUB_USER_AGENT = 'auto-claude-plugin-manager/1.0.0';

/**
 * GitHub Authentication Service
 *
 * Handles authentication and Git operations for private GitHub repositories:
 * - Validate GitHub Personal Access Tokens
 * - Check repository access
 * - Clone private repositories
 * - Manage token storage (encrypted via Electron safeStorage)
 */
export class GitHubAuth {
  private octokit: Octokit | null = null;
  private git: SimpleGit;
  private progressCallback?: (progress: PluginInstallProgress) => void;

  constructor() {
    // Initialize simple-git without progress initially
    this.git = simpleGit();
  }

  /**
   * Set progress callback for clone operations
   */
  setProgressCallback(callback: (progress: PluginInstallProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Check if Git is available and meets minimum version
   */
  async checkGitAvailability(): Promise<GitAvailability> {
    try {
      const versionResult = await this.git.version();

      if (!versionResult.installed) {
        return {
          available: false,
          meetsMinimum: false,
          minimumRequired: MINIMUM_GIT_VERSION,
          error: 'Git is not installed. Please install Git to use GitHub plugins.'
        };
      }

      // Build version string from structured result
      const { major, minor, patch } = versionResult;
      const currentVersion = `${major}.${minor}.${patch}`;
      const meetsMinimum = this.compareVersions(currentVersion, MINIMUM_GIT_VERSION) >= 0;

      if (!meetsMinimum) {
        return {
          available: true,
          version: currentVersion,
          meetsMinimum: false,
          minimumRequired: MINIMUM_GIT_VERSION,
          error: `Git version ${currentVersion} is below minimum required ${MINIMUM_GIT_VERSION}. Please update Git.`
        };
      }

      return {
        available: true,
        version: currentVersion,
        meetsMinimum: true,
        minimumRequired: MINIMUM_GIT_VERSION
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        available: false,
        meetsMinimum: false,
        minimumRequired: MINIMUM_GIT_VERSION,
        error: `Failed to check Git availability: ${message}`
      };
    }
  }

  /**
   * Compare two semantic versions
   * Returns: 1 if a > b, -1 if a < b, 0 if equal
   */
  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i] || 0;
      const partB = partsB[i] || 0;

      if (partA > partB) return 1;
      if (partA < partB) return -1;
    }

    return 0;
  }

  /**
   * Parse a GitHub URL (SSH or HTTPS)
   */
  parseGitHubUrl(url: string): ParsedGitHubUrl | null {
    // SSH format: git@github.com:owner/repo.git
    const sshMatch = url.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
    if (sshMatch) {
      return {
        owner: sshMatch[1],
        repo: sshMatch[2],
        isSSH: true,
        originalUrl: url
      };
    }

    // HTTPS format: https://github.com/owner/repo.git
    const httpsMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
      return {
        owner: httpsMatch[1],
        repo: httpsMatch[2],
        isSSH: false,
        originalUrl: url
      };
    }

    return null;
  }

  /**
   * Convert SSH URL to HTTPS format for PAT authentication
   */
  private convertToHttpsUrl(url: string): string {
    const parsed = this.parseGitHubUrl(url);
    if (!parsed) {
      throw new Error(`Invalid GitHub URL format: ${url}`);
    }

    return `https://github.com/${parsed.owner}/${parsed.repo}.git`;
  }

  /**
   * Create authenticated URL with embedded token
   * SECURITY: Never log the returned URL as it contains credentials
   */
  private createAuthenticatedUrl(httpsUrl: string, token: string): string {
    // GitHub accepts any username with PAT, 'oauth2' is conventional
    const username = 'oauth2';
    return httpsUrl.replace(
      'https://github.com/',
      `https://${username}:${token}@github.com/`
    );
  }

  /**
   * Validate a GitHub Personal Access Token
   */
  async validateToken(token: string): Promise<GitHubTokenValidation> {
    try {
      this.octokit = new Octokit({
        auth: token,
        userAgent: GITHUB_USER_AGENT
      });

      // Test connection by fetching authenticated user
      const { data: user } = await this.octokit.rest.users.getAuthenticated();

      // Get token scopes from headers (if available)
      // Note: Scopes are not directly available from this endpoint,
      // but we can verify the token works
      const scopes: string[] = [];

      return {
        valid: true,
        username: user.login,
        scopes
      };
    } catch (error) {
      // Don't expose detailed error messages that might reveal token info
      const message = this.getSafeErrorMessage(error);
      return {
        valid: false,
        error: message
      };
    }
  }

  /**
   * Check if the token has access to a specific repository
   */
  async checkRepoAccess(token: string, owner: string, repo: string): Promise<GitHubRepoAccess> {
    try {
      const octokit = new Octokit({
        auth: token,
        userAgent: GITHUB_USER_AGENT
      });

      const { data: repoData } = await octokit.rest.repos.get({ owner, repo });

      return {
        hasAccess: true,
        owner,
        repo,
        isPrivate: repoData.private
      };
    } catch (error) {
      const message = this.getSafeErrorMessage(error);

      // Check for specific error types
      if (this.isHttpError(error) && error.status === 404) {
        return {
          hasAccess: false,
          owner,
          repo,
          isPrivate: false,
          error: 'Repository not found or no access. Check the URL and token permissions.'
        };
      }

      if (this.isHttpError(error) && error.status === 401) {
        return {
          hasAccess: false,
          owner,
          repo,
          isPrivate: false,
          error: 'Authentication failed. Check your Personal Access Token.'
        };
      }

      if (this.isHttpError(error) && error.status === 403) {
        return {
          hasAccess: false,
          owner,
          repo,
          isPrivate: false,
          error: 'Access forbidden. Your token may not have the required scopes.'
        };
      }

      return {
        hasAccess: false,
        owner,
        repo,
        isPrivate: false,
        error: message
      };
    }
  }

  /**
   * Clone a private repository using PAT authentication
   */
  async clonePrivateRepo(
    repoUrl: string,
    token: string,
    localPath: string
  ): Promise<{ success: boolean; path: string; error?: string }> {
    try {
      // Report progress: validating
      this.reportProgress({
        stage: 'validating',
        percent: 10,
        message: 'Validating repository access...'
      });

      // Convert to HTTPS if needed
      const httpsUrl = this.convertToHttpsUrl(repoUrl);

      // Parse URL for validation
      const parsed = this.parseGitHubUrl(repoUrl);
      if (!parsed) {
        return {
          success: false,
          path: '',
          error: `Invalid GitHub URL format: ${repoUrl}`
        };
      }

      // Check repository access
      const access = await this.checkRepoAccess(token, parsed.owner, parsed.repo);
      if (!access.hasAccess) {
        return {
          success: false,
          path: '',
          error: access.error || 'No access to repository'
        };
      }

      // Ensure parent directory exists
      const parentDir = path.dirname(localPath);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      // Remove existing directory if it exists
      if (existsSync(localPath)) {
        rmSync(localPath, { recursive: true, force: true });
      }

      // Report progress: cloning
      this.reportProgress({
        stage: 'cloning',
        percent: 30,
        message: 'Cloning repository...'
      });

      // Create authenticated URL (NEVER log this)
      const authenticatedUrl = this.createAuthenticatedUrl(httpsUrl, token);

      // Capture reference for use in progress callback
      const reportProgress = this.reportProgress.bind(this);

      // Create a new git instance for cloning with progress
      // Note: simple-git progress is not as detailed as native git progress
      // IMPORTANT: Disable debug logging to prevent token exposure
      const git = simpleGit({
        progress({ method, stage, progress }) {
          // Update progress during clone
          if (method === 'clone') {
            const percent = 30 + Math.floor(progress * 0.6); // 30-90%
            const stageMessage = stage === 'receiving' ? 'Receiving objects...' : 'Resolving deltas...';
            reportProgress({
              stage: 'cloning',
              percent,
              message: stageMessage
            });
          }
        }
      });

      // Clone the repository
      await git.clone(authenticatedUrl, localPath);

      // Report progress: complete
      this.reportProgress({
        stage: 'complete',
        percent: 100,
        message: 'Clone complete'
      });

      return {
        success: true,
        path: localPath
      };
    } catch (error) {
      const message = this.getSafeErrorMessage(error);

      // Report progress: error
      this.reportProgress({
        stage: 'error',
        percent: 0,
        message: `Clone failed: ${message}`
      });

      return {
        success: false,
        path: '',
        error: message
      };
    }
  }

  /**
   * Pull latest changes from a repository
   */
  async pullUpdates(
    repoPath: string,
    token?: string
  ): Promise<{ success: boolean; updated: boolean; error?: string }> {
    try {
      const git = simpleGit(repoPath);

      // Get current remote URL
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');

      if (!origin) {
        return {
          success: false,
          updated: false,
          error: 'No origin remote found'
        };
      }

      // If token provided and URL is GitHub, authenticate
      if (token && origin.refs.fetch.includes('github.com')) {
        const parsed = this.parseGitHubUrl(origin.refs.fetch);
        if (parsed) {
          // Temporarily set authenticated remote for pull
          const httpsUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
          const authenticatedUrl = this.createAuthenticatedUrl(httpsUrl, token);

          // Set remote URL temporarily (will be reset after)
          await git.remote(['set-url', 'origin', authenticatedUrl]);

          try {
            // Perform pull
            const result = await git.pull();

            // Reset remote URL to non-authenticated version
            await git.remote(['set-url', 'origin', httpsUrl]);

            return {
              success: true,
              updated: result.files.length > 0 || result.summary.changes > 0
            };
          } catch (pullError) {
            // Reset remote URL even on error
            await git.remote(['set-url', 'origin', httpsUrl]);
            throw pullError;
          }
        }
      }

      // Pull without authentication (for public repos or SSH)
      const result = await git.pull();

      return {
        success: true,
        updated: result.files.length > 0 || result.summary.changes > 0
      };
    } catch (error) {
      const message = this.getSafeErrorMessage(error);
      return {
        success: false,
        updated: false,
        error: message
      };
    }
  }

  /**
   * Store encrypted token using Electron safeStorage
   */
  storeToken(token: string): boolean {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        console.error('[GitHubAuth] Encryption not available for token storage');
        return false;
      }

      const encrypted = safeStorage.encryptString(token);
      // Store in a way that can be retrieved later
      // Note: In production, this would be stored in a file or system keychain
      // For now, we'll store it in memory (not persistent)
      this.encryptedToken = encrypted;
      return true;
    } catch (error) {
      console.error('[GitHubAuth] Failed to store token:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  private encryptedToken: Buffer | null = null;

  /**
   * Retrieve stored token from Electron safeStorage
   */
  retrieveToken(): string | null {
    try {
      if (!this.encryptedToken) {
        return null;
      }

      if (!safeStorage.isEncryptionAvailable()) {
        console.error('[GitHubAuth] Encryption not available for token retrieval');
        return null;
      }

      return safeStorage.decryptString(this.encryptedToken);
    } catch (error) {
      console.error('[GitHubAuth] Failed to retrieve token:', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  /**
   * Clear stored token
   */
  clearToken(): void {
    this.encryptedToken = null;
    this.octokit = null;
  }

  /**
   * Report progress through callback
   */
  private reportProgress(progress: PluginInstallProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  /**
   * Get a safe error message that doesn't expose credentials
   */
  private getSafeErrorMessage(error: unknown): string {
    if (!error) return 'Unknown error';

    if (error instanceof Error) {
      // Remove any potential token from error messages
      let message = error.message;

      // Remove URLs that might contain tokens
      message = message.replace(/https:\/\/[^@]+@github\.com/g, 'https://[REDACTED]@github.com');

      // Remove token patterns
      message = message.replace(/ghp_[a-zA-Z0-9]+/g, '[TOKEN_REDACTED]');
      message = message.replace(/github_pat_[a-zA-Z0-9_]+/g, '[TOKEN_REDACTED]');

      return message;
    }

    return String(error);
  }

  /**
   * Type guard for HTTP errors from Octokit
   */
  private isHttpError(error: unknown): error is { status: number; message: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status: unknown }).status === 'number'
    );
  }
}

// Singleton instance
let gitHubAuthInstance: GitHubAuth | null = null;

/**
 * Get the singleton GitHubAuth instance
 */
export function getGitHubAuth(): GitHubAuth {
  if (!gitHubAuthInstance) {
    gitHubAuthInstance = new GitHubAuth();
  }
  return gitHubAuthInstance;
}
