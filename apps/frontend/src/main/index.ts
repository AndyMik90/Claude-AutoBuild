import { app, BrowserWindow, shell, nativeImage, session } from 'electron';
import { join } from 'path';
import { accessSync, readFileSync, writeFileSync } from 'fs';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { setupIpcHandlers } from './ipc-setup';
import { AgentManager } from './agent';
import { TerminalManager } from './terminal-manager';
import { pythonEnvManager } from './python-env-manager';
import { getUsageMonitor } from './claude-profile/usage-monitor';
import { initializeUsageMonitorForwarding } from './ipc-handlers/terminal-handlers';
import { initializeAppUpdater } from './app-updater';
import { DEFAULT_APP_SETTINGS } from '../shared/constants';
import { readSettingsFile } from './settings-utils';
import { setupErrorLogging } from './app-logger';
import type { AppSettings } from '../shared/types';

// Setup error logging early (captures uncaught exceptions)
setupErrorLogging();

/**
 * Load app settings synchronously (for use during startup).
 * This is a simple merge with defaults - no migrations or auto-detection.
 */
function loadSettingsSync(): AppSettings {
  const savedSettings = readSettingsFile();
  return { ...DEFAULT_APP_SETTINGS, ...savedSettings } as AppSettings;
}

// Get icon path based on platform
function getIconPath(): string {
  // In dev mode, __dirname is out/main, so we go up to project root then into resources
  // In production, resources are in the app's resources folder
  const resourcesPath = is.dev
    ? join(__dirname, '../../resources')
    : join(process.resourcesPath);

  let iconName: string;
  if (process.platform === 'darwin') {
    // Use PNG in dev mode (works better), ICNS in production
    iconName = is.dev ? 'icon-256.png' : 'icon.icns';
  } else if (process.platform === 'win32') {
    iconName = 'icon.ico';
  } else {
    iconName = 'icon.png';
  }

  const iconPath = join(resourcesPath, iconName);
  return iconPath;
}

// Keep a global reference of the window object to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let agentManager: AgentManager | null = null;
let terminalManager: TerminalManager | null = null;

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    icon: getIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false // Prevent terminal lag when window loses focus
    }
  });

  // Show window when ready to avoid visual flash
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Open DevTools in development
  if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: 'right' });
  }

  // Clean up on close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Set app name before ready (for dock tooltip on macOS in dev mode)
app.setName('Auto Claude');
if (process.platform === 'darwin') {
  // Force the name to appear in dock on macOS
  app.name = 'Auto Claude';
}

// Fix Windows GPU cache permission errors (0x5 Access Denied)
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
  app.commandLine.appendSwitch('disable-gpu-program-cache');
  console.log('[main] Applied Windows GPU cache fixes');
}

