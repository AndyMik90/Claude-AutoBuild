import { create } from 'zustand';
import type {
  Plugin,
  PluginInstallOptions,
  PluginInstallProgress,
  PluginUpdateCheck,
  PluginUpdateOptions,
  PluginUpdateResult,
  PluginContext,
  BoilerplateDetectionResult
} from '../../shared/types';

// ============================================
// Plugin Store State Interface
// ============================================

interface PluginState {
  plugins: Plugin[];
  isLoading: boolean;
  error: string | null;

  // Installation state
  isInstalling: boolean;
  installProgress: PluginInstallProgress | null;

  // Update state
  isCheckingUpdates: boolean;
  updateCheck: PluginUpdateCheck | null;
  isApplyingUpdate: boolean;

  // Actions
  setPlugins: (plugins: Plugin[]) => void;
  addPlugin: (plugin: Plugin) => void;
  removePlugin: (pluginId: string) => void;
  updatePlugin: (pluginId: string, updates: Partial<Plugin>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Installation actions
  setInstalling: (installing: boolean) => void;
  setInstallProgress: (progress: PluginInstallProgress | null) => void;

  // Update actions
  setCheckingUpdates: (checking: boolean) => void;
  setUpdateCheck: (check: PluginUpdateCheck | null) => void;
  setApplyingUpdate: (applying: boolean) => void;

  // Selectors
  getPluginById: (id: string) => Plugin | undefined;
  getPluginBySource: (source: string) => Plugin | undefined;
}

// ============================================
// Zustand Store
// ============================================

export const usePluginStore = create<PluginState>((set, get) => ({
  plugins: [],
  isLoading: false,
  error: null,

  // Installation state
  isInstalling: false,
  installProgress: null,

  // Update state
  isCheckingUpdates: false,
  updateCheck: null,
  isApplyingUpdate: false,

  // Basic actions
  setPlugins: (plugins) => set({ plugins }),

  addPlugin: (plugin) =>
    set((state) => ({
      plugins: [...state.plugins, plugin]
    })),

  removePlugin: (pluginId) =>
    set((state) => ({
      plugins: state.plugins.filter((p) => p.id !== pluginId)
    })),

  updatePlugin: (pluginId, updates) =>
    set((state) => ({
      plugins: state.plugins.map((p) =>
        p.id === pluginId ? { ...p, ...updates } : p
      )
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  // Installation actions
  setInstalling: (isInstalling) => set({ isInstalling }),

  setInstallProgress: (installProgress) => set({ installProgress }),

  // Update actions
  setCheckingUpdates: (isCheckingUpdates) => set({ isCheckingUpdates }),

  setUpdateCheck: (updateCheck) => set({ updateCheck }),

  setApplyingUpdate: (isApplyingUpdate) => set({ isApplyingUpdate }),

  // Selectors
  getPluginById: (id) => {
    const state = get();
    return state.plugins.find((p) => p.id === id);
  },

  getPluginBySource: (source) => {
    const state = get();
    return state.plugins.find((p) => p.source === source);
  }
}));

// ============================================
// Async Actions (IPC calls)
// ============================================

/**
 * Load all installed plugins from the main process
 */
export async function loadPlugins(): Promise<void> {
  const store = usePluginStore.getState();
  store.setLoading(true);
  store.setError(null);

  try {
    const result = await window.electronAPI.getPlugins();
    if (result.success && result.data) {
      store.setPlugins(result.data);
    } else {
      store.setError(result.error || 'Failed to load plugins');
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error loading plugins');
  } finally {
    store.setLoading(false);
  }
}

/**
 * Install a plugin from GitHub or local path
 */
export async function installPlugin(
  options: PluginInstallOptions
): Promise<Plugin | null> {
  const store = usePluginStore.getState();
  store.setInstalling(true);
  store.setInstallProgress({ stage: 'validating', percent: 0, message: 'Validating source...' });
  store.setError(null);

  try {
    const result = await window.electronAPI.installPlugin(options);
    if (result.success && result.plugin) {
      store.addPlugin(result.plugin);
      store.setInstallProgress({ stage: 'complete', percent: 100, message: 'Installation complete' });
      return result.plugin;
    } else {
      store.setError(result.error || 'Failed to install plugin');
      store.setInstallProgress({ stage: 'error', percent: 0, message: result.error || 'Installation failed' });
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error installing plugin';
    store.setError(errorMessage);
    store.setInstallProgress({ stage: 'error', percent: 0, message: errorMessage });
    return null;
  } finally {
    store.setInstalling(false);
  }
}

/**
 * Uninstall a plugin
 */
export async function uninstallPlugin(pluginId: string): Promise<boolean> {
  const store = usePluginStore.getState();

  try {
    store.updatePlugin(pluginId, { status: 'uninstalling' });
    const result = await window.electronAPI.uninstallPlugin(pluginId);
    if (result.success) {
      store.removePlugin(pluginId);
      return true;
    } else {
      store.setError(result.error || 'Failed to uninstall plugin');
      store.updatePlugin(pluginId, { status: 'installed' });
      return false;
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error uninstalling plugin');
    store.updatePlugin(pluginId, { status: 'installed' });
    return false;
  }
}

/**
 * Check for updates to a plugin
 */
export async function checkPluginUpdates(
  pluginId: string
): Promise<PluginUpdateCheck | null> {
  const store = usePluginStore.getState();
  store.setCheckingUpdates(true);
  store.setUpdateCheck(null);

  try {
    store.updatePlugin(pluginId, { updateStatus: 'checking' });
    const result = await window.electronAPI.checkPluginUpdates(pluginId);
    if (result.success && result.data) {
      store.setUpdateCheck(result.data);
      store.updatePlugin(pluginId, {
        updateStatus: result.data.hasUpdate ? 'update_available' : 'up_to_date',
        latestVersion: result.data.latestVersion
      });
      return result.data;
    } else {
      store.setError(result.error || 'Failed to check for updates');
      store.updatePlugin(pluginId, { updateStatus: 'up_to_date' });
      return null;
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error checking updates');
    store.updatePlugin(pluginId, { updateStatus: 'up_to_date' });
    return null;
  } finally {
    store.setCheckingUpdates(false);
  }
}

/**
 * Apply selected updates to a plugin
 */
export async function applyPluginUpdates(
  options: PluginUpdateOptions
): Promise<PluginUpdateResult | null> {
  const store = usePluginStore.getState();
  store.setApplyingUpdate(true);

  try {
    store.updatePlugin(options.pluginId, { updateStatus: 'updating' });
    const result = await window.electronAPI.applyPluginUpdates(options);
    if (result.success && result.data) {
      // Reload the plugin to get updated metadata
      await loadPlugins();
      return result.data;
    } else {
      store.setError(result.error || 'Failed to apply updates');
      store.updatePlugin(options.pluginId, { updateStatus: 'update_available' });
      return null;
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error applying updates');
    store.updatePlugin(options.pluginId, { updateStatus: 'update_available' });
    return null;
  } finally {
    store.setApplyingUpdate(false);
    store.setUpdateCheck(null);
  }
}

/**
 * Detect if a project is a boilerplate project
 */
export async function detectBoilerplate(
  projectPath: string
): Promise<BoilerplateDetectionResult | null> {
  try {
    const result = await window.electronAPI.detectBoilerplate(projectPath);
    if (result.success && result.data) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get plugin context for a project (for task context injection)
 */
export async function getPluginContext(
  projectId: string
): Promise<PluginContext | null> {
  try {
    const result = await window.electronAPI.getPluginContext(projectId);
    if (result.success && result.data) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get the count of installed plugins
 */
export function getPluginCount(): number {
  return usePluginStore.getState().plugins.length;
}

/**
 * Check if any plugins are installed
 */
export function hasPlugins(): boolean {
  return usePluginStore.getState().plugins.length > 0;
}

/**
 * Get all plugins with available updates
 */
export function getPluginsWithUpdates(): Plugin[] {
  return usePluginStore.getState().plugins.filter(
    (p) => p.updateStatus === 'update_available'
  );
}

/**
 * Get total skill count across all plugins
 */
export function getTotalSkillCount(): number {
  return usePluginStore.getState().plugins.reduce(
    (total, plugin) => total + (plugin.metadata?.skillCount || 0),
    0
  );
}
