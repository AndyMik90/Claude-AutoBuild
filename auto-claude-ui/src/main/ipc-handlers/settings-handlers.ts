import { ipcMain, dialog, app, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { is } from '@electron-toolkit/utils';
import { IPC_CHANNELS, DEFAULT_APP_SETTINGS } from '../../shared/constants';
import type {
  AppSettings,
  IPCResult
} from '../../shared/types';
import { AgentManager } from '../agent';
import type { BrowserWindow } from 'electron';

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

/**
 * Auto-detect the auto-claude source path relative to the app location.
 * Works across platforms (macOS, Windows, Linux) in both dev and production modes.
 */
const detectAutoBuildSourcePath = (): string | null => {
  const possiblePaths: string[] = [];

  // Development mode paths
  if (is.dev) {
    // In dev, __dirname is typically auto-claude-ui/out/main
    // We need to go up to the project root to find auto-claude/
    possiblePaths.push(
      path.resolve(__dirname, '..', '..', '..', 'auto-claude'),  // From out/main up 3 levels
      path.resolve(__dirname, '..', '..', 'auto-claude'),        // From out/main up 2 levels
      path.resolve(process.cwd(), 'auto-claude'),                // From cwd (project root)
      path.resolve(process.cwd(), '..', 'auto-claude')           // From cwd parent (if running from auto-claude-ui/)
    );
  } else {
    // Production mode paths (packaged app)
    // On Windows/Linux/macOS, the app might be installed anywhere
    // We check common locations relative to the app bundle
    const appPath = app.getAppPath();
    possiblePaths.push(
      path.resolve(appPath, '..', 'auto-claude'),               // Sibling to app
      path.resolve(appPath, '..', '..', 'auto-claude'),         // Up 2 from app
      path.resolve(appPath, '..', '..', '..', 'auto-claude'),   // Up 3 from app
      path.resolve(process.resourcesPath, '..', 'auto-claude'), // Relative to resources
      path.resolve(process.resourcesPath, '..', '..', 'auto-claude')
    );
  }

  // Add process.cwd() as last resort on all platforms
  possiblePaths.push(path.resolve(process.cwd(), 'auto-claude'));

  // Enable debug logging with AUTO_CLAUDE_DEBUG=1
  const debug = process.env.AUTO_CLAUDE_DEBUG === '1' || process.env.AUTO_CLAUDE_DEBUG === 'true';

  if (debug) {
    console.log('[detectAutoBuildSourcePath] Platform:', process.platform);
    console.log('[detectAutoBuildSourcePath] Is dev:', is.dev);
    console.log('[detectAutoBuildSourcePath] __dirname:', __dirname);
    console.log('[detectAutoBuildSourcePath] app.getAppPath():', app.getAppPath());
    console.log('[detectAutoBuildSourcePath] process.cwd():', process.cwd());
    console.log('[detectAutoBuildSourcePath] Checking paths:', possiblePaths);
  }

  for (const p of possiblePaths) {
    const versionPath = path.join(p, 'VERSION');
    const exists = existsSync(p) && existsSync(versionPath);

    if (debug) {
      console.log(`[detectAutoBuildSourcePath] Checking ${p}: ${exists ? '✓ FOUND' : '✗ not found'}`);
    }

    if (exists) {
      console.log(`[detectAutoBuildSourcePath] Auto-detected source path: ${p}`);
      return p;
    }
  }

  console.warn('[detectAutoBuildSourcePath] Could not auto-detect Auto Claude source path. Please configure manually in settings.');
  console.warn('[detectAutoBuildSourcePath] Set AUTO_CLAUDE_DEBUG=1 environment variable for detailed path checking.');
  return null;
};

/**
 * Register all settings-related IPC handlers
 */
export function registerSettingsHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  // ============================================
  // Settings Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET,
    async (): Promise<IPCResult<AppSettings>> => {
      let settings = { ...DEFAULT_APP_SETTINGS };

      if (existsSync(settingsPath)) {
        try {
          const content = readFileSync(settingsPath, 'utf-8');
          settings = { ...settings, ...JSON.parse(content) };
        } catch {
          // Use defaults
        }
      }

      // If no manual autoBuildPath is set, try to auto-detect
      if (!settings.autoBuildPath) {
        const detectedPath = detectAutoBuildSourcePath();
        if (detectedPath) {
          settings.autoBuildPath = detectedPath;
        }
      }

      return { success: true, data: settings as AppSettings };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SAVE,
    async (_, settings: Partial<AppSettings>): Promise<IPCResult> => {
      try {
        let currentSettings = DEFAULT_APP_SETTINGS;
        if (existsSync(settingsPath)) {
          const content = readFileSync(settingsPath, 'utf-8');
          currentSettings = { ...currentSettings, ...JSON.parse(content) };
        }

        const newSettings = { ...currentSettings, ...settings };
        writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));

        // Apply Python path if changed
        if (settings.pythonPath || settings.autoBuildPath) {
          agentManager.configure(settings.pythonPath, settings.autoBuildPath);
        }

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save settings'
        };
      }
    }
  );

  // ============================================
  // Dialog Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.DIALOG_SELECT_DIRECTORY,
    async (): Promise<string | null> => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return null;

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Project Directory'
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DIALOG_CREATE_PROJECT_FOLDER,
    async (
      _,
      location: string,
      name: string,
      initGit: boolean
    ): Promise<IPCResult<{ path: string; name: string; gitInitialized: boolean }>> => {
      try {
        // Validate inputs
        if (!location || !name) {
          return { success: false, error: 'Location and name are required' };
        }

        // Sanitize project name (convert to kebab-case, remove invalid chars)
        const sanitizedName = name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-_]/g, '')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        if (!sanitizedName) {
          return { success: false, error: 'Invalid project name' };
        }

        const projectPath = path.join(location, sanitizedName);

        // Check if folder already exists
        if (existsSync(projectPath)) {
          return { success: false, error: `Folder "${sanitizedName}" already exists at this location` };
        }

        // Create the directory
        mkdirSync(projectPath, { recursive: true });

        // Initialize git if requested
        let gitInitialized = false;
        if (initGit) {
          try {
            execSync('git init', { cwd: projectPath, stdio: 'ignore' });
            gitInitialized = true;
          } catch {
            // Git init failed, but folder was created - continue without git
            console.warn('Failed to initialize git repository');
          }
        }

        return {
          success: true,
          data: {
            path: projectPath,
            name: sanitizedName,
            gitInitialized
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create project folder'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DIALOG_GET_DEFAULT_PROJECT_LOCATION,
    async (): Promise<string | null> => {
      try {
        // Return user's home directory + common project folders
        const homeDir = app.getPath('home');
        const commonPaths = [
          path.join(homeDir, 'Projects'),
          path.join(homeDir, 'Developer'),
          path.join(homeDir, 'Code'),
          path.join(homeDir, 'Documents')
        ];

        // Return the first one that exists, or Documents as fallback
        for (const p of commonPaths) {
          if (existsSync(p)) {
            return p;
          }
        }

        return path.join(homeDir, 'Documents');
      } catch {
        return null;
      }
    }
  );

  // ============================================
  // App Info
  // ============================================

  ipcMain.handle(IPC_CHANNELS.APP_VERSION, async (): Promise<string> => {
    return app.getVersion();
  });

  // ============================================
  // Shell Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.SHELL_OPEN_EXTERNAL,
    async (_, url: string): Promise<void> => {
      await shell.openExternal(url);
    }
  );
}
