/**
 * Mock Electron module for unit testing
 */
import { vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock app
export const app = {
  getPath: vi.fn((name: string) => {
    const paths: Record<string, string> = {
      userData: '/tmp/test-app-data',
      home: '/tmp/test-home',
      temp: '/tmp'
    };
    return paths[name] || '/tmp';
  }),
  getAppPath: vi.fn(() => '/tmp/test-app'),
  getVersion: vi.fn(() => '0.1.0'),
  isPackaged: false,
  on: vi.fn(),
  quit: vi.fn()
};

// Mock ipcMain
class MockIpcMain extends EventEmitter {
  private handlers: Map<string, Function> = new Map();

  handle(channel: string, handler: Function): void {
    this.handlers.set(channel, handler);
  }

  handleOnce(channel: string, handler: Function): void {
    this.handlers.set(channel, handler);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }

  // Helper for tests to invoke handlers
  async invokeHandler(channel: string, event: unknown, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (handler) {
      return handler(event, ...args);
    }
    throw new Error(`No handler for channel: ${channel}`);
  }
}

export const ipcMain = new MockIpcMain();

// Mock ipcRenderer
export const ipcRenderer = {
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
  setMaxListeners: vi.fn()
};

// Mock BrowserWindow
export class BrowserWindow extends EventEmitter {
  webContents = {
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn()
  };

  id = 1;

  constructor(_options?: unknown) {
    super();
  }

  loadURL = vi.fn();
  loadFile = vi.fn();
  show = vi.fn();
  hide = vi.fn();
  close = vi.fn();
  destroy = vi.fn();
  isDestroyed = vi.fn(() => false);
  isFocused = vi.fn(() => true);
  focus = vi.fn();
  blur = vi.fn();
  minimize = vi.fn();
  maximize = vi.fn();
  restore = vi.fn();
  isMinimized = vi.fn(() => false);
  isMaximized = vi.fn(() => false);
  setFullScreen = vi.fn();
  isFullScreen = vi.fn(() => false);
  getBounds = vi.fn(() => ({ x: 0, y: 0, width: 1200, height: 800 }));
  setBounds = vi.fn();
  getContentBounds = vi.fn(() => ({ x: 0, y: 0, width: 1200, height: 800 }));
  setContentBounds = vi.fn();
}

// Mock dialog
export const dialog = {
  showOpenDialog: vi.fn(() => Promise.resolve({ canceled: false, filePaths: ['/test/path'] })),
  showSaveDialog: vi.fn(() => Promise.resolve({ canceled: false, filePath: '/test/save/path' })),
  showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
  showErrorBox: vi.fn()
};

// Mock contextBridge
export const contextBridge = {
  exposeInMainWorld: vi.fn()
};

// Mock shell
export const shell = {
  openExternal: vi.fn(),
  openPath: vi.fn(),
  showItemInFolder: vi.fn()
};

// Mock nativeTheme
export const nativeTheme = {
  themeSource: 'system' as 'system' | 'light' | 'dark',
  shouldUseDarkColors: false,
  shouldUseHighContrastColors: false,
  shouldUseInvertedColorScheme: false,
  on: vi.fn()
};

// Mock screen
export const screen = {
  getPrimaryDisplay: vi.fn(() => ({
    workAreaSize: { width: 1920, height: 1080 }
  }))
};

export default {
  app,
  ipcMain,
  ipcRenderer,
  BrowserWindow,
  dialog,
  contextBridge,
  shell,
  nativeTheme,
  screen
};
