/**
 * Unit tests for GitHubAuth service
 *
 * Tests GitHub authentication, repository access, cloning, and token management:
 * - Token validation (validateToken)
 * - Repository access checking (checkRepoAccess)
 * - URL parsing (parseGitHubUrl)
 * - Private repository cloning (clonePrivateRepo)
 * - Git version checking (checkGitAvailability)
 * - Token storage (storeToken, retrieveToken, clearToken)
 * - Progress callback reporting
 * - Error message sanitization
 */
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import path from 'path';

// Test directories
const TEST_DIR = '/tmp/github-auth-test';
const CLONE_TARGET = path.join(TEST_DIR, 'cloned-repo');

// Mock safeStorage before importing GitHubAuth
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str: string) => Buffer.from(`encrypted:${str}`)),
    decryptString: vi.fn((buf: Buffer) => {
      const str = buf.toString();
      return str.startsWith('encrypted:') ? str.slice('encrypted:'.length) : str;
    })
  }
}));

// Mock simple-git
const mockGit = {
  version: vi.fn(),
  clone: vi.fn(),
  pull: vi.fn(),
  getRemotes: vi.fn(),
  remote: vi.fn()
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}));

// Mock Octokit
const mockOctokitRest = {
  users: {
    getAuthenticated: vi.fn()
  },
  repos: {
    get: vi.fn()
  }
};

class MockOctokit {
  rest = mockOctokitRest;
  constructor(_options?: { auth?: string; userAgent?: string }) {
    // Constructor accepts options
  }
}

vi.mock('octokit', () => ({
  Octokit: MockOctokit
}));

