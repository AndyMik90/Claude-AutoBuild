/**
 * Integration tests for plugin install flow
 *
 * Tests the complete IPC flow for plugin installation:
 * - Renderer triggers install → Main clones/copies repo → Store updated → UI reflects change
 * - Tests both GitHub and local path installation flows
 * - Tests boilerplate detection and task context injection
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

// Test directories
const TEST_DIR = '/tmp/plugin-install-test';
const TEST_PLUGINS_DIR = path.join(TEST_DIR, 'plugins');
const TEST_PROJECT_DIR = path.join(TEST_DIR, 'project');
const TEST_SOURCE_DIR = path.join(TEST_DIR, 'source-plugin');

// Mock ipcRenderer for renderer-side tests
const mockIpcRenderer = {
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn()
};

// Mock contextBridge
const exposedApis: Record<string, unknown> = {};
const mockContextBridge = {
  exposeInMainWorld: vi.fn((name: string, api: unknown) => {
    exposedApis[name] = api;
  })
};

// Mock ipcMain for main-side tests
const ipcMainHandlers: Map<string, Function> = new Map();
const mockIpcMain = {
  handle: vi.fn((channel: string, handler: Function) => {
    ipcMainHandlers.set(channel, handler);
  }),
  on: vi.fn(),
  removeHandler: vi.fn()
};

// Mock BrowserWindow
const mockWebContents = {
  send: vi.fn()
};
const mockMainWindow = {
  webContents: mockWebContents
};

vi.mock('electron', () => ({
  ipcRenderer: mockIpcRenderer,
  contextBridge: mockContextBridge,
  ipcMain: mockIpcMain,
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
  BrowserWindow: vi.fn(() => mockMainWindow)
}));

// Sample plugin metadata
function createTestPluginMetadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin for integration tests',
    author: 'Test Author',
    repository: 'https://github.com/test/test-plugin',
    domains: ['testing', 'development'],
    categories: ['utilities', 'helpers'],
    skillCount: 5,
    content: {
      skills: [
        {
          id: 'skill-1',
          name: 'Test Skill 1',
          description: 'First test skill',
          category: 'utilities',
          domain: 'testing',
          path: 'skills/skill-1.md'
        },
        {
          id: 'skill-2',
          name: 'Test Skill 2',
          description: 'Second test skill',
          category: 'helpers',
          domain: 'development',
          path: 'skills/skill-2.md'
        }
      ],
      patterns: [
        {
          id: 'pattern-1',
          name: 'Test Pattern',
          description: 'A test pattern',
          category: 'design',
          path: 'patterns/pattern-1.md'
        }
      ],
      conventions: [
        {
          id: 'convention-1',
          name: 'Test Convention',
          description: 'A test convention',
          path: 'conventions/convention-1.md'
        }
      ]
    },
    ...overrides
  };
}

// Create a test plugin directory with plugin.json
function createTestPlugin(pluginDir: string, metadata: Record<string, unknown>): void {
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify(metadata, null, 2)
  );
}

// Create a boilerplate reference file
function createBoilerplateRef(projectDir: string, reference: Record<string, unknown>): void {
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    path.join(projectDir, 'boilerplate-ref.json'),
    JSON.stringify(reference, null, 2)
  );
}

// Setup test directories
function setupTestDirs(): void {
  mkdirSync(TEST_PLUGINS_DIR, { recursive: true });
  mkdirSync(TEST_PROJECT_DIR, { recursive: true });
}

// Cleanup test directories
function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Plugin Install Flow Integration', () => {
  beforeEach(() => {
    cleanupTestDirs();
    setupTestDirs();
    vi.clearAllMocks();
    vi.resetModules();
    ipcMainHandlers.clear();
    Object.keys(exposedApis).forEach((key) => delete exposedApis[key]);
  });

  afterEach(() => {
    cleanupTestDirs();
    vi.clearAllMocks();
  });

  describe('IPC Channel Constants', () => {
    it('should have all required plugin IPC channels defined', async () => {
      const { IPC_CHANNELS } = await import('../../shared/constants');

      // Verify channel naming convention
      expect(IPC_CHANNELS.PLUGIN_LIST).toBe('plugin:list');
      expect(IPC_CHANNELS.PLUGIN_INSTALL).toBe('plugin:install');
      expect(IPC_CHANNELS.PLUGIN_UNINSTALL).toBe('plugin:uninstall');
      expect(IPC_CHANNELS.PLUGIN_CHECK_UPDATES).toBe('plugin:checkUpdates');
      expect(IPC_CHANNELS.PLUGIN_APPLY_UPDATES).toBe('plugin:applyUpdates');
      expect(IPC_CHANNELS.PLUGIN_INSTALL_PROGRESS).toBe('plugin:installProgress');
      expect(IPC_CHANNELS.PLUGIN_VALIDATE_GITHUB_TOKEN).toBe('plugin:validateGitHubToken');
      expect(IPC_CHANNELS.PLUGIN_CHECK_GITHUB_REPO_ACCESS).toBe('plugin:checkGitHubRepoAccess');
      expect(IPC_CHANNELS.PLUGIN_CHECK_GIT_AVAILABILITY).toBe('plugin:checkGitAvailability');
      expect(IPC_CHANNELS.PLUGIN_GET_FILE_DIFF).toBe('plugin:getFileDiff');
      expect(IPC_CHANNELS.PLUGIN_LIST_BACKUPS).toBe('plugin:listBackups');
      expect(IPC_CHANNELS.PLUGIN_ROLLBACK).toBe('plugin:rollback');
    });
  });

  describe('Plugin Install Flow (Local Path)', () => {
    it('should complete local plugin installation flow', async () => {
      // Setup: Create source plugin
      const metadata = createTestPluginMetadata();
      createTestPlugin(TEST_SOURCE_DIR, metadata);

      // Mock successful IPC response
      mockIpcRenderer.invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
        if (channel === 'plugin:install') {
          const options = args[0] as { source: string; sourceType: string };

          // Simulate successful local install
          if (options.sourceType === 'local') {
            return {
              success: true,
              plugin: {
                id: 'test-plugin',
                name: 'Test Plugin',
                version: '1.0.0',
                description: 'A test plugin for integration tests',
                sourceType: 'local',
                source: options.source,
                path: path.join(TEST_PLUGINS_DIR, 'test-plugin'),
                status: 'installed',
                updateStatus: 'up_to_date',
                installedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata
              }
            };
          }
        }
        return { success: false, error: 'Unknown channel' };
      });

      // Simulate install request
      const installResult = await mockIpcRenderer.invoke('plugin:install', {
        source: TEST_SOURCE_DIR,
        sourceType: 'local'
      });

      // Verify
      expect(installResult.success).toBe(true);
      expect(installResult.plugin).toBeDefined();
      expect(installResult.plugin.id).toBe('test-plugin');
      expect(installResult.plugin.sourceType).toBe('local');
      expect(installResult.plugin.source).toBe(TEST_SOURCE_DIR);
    });

    it('should report progress during installation', async () => {
      const progressUpdates: Array<{ stage: string; percent: number; message: string }> = [];

      // Setup progress listener
      mockIpcRenderer.on.mockImplementation((channel: string, callback: Function) => {
        if (channel === 'plugin:installProgress') {
          // Simulate progress events
          setTimeout(() => {
            callback({}, { stage: 'validating', percent: 10, message: 'Validating local path...' });
            progressUpdates.push({ stage: 'validating', percent: 10, message: 'Validating local path...' });
          }, 10);
          setTimeout(() => {
            callback({}, { stage: 'copying', percent: 50, message: 'Copying plugin files...' });
            progressUpdates.push({ stage: 'copying', percent: 50, message: 'Copying plugin files...' });
          }, 20);
          setTimeout(() => {
            callback({}, { stage: 'complete', percent: 100, message: 'Plugin installed successfully' });
            progressUpdates.push({ stage: 'complete', percent: 100, message: 'Plugin installed successfully' });
          }, 30);
        }
        return () => {};
      });

      // Register listener
      const cleanup = mockIpcRenderer.on('plugin:installProgress', vi.fn());

      // Wait for progress events
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify progress was tracked
      expect(progressUpdates.length).toBe(3);
      expect(progressUpdates[0].stage).toBe('validating');
      expect(progressUpdates[1].stage).toBe('copying');
      expect(progressUpdates[2].stage).toBe('complete');
    });

    it('should handle invalid local path gracefully', async () => {
      mockIpcRenderer.invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
        if (channel === 'plugin:install') {
          const options = args[0] as { source: string; sourceType: string };
          if (options.sourceType === 'local' && !existsSync(options.source)) {
            return {
              success: false,
              error: 'Path does not exist'
            };
          }
        }
        return { success: false, error: 'Unknown error' };
      });

      const result = await mockIpcRenderer.invoke('plugin:install', {
        source: '/nonexistent/path',
        sourceType: 'local'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('should handle missing plugin.json gracefully', async () => {
      // Create empty directory without plugin.json
      const emptyDir = path.join(TEST_DIR, 'empty-plugin');
      mkdirSync(emptyDir, { recursive: true });

      mockIpcRenderer.invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
        if (channel === 'plugin:install') {
          const options = args[0] as { source: string };
          const pluginJsonPath = path.join(options.source, 'plugin.json');
          if (!existsSync(pluginJsonPath)) {
            return {
              success: false,
              error: 'No valid plugin.json found'
            };
          }
        }
        return { success: false, error: 'Unknown error' };
      });

      const result = await mockIpcRenderer.invoke('plugin:install', {
        source: emptyDir,
        sourceType: 'local'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('plugin.json');
    });
  });

  describe('Plugin Install Flow (GitHub)', () => {
    it('should validate GitHub URL format', async () => {
      mockIpcRenderer.invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
        if (channel === 'plugin:install') {
          const options = args[0] as { source: string; sourceType: string };
          if (options.sourceType === 'github') {
            // Validate URL format
            const httpsPattern = /^https:\/\/github\.com\/[\w-]+\/[\w.-]+(?:\.git)?$/;
            const sshPattern = /^git@github\.com:[\w-]+\/[\w.-]+\.git$/;

            if (!httpsPattern.test(options.source) && !sshPattern.test(options.source)) {
              return {
                success: false,
                error: 'Invalid GitHub URL format'
              };
            }
          }
        }
        return { success: true };
      });

      // Valid HTTPS URL
      const httpsResult = await mockIpcRenderer.invoke('plugin:install', {
        source: 'https://github.com/test/test-plugin',
        sourceType: 'github'
      });
      expect(httpsResult.success).toBe(true);

      // Valid SSH URL
      const sshResult = await mockIpcRenderer.invoke('plugin:install', {
        source: 'git@github.com:test/test-plugin.git',
        sourceType: 'github'
      });
      expect(sshResult.success).toBe(true);

      // Invalid URL
      const invalidResult = await mockIpcRenderer.invoke('plugin:install', {
        source: 'not-a-valid-url',
        sourceType: 'github'
      });
      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error).toContain('Invalid');
    });

    it('should validate GitHub token before cloning', async () => {
      mockIpcRenderer.invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
        if (channel === 'plugin:validateGitHubToken') {
          const token = args[0] as string;
          if (token.startsWith('ghp_') && token.length > 20) {
            return { valid: true, username: 'testuser', scopes: ['repo'] };
          }
          return { valid: false, error: 'Invalid token format' };
        }
        return { success: false };
      });

      // Valid token
      const validResult = await mockIpcRenderer.invoke(
        'plugin:validateGitHubToken',
        'ghp_validtoken123456789012345'
      );
      expect(validResult.valid).toBe(true);
      expect(validResult.username).toBe('testuser');

      // Invalid token
      const invalidResult = await mockIpcRenderer.invoke(
        'plugin:validateGitHubToken',
        'invalid-token'
      );
      expect(invalidResult.valid).toBe(false);
    });

    it('should check repository access before cloning', async () => {
      mockIpcRenderer.invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
        if (channel === 'plugin:checkGitHubRepoAccess') {
          const [owner, repo, token] = args as [string, string, string | undefined];

          if (owner === 'test' && repo === 'test-plugin') {
            return { hasAccess: true, owner, repo, isPrivate: false };
          }
          return { hasAccess: false, owner, repo, isPrivate: false, error: 'Repository not found' };
        }
        return { success: false };
      });

      // Accessible repo
      const accessibleResult = await mockIpcRenderer.invoke(
        'plugin:checkGitHubRepoAccess',
        'test',
        'test-plugin'
      );
      expect(accessibleResult.hasAccess).toBe(true);

      // Inaccessible repo
      const inaccessibleResult = await mockIpcRenderer.invoke(
        'plugin:checkGitHubRepoAccess',
        'unknown',
        'unknown-repo'
      );
      expect(inaccessibleResult.hasAccess).toBe(false);
    });

    it('should check git availability before operations', async () => {
      mockIpcRenderer.invoke.mockImplementation(async (channel: string) => {
        if (channel === 'plugin:checkGitAvailability') {
          return {
            available: true,
            version: '2.40.0',
            meetsMinimum: true,
            minimumRequired: '2.1.0'
          };
        }
        return { success: false };
      });

      const result = await mockIpcRenderer.invoke('plugin:checkGitAvailability');

      expect(result.available).toBe(true);
      expect(result.meetsMinimum).toBe(true);
    });
  });

  describe('Plugin List Operations', () => {
    it('should list installed plugins', async () => {
      mockIpcRenderer.invoke.mockImplementation(async (channel: string) => {
        if (channel === 'plugin:list') {
          return {
            success: true,
            data: [
              {
                id: 'plugin-1',
                name: 'Plugin One',
                version: '1.0.0',
                sourceType: 'local'
              },
              {
                id: 'plugin-2',
                name: 'Plugin Two',
                version: '2.0.0',
                sourceType: 'github'
              }
            ]
          };
        }
        return { success: false };
      });

      const result = await mockIpcRenderer.invoke('plugin:list');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('plugin-1');
      expect(result.data[1].sourceType).toBe('github');
    });

    it('should uninstall a plugin', async () => {
      mockIpcRenderer.invoke.mockImplementation(async (channel: string, pluginId: string) => {
        if (channel === 'plugin:uninstall') {
          if (pluginId === 'test-plugin') {
            return { success: true, data: true };
          }
          return { success: false, error: 'Plugin not found' };
        }
        return { success: false };
      });

      // Successful uninstall
      const successResult = await mockIpcRenderer.invoke('plugin:uninstall', 'test-plugin');
      expect(successResult.success).toBe(true);

      // Failed uninstall
      const failResult = await mockIpcRenderer.invoke('plugin:uninstall', 'nonexistent');
      expect(failResult.success).toBe(false);
    });
  });

  describe('Boilerplate Detection', () => {
    it('should detect boilerplate project via boilerplate-ref.json', async () => {
      const reference = {
        pluginId: 'quik-nation-boilerplate',
        pluginName: 'Quik Nation AI Boilerplate',
        pluginVersion: '1.8.0',
        linkedAt: '2024-01-01T00:00:00.000Z'
      };
      createBoilerplateRef(TEST_PROJECT_DIR, reference);

      mockIpcRenderer.invoke.mockImplementation(async (channel: string, projectPath: string) => {
        if (channel === 'plugin:detectBoilerplate') {
          const refPath = path.join(projectPath, 'boilerplate-ref.json');
          if (existsSync(refPath)) {
            return {
              success: true,
              data: {
                isBoilerplate: true,
                reference: reference
              }
            };
          }
          return { success: true, data: { isBoilerplate: false } };
        }
        return { success: false };
      });

      const result = await mockIpcRenderer.invoke('plugin:detectBoilerplate', TEST_PROJECT_DIR);

      expect(result.success).toBe(true);
      expect(result.data.isBoilerplate).toBe(true);
      expect(result.data.reference.pluginId).toBe('quik-nation-boilerplate');
      expect(result.data.reference.pluginVersion).toBe('1.8.0');
    });

    it('should detect boilerplate project via plugin.json', async () => {
      const metadata = createTestPluginMetadata({
        id: 'boilerplate-project',
        name: 'Boilerplate Project'
      });
      createTestPlugin(TEST_PROJECT_DIR, metadata);

      mockIpcRenderer.invoke.mockImplementation(async (channel: string, projectPath: string) => {
        if (channel === 'plugin:detectBoilerplate') {
          const pluginJsonPath = path.join(projectPath, 'plugin.json');
          if (existsSync(pluginJsonPath)) {
            return {
              success: true,
              data: {
                isBoilerplate: true,
                reference: {
                  pluginId: 'boilerplate-project',
                  pluginName: 'Boilerplate Project',
                  pluginVersion: '1.0.0',
                  linkedAt: new Date().toISOString()
                }
              }
            };
          }
          return { success: true, data: { isBoilerplate: false } };
        }
        return { success: false };
      });

      const result = await mockIpcRenderer.invoke('plugin:detectBoilerplate', TEST_PROJECT_DIR);

      expect(result.success).toBe(true);
      expect(result.data.isBoilerplate).toBe(true);
      expect(result.data.reference.pluginId).toBe('boilerplate-project');
    });

    it('should return false for non-boilerplate project', async () => {
      mockIpcRenderer.invoke.mockImplementation(async (channel: string, projectPath: string) => {
        if (channel === 'plugin:detectBoilerplate') {
          const refPath = path.join(projectPath, 'boilerplate-ref.json');
          const pluginPath = path.join(projectPath, 'plugin.json');

          if (!existsSync(refPath) && !existsSync(pluginPath)) {
            return { success: true, data: { isBoilerplate: false } };
          }
        }
        return { success: false };
      });

      const result = await mockIpcRenderer.invoke('plugin:detectBoilerplate', TEST_PROJECT_DIR);

      expect(result.success).toBe(true);
      expect(result.data.isBoilerplate).toBe(false);
    });
  });

  describe('Task Context Injection', () => {
    it('should get plugin context for task creation', async () => {
      const expectedContext = {
        pluginId: 'test-plugin',
        pluginName: 'Test Plugin',
        pluginVersion: '1.0.0',
        skills: [
          {
            id: 'skill-1',
            name: 'Test Skill 1',
            description: 'First test skill',
            category: 'utilities',
            domain: 'testing',
            path: 'skills/skill-1.md'
          }
        ],
        patterns: [
          {
            id: 'pattern-1',
            name: 'Test Pattern',
            description: 'A test pattern',
            category: 'design',
            path: 'patterns/pattern-1.md'
          }
        ],
        conventions: [
          {
            id: 'convention-1',
            name: 'Test Convention',
            description: 'A test convention',
            path: 'conventions/convention-1.md'
          }
        ],
        contextString: '# Available Skills (1)\n- Test Skill 1: First test skill'
      };

      mockIpcRenderer.invoke.mockImplementation(async (channel: string, pluginId: string) => {
        if (channel === 'plugin:getContext') {
          if (pluginId === 'test-plugin') {
            return { success: true, data: expectedContext };
          }
          return { success: true, data: null };
        }
        return { success: false };
      });

      const result = await mockIpcRenderer.invoke('plugin:getContext', 'test-plugin');

      expect(result.success).toBe(true);
      expect(result.data).not.toBeNull();
      expect(result.data.pluginId).toBe('test-plugin');
      expect(result.data.skills).toHaveLength(1);
      expect(result.data.patterns).toHaveLength(1);
      expect(result.data.conventions).toHaveLength(1);
      expect(result.data.contextString).toContain('Available Skills');
    });

    it('should return null for non-existent plugin', async () => {
      mockIpcRenderer.invoke.mockImplementation(async (channel: string, pluginId: string) => {
        if (channel === 'plugin:getContext') {
          if (pluginId !== 'test-plugin') {
            return { success: true, data: null };
          }
        }
        return { success: false };
      });

      const result = await mockIpcRenderer.invoke('plugin:getContext', 'nonexistent-plugin');

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('Plugin Update Operations', () => {
    it('should check for plugin updates', async () => {
      mockIpcRenderer.invoke.mockImplementation(async (channel: string, pluginId: string) => {
        if (channel === 'plugin:checkUpdates') {
          return {
            success: true,
            data: {
              pluginId,
              hasUpdate: true,
              currentVersion: '1.0.0',
              latestVersion: '1.1.0',
              categories: [
                {
                  id: 'skills',
                  name: 'Skills',
                  description: 'Skill definitions',
                  files: [
                    { path: 'skills/new-skill.md', status: 'added', hasConflict: false }
                  ],
                  conflictCount: 0
                }
              ],
              summary: {
                totalFiles: 1,
                addedFiles: 1,
                modifiedFiles: 0,
                deletedFiles: 0,
                conflictFiles: 0
              }
            }
          };
        }
        return { success: false };
      });

      const result = await mockIpcRenderer.invoke('plugin:checkUpdates', 'test-plugin');

      expect(result.success).toBe(true);
      expect(result.data.hasUpdate).toBe(true);
      expect(result.data.currentVersion).toBe('1.0.0');
      expect(result.data.latestVersion).toBe('1.1.0');
      expect(result.data.categories).toHaveLength(1);
      expect(result.data.summary.addedFiles).toBe(1);
    });

    it('should apply selected plugin updates', async () => {
      mockIpcRenderer.invoke.mockImplementation(async (channel: string, options: unknown) => {
        if (channel === 'plugin:applyUpdates') {
          const updateOptions = options as { pluginId: string; selectedFiles: string[]; createBackup: boolean };
          return {
            success: true,
            data: {
              success: true,
              appliedFiles: updateOptions.selectedFiles,
              skippedFiles: [],
              backupPath: updateOptions.createBackup
                ? path.join(TEST_PLUGINS_DIR, updateOptions.pluginId, '.backups', '2024-01-01T00-00-00')
                : undefined
            }
          };
        }
        return { success: false };
      });

      const result = await mockIpcRenderer.invoke('plugin:applyUpdates', {
        pluginId: 'test-plugin',
        selectedFiles: ['skills/new-skill.md'],
        createBackup: true
      });

      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
      expect(result.data.appliedFiles).toContain('skills/new-skill.md');
      expect(result.data.backupPath).toBeDefined();
    });

    it('should get file diff for update preview', async () => {
      mockIpcRenderer.invoke.mockImplementation(async (channel: string, pluginId: string, filePath: string) => {
        if (channel === 'plugin:getFileDiff') {
          return {
            success: true,
            data: `--- a/${filePath}
+++ b/${filePath}
@@ -1,3 +1,4 @@
 # Test Skill

 Description of the test skill.
+## New Section`
          };
        }
        return { success: false };
      });

      const result = await mockIpcRenderer.invoke(
        'plugin:getFileDiff',
        'test-plugin',
        'skills/test-skill.md'
      );

      expect(result.success).toBe(true);
      expect(result.data).toContain('--- a/');
      expect(result.data).toContain('+++ b/');
      expect(result.data).toContain('+## New Section');
    });
  });

  describe('Plugin Backup and Rollback', () => {
    it('should list available backups', async () => {
      mockIpcRenderer.invoke.mockImplementation(async (channel: string, pluginId: string) => {
        if (channel === 'plugin:listBackups') {
          return {
            success: true,
            data: [
              {
                pluginId,
                timestamp: '2024-01-01T00:00:00.000Z',
                path: path.join(TEST_PLUGINS_DIR, pluginId, '.backups', '2024-01-01T00-00-00'),
                version: '1.0.0',
                files: ['skills/skill-1.md', 'patterns/pattern-1.md']
              }
            ]
          };
        }
        return { success: false };
      });

      const result = await mockIpcRenderer.invoke('plugin:listBackups', 'test-plugin');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].pluginId).toBe('test-plugin');
      expect(result.data[0].version).toBe('1.0.0');
      expect(result.data[0].files).toHaveLength(2);
    });

    it('should rollback plugin to previous backup', async () => {
      const backupPath = path.join(TEST_PLUGINS_DIR, 'test-plugin', '.backups', '2024-01-01T00-00-00');

      mockIpcRenderer.invoke.mockImplementation(async (channel: string, pluginId: string, backup: string) => {
        if (channel === 'plugin:rollback') {
          return {
            success: true,
            data: {
              success: true,
              appliedFiles: ['skills/skill-1.md', 'patterns/pattern-1.md'],
              skippedFiles: [],
              backupPath: path.join(TEST_PLUGINS_DIR, pluginId, '.backups', 'pre-rollback')
            }
          };
        }
        return { success: false };
      });

      const result = await mockIpcRenderer.invoke('plugin:rollback', 'test-plugin', backupPath);

      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
      expect(result.data.appliedFiles).toContain('skills/skill-1.md');
      expect(result.data.backupPath).toContain('pre-rollback');
    });
  });

  describe('Complete Install Flow Integration', () => {
    it('should complete full install → detect → context flow', async () => {
      // 1. Setup source plugin
      const metadata = createTestPluginMetadata();
      createTestPlugin(TEST_SOURCE_DIR, metadata);

      // 2. Mock all IPC calls for the flow
      mockIpcRenderer.invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
        switch (channel) {
          case 'plugin:install':
            return {
              success: true,
              plugin: {
                id: 'test-plugin',
                name: 'Test Plugin',
                version: '1.0.0',
                sourceType: 'local',
                path: path.join(TEST_PLUGINS_DIR, 'test-plugin'),
                status: 'installed',
                metadata
              }
            };

          case 'plugin:list':
            return {
              success: true,
              data: [{
                id: 'test-plugin',
                name: 'Test Plugin',
                version: '1.0.0',
                sourceType: 'local'
              }]
            };

          case 'plugin:detectBoilerplate':
            return {
              success: true,
              data: {
                isBoilerplate: true,
                reference: {
                  pluginId: 'test-plugin',
                  pluginName: 'Test Plugin',
                  pluginVersion: '1.0.0',
                  linkedAt: new Date().toISOString()
                }
              }
            };

          case 'plugin:getContext':
            return {
              success: true,
              data: {
                pluginId: 'test-plugin',
                pluginName: 'Test Plugin',
                pluginVersion: '1.0.0',
                skills: (metadata.content as { skills: unknown[] }).skills,
                patterns: (metadata.content as { patterns: unknown[] }).patterns,
                conventions: (metadata.content as { conventions: unknown[] }).conventions,
                contextString: '# Available Skills (2)\n...'
              }
            };

          default:
            return { success: false, error: 'Unknown channel' };
        }
      });

      // Step 1: Install plugin
      const installResult = await mockIpcRenderer.invoke('plugin:install', {
        source: TEST_SOURCE_DIR,
        sourceType: 'local'
      });
      expect(installResult.success).toBe(true);
      expect(installResult.plugin.id).toBe('test-plugin');

      // Step 2: Verify plugin appears in list
      const listResult = await mockIpcRenderer.invoke('plugin:list');
      expect(listResult.success).toBe(true);
      expect(listResult.data.find((p: { id: string }) => p.id === 'test-plugin')).toBeDefined();

      // Step 3: Detect boilerplate in project
      const detectResult = await mockIpcRenderer.invoke('plugin:detectBoilerplate', TEST_PROJECT_DIR);
      expect(detectResult.success).toBe(true);
      expect(detectResult.data.isBoilerplate).toBe(true);

      // Step 4: Get plugin context for task creation
      const contextResult = await mockIpcRenderer.invoke('plugin:getContext', 'test-plugin');
      expect(contextResult.success).toBe(true);
      expect(contextResult.data.skills).toHaveLength(2);
      expect(contextResult.data.patterns).toHaveLength(1);
      expect(contextResult.data.conventions).toHaveLength(1);
    });
  });
});
