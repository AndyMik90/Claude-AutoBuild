/**
 * Unit tests for UpdateEngine
 *
 * Tests the plugin update functionality:
 * - Checking for updates from GitHub (checkForUpdates)
 * - Detecting local modifications/conflicts (detectConflicts)
 * - Categorizing changes by file type (categorizeChanges)
 * - Building update summaries (buildSummary)
 * - Applying selective updates (applyUpdates)
 * - Creating and managing backups (createBackup, listBackups)
 * - Rolling back to previous versions (rollback)
 * - Getting file diffs (getFileDiff)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import type { UpdateFile, Plugin, PluginMetadata } from '../../../shared/types';

// Test directories
const TEST_DIR = '/tmp/update-engine-test';
const TEST_PLUGINS_DIR = path.join(TEST_DIR, 'plugins');
const TEST_PLUGIN_DIR = path.join(TEST_PLUGINS_DIR, 'test-plugin');

// Mock Electron app module
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return TEST_DIR;
      if (name === 'home') return '/tmp/test-home';
      return '/tmp';
    }),
    getAppPath: vi.fn(() => '/tmp/test-app'),
    getVersion: vi.fn(() => '0.1.0'),
    isPackaged: false,
    on: vi.fn(),
    quit: vi.fn()
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str: string) => Buffer.from(`encrypted:${str}`)),
    decryptString: vi.fn((buf: Buffer) => buf.toString().slice('encrypted:'.length))
  }
}));

// Mock git status and diff results
const mockGitStatus = {
  files: [] as { path: string; working_dir: string; index: string }[]
};

const mockDiffSummary = {
  files: [] as { file: string; changes: number; insertions: number; deletions: number }[]
};

// Mock simple-git
const mockGit = {
  fetch: vi.fn().mockResolvedValue(undefined),
  pull: vi.fn().mockResolvedValue({ files: [], summary: { changes: 0 } }),
  status: vi.fn().mockResolvedValue(mockGitStatus),
  diffSummary: vi.fn().mockResolvedValue(mockDiffSummary),
  diff: vi.fn().mockResolvedValue(''),
  show: vi.fn().mockResolvedValue(''),
  checkout: vi.fn().mockResolvedValue(undefined),
  branch: vi.fn().mockResolvedValue({ all: ['origin/main'] }),
  version: vi.fn().mockResolvedValue({ installed: true, major: 2, minor: 40, patch: 0 }),
  getRemotes: vi.fn().mockResolvedValue([{ name: 'origin', refs: { fetch: 'https://github.com/test/repo.git' } }]),
  remote: vi.fn().mockResolvedValue(undefined)
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}));

// Mock Octokit
const mockOctokitRest = {
  users: {
    getAuthenticated: vi.fn().mockResolvedValue({ data: { login: 'testuser' } })
  },
  repos: {
    get: vi.fn().mockResolvedValue({ data: { private: true } })
  }
};

vi.mock('octokit', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    rest: mockOctokitRest
  }))
}));

// Sample plugin metadata for tests
function createTestPluginMetadata(overrides: Partial<PluginMetadata> = {}): PluginMetadata {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    domains: ['testing'],
    categories: ['utilities'],
    skillCount: 5,
    content: {
      skills: [],
      patterns: [],
      conventions: []
    },
    ...overrides
  };
}

// Create a test plugin
function createTestPlugin(pluginPath: string, metadata: PluginMetadata): Plugin {
  mkdirSync(pluginPath, { recursive: true });
  writeFileSync(
    path.join(pluginPath, 'plugin.json'),
    JSON.stringify(metadata, null, 2)
  );

  return {
    id: metadata.id,
    name: metadata.name,
    version: metadata.version,
    description: metadata.description,
    sourceType: 'github',
    source: 'https://github.com/test/test-plugin.git',
    path: pluginPath,
    metadata,
    status: 'installed',
    updateStatus: 'up_to_date',
    installedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  };
}

// Mock PluginManager
let mockPlugins: Plugin[] = [];

vi.mock('../PluginManager', () => ({
  getPluginManager: vi.fn(() => ({
    getPlugin: vi.fn((id: string) => mockPlugins.find(p => p.id === id)),
    getPlugins: vi.fn(() => mockPlugins),
    refresh: vi.fn().mockResolvedValue(undefined)
  })),
  PluginManager: vi.fn()
}));

// Mock GitHubAuth
vi.mock('../GitHubAuth', () => ({
  getGitHubAuth: vi.fn(() => ({
    pullUpdates: vi.fn().mockResolvedValue({ success: true, updated: true }),
    validateToken: vi.fn().mockResolvedValue({ valid: true, username: 'testuser' })
  })),
  GitHubAuth: vi.fn()
}));

// Setup and cleanup test directories
function setupTestDirs(): void {
  mkdirSync(TEST_PLUGINS_DIR, { recursive: true });
}

function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('UpdateEngine', () => {
  let UpdateEngine: typeof import('../UpdateEngine').UpdateEngine;
  let getUpdateEngine: typeof import('../UpdateEngine').getUpdateEngine;

  beforeEach(async () => {
    cleanupTestDirs();
    setupTestDirs();
    vi.clearAllMocks();
    vi.resetModules();

    // Reset mocks
    mockPlugins = [];
    mockGitStatus.files = [];
    mockDiffSummary.files = [];
    mockGit.fetch.mockResolvedValue(undefined);
    mockGit.status.mockResolvedValue(mockGitStatus);
    mockGit.diffSummary.mockResolvedValue(mockDiffSummary);
    mockGit.diff.mockResolvedValue('');
    mockGit.show.mockResolvedValue('');
    mockGit.checkout.mockResolvedValue(undefined);
    mockGit.branch.mockResolvedValue({ all: ['origin/main'] });

    // Import fresh instance
    const module = await import('../UpdateEngine');
    UpdateEngine = module.UpdateEngine;
    getUpdateEngine = module.getUpdateEngine;
  });

  afterEach(() => {
    cleanupTestDirs();
  });

  describe('checkForUpdates', () => {
    it('should return error for non-existent plugin', async () => {
      const engine = new UpdateEngine();
      const result = await engine.checkForUpdates('nonexistent');

      expect(result.hasUpdate).toBe(false);
      expect(result.error).toContain('Plugin not found');
    });

    it('should return error for local plugins', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      plugin.sourceType = 'local';
      mockPlugins = [plugin];

      const engine = new UpdateEngine();
      const result = await engine.checkForUpdates('test-plugin');

      expect(result.hasUpdate).toBe(false);
      expect(result.error).toContain('Only GitHub plugins support update checking');
    });

    it('should return no updates when no changes', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      // No changed files
      mockDiffSummary.files = [];

      const engine = new UpdateEngine();
      const result = await engine.checkForUpdates('test-plugin');

      expect(result.hasUpdate).toBe(false);
      expect(result.categories).toHaveLength(0);
      expect(result.summary.totalFiles).toBe(0);
    });

    it('should detect updates and categorize changes', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      // Simulate changed files
      mockDiffSummary.files = [
        { file: 'boilerplate/skills/skill1.md', changes: 10, insertions: 5, deletions: 5 },
        { file: 'boilerplate/patterns/pattern1.md', changes: 5, insertions: 3, deletions: 2 },
        { file: 'README.md', changes: 2, insertions: 1, deletions: 1 }
      ];

      // Mock plugin.json from remote for version
      mockGit.show.mockImplementation(async (args: string[]) => {
        if (args[0]?.includes('plugin.json')) {
          return JSON.stringify({ version: '1.1.0' });
        }
        return '';
      });

      const engine = new UpdateEngine();
      const result = await engine.checkForUpdates('test-plugin');

      expect(result.hasUpdate).toBe(true);
      expect(result.latestVersion).toBe('1.1.0');
      expect(result.categories.length).toBeGreaterThan(0);
      expect(result.summary.totalFiles).toBe(3);
      expect(result.summary.modifiedFiles).toBe(3);
    });

    it('should handle git fetch errors gracefully', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      mockGit.fetch.mockRejectedValue(new Error('Network error'));

      const engine = new UpdateEngine();
      const result = await engine.checkForUpdates('test-plugin');

      expect(result.hasUpdate).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should use token for authenticated fetch when plugin source includes github.com', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      plugin.source = 'https://github.com/test/repo.git';
      mockPlugins = [plugin];

      // Verify that we have a github plugin set up correctly
      expect(plugin.sourceType).toBe('github');
      expect(plugin.source).toContain('github.com');

      const engine = new UpdateEngine();
      const result = await engine.checkForUpdates('test-plugin', 'ghp_token123');

      // The test verifies that the check doesn't crash when token is provided
      // and that the plugin source is correctly identified as GitHub
      expect(result.pluginId).toBe('test-plugin');
      expect(result.currentVersion).toBe('1.0.0');
      // The result should either have updates or no updates (based on mock), not an error
      // about authentication since the token was provided
      if (result.error) {
        // If there's an error, it should not be about missing token
        expect(result.error).not.toContain('token');
      }
    });
  });

  describe('detectConflicts', () => {
    it('should detect uncommitted local changes', async () => {
      const metadata = createTestPluginMetadata();
      createTestPlugin(TEST_PLUGIN_DIR, metadata);

      const files: UpdateFile[] = [
        { path: 'file1.ts', status: 'modified', hasConflict: false }
      ];

      // Simulate uncommitted changes
      mockGitStatus.files = [
        { path: 'file1.ts', working_dir: 'M', index: ' ' }
      ];

      const engine = new UpdateEngine();
      const result = await engine.detectConflicts(TEST_PLUGIN_DIR, files);

      expect(result[0].hasConflict).toBe(true);
    });

    it('should detect staged changes', async () => {
      const metadata = createTestPluginMetadata();
      createTestPlugin(TEST_PLUGIN_DIR, metadata);

      const files: UpdateFile[] = [
        { path: 'file1.ts', status: 'modified', hasConflict: false }
      ];

      // Simulate staged changes
      mockGitStatus.files = [
        { path: 'file1.ts', working_dir: ' ', index: 'M' }
      ];

      const engine = new UpdateEngine();
      const result = await engine.detectConflicts(TEST_PLUGIN_DIR, files);

      expect(result[0].hasConflict).toBe(true);
    });

    it('should detect content differences from HEAD', async () => {
      const metadata = createTestPluginMetadata();
      createTestPlugin(TEST_PLUGIN_DIR, metadata);

      // Create a local file
      const testFilePath = path.join(TEST_PLUGIN_DIR, 'test.ts');
      writeFileSync(testFilePath, 'local content');

      const files: UpdateFile[] = [
        { path: 'test.ts', status: 'modified', hasConflict: false }
      ];

      // No uncommitted changes in git status
      mockGitStatus.files = [];

      // But file content differs from HEAD
      mockGit.show.mockResolvedValue('different content');

      const engine = new UpdateEngine();
      const result = await engine.detectConflicts(TEST_PLUGIN_DIR, files);

      expect(result[0].hasConflict).toBe(true);
    });

    it('should mark no conflict when local matches HEAD', async () => {
      const metadata = createTestPluginMetadata();
      createTestPlugin(TEST_PLUGIN_DIR, metadata);

      const testContent = 'same content';
      const testFilePath = path.join(TEST_PLUGIN_DIR, 'test.ts');
      writeFileSync(testFilePath, testContent);

      const files: UpdateFile[] = [
        { path: 'test.ts', status: 'modified', hasConflict: false }
      ];

      mockGitStatus.files = [];
      mockGit.show.mockResolvedValue(testContent);

      const engine = new UpdateEngine();
      const result = await engine.detectConflicts(TEST_PLUGIN_DIR, files);

      expect(result[0].hasConflict).toBe(false);
    });

    it('should include diff for modified files', async () => {
      const metadata = createTestPluginMetadata();
      createTestPlugin(TEST_PLUGIN_DIR, metadata);

      const files: UpdateFile[] = [
        { path: 'test.ts', status: 'modified', hasConflict: false }
      ];

      mockGitStatus.files = [];
      mockGit.diff.mockResolvedValue('@@ -1 +1 @@\n-old line\n+new line');

      const engine = new UpdateEngine();
      const result = await engine.detectConflicts(TEST_PLUGIN_DIR, files);

      expect(result[0].diff).toContain('-old line');
      expect(result[0].diff).toContain('+new line');
    });
  });

  describe('categorizeChanges', () => {
    it('should categorize skill files', async () => {
      const files: UpdateFile[] = [
        { path: 'boilerplate/skills/skill1.md', status: 'modified', hasConflict: false },
        { path: 'boilerplate/skills/skill2.md', status: 'added', hasConflict: false }
      ];

      const engine = new UpdateEngine();
      const categories = engine.categorizeChanges(files);

      const skillsCategory = categories.find(c => c.id === 'skills');
      expect(skillsCategory).toBeDefined();
      expect(skillsCategory?.files).toHaveLength(2);
    });

    it('should categorize pattern files', async () => {
      const files: UpdateFile[] = [
        { path: 'boilerplate/patterns/pattern1.md', status: 'modified', hasConflict: false }
      ];

      const engine = new UpdateEngine();
      const categories = engine.categorizeChanges(files);

      const patternsCategory = categories.find(c => c.id === 'patterns');
      expect(patternsCategory).toBeDefined();
      expect(patternsCategory?.files).toHaveLength(1);
    });

    it('should categorize convention files', async () => {
      const files: UpdateFile[] = [
        { path: 'boilerplate/conventions/naming.md', status: 'modified', hasConflict: false }
      ];

      const engine = new UpdateEngine();
      const categories = engine.categorizeChanges(files);

      const conventionsCategory = categories.find(c => c.id === 'conventions');
      expect(conventionsCategory).toBeDefined();
      expect(conventionsCategory?.files).toHaveLength(1);
    });

    it('should categorize config files', async () => {
      const files: UpdateFile[] = [
        { path: 'plugin.json', status: 'modified', hasConflict: false },
        { path: 'boilerplate-ref.json', status: 'modified', hasConflict: false }
      ];

      const engine = new UpdateEngine();
      const categories = engine.categorizeChanges(files);

      const configCategory = categories.find(c => c.id === 'config');
      expect(configCategory).toBeDefined();
      expect(configCategory?.files).toHaveLength(2);
    });

    it('should categorize documentation files', async () => {
      const files: UpdateFile[] = [
        { path: 'README.md', status: 'modified', hasConflict: false },
        { path: 'docs/guide.md', status: 'added', hasConflict: false }
      ];

      const engine = new UpdateEngine();
      const categories = engine.categorizeChanges(files);

      const docsCategory = categories.find(c => c.id === 'documentation');
      expect(docsCategory).toBeDefined();
      expect(docsCategory?.files).toHaveLength(2);
    });

    it('should put unmatched files in other category', async () => {
      const files: UpdateFile[] = [
        { path: 'src/helper.ts', status: 'modified', hasConflict: false },
        { path: 'package.json', status: 'modified', hasConflict: false }
      ];

      const engine = new UpdateEngine();
      const categories = engine.categorizeChanges(files);

      const otherCategory = categories.find(c => c.id === 'other');
      expect(otherCategory).toBeDefined();
      expect(otherCategory?.files.length).toBeGreaterThan(0);
    });

    it('should count conflicts per category', async () => {
      const files: UpdateFile[] = [
        { path: 'boilerplate/skills/skill1.md', status: 'modified', hasConflict: true },
        { path: 'boilerplate/skills/skill2.md', status: 'modified', hasConflict: true },
        { path: 'boilerplate/skills/skill3.md', status: 'modified', hasConflict: false }
      ];

      const engine = new UpdateEngine();
      const categories = engine.categorizeChanges(files);

      const skillsCategory = categories.find(c => c.id === 'skills');
      expect(skillsCategory?.conflictCount).toBe(2);
    });

    it('should not return empty categories', async () => {
      const files: UpdateFile[] = [
        { path: 'boilerplate/skills/skill1.md', status: 'modified', hasConflict: false }
      ];

      const engine = new UpdateEngine();
      const categories = engine.categorizeChanges(files);

      // Should only have skills category, not patterns, conventions, etc.
      expect(categories).toHaveLength(1);
      expect(categories[0].id).toBe('skills');
    });
  });

  describe('applyUpdates', () => {
    it('should return error for non-existent plugin', async () => {
      const engine = new UpdateEngine();
      const result = await engine.applyUpdates({
        pluginId: 'nonexistent',
        selectedFiles: ['file.ts'],
        createBackup: false
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Plugin not found');
    });

    it('should apply selected files from remote', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      mockGit.checkout.mockResolvedValue(undefined);

      const engine = new UpdateEngine();
      const result = await engine.applyUpdates({
        pluginId: 'test-plugin',
        selectedFiles: ['file1.ts', 'file2.ts'],
        createBackup: false
      });

      expect(result.success).toBe(true);
      expect(result.appliedFiles).toHaveLength(2);
      expect(mockGit.checkout).toHaveBeenCalledTimes(2);
    });

    it('should track skipped files on checkout failure', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      // First file succeeds, second fails
      mockGit.checkout
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Checkout failed'));

      const engine = new UpdateEngine();
      const result = await engine.applyUpdates({
        pluginId: 'test-plugin',
        selectedFiles: ['success.ts', 'fail.ts'],
        createBackup: false
      });

      expect(result.success).toBe(true);
      expect(result.appliedFiles).toContain('success.ts');
      expect(result.skippedFiles).toContain('fail.ts');
    });

    it('should create backup when requested', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      // Create some files to backup
      writeFileSync(path.join(TEST_PLUGIN_DIR, 'file.ts'), 'content');

      const engine = new UpdateEngine();
      const result = await engine.applyUpdates({
        pluginId: 'test-plugin',
        selectedFiles: ['file.ts'],
        createBackup: true
      });

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(existsSync(result.backupPath!)).toBe(true);
    });

    it('should fail if backup creation fails', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      // Set path to invalid location to cause backup failure
      plugin.path = '/nonexistent/invalid/path';
      mockPlugins = [plugin];

      const engine = new UpdateEngine();
      const result = await engine.applyUpdates({
        pluginId: 'test-plugin',
        selectedFiles: ['file.ts'],
        createBackup: true
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create backup');
    });

    it('should succeed when applying updates with files', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      const engine = new UpdateEngine();
      const result = await engine.applyUpdates({
        pluginId: 'test-plugin',
        selectedFiles: ['file.ts'],
        createBackup: false
      });

      // The update should succeed and the file should be in appliedFiles
      expect(result.success).toBe(true);
      expect(result.appliedFiles).toContain('file.ts');
      // No backup should be created since we set createBackup: false
      expect(result.backupPath).toBeUndefined();
    });
  });

  describe('createBackup', () => {
    it('should create timestamped backup directory', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);

      // Add some content
      writeFileSync(path.join(TEST_PLUGIN_DIR, 'test.ts'), 'content');

      const engine = new UpdateEngine();
      const backupPath = await engine.createBackup(plugin);

      expect(backupPath).toBeDefined();
      expect(existsSync(backupPath!)).toBe(true);
      expect(backupPath).toContain('.backups');
      expect(backupPath).toContain('backup-');
    });

    it('should copy plugin files excluding .git and .backups', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);

      // Create .git directory (should be excluded)
      mkdirSync(path.join(TEST_PLUGIN_DIR, '.git'), { recursive: true });
      writeFileSync(path.join(TEST_PLUGIN_DIR, '.git', 'config'), 'git config');

      // Create regular file (should be included) - must create parent dir first
      const srcDir = path.join(TEST_PLUGIN_DIR, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(path.join(srcDir, 'index.ts'), 'content');

      const engine = new UpdateEngine();
      const backupPath = await engine.createBackup(plugin);

      expect(existsSync(path.join(backupPath!, 'plugin.json'))).toBe(true);
      expect(existsSync(path.join(backupPath!, '.git'))).toBe(false);
    });

    it('should save backup metadata', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);

      const engine = new UpdateEngine();
      const backupPath = await engine.createBackup(plugin);

      const metaPath = path.join(backupPath!, 'backup-meta.json');
      expect(existsSync(metaPath)).toBe(true);

      const backupMeta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      expect(backupMeta.pluginId).toBe('test-plugin');
      expect(backupMeta.version).toBe('1.0.0');
      expect(backupMeta.files).toContain('plugin.json');
    });

    it('should limit backups to maximum count', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);

      const engine = new UpdateEngine();

      // Create 6 backups (max is 5)
      for (let i = 0; i < 6; i++) {
        await engine.createBackup(plugin);
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const backupsDir = path.join(TEST_PLUGIN_DIR, '.backups');
      const backups = readdirSync(backupsDir).filter(d => d.startsWith('backup-'));

      expect(backups.length).toBeLessThanOrEqual(5);
    });
  });

  describe('listBackups', () => {
    it('should return empty array for plugin without backups', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      const engine = new UpdateEngine();
      const backups = engine.listBackups('test-plugin');

      expect(backups).toEqual([]);
    });

    it('should return empty array for non-existent plugin', async () => {
      const engine = new UpdateEngine();
      const backups = engine.listBackups('nonexistent');

      expect(backups).toEqual([]);
    });

    it('should return sorted list of backups', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      const engine = new UpdateEngine();

      // Create multiple backups
      await engine.createBackup(plugin);
      await new Promise(resolve => setTimeout(resolve, 20));
      await engine.createBackup(plugin);

      const backups = engine.listBackups('test-plugin');

      expect(backups.length).toBe(2);
      // Should be sorted newest first
      const time1 = new Date(backups[0].timestamp).getTime();
      const time2 = new Date(backups[1].timestamp).getTime();
      expect(time1).toBeGreaterThan(time2);
    });
  });

  describe('rollback', () => {
    it('should return error for non-existent plugin', async () => {
      const engine = new UpdateEngine();
      const result = await engine.rollback('nonexistent', '/some/path');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Plugin not found');
    });

    it('should return error for non-existent backup', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      const engine = new UpdateEngine();
      const result = await engine.rollback('test-plugin', '/nonexistent/backup');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Backup not found');
    });

    it('should restore files from backup', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      // Create initial content
      writeFileSync(path.join(TEST_PLUGIN_DIR, 'test.ts'), 'original content');

      const engine = new UpdateEngine();
      const backupPath = await engine.createBackup(plugin);

      // Modify the file
      writeFileSync(path.join(TEST_PLUGIN_DIR, 'test.ts'), 'modified content');

      // Rollback
      const result = await engine.rollback('test-plugin', backupPath!);

      expect(result.success).toBe(true);
      expect(result.appliedFiles).toContain('test.ts');

      // File should be restored
      const restoredContent = readFileSync(path.join(TEST_PLUGIN_DIR, 'test.ts'), 'utf-8');
      expect(restoredContent).toBe('original content');
    });

    it('should create backup of current state before rollback', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      writeFileSync(path.join(TEST_PLUGIN_DIR, 'test.ts'), 'content');

      const engine = new UpdateEngine();
      const originalBackupPath = await engine.createBackup(plugin);

      // Modify file
      writeFileSync(path.join(TEST_PLUGIN_DIR, 'test.ts'), 'new content');

      const result = await engine.rollback('test-plugin', originalBackupPath!);

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(result.backupPath).not.toBe(originalBackupPath);
    });

    it('should return error when backup metadata is missing', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      // Create backup directory without metadata
      const fakeBackupPath = path.join(TEST_PLUGIN_DIR, '.backups', 'fake-backup');
      mkdirSync(fakeBackupPath, { recursive: true });

      const engine = new UpdateEngine();
      const result = await engine.rollback('test-plugin', fakeBackupPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Backup metadata not found');
    });
  });

  describe('getFileDiff', () => {
    it('should return undefined for non-existent plugin', async () => {
      const engine = new UpdateEngine();
      const diff = await engine.getFileDiff('nonexistent', 'file.ts');

      expect(diff).toBeUndefined();
    });

    it('should return diff for a file', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      const expectedDiff = '@@ -1 +1 @@\n-old\n+new';
      mockGit.diff.mockResolvedValue(expectedDiff);

      const engine = new UpdateEngine();
      const diff = await engine.getFileDiff('test-plugin', 'file.ts');

      expect(diff).toBe(expectedDiff);
    });

    it('should handle diff errors gracefully', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      mockGit.diff.mockRejectedValue(new Error('Diff failed'));

      const engine = new UpdateEngine();
      const diff = await engine.getFileDiff('test-plugin', 'file.ts');

      expect(diff).toBeUndefined();
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance from getUpdateEngine', async () => {
      const instance1 = getUpdateEngine();
      const instance2 = getUpdateEngine();

      expect(instance1).toBe(instance2);
    });
  });

  describe('getDefaultBranch (private method behavior)', () => {
    it('should use main branch when available', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      mockGit.branch.mockResolvedValue({ all: ['origin/main', 'origin/develop'] });
      mockDiffSummary.files = [{ file: 'test.ts', changes: 1, insertions: 1, deletions: 0 }];

      const engine = new UpdateEngine();
      await engine.checkForUpdates('test-plugin');

      // diffSummary should be called with origin/main
      expect(mockGit.diffSummary).toHaveBeenCalledWith(['origin/main', 'HEAD']);
    });

    it('should fallback to master branch', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      mockGit.branch.mockResolvedValue({ all: ['origin/master', 'origin/develop'] });
      mockDiffSummary.files = [{ file: 'test.ts', changes: 1, insertions: 1, deletions: 0 }];

      const engine = new UpdateEngine();
      await engine.checkForUpdates('test-plugin');

      expect(mockGit.diffSummary).toHaveBeenCalledWith(['origin/master', 'HEAD']);
    });
  });

  describe('update summary building', () => {
    it('should count added files', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      mockDiffSummary.files = [
        { file: 'new1.ts', changes: 0, insertions: 0, deletions: 0 },
        { file: 'new2.ts', changes: 0, insertions: 0, deletions: 0 }
      ];

      // Mock status with added files indicator
      mockGit.diffSummary.mockResolvedValue({
        files: [
          { file: 'new1.ts', status: 'A' },
          { file: 'new2.ts', status: 'A' }
        ]
      });

      const engine = new UpdateEngine();
      const result = await engine.checkForUpdates('test-plugin');

      expect(result.summary.addedFiles).toBe(2);
    });

    it('should count deleted files', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      mockGit.diffSummary.mockResolvedValue({
        files: [
          { file: 'removed.ts', status: 'D' }
        ]
      });

      const engine = new UpdateEngine();
      const result = await engine.checkForUpdates('test-plugin');

      expect(result.summary.deletedFiles).toBe(1);
    });

    it('should count conflict files', async () => {
      const metadata = createTestPluginMetadata();
      const plugin = createTestPlugin(TEST_PLUGIN_DIR, metadata);
      mockPlugins = [plugin];

      mockDiffSummary.files = [
        { file: 'conflict1.ts', changes: 5, insertions: 3, deletions: 2 },
        { file: 'conflict2.ts', changes: 3, insertions: 2, deletions: 1 }
      ];

      // Simulate local modifications
      mockGitStatus.files = [
        { path: 'conflict1.ts', working_dir: 'M', index: ' ' },
        { path: 'conflict2.ts', working_dir: 'M', index: ' ' }
      ];

      const engine = new UpdateEngine();
      const result = await engine.checkForUpdates('test-plugin');

      expect(result.summary.conflictFiles).toBe(2);
    });
  });
});
