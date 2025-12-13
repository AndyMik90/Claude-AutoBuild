import { app, BrowserWindow, shell, nativeImage } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { setupIpcHandlers } from './ipc-handlers';
import { AgentManager } from './agent-manager';
import { TerminalManager } from './terminal-manager';
import { pythonEnvManager } from './python-env-manager';

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
    iconName = 'icon-256.png';
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
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
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

// Initialize the application
app.whenReady().then(() => {
  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.autoclaude.ui');

  // Set dock icon on macOS
  if (process.platform === 'darwin') {
    const iconPath = getIconPath();
    try {
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
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

  // Initialize terminal manager
  terminalManager = new TerminalManager(() => mainWindow);

  // Setup IPC handlers (pass pythonEnvManager for Python path management)
  setupIpcHandlers(agentManager, terminalManager, () => mainWindow, pythonEnvManager);

  // Create window
  createWindow();

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
  // Kill all running agent processes
  if (agentManager) {
    await agentManager.killAll();
  }
  // Kill all terminal processes
  if (terminalManager) {
    await terminalManager.killAll();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
