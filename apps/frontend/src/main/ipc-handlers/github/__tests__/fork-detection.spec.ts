/**
 * Unit tests for fork detection functionality
 * Tests getGitHubConfig parsing of IS_FORK and GITHUB_PARENT_REPO,
 * normalizeRepoReference URL handling, and target repo selection
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn()
}));

// Mock child_process
vi.mock('child_process', () => ({
  execFileSync: vi.fn()
}));

// Mock cli-tool-manager
vi.mock('../../../cli-tool-manager', () => ({
  getToolPath: vi.fn().mockReturnValue('gh')
}));

// Mock env-utils
vi.mock('../../../env-utils', () => ({
  getAugmentedEnv: vi.fn().mockReturnValue(process.env)
}));

import { existsSync, readFileSync } from 'fs';
import { getGitHubConfig, normalizeRepoReference, getTargetRepo, githubFetchWithFallback } from '../utils';
import type { Project } from '../../../../shared/types';
import type { GitHubConfig } from '../types';

const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;

describe('Fork Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getGitHubConfig - Fork Detection Fields', () => {
    // Create a minimal mock project with only the fields needed by getGitHubConfig
    const createMockProject = (autoBuildPath = '.auto-claude'): Project => ({
      id: 'test-project',
      name: 'Test Project',
      path: '/test/project',
      autoBuildPath,
      createdAt: new Date(),
      updatedAt: new Date(),
      settings: {
        model: 'claude-sonnet-4-20250514',
        memoryBackend: 'file',
        linearSync: false,
        notifications: {
          onTaskComplete: false,
          onTaskFailed: false,
          onReviewNeeded: false,
          sound: false
        },
        graphitiMcpEnabled: false
      }
    });

    it('should parse IS_FORK=true correctly', () => {
      const project = createMockProject();
      const envPath = path.join(project.path, project.autoBuildPath!, '.env');

      mockExistsSync.mockImplementation((p: string) => p === envPath);
      mockReadFileSync.mockImplementation((p: string) => {
        if (p === envPath) {
          return `GITHUB_TOKEN=test-token
GITHUB_REPO=owner/repo
IS_FORK=true
GITHUB_PARENT_REPO=parent-owner/parent-repo`;
        }
        return '';
      });

      const config = getGitHubConfig(project);

      expect(config).not.toBeNull();
      expect(config?.isFork).toBe(true);
      expect(config?.parentRepo).toBe('parent-owner/parent-repo');
    });

    it('should parse IS_FORK=TRUE (uppercase) correctly', () => {
      const project = createMockProject();
      const envPath = path.join(project.path, project.autoBuildPath!, '.env');

      mockExistsSync.mockImplementation((p: string) => p === envPath);
      mockReadFileSync.mockImplementation((p: string) => {
        if (p === envPath) {
          return `GITHUB_TOKEN=test-token
GITHUB_REPO=owner/repo
IS_FORK=TRUE
GITHUB_PARENT_REPO=parent-owner/parent-repo`;
        }
        return '';
      });

      const config = getGitHubConfig(project);

      expect(config).not.toBeNull();
      expect(config?.isFork).toBe(true);
    });

    it('should treat IS_FORK=false as false', () => {
      const project = createMockProject();
      const envPath = path.join(project.path, project.autoBuildPath!, '.env');

      mockExistsSync.mockImplementation((p: string) => p === envPath);
      mockReadFileSync.mockImplementation((p: string) => {
        if (p === envPath) {
          return `GITHUB_TOKEN=test-token
GITHUB_REPO=owner/repo
IS_FORK=false`;
        }
        return '';
      });

      const config = getGitHubConfig(project);

      expect(config).not.toBeNull();
      expect(config?.isFork).toBe(false);
    });

    it('should treat mixed case IS_FORK values (other than "true" or "TRUE") as false', () => {
      const project = createMockProject();
      const envPath = path.join(project.path, project.autoBuildPath!, '.env');

      mockExistsSync.mockImplementation((p: string) => p === envPath);
      mockReadFileSync.mockImplementation((p: string) => {
        if (p === envPath) {
          return `GITHUB_TOKEN=test-token
GITHUB_REPO=owner/repo
IS_FORK=True`;
        }
        return '';
      });

      const config = getGitHubConfig(project);

      expect(config).not.toBeNull();
      expect(config?.isFork).toBe(false);
    });

    it('should treat missing IS_FORK as false', () => {
      const project = createMockProject();
      const envPath = path.join(project.path, project.autoBuildPath!, '.env');

      mockExistsSync.mockImplementation((p: string) => p === envPath);
      mockReadFileSync.mockImplementation((p: string) => {
        if (p === envPath) {
          return `GITHUB_TOKEN=test-token
GITHUB_REPO=owner/repo`;
        }
        return '';
      });

      const config = getGitHubConfig(project);

      expect(config).not.toBeNull();
      expect(config?.isFork).toBe(false);
      expect(config?.parentRepo).toBeUndefined();
    });

    it('should treat empty GITHUB_PARENT_REPO as undefined', () => {
      const project = createMockProject();
      const envPath = path.join(project.path, project.autoBuildPath!, '.env');

      mockExistsSync.mockImplementation((p: string) => p === envPath);
      mockReadFileSync.mockImplementation((p: string) => {
        if (p === envPath) {
          return `GITHUB_TOKEN=test-token
GITHUB_REPO=owner/repo
IS_FORK=true
GITHUB_PARENT_REPO=`;
        }
        return '';
      });

      const config = getGitHubConfig(project);

      expect(config).not.toBeNull();
      expect(config?.isFork).toBe(true);
      expect(config?.parentRepo).toBeUndefined();
    });

    it('should normalize GitHub URL in GITHUB_PARENT_REPO', () => {
      const project = createMockProject();
      const envPath = path.join(project.path, project.autoBuildPath!, '.env');

      mockExistsSync.mockImplementation((p: string) => p === envPath);
      mockReadFileSync.mockImplementation((p: string) => {
        if (p === envPath) {
          return `GITHUB_TOKEN=test-token
GITHUB_REPO=owner/repo
IS_FORK=true
GITHUB_PARENT_REPO=https://github.com/parent-owner/parent-repo`;
        }
        return '';
      });

      const config = getGitHubConfig(project);

      expect(config).not.toBeNull();
      expect(config?.parentRepo).toBe('parent-owner/parent-repo');
    });

    it('should normalize git@ URL in GITHUB_PARENT_REPO', () => {
      const project = createMockProject();
      const envPath = path.join(project.path, project.autoBuildPath!, '.env');

      mockExistsSync.mockImplementation((p: string) => p === envPath);
      mockReadFileSync.mockImplementation((p: string) => {
        if (p === envPath) {
          return `GITHUB_TOKEN=test-token
GITHUB_REPO=owner/repo
IS_FORK=true
GITHUB_PARENT_REPO=git@github.com:parent-owner/parent-repo.git`;
        }
        return '';
      });

      const config = getGitHubConfig(project);

      expect(config).not.toBeNull();
      expect(config?.parentRepo).toBe('parent-owner/parent-repo');
    });

    it('should handle quoted values in .env file', () => {
      const project = createMockProject();
      const envPath = path.join(project.path, project.autoBuildPath!, '.env');

      mockExistsSync.mockImplementation((p: string) => p === envPath);
      mockReadFileSync.mockImplementation((p: string) => {
        if (p === envPath) {
          return `GITHUB_TOKEN="test-token"
GITHUB_REPO="owner/repo"
IS_FORK="true"
GITHUB_PARENT_REPO="parent-owner/parent-repo"`;
        }
        return '';
      });

      const config = getGitHubConfig(project);

      expect(config).not.toBeNull();
      expect(config?.isFork).toBe(true);
      expect(config?.parentRepo).toBe('parent-owner/parent-repo');
    });

    it('should return null if project has no autoBuildPath', () => {
      // Cast to unknown then to Project to test the null autoBuildPath edge case
      // This simulates projects that might have an empty or null autoBuildPath
      const project = {
        id: 'test-project',
        name: 'Test Project',
        path: '/test/project',
        autoBuildPath: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {
          model: 'claude-sonnet-4-20250514',
          memoryBackend: 'file',
          linearSync: false,
          notifications: {
            onTaskComplete: false,
            onTaskFailed: false,
            onReviewNeeded: false,
            sound: false
          },
          graphitiMcpEnabled: false
        }
      } as unknown as Project;

      const config = getGitHubConfig(project);

      expect(config).toBeNull();
    });

    it('should return null if .env file does not exist', () => {
      const project = createMockProject();

      mockExistsSync.mockReturnValue(false);

      const config = getGitHubConfig(project);

      expect(config).toBeNull();
    });

    it('should return null if GITHUB_TOKEN is missing', () => {
      const project = createMockProject();
      const envPath = path.join(project.path, project.autoBuildPath!, '.env');

      mockExistsSync.mockImplementation((p: string) => p === envPath);
      mockReadFileSync.mockImplementation((p: string) => {
        if (p === envPath) {
          return `GITHUB_REPO=owner/repo
IS_FORK=true`;
        }
        return '';
      });

      const config = getGitHubConfig(project);

      expect(config).toBeNull();
    });

    it('should return null if GITHUB_REPO is missing', () => {
      const project = createMockProject();
      const envPath = path.join(project.path, project.autoBuildPath!, '.env');

      mockExistsSync.mockImplementation((p: string) => p === envPath);
      mockReadFileSync.mockImplementation((p: string) => {
        if (p === envPath) {
          return `GITHUB_TOKEN=test-token
IS_FORK=true`;
        }
        return '';
      });

      const config = getGitHubConfig(project);

      expect(config).toBeNull();
    });

    it('should invalidate GITHUB_PARENT_REPO that does not contain /', () => {
      const project = createMockProject();
      const envPath = path.join(project.path, project.autoBuildPath!, '.env');

      mockExistsSync.mockImplementation((p: string) => p === envPath);
      mockReadFileSync.mockImplementation((p: string) => {
        if (p === envPath) {
          return `GITHUB_TOKEN=test-token
GITHUB_REPO=owner/repo
IS_FORK=true
GITHUB_PARENT_REPO=invalid-repo-format`;
        }
        return '';
      });

      const config = getGitHubConfig(project);

      expect(config).not.toBeNull();
      expect(config?.isFork).toBe(true);
      expect(config?.parentRepo).toBeUndefined();
    });
  });

  describe('normalizeRepoReference', () => {
    it('should return owner/repo unchanged', () => {
      expect(normalizeRepoReference('owner/repo')).toBe('owner/repo');
    });

    it('should normalize https://github.com/owner/repo URL', () => {
      expect(normalizeRepoReference('https://github.com/owner/repo')).toBe('owner/repo');
    });

    it('should normalize https://github.com/owner/repo.git URL', () => {
      expect(normalizeRepoReference('https://github.com/owner/repo.git')).toBe('owner/repo');
    });

    it('should normalize http://github.com/owner/repo URL', () => {
      expect(normalizeRepoReference('http://github.com/owner/repo')).toBe('owner/repo');
    });

    it('should normalize git@github.com:owner/repo.git URL', () => {
      expect(normalizeRepoReference('git@github.com:owner/repo.git')).toBe('owner/repo');
    });

    it('should remove trailing .git from owner/repo.git', () => {
      expect(normalizeRepoReference('owner/repo.git')).toBe('owner/repo');
    });

    it('should return empty string for empty input', () => {
      expect(normalizeRepoReference('')).toBe('');
    });

    it('should trim whitespace', () => {
      expect(normalizeRepoReference('  owner/repo  ')).toBe('owner/repo');
    });
  });

  describe('getTargetRepo', () => {
    // Helper to create a GitHubConfig for testing
    const createConfig = (overrides: Partial<GitHubConfig> = {}): GitHubConfig => ({
      token: 'test-token',
      repo: 'fork-owner/fork-repo',
      isFork: false,
      parentRepo: undefined,
      ...overrides
    });

    describe('non-fork repositories', () => {
      it('should return the configured repo for issues', () => {
        const config = createConfig({ isFork: false });
        expect(getTargetRepo(config, 'issues')).toBe('fork-owner/fork-repo');
      });

      it('should return the configured repo for prs', () => {
        const config = createConfig({ isFork: false });
        expect(getTargetRepo(config, 'prs')).toBe('fork-owner/fork-repo');
      });

      it('should return the configured repo for code', () => {
        const config = createConfig({ isFork: false });
        expect(getTargetRepo(config, 'code')).toBe('fork-owner/fork-repo');
      });

      it('should return the configured repo even if parentRepo is set but isFork is false', () => {
        const config = createConfig({
          isFork: false,
          parentRepo: 'parent-owner/parent-repo'
        });
        expect(getTargetRepo(config, 'issues')).toBe('fork-owner/fork-repo');
      });
    });

    describe('fork repositories with parent configured', () => {
      it('should return parent repo for issues', () => {
        const config = createConfig({
          isFork: true,
          parentRepo: 'parent-owner/parent-repo'
        });
        expect(getTargetRepo(config, 'issues')).toBe('parent-owner/parent-repo');
      });

      it('should return parent repo for prs', () => {
        const config = createConfig({
          isFork: true,
          parentRepo: 'parent-owner/parent-repo'
        });
        expect(getTargetRepo(config, 'prs')).toBe('parent-owner/parent-repo');
      });

      it('should return fork repo for code operations', () => {
        const config = createConfig({
          isFork: true,
          parentRepo: 'parent-owner/parent-repo'
        });
        expect(getTargetRepo(config, 'code')).toBe('fork-owner/fork-repo');
      });
    });

    describe('fork repositories without parent configured', () => {
      it('should fall back to fork repo for issues when no parent is set', () => {
        const config = createConfig({
          isFork: true,
          parentRepo: undefined
        });
        expect(getTargetRepo(config, 'issues')).toBe('fork-owner/fork-repo');
      });

      it('should fall back to fork repo for prs when no parent is set', () => {
        const config = createConfig({
          isFork: true,
          parentRepo: undefined
        });
        expect(getTargetRepo(config, 'prs')).toBe('fork-owner/fork-repo');
      });

      it('should return fork repo for code operations when no parent is set', () => {
        const config = createConfig({
          isFork: true,
          parentRepo: undefined
        });
        expect(getTargetRepo(config, 'code')).toBe('fork-owner/fork-repo');
      });
    });

    describe('edge cases', () => {
      it('should handle undefined isFork as false', () => {
        const config: GitHubConfig = {
          token: 'test-token',
          repo: 'fork-owner/fork-repo'
          // isFork is undefined
        };
        expect(getTargetRepo(config, 'issues')).toBe('fork-owner/fork-repo');
      });

      it('should handle empty string parentRepo as falsy', () => {
        const config = createConfig({
          isFork: true,
          parentRepo: '' as unknown as undefined // Edge case: empty string
        });
        expect(getTargetRepo(config, 'issues')).toBe('fork-owner/fork-repo');
      });
    });
  });

  describe('githubFetchWithFallback', () => {
    // Helper to create a GitHubConfig for testing
    const createConfig = (overrides: Partial<GitHubConfig> = {}): GitHubConfig => ({
      token: 'test-token',
      repo: 'fork-owner/fork-repo',
      isFork: false,
      parentRepo: undefined,
      ...overrides
    });

    // Mock fetch
    const mockFetch = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('successful requests without fallback', () => {
      it('should return data with usedFallback=false when primary request succeeds', async () => {
        const mockData = { id: 1, title: 'Test Issue' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockData)
        });

        const config = createConfig({
          isFork: true,
          parentRepo: 'parent-owner/parent-repo'
        });

        const result = await githubFetchWithFallback(
          config,
          (repo) => `/repos/${repo}/issues`,
          'issues'
        );

        expect(result.data).toEqual(mockData);
        expect(result.usedFallback).toBe(false);
        expect(result.repo).toBe('parent-owner/parent-repo');
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.github.com/repos/parent-owner/parent-repo/issues',
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': 'Bearer test-token'
            })
          })
        );
      });

      it('should use fork repo for non-fork repositories', async () => {
        const mockData = { id: 1, title: 'Test Issue' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockData)
        });

        const config = createConfig({ isFork: false });

        const result = await githubFetchWithFallback(
          config,
          (repo) => `/repos/${repo}/issues`,
          'issues'
        );

        expect(result.data).toEqual(mockData);
        expect(result.usedFallback).toBe(false);
        expect(result.repo).toBe('fork-owner/fork-repo');
      });

      it('should use fork repo for code operations even when fork is configured', async () => {
        const mockData = { content: 'file contents' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockData)
        });

        const config = createConfig({
          isFork: true,
          parentRepo: 'parent-owner/parent-repo'
        });

        const result = await githubFetchWithFallback(
          config,
          (repo) => `/repos/${repo}/contents/README.md`,
          'code'
        );

        expect(result.data).toEqual(mockData);
        expect(result.usedFallback).toBe(false);
        expect(result.repo).toBe('fork-owner/fork-repo');
      });
    });

    describe('fallback on 403 errors', () => {
      it('should fall back to fork repo when parent returns 403', async () => {
        const mockForkData = { id: 2, title: 'Fork Issue' };

        // First call to parent fails with 403
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          text: () => Promise.resolve('Access denied')
        });

        // Second call to fork succeeds
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockForkData)
        });

        const config = createConfig({
          isFork: true,
          parentRepo: 'parent-owner/parent-repo'
        });

        const result = await githubFetchWithFallback(
          config,
          (repo) => `/repos/${repo}/issues`,
          'issues'
        );

        expect(result.data).toEqual(mockForkData);
        expect(result.usedFallback).toBe(true);
        expect(result.repo).toBe('fork-owner/fork-repo');
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    describe('fallback on 404 errors', () => {
      it('should fall back to fork repo when parent returns 404', async () => {
        const mockForkData = { id: 3, title: 'Fork PR' };

        // First call to parent fails with 404
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: () => Promise.resolve('Not found')
        });

        // Second call to fork succeeds
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockForkData)
        });

        const config = createConfig({
          isFork: true,
          parentRepo: 'parent-owner/parent-repo'
        });

        const result = await githubFetchWithFallback(
          config,
          (repo) => `/repos/${repo}/pulls`,
          'prs'
        );

        expect(result.data).toEqual(mockForkData);
        expect(result.usedFallback).toBe(true);
        expect(result.repo).toBe('fork-owner/fork-repo');
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    describe('no fallback scenarios', () => {
      it('should NOT fall back for non-fork repositories', async () => {
        // Request fails with 404
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: () => Promise.resolve('Not found')
        });

        const config = createConfig({ isFork: false });

        await expect(
          githubFetchWithFallback(
            config,
            (repo) => `/repos/${repo}/issues`,
            'issues'
          )
        ).rejects.toThrow('404');

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it('should NOT fall back for forks without parent repo configured', async () => {
        // Request fails with 403
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          text: () => Promise.resolve('Access denied')
        });

        const config = createConfig({
          isFork: true,
          parentRepo: undefined
        });

        await expect(
          githubFetchWithFallback(
            config,
            (repo) => `/repos/${repo}/issues`,
            'issues'
          )
        ).rejects.toThrow('403');

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it('should NOT fall back for code operations (already using fork)', async () => {
        // Request fails with 404
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: () => Promise.resolve('Not found')
        });

        const config = createConfig({
          isFork: true,
          parentRepo: 'parent-owner/parent-repo'
        });

        await expect(
          githubFetchWithFallback(
            config,
            (repo) => `/repos/${repo}/contents/file.txt`,
            'code'
          )
        ).rejects.toThrow('404');

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it('should NOT fall back for 500 errors (server errors)', async () => {
        // Request fails with 500
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: () => Promise.resolve('Server error')
        });

        const config = createConfig({
          isFork: true,
          parentRepo: 'parent-owner/parent-repo'
        });

        await expect(
          githubFetchWithFallback(
            config,
            (repo) => `/repos/${repo}/issues`,
            'issues'
          )
        ).rejects.toThrow('500');

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it('should NOT fall back for 401 errors (authentication)', async () => {
        // Request fails with 401
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          text: () => Promise.resolve('Bad credentials')
        });

        const config = createConfig({
          isFork: true,
          parentRepo: 'parent-owner/parent-repo'
        });

        await expect(
          githubFetchWithFallback(
            config,
            (repo) => `/repos/${repo}/issues`,
            'issues'
          )
        ).rejects.toThrow('401');

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    describe('fallback failure handling', () => {
      it('should throw error if fallback also fails', async () => {
        // First call to parent fails with 403
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          text: () => Promise.resolve('Access denied to parent')
        });

        // Second call to fork also fails
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: () => Promise.resolve('Server error on fork')
        });

        const config = createConfig({
          isFork: true,
          parentRepo: 'parent-owner/parent-repo'
        });

        await expect(
          githubFetchWithFallback(
            config,
            (repo) => `/repos/${repo}/issues`,
            'issues'
          )
        ).rejects.toThrow('500');

        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    describe('request options passthrough', () => {
      it('should pass request options to both primary and fallback requests', async () => {
        const mockForkData = { id: 1, title: 'Test' };

        // First call fails
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          text: () => Promise.resolve('Access denied')
        });

        // Second call succeeds
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockForkData)
        });

        const config = createConfig({
          isFork: true,
          parentRepo: 'parent-owner/parent-repo'
        });

        const customHeaders = { 'X-Custom-Header': 'test-value' };

        await githubFetchWithFallback(
          config,
          (repo) => `/repos/${repo}/issues`,
          'issues',
          { headers: customHeaders }
        );

        // Both calls should include the custom header
        expect(mockFetch).toHaveBeenNthCalledWith(
          1,
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Custom-Header': 'test-value'
            })
          })
        );
        expect(mockFetch).toHaveBeenNthCalledWith(
          2,
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Custom-Header': 'test-value'
            })
          })
        );
      });
    });
  });
});