// Initialize the application
app.whenReady().then(() => {
  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.autoclaude.ui');

  // Clear cache on Windows to prevent permission errors from stale cache
  if (process.platform === 'win32') {
    session.defaultSession.clearCache()
      .then(() => console.log('[main] Cleared cache on startup'))
      .catch((err) => console.warn('[main] Failed to clear cache:', err));
  }

  // Set dock icon on macOS
  if (process.platform === 'darwin') {
    const iconPath = getIconPath();
    try {
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        app.dock?.setIcon(icon);
      }
    } catch (e) {
      console.warn('Could not set dock icon:', e);
    }
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Initialize agent manager
  agentManager = new AgentManager();

  // Load settings and configure agent manager with Python and auto-claude paths
  // Uses EAFP pattern (try/catch) instead of LBYL (existsSync) to avoid TOCTOU race conditions
  const settingsPath = join(app.getPath('userData'), 'settings.json');
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    // Validate and migrate autoBuildPath - must contain runners/spec_runner.py
    // Uses EAFP pattern (try/catch with accessSync) instead of existsSync to avoid TOCTOU race conditions
    let validAutoBuildPath = settings.autoBuildPath;
    if (validAutoBuildPath) {
      const specRunnerPath = join(validAutoBuildPath, 'runners', 'spec_runner.py');
      let specRunnerExists = false;
      try {
        accessSync(specRunnerPath);
        specRunnerExists = true;
      } catch {
        // File doesn't exist or isn't accessible
      }

      if (!specRunnerExists) {
        // Migration: Try to fix stale paths from old project structure
        // Old structure: /path/to/project/auto-claude
        // New structure: /path/to/project/apps/backend
        let migrated = false;
        if (validAutoBuildPath.endsWith('/auto-claude') || validAutoBuildPath.endsWith('\\auto-claude')) {
          const basePath = validAutoBuildPath.replace(/[/\\]auto-claude$/, '');
          const correctedPath = join(basePath, 'apps', 'backend');
          const correctedSpecRunnerPath = join(correctedPath, 'runners', 'spec_runner.py');

          let correctedPathExists = false;
          try {
            accessSync(correctedSpecRunnerPath);
            correctedPathExists = true;
          } catch {
            // Corrected path doesn't exist
          }

          if (correctedPathExists) {
            console.log('[main] Migrating autoBuildPath from old structure:', validAutoBuildPath, '->', correctedPath);
            settings.autoBuildPath = correctedPath;
            validAutoBuildPath = correctedPath;
            migrated = true;

            // Save the corrected setting - we're the only process modifying settings at startup
            try {
              writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
              console.log('[main] Successfully saved migrated autoBuildPath to settings');
            } catch (writeError) {
              console.warn('[main] Failed to save migrated autoBuildPath:', writeError);
            }
          }
        }

        if (!migrated) {
          console.warn('[main] Configured autoBuildPath is invalid (missing runners/spec_runner.py), will use auto-detection:', validAutoBuildPath);
          validAutoBuildPath = undefined; // Let auto-detection find the correct path
        }
      }
    }

    if (settings.pythonPath || validAutoBuildPath) {
      console.warn('[main] Configuring AgentManager with settings:', {
        pythonPath: settings.pythonPath,
        autoBuildPath: validAutoBuildPath
      });
      agentManager.configure(settings.pythonPath, validAutoBuildPath);
    }
  } catch (error: unknown) {
    // ENOENT means no settings file yet - that's fine, use defaults
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      // No settings file, use defaults - this is expected on first run
    } else {
      console.warn('[main] Failed to load settings for agent configuration:', error);
    }
  }

  // Initialize terminal manager
  terminalManager = new TerminalManager(() => mainWindow);

  // Setup IPC handlers (pass pythonEnvManager for Python path management)
  setupIpcHandlers(agentManager, terminalManager, () => mainWindow, pythonEnvManager);

  // Create window
  createWindow();

  // Initialize usage monitoring after window is created
  if (mainWindow) {
    // Setup event forwarding from usage monitor to renderer
    initializeUsageMonitorForwarding(mainWindow);

    // Start the usage monitor
    const usageMonitor = getUsageMonitor();
    usageMonitor.start();
    console.warn('[main] Usage monitor initialized and started');

    // Log debug mode status
    const isDebugMode = process.env.DEBUG === 'true';
    if (isDebugMode) {
      console.warn('[main] ========================================');
      console.warn('[main] DEBUG MODE ENABLED (DEBUG=true)');
      console.warn('[main] ========================================');
    }

    // Initialize app auto-updater (only in production, or when DEBUG_UPDATER is set)
    const forceUpdater = process.env.DEBUG_UPDATER === 'true';
    if (app.isPackaged || forceUpdater) {
      // Load settings to get beta updates preference
      const settings = loadSettingsSync();
      const betaUpdates = settings.betaUpdates ?? false;

      initializeAppUpdater(mainWindow, betaUpdates);
      console.warn('[main] App auto-updater initialized');
      console.warn(`[main] Beta updates: ${betaUpdates ? 'enabled' : 'disabled'}`);
      if (forceUpdater && !app.isPackaged) {
        console.warn('[main] Updater forced in dev mode via DEBUG_UPDATER=true');
        console.warn('[main] Note: Updates won\'t actually work in dev mode');
      }
    } else {
      console.warn('[main] ========================================');
      console.warn('[main] App auto-updater DISABLED (development mode)');
      console.warn('[main] To test updater logging, set DEBUG_UPDATER=true');
      console.warn('[main] Note: Actual updates only work in packaged builds');
      console.warn('[main] ========================================');
    }
  }

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup before quit
app.on('before-quit', async () => {
  // Stop usage monitor
  const usageMonitor = getUsageMonitor();
  usageMonitor.stop();
  console.warn('[main] Usage monitor stopped');

  // Kill all running agent processes
  if (agentManager) {
    await agentManager.killAll();
  }
  // Kill all terminal processes
  if (terminalManager) {
    await terminalManager.killAll();
  }
});

// Note: Uncaught exceptions and unhandled rejections are now
// logged by setupErrorLogging() in app-logger.ts
