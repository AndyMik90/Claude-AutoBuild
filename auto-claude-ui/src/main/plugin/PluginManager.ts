import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, cpSync, rmSync, symlinkSync, lstatSync } from 'fs';
import path from 'path';
import type {
  Plugin,
  PluginManifest,
  PluginManifestEntry,
  PluginMetadata,
  PluginContent,
  PluginInstallResult,
  PluginSourceType
} from '../../shared/types';

/** Manifest version for future compatibility */
const MANIFEST_VERSION = '1.0.0';

/** File names for plugin detection */
const PLUGIN_CONFIG_FILE = 'plugin.json';

/**
 * Plugin Manager
 *
 * Manages the lifecycle of plugins in Auto Claude:
 * - Loading and saving the plugin manifest
 * - Registering and unregistering plugins
 *
 * Plugins are stored in ~/.auto-claude/plugins/ with a manifest.json
 * that tracks all installed plugins.
 */
export class PluginManager {
  private pluginsDir: string;
  private manifestPath: string;
  private manifest: PluginManifest;
  private plugins: Map<string, Plugin> = new Map();
  private initialized: boolean = false;

  constructor() {
    // Store plugins in app's userData directory
    const userDataPath = app.getPath('userData');
    this.pluginsDir = path.join(userDataPath, 'plugins');
    this.manifestPath = path.join(this.pluginsDir, 'manifest.json');

    // Load or create manifest
    this.manifest = this.loadManifest();
  }

  /**
   * Initialize the plugin manager
   * Loads all plugins from the manifest
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure plugins directory exists
    if (!existsSync(this.pluginsDir)) {
      mkdirSync(this.pluginsDir, { recursive: true });
    }

    // Load all plugins from manifest
    for (const entry of this.manifest.plugins) {
      try {
        const plugin = await this.loadPlugin(entry);
        if (plugin) {
          this.plugins.set(plugin.id, plugin);
        }
      } catch (error) {
        // Log error but continue loading other plugins (graceful degradation)
        console.error(`[PluginManager] Failed to load plugin ${entry.id}:`, error);
      }
    }

    this.initialized = true;
    console.warn(`[PluginManager] Initialized with ${this.plugins.size} plugins`);
  }

  /**
   * Load manifest from disk or create default
   */
  private loadManifest(): PluginManifest {
    if (existsSync(this.manifestPath)) {
      try {
        const content = readFileSync(this.manifestPath, 'utf-8');
        return JSON.parse(content) as PluginManifest;
      } catch (error) {
        console.error('[PluginManager] Error loading manifest, creating new one:', error);
        return this.createDefaultManifest();
      }
    }
    return this.createDefaultManifest();
  }

  /**
   * Create a default empty manifest
   */
  private createDefaultManifest(): PluginManifest {
    const manifest: PluginManifest = {
      version: MANIFEST_VERSION,
      plugins: [],
      updatedAt: new Date().toISOString()
    };

    // Save the default manifest
    this.saveManifest(manifest);
    return manifest;
  }

  /**
   * Save manifest to disk
   */
  private saveManifest(manifest: PluginManifest): void {
    // Ensure directory exists
    if (!existsSync(this.pluginsDir)) {
      mkdirSync(this.pluginsDir, { recursive: true });
    }

    manifest.updatedAt = new Date().toISOString();
    writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  /**
   * Load a plugin from its directory
   */
  private async loadPlugin(entry: PluginManifestEntry): Promise<Plugin | null> {
    const pluginDir = entry.path;

    // Check if plugin directory exists
    if (!existsSync(pluginDir)) {
      console.warn(`[PluginManager] Plugin directory not found: ${pluginDir}`);
      return null;
    }

    // Load plugin metadata
    const metadata = this.loadPluginMetadata(pluginDir);
    if (!metadata) {
      console.warn(`[PluginManager] No valid plugin.json found in: ${pluginDir}`);
      return null;
    }

    const plugin: Plugin = {
      id: entry.id,
      name: metadata.name,
      version: metadata.version,
      description: metadata.description,
      sourceType: entry.sourceType,
      source: entry.source,
      path: pluginDir,
      metadata,
      status: 'installed',
      updateStatus: 'up_to_date',
      installedAt: entry.installedAt,
      updatedAt: entry.updatedAt
    };

    return plugin;
  }

  /**
   * Load plugin metadata from plugin.json
   */
  private loadPluginMetadata(pluginDir: string): PluginMetadata | null {
    const metadataPath = path.join(pluginDir, PLUGIN_CONFIG_FILE);

    if (!existsSync(metadataPath)) {
      return null;
    }

    try {
      const content = readFileSync(metadataPath, 'utf-8');
      return JSON.parse(content) as PluginMetadata;
    } catch (error) {
      console.error(`[PluginManager] Error loading plugin metadata:`, error);
      return null;
    }
  }

  /**
   * Get all installed plugins
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get a plugin by ID
   */
  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Register a new plugin from a local path
   * This copies or symlinks the plugin to the plugins directory
   */
  async registerLocalPlugin(
    sourcePath: string,
    useSymlink: boolean = false
  ): Promise<PluginInstallResult> {
    try {
      // Validate source path
      if (!existsSync(sourcePath)) {
        return { success: false, error: `Source path does not exist: ${sourcePath}` };
      }

      // Load metadata from source
      const metadata = this.loadPluginMetadata(sourcePath);
      if (!metadata) {
        return { success: false, error: 'No valid plugin.json found in source directory' };
      }

      // Check for duplicate
      if (this.plugins.has(metadata.id)) {
        return { success: false, error: `Plugin with ID "${metadata.id}" is already installed` };
      }

      // Create destination path
      const destPath = path.join(this.pluginsDir, metadata.id);

      // Remove existing directory if it exists
      if (existsSync(destPath)) {
        rmSync(destPath, { recursive: true, force: true });
      }

      // Copy or symlink
      if (useSymlink) {
        symlinkSync(sourcePath, destPath);
      } else {
        cpSync(sourcePath, destPath, { recursive: true });
      }

      // Create manifest entry
      const now = new Date().toISOString();
      const entry: PluginManifestEntry = {
        id: metadata.id,
        name: metadata.name,
        version: metadata.version,
        sourceType: 'local',
        source: sourcePath,
        path: destPath,
        installedAt: now,
        updatedAt: now
      };

      // Update manifest
      this.manifest.plugins.push(entry);
      this.saveManifest(this.manifest);

      // Create plugin object
      const plugin: Plugin = {
        id: metadata.id,
        name: metadata.name,
        version: metadata.version,
        description: metadata.description,
        sourceType: 'local',
        source: sourcePath,
        path: destPath,
        metadata,
        status: 'installed',
        updateStatus: 'up_to_date',
        installedAt: now,
        updatedAt: now
      };

      this.plugins.set(plugin.id, plugin);

      console.warn(`[PluginManager] Registered local plugin: ${plugin.name} v${plugin.version}`);
      return { success: true, plugin };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PluginManager] Failed to register local plugin:', error);
      return { success: false, error: message };
    }
  }

