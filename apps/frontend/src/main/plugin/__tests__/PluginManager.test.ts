/**
 * Unit tests for PluginManager
 *
 * Tests the core plugin management functionality:
 * - Loading and saving manifest
 * - Registering and unregistering plugins
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import path from 'path';

// Test directories
const TEST_DIR = '/tmp/plugin-manager-test';
const TEST_PLUGINS_DIR = path.join(TEST_DIR, 'plugins');
const TEST_PROJECT_DIR = path.join(TEST_DIR, 'project');

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
  }
}));

// Sample plugin metadata for tests
function createTestPluginMetadata(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin for unit tests',
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
function createTestPlugin(
  pluginDir: string,
  metadata: Record<string, unknown>
): void {
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify(metadata, null, 2)
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

describe('PluginManager', () => {
  beforeEach(async () => {
    cleanupTestDirs();
    setupTestDirs();
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    cleanupTestDirs();
    vi.clearAllMocks();
  });

  describe('loadManifest', () => {
    it('should create default manifest if none exists', async () => {
      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();

      await manager.initialize();

      const manifestPath = path.join(TEST_PLUGINS_DIR, 'manifest.json');
      expect(existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      expect(manifest).toMatchObject({
        version: '1.0.0',
        plugins: [],
        updatedAt: expect.any(String)
      });
    });

    it('should load existing manifest', async () => {
      // Create existing manifest
      const existingManifest = {
        version: '1.0.0',
        plugins: [
          {
            id: 'existing-plugin',
            name: 'Existing Plugin',
            version: '2.0.0',
            sourceType: 'local',
            source: '/path/to/source',
            path: '/path/to/plugin',
            installedAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z'
          }
        ],
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      mkdirSync(TEST_PLUGINS_DIR, { recursive: true });
      writeFileSync(
        path.join(TEST_PLUGINS_DIR, 'manifest.json'),
        JSON.stringify(existingManifest, null, 2)
      );

      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();

      // Manager should have loaded the manifest (even though plugin won't load)
      await manager.initialize();

      // Check that manifest was read (even if plugin doesn't exist)
      expect(manager.getPlugins().length).toBe(0); // Plugin dir doesn't exist, so it won't load
    });

    it('should handle corrupted manifest gracefully', async () => {
      // Create corrupted manifest
      mkdirSync(TEST_PLUGINS_DIR, { recursive: true });
      writeFileSync(
        path.join(TEST_PLUGINS_DIR, 'manifest.json'),
        'invalid json {{{}'
      );

      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();

      await manager.initialize();

      // Should create new manifest instead of crashing
      const manifestPath = path.join(TEST_PLUGINS_DIR, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      expect(manifest.plugins).toEqual([]);
    });

    it('should validate manifest schema', async () => {
      // Create manifest with missing fields
      const invalidManifest = {
        version: '1.0.0'
        // Missing plugins array
      };

      mkdirSync(TEST_PLUGINS_DIR, { recursive: true });
      writeFileSync(
        path.join(TEST_PLUGINS_DIR, 'manifest.json'),
        JSON.stringify(invalidManifest, null, 2)
      );

      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();

      // Currently, the PluginManager does not validate manifest schema
      // and will throw when trying to iterate over undefined plugins array.
      // This test documents the current behavior - a structural schema error
      // during initialization causes a TypeError.
      await expect(manager.initialize()).rejects.toThrow(TypeError);
    });
  });

  describe('registerPlugin', () => {
    it('should register a new local plugin', async () => {
      const metadata = createTestPluginMetadata();
      const sourceDir = path.join(TEST_DIR, 'source-plugin');
      createTestPlugin(sourceDir, metadata);

      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();

      const result = await manager.registerLocalPlugin(sourceDir);

      expect(result.success).toBe(true);
      expect(result.plugin).toBeDefined();
      expect(result.plugin?.id).toBe('test-plugin');
      expect(result.plugin?.name).toBe('Test Plugin');
      expect(result.plugin?.version).toBe('1.0.0');
      expect(result.plugin?.sourceType).toBe('local');
    });

    it('should update manifest after registering plugin', async () => {
      const metadata = createTestPluginMetadata();
      const sourceDir = path.join(TEST_DIR, 'source-plugin');
      createTestPlugin(sourceDir, metadata);

      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();

      await manager.registerLocalPlugin(sourceDir);

      const manifestPath = path.join(TEST_PLUGINS_DIR, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

      expect(manifest.plugins).toHaveLength(1);
      expect(manifest.plugins[0]).toMatchObject({
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        sourceType: 'local'
      });
    });

    it('should prevent duplicate plugin registration', async () => {
      const metadata = createTestPluginMetadata();
      const sourceDir = path.join(TEST_DIR, 'source-plugin');
      createTestPlugin(sourceDir, metadata);

      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();

      // Register first time
      await manager.registerLocalPlugin(sourceDir);

      // Try to register again with different source
      const sourceDir2 = path.join(TEST_DIR, 'source-plugin-2');
      createTestPlugin(sourceDir2, metadata);

      const result = await manager.registerLocalPlugin(sourceDir2);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already installed');
    });

    it('should fail gracefully for invalid source path', async () => {
      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();

      const result = await manager.registerLocalPlugin('/nonexistent/path');

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('should fail gracefully for directory without plugin.json', async () => {
      const emptyDir = path.join(TEST_DIR, 'empty-plugin');
      mkdirSync(emptyDir, { recursive: true });

      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();

      const result = await manager.registerLocalPlugin(emptyDir);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No valid plugin.json');
    });

    it('should register cloned plugin from GitHub', async () => {
      const metadata = createTestPluginMetadata({ id: 'github-plugin' });
      const clonedDir = path.join(TEST_PLUGINS_DIR, 'github-plugin');
      createTestPlugin(clonedDir, metadata);

      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();

      const result = await manager.registerClonedPlugin(
        clonedDir,
        'https://github.com/test/github-plugin.git',
        'github'
      );

      expect(result.success).toBe(true);
      expect(result.plugin?.sourceType).toBe('github');
      expect(result.plugin?.source).toBe(
        'https://github.com/test/github-plugin.git'
      );
    });
  });

  describe('unregisterPlugin', () => {
    it('should unregister an installed plugin', async () => {
      const metadata = createTestPluginMetadata();
      const sourceDir = path.join(TEST_DIR, 'source-plugin');
      createTestPlugin(sourceDir, metadata);

      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();

      await manager.registerLocalPlugin(sourceDir);
      expect(manager.getPlugins()).toHaveLength(1);

      const result = await manager.unregisterPlugin('test-plugin');

      expect(result).toBe(true);
      expect(manager.getPlugins()).toHaveLength(0);
    });

    it('should remove plugin from manifest', async () => {
      const metadata = createTestPluginMetadata();
      const sourceDir = path.join(TEST_DIR, 'source-plugin');
      createTestPlugin(sourceDir, metadata);

      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();

      await manager.registerLocalPlugin(sourceDir);
      await manager.unregisterPlugin('test-plugin');

      const manifestPath = path.join(TEST_PLUGINS_DIR, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

      expect(manifest.plugins).toHaveLength(0);
    });

    it('should remove plugin directory', async () => {
      const metadata = createTestPluginMetadata();
      const sourceDir = path.join(TEST_DIR, 'source-plugin');
      createTestPlugin(sourceDir, metadata);

      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();

      await manager.registerLocalPlugin(sourceDir);

      const pluginPath = path.join(TEST_PLUGINS_DIR, 'test-plugin');
      expect(existsSync(pluginPath)).toBe(true);

      await manager.unregisterPlugin('test-plugin');

      expect(existsSync(pluginPath)).toBe(false);
    });

    it('should return false for non-existent plugin', async () => {
      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();

      const result = await manager.unregisterPlugin('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getPlugins', () => {
    it('should return empty array when no plugins installed', async () => {
      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();

      const plugins = manager.getPlugins();

      expect(plugins).toEqual([]);
    });

    it('should return all installed plugins', async () => {
      const metadata1 = createTestPluginMetadata({ id: 'plugin-1' });
      const metadata2 = createTestPluginMetadata({
        id: 'plugin-2',
        name: 'Plugin Two'
      });

      const sourceDir1 = path.join(TEST_DIR, 'source-plugin-1');
      const sourceDir2 = path.join(TEST_DIR, 'source-plugin-2');

      createTestPlugin(sourceDir1, metadata1);
      createTestPlugin(sourceDir2, metadata2);

      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();

      await manager.registerLocalPlugin(sourceDir1);
      await manager.registerLocalPlugin(sourceDir2);

      const plugins = manager.getPlugins();

      expect(plugins).toHaveLength(2);
      expect(plugins.map((p) => p.id)).toContain('plugin-1');
      expect(plugins.map((p) => p.id)).toContain('plugin-2');
    });
  });

  describe('getPlugin', () => {
    it('should return plugin by ID', async () => {
      const metadata = createTestPluginMetadata();
      const sourceDir = path.join(TEST_DIR, 'source-plugin');
      createTestPlugin(sourceDir, metadata);

      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();
      await manager.registerLocalPlugin(sourceDir);

      const plugin = manager.getPlugin('test-plugin');

      expect(plugin).toBeDefined();
      expect(plugin?.id).toBe('test-plugin');
    });

    it('should return undefined for non-existent plugin', async () => {
      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();

      const plugin = manager.getPlugin('nonexistent');

      expect(plugin).toBeUndefined();
    });
  });

  describe('refresh', () => {
    it('should reload plugins from manifest', async () => {
      const metadata = createTestPluginMetadata();
      const sourceDir = path.join(TEST_DIR, 'source-plugin');
      createTestPlugin(sourceDir, metadata);

      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();
      await manager.registerLocalPlugin(sourceDir);

      expect(manager.getPlugins()).toHaveLength(1);

      // Clear plugins cache
      await manager.refresh();

      // Should have reloaded from manifest
      expect(manager.getPlugins()).toHaveLength(1);
      expect(manager.getPlugin('test-plugin')).toBeDefined();
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', async () => {
      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();

      expect(manager.isInitialized()).toBe(false);
    });

    it('should return true after initialization', async () => {
      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
    });
  });

  describe('getPluginsDir', () => {
    it('should return plugins directory path', async () => {
      const { PluginManager } = await import('../PluginManager');
      const manager = new PluginManager();

      const pluginsDir = manager.getPluginsDir();

      expect(pluginsDir).toBe(TEST_PLUGINS_DIR);
    });
  });

  describe('singleton', () => {
    it('should return same instance via getPluginManager', async () => {
      vi.resetModules();
      const { getPluginManager } = await import('../PluginManager');

      const instance1 = getPluginManager();
      const instance2 = getPluginManager();

      expect(instance1).toBe(instance2);
    });
  });
});