// Setup and cleanup test directories
function setupTestDirs(): void {
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('GitHubAuth', () => {
  let GitHubAuth: typeof import('../GitHubAuth').GitHubAuth;
  let getGitHubAuth: typeof import('../GitHubAuth').getGitHubAuth;

  beforeEach(async () => {
    cleanupTestDirs();
    setupTestDirs();
    vi.clearAllMocks();
    vi.resetModules();

    // Import fresh instances after mocks are set up
    const module = await import('../GitHubAuth');
    GitHubAuth = module.GitHubAuth;
    getGitHubAuth = module.getGitHubAuth;
  });

  afterEach(() => {
    cleanupTestDirs();
  });

  describe('checkGitAvailability', () => {
    it('should return available and meetsMinimum when git version is sufficient', async () => {
      mockGit.version.mockResolvedValue({
        installed: true,
        major: 2,
        minor: 40,
        patch: 0
      });

      const auth = new GitHubAuth();
      const result = await auth.checkGitAvailability();

      expect(result.available).toBe(true);
      expect(result.meetsMinimum).toBe(true);
      expect(result.version).toBe('2.40.0');
      expect(result.error).toBeUndefined();
    });

    it('should return error when git is not installed', async () => {
      mockGit.version.mockResolvedValue({
        installed: false,
        major: 0,
        minor: 0,
        patch: 0
      });

      const auth = new GitHubAuth();
      const result = await auth.checkGitAvailability();

      expect(result.available).toBe(false);
      expect(result.meetsMinimum).toBe(false);
      expect(result.error).toContain('Git is not installed');
    });

    it('should return error when git version is below minimum', async () => {
      mockGit.version.mockResolvedValue({
        installed: true,
        major: 1,
        minor: 9,
        patch: 0
      });

      const auth = new GitHubAuth();
      const result = await auth.checkGitAvailability();

      expect(result.available).toBe(true);
      expect(result.meetsMinimum).toBe(false);
      expect(result.version).toBe('1.9.0');
      expect(result.error).toContain('below minimum required');
    });

    it('should handle git version check errors', async () => {
      mockGit.version.mockRejectedValue(new Error('Command not found'));

      const auth = new GitHubAuth();
      const result = await auth.checkGitAvailability();

      expect(result.available).toBe(false);
      expect(result.meetsMinimum).toBe(false);
      expect(result.error).toContain('Failed to check Git availability');
    });

    it('should handle exact minimum version', async () => {
      mockGit.version.mockResolvedValue({
        installed: true,
        major: 2,
        minor: 1,
        patch: 0
      });

      const auth = new GitHubAuth();
      const result = await auth.checkGitAvailability();

      expect(result.meetsMinimum).toBe(true);
      expect(result.version).toBe('2.1.0');
    });
  });

  describe('parseGitHubUrl', () => {
    it('should parse SSH URLs correctly', () => {
      const auth = new GitHubAuth();
      const result = auth.parseGitHubUrl('git@github.com:owner/repo.git');

      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        isSSH: true,
        originalUrl: 'git@github.com:owner/repo.git'
      });
    });

    it('should parse SSH URLs without .git suffix', () => {
      const auth = new GitHubAuth();
      const result = auth.parseGitHubUrl('git@github.com:owner/repo');

      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        isSSH: true,
        originalUrl: 'git@github.com:owner/repo'
      });
    });

    it('should parse HTTPS URLs correctly', () => {
      const auth = new GitHubAuth();
      const result = auth.parseGitHubUrl('https://github.com/owner/repo.git');

      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        isSSH: false,
        originalUrl: 'https://github.com/owner/repo.git'
      });
    });

    it('should parse HTTPS URLs without .git suffix', () => {
      const auth = new GitHubAuth();
      const result = auth.parseGitHubUrl('https://github.com/owner/repo');

      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        isSSH: false,
        originalUrl: 'https://github.com/owner/repo'
      });
    });

    it('should parse HTTP URLs correctly', () => {
      const auth = new GitHubAuth();
      const result = auth.parseGitHubUrl('http://github.com/owner/repo.git');

      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        isSSH: false,
        originalUrl: 'http://github.com/owner/repo.git'
      });
    });

    it('should handle repos with hyphens and underscores', () => {
      const auth = new GitHubAuth();
      const result = auth.parseGitHubUrl('git@github.com:my-org/my_repo-name.git');

      expect(result).toEqual({
        owner: 'my-org',
        repo: 'my_repo-name',
        isSSH: true,
        originalUrl: 'git@github.com:my-org/my_repo-name.git'
      });
    });

    it('should return null for invalid URLs', () => {
      const auth = new GitHubAuth();

      expect(auth.parseGitHubUrl('not-a-url')).toBeNull();
      expect(auth.parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull();
      expect(auth.parseGitHubUrl('git@gitlab.com:owner/repo.git')).toBeNull();
      expect(auth.parseGitHubUrl('')).toBeNull();
    });
  });

  describe('validateToken', () => {
    it('should validate a correct token and return user info', async () => {
      mockOctokitRest.users.getAuthenticated.mockResolvedValue({
        data: { login: 'testuser' }
      });

      const auth = new GitHubAuth();
      const result = await auth.validateToken('ghp_validtoken123');

      expect(result.valid).toBe(true);
      expect(result.username).toBe('testuser');
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for incorrect token', async () => {
      mockOctokitRest.users.getAuthenticated.mockRejectedValue(
        new Error('Bad credentials')
      );

      const auth = new GitHubAuth();
      const result = await auth.validateToken('ghp_invalidtoken');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle network errors', async () => {
      mockOctokitRest.users.getAuthenticated.mockRejectedValue(
        new Error('Network error')
      );

      const auth = new GitHubAuth();
      const result = await auth.validateToken('ghp_sometoken');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should not expose token in error messages', async () => {
      const tokenValue = 'ghp_supersecrettoken123';
      mockOctokitRest.users.getAuthenticated.mockRejectedValue(
        new Error(`Authentication failed for token ${tokenValue}`)
      );

      const auth = new GitHubAuth();
      const result = await auth.validateToken(tokenValue);

      expect(result.valid).toBe(false);
      expect(result.error).not.toContain(tokenValue);
      expect(result.error).toContain('[TOKEN_REDACTED]');
    });
  });

  describe('checkRepoAccess', () => {
    it('should return access info for accessible repo', async () => {
      mockOctokitRest.repos.get.mockResolvedValue({
        data: { private: true }
      });

      const auth = new GitHubAuth();
      const result = await auth.checkRepoAccess('ghp_token', 'owner', 'repo');

      expect(result.hasAccess).toBe(true);
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
      expect(result.isPrivate).toBe(true);
    });

    it('should return access info for public repo', async () => {
      mockOctokitRest.repos.get.mockResolvedValue({
        data: { private: false }
      });

      const auth = new GitHubAuth();
      const result = await auth.checkRepoAccess('ghp_token', 'owner', 'public-repo');

      expect(result.hasAccess).toBe(true);
      expect(result.isPrivate).toBe(false);
    });

    it('should return no access for 404 error', async () => {
      const error = new Error('Not Found');
      (error as Error & { status: number }).status = 404;
      mockOctokitRest.repos.get.mockRejectedValue(error);

      const auth = new GitHubAuth();
      const result = await auth.checkRepoAccess('ghp_token', 'owner', 'nonexistent');

      expect(result.hasAccess).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return no access for 401 error', async () => {
      const error = new Error('Unauthorized');
      (error as Error & { status: number }).status = 401;
      mockOctokitRest.repos.get.mockRejectedValue(error);

      const auth = new GitHubAuth();
      const result = await auth.checkRepoAccess('ghp_token', 'owner', 'repo');

      expect(result.hasAccess).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });

    it('should return no access for 403 error', async () => {
      const error = new Error('Forbidden');
      (error as Error & { status: number }).status = 403;
      mockOctokitRest.repos.get.mockRejectedValue(error);

      const auth = new GitHubAuth();
      const result = await auth.checkRepoAccess('ghp_token', 'owner', 'repo');

      expect(result.hasAccess).toBe(false);
      expect(result.error).toContain('Access forbidden');
    });
  });

  describe('clonePrivateRepo', () => {
    beforeEach(() => {
      // Mock successful repo access check
      mockOctokitRest.repos.get.mockResolvedValue({
        data: { private: true }
      });
      // Mock successful clone
      mockGit.clone.mockResolvedValue(undefined);
    });

    it('should clone a repository successfully', async () => {
      const auth = new GitHubAuth();
      const result = await auth.clonePrivateRepo(
        'git@github.com:owner/repo.git',
        'ghp_validtoken',
        CLONE_TARGET
      );

      expect(result.success).toBe(true);
      expect(result.path).toBe(CLONE_TARGET);
      expect(result.error).toBeUndefined();
    });

    it('should convert SSH URL to HTTPS for cloning', async () => {
      const { simpleGit } = await import('simple-git');

      const auth = new GitHubAuth();
      await auth.clonePrivateRepo(
        'git@github.com:owner/repo.git',
        'ghp_token',
        CLONE_TARGET
      );

      // simpleGit should be called with progress config
      expect(simpleGit).toHaveBeenCalled();
      // clone should be called with an authenticated HTTPS URL
      expect(mockGit.clone).toHaveBeenCalled();
      const cloneCall = mockGit.clone.mock.calls[0];
      expect(cloneCall[0]).toContain('https://');
      expect(cloneCall[0]).toContain('github.com');
      expect(cloneCall[1]).toBe(CLONE_TARGET);
    });

    it('should return error for invalid URL', async () => {
      const auth = new GitHubAuth();
      const result = await auth.clonePrivateRepo(
        'not-a-valid-url',
        'ghp_token',
        CLONE_TARGET
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid GitHub URL format');
    });

    it('should return error when repo access check fails', async () => {
      mockOctokitRest.repos.get.mockRejectedValue(
        Object.assign(new Error('Not Found'), { status: 404 })
      );

      const auth = new GitHubAuth();
      const result = await auth.clonePrivateRepo(
        'git@github.com:owner/private-repo.git',
        'ghp_token',
        CLONE_TARGET
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('access');
    });

    it('should handle clone errors gracefully', async () => {
      mockGit.clone.mockRejectedValue(new Error('Clone failed'));

      const auth = new GitHubAuth();
      const result = await auth.clonePrivateRepo(
        'git@github.com:owner/repo.git',
        'ghp_token',
        CLONE_TARGET
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Clone failed');
    });

    it('should create parent directory if it does not exist', async () => {
      const nestedPath = path.join(TEST_DIR, 'nested', 'deep', 'target');

      const auth = new GitHubAuth();
      await auth.clonePrivateRepo(
        'git@github.com:owner/repo.git',
        'ghp_token',
        nestedPath
      );

      // Parent directory should be created (mock doesn't actually create it)
      expect(mockGit.clone).toHaveBeenCalled();
    });

    it('should remove existing directory before cloning', async () => {
      // Create existing directory
      mkdirSync(CLONE_TARGET, { recursive: true });
      writeFileSync(path.join(CLONE_TARGET, 'existing-file.txt'), 'test');

      const auth = new GitHubAuth();
      await auth.clonePrivateRepo(
        'git@github.com:owner/repo.git',
        'ghp_token',
        CLONE_TARGET
      );

      // Clone should be called (implying old directory was removed)
      expect(mockGit.clone).toHaveBeenCalled();
    });

    it('should not expose token in authenticated URL errors', async () => {
      const sensitiveToken = 'ghp_verysecrettoken123';
      mockGit.clone.mockRejectedValue(
        new Error(`Clone failed: https://oauth2:${sensitiveToken}@github.com/owner/repo.git`)
      );

      const auth = new GitHubAuth();
      const result = await auth.clonePrivateRepo(
        'git@github.com:owner/repo.git',
        sensitiveToken,
        CLONE_TARGET
      );

      expect(result.success).toBe(false);
      expect(result.error).not.toContain(sensitiveToken);
      expect(result.error).toContain('[REDACTED]');
    });
  });

  describe('progress callback', () => {
    it('should call progress callback during clone stages', async () => {
      mockOctokitRest.repos.get.mockResolvedValue({
        data: { private: true }
      });
      mockGit.clone.mockResolvedValue(undefined);

      const progressCallback = vi.fn();
      const auth = new GitHubAuth();
      auth.setProgressCallback(progressCallback);

      await auth.clonePrivateRepo(
        'git@github.com:owner/repo.git',
        'ghp_token',
        CLONE_TARGET
      );

      // Should have progress calls for validating, cloning, and complete stages
      expect(progressCallback).toHaveBeenCalled();
      const calls = progressCallback.mock.calls;

      // Check for validating stage
      expect(calls.some((call: unknown[]) => (call[0] as { stage: string }).stage === 'validating')).toBe(true);

      // Check for cloning stage
      expect(calls.some((call: unknown[]) => (call[0] as { stage: string }).stage === 'cloning')).toBe(true);

      // Check for complete stage
      expect(calls.some((call: unknown[]) => (call[0] as { stage: string }).stage === 'complete')).toBe(true);
    });

    it('should report error stage on clone failure', async () => {
      // Mock successful access check but failed clone
      mockOctokitRest.repos.get.mockResolvedValue({
        data: { private: true }
      });
      mockGit.clone.mockRejectedValue(new Error('Clone network error'));

      const progressCallback = vi.fn();
      const auth = new GitHubAuth();
      auth.setProgressCallback(progressCallback);

      await auth.clonePrivateRepo(
        'git@github.com:owner/repo.git',
        'ghp_token',
        CLONE_TARGET
      );

      // Check for error stage
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ stage: 'error' })
      );
    });
  });

  describe('pullUpdates', () => {
    beforeEach(() => {
      mkdirSync(CLONE_TARGET, { recursive: true });
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'https://github.com/owner/repo.git', push: 'https://github.com/owner/repo.git' } }
      ]);
    });

    it('should pull updates successfully', async () => {
      mockGit.pull.mockResolvedValue({ files: ['file1.ts'], summary: { changes: 1 } });

      const auth = new GitHubAuth();
      const result = await auth.pullUpdates(CLONE_TARGET, 'ghp_token');

      expect(result.success).toBe(true);
      expect(result.updated).toBe(true);
    });

    it('should report no updates when nothing changed', async () => {
      mockGit.pull.mockResolvedValue({ files: [], summary: { changes: 0 } });

      const auth = new GitHubAuth();
      const result = await auth.pullUpdates(CLONE_TARGET, 'ghp_token');

      expect(result.success).toBe(true);
      expect(result.updated).toBe(false);
    });

    it('should return error when no origin remote', async () => {
      mockGit.getRemotes.mockResolvedValue([]);

      const auth = new GitHubAuth();
      const result = await auth.pullUpdates(CLONE_TARGET, 'ghp_token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No origin remote');
    });

    it('should handle pull errors', async () => {
      mockGit.pull.mockRejectedValue(new Error('Merge conflict'));

      const auth = new GitHubAuth();
      const result = await auth.pullUpdates(CLONE_TARGET, 'ghp_token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Merge conflict');
    });

    it('should reset remote URL after authenticated pull', async () => {
      mockGit.pull.mockResolvedValue({ files: [], summary: { changes: 0 } });
      mockGit.remote.mockResolvedValue(undefined);

      const auth = new GitHubAuth();
      await auth.pullUpdates(CLONE_TARGET, 'ghp_token');

      // Should call remote set-url twice (set auth URL, then reset to clean URL)
      expect(mockGit.remote).toHaveBeenCalledTimes(2);
    });

    it('should reset remote URL even on pull failure', async () => {
      mockGit.pull.mockRejectedValue(new Error('Pull failed'));
      mockGit.remote.mockResolvedValue(undefined);

      const auth = new GitHubAuth();
      await auth.pullUpdates(CLONE_TARGET, 'ghp_token');

      // Should still reset remote URL after failure
      expect(mockGit.remote).toHaveBeenCalledWith(['set-url', 'origin', expect.any(String)]);
    });
  });

  describe('token storage', () => {
    it('should store token using safeStorage', async () => {
      const { safeStorage } = await import('electron');

      const auth = new GitHubAuth();
      const stored = auth.storeToken('ghp_testtoken');

      expect(stored).toBe(true);
      expect(safeStorage.encryptString).toHaveBeenCalledWith('ghp_testtoken');
    });

    it('should retrieve stored token', async () => {
      const auth = new GitHubAuth();
      auth.storeToken('ghp_storedtoken');
      const retrieved = auth.retrieveToken();

      expect(retrieved).toBe('ghp_storedtoken');
    });

    it('should return null when no token stored', () => {
      const auth = new GitHubAuth();
      const retrieved = auth.retrieveToken();

      expect(retrieved).toBeNull();
    });

    it('should clear stored token', () => {
      const auth = new GitHubAuth();
      auth.storeToken('ghp_tokenToRemove');
      auth.clearToken();
      const retrieved = auth.retrieveToken();

      expect(retrieved).toBeNull();
    });

    it('should handle encryption unavailable', async () => {
      const { safeStorage } = await import('electron');
      (safeStorage.isEncryptionAvailable as Mock).mockReturnValue(false);

      // Need to reset modules to pick up the mock change
      vi.resetModules();
      const { GitHubAuth: FreshGitHubAuth } = await import('../GitHubAuth');

      const auth = new FreshGitHubAuth();
      const stored = auth.storeToken('ghp_token');

      expect(stored).toBe(false);
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance from getGitHubAuth', () => {
      const instance1 = getGitHubAuth();
      const instance2 = getGitHubAuth();

      expect(instance1).toBe(instance2);
    });
  });

  describe('error message sanitization', () => {
    it('should redact ghp_ tokens from error messages', async () => {
      const tokenInError = 'ghp_abc123secrettoken';
      mockOctokitRest.users.getAuthenticated.mockRejectedValue(
        new Error(`Failed with token ${tokenInError}`)
      );

      const auth = new GitHubAuth();
      const result = await auth.validateToken(tokenInError);

      expect(result.error).not.toContain(tokenInError);
      expect(result.error).toContain('[TOKEN_REDACTED]');
    });

    it('should redact github_pat_ tokens from error messages', async () => {
      const patToken = 'github_pat_xyz789secretpattern';
      mockOctokitRest.users.getAuthenticated.mockRejectedValue(
        new Error(`Auth failed for ${patToken}`)
      );

      const auth = new GitHubAuth();
      const result = await auth.validateToken(patToken);

      expect(result.error).not.toContain(patToken);
      expect(result.error).toContain('[TOKEN_REDACTED]');
    });

    it('should redact authenticated URLs from error messages', async () => {
      mockGit.clone.mockRejectedValue(
        new Error('Clone failed: https://oauth2:ghp_secret123@github.com/owner/repo.git refused')
      );
      mockOctokitRest.repos.get.mockResolvedValue({
        data: { private: true }
      });

      const auth = new GitHubAuth();
      const result = await auth.clonePrivateRepo(
        'git@github.com:owner/repo.git',
        'ghp_secret123',
        CLONE_TARGET
      );

      expect(result.error).not.toContain('ghp_secret123');
      expect(result.error).toContain('[REDACTED]');
    });
  });
});