  /**
   * Register a plugin that has already been cloned (e.g., from GitHub)
   * This is called after GitHubAuth has cloned the repo
   */
  async registerClonedPlugin(
    clonedPath: string,
    sourceUrl: string,
    sourceType: PluginSourceType
  ): Promise<PluginInstallResult> {
    try {
      // Load metadata from cloned directory
      const metadata = this.loadPluginMetadata(clonedPath);
      if (!metadata) {
        return { success: false, error: 'No valid plugin.json found in cloned repository' };
      }

      // Check for duplicate
      if (this.plugins.has(metadata.id)) {
        // Remove the cloned directory since we can't use it
        rmSync(clonedPath, { recursive: true, force: true });
        return { success: false, error: `Plugin with ID "${metadata.id}" is already installed` };
      }

      // Create manifest entry
      const now = new Date().toISOString();
      const entry: PluginManifestEntry = {
        id: metadata.id,
        name: metadata.name,
        version: metadata.version,
        sourceType,
        source: sourceUrl,
        path: clonedPath,
        installedAt: now,
        updatedAt: now
      };

      // Update manifest
      this.manifest.plugins.push(entry);
      this.saveManifest(this.manifest);

      // Create plugin object
      const plugin: Plugin = {
        id: metadata.id,
        name: metadata.name,
        version: metadata.version,
        description: metadata.description,
        sourceType,
        source: sourceUrl,
        path: clonedPath,
        metadata,
        status: 'installed',
        updateStatus: 'up_to_date',
        installedAt: now,
        updatedAt: now
      };

      this.plugins.set(plugin.id, plugin);

      console.warn(`[PluginManager] Registered ${sourceType} plugin: ${plugin.name} v${plugin.version}`);
      return { success: true, plugin };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PluginManager] Failed to register cloned plugin:', error);
      return { success: false, error: message };
    }
  }

  /**
   * Unregister and remove a plugin
   */
  async unregisterPlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      console.warn(`[PluginManager] Plugin not found: ${pluginId}`);
      return false;
    }

    try {
      // Remove from plugins directory
      if (existsSync(plugin.path)) {
        // Check if it's a symlink
        const stats = lstatSync(plugin.path);
        if (stats.isSymbolicLink()) {
          rmSync(plugin.path);
        } else {
          rmSync(plugin.path, { recursive: true, force: true });
        }
      }

      // Remove from manifest
      this.manifest.plugins = this.manifest.plugins.filter(p => p.id !== pluginId);
      this.saveManifest(this.manifest);

      // Remove from cache
      this.plugins.delete(pluginId);

      console.warn(`[PluginManager] Unregistered plugin: ${plugin.name}`);
      return true;
    } catch (error) {
      console.error(`[PluginManager] Failed to unregister plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * Get the plugins directory path
   */
  getPluginsDir(): string {
    return this.pluginsDir;
  }

  /**
   * Check if plugin manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Refresh plugins by reloading from manifest
   */
  async refresh(): Promise<void> {
    this.plugins.clear();
    this.manifest = this.loadManifest();
    this.initialized = false;
    await this.initialize();
  }
}

// Singleton instance
let pluginManagerInstance: PluginManager | null = null;

/**
 * Get the singleton PluginManager instance
 */
export function getPluginManager(): PluginManager {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager();
  }
  return pluginManagerInstance;
}
