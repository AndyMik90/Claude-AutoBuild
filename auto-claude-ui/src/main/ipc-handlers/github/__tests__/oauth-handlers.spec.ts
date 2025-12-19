/**
 * Unit tests for GitHub OAuth handlers
 * Tests device code parsing, shell.openExternal handling, and error recovery
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock child_process before importing
const mockSpawn = vi.fn();
const mockExecSync = vi.fn();
const mockExecFileSync = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execSync: (...args: unknown[]) => mockExecSync(...args),
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args)
}));

// Mock shell.openExternal
const mockOpenExternal = vi.fn();

vi.mock('electron', () => {
  const mockIpcMain = new (class extends EventEmitter {
    private handlers: Map<string, Function> = new Map();

    handle(channel: string, handler: Function): void {
      this.handlers.set(channel, handler);
    }

    removeHandler(channel: string): void {
      this.handlers.delete(channel);
    }

    async invokeHandler(channel: string, event: unknown, ...args: unknown[]): Promise<unknown> {
      const handler = this.handlers.get(channel);
      if (handler) {
        return handler(event, ...args);
      }
      throw new Error(`No handler for channel: ${channel}`);
    }

    getHandler(channel: string): Function | undefined {
      return this.handlers.get(channel);
    }
  })();

  return {
    ipcMain: mockIpcMain,
    shell: {
      openExternal: (...args: unknown[]) => mockOpenExternal(...args)
    }
  };
});

// Mock @electron-toolkit/utils
vi.mock('@electron-toolkit/utils', () => ({
  is: {
    dev: true,
    windows: process.platform === 'win32',
    macos: process.platform === 'darwin',
    linux: process.platform === 'linux'
  }
}));

// Create mock process for spawn
function createMockProcess(): EventEmitter & {
  stdout: EventEmitter | null;
  stderr: EventEmitter | null;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } | null;
} {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter | null;
    stderr: EventEmitter | null;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } | null;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: vi.fn(), end: vi.fn() };
  return proc;
}

describe('GitHub OAuth Handlers', () => {
  let ipcMain: EventEmitter & {
    handlers: Map<string, Function>;
    invokeHandler: (channel: string, event: unknown, ...args: unknown[]) => Promise<unknown>;
    getHandler: (channel: string) => Function | undefined;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Get mocked ipcMain
    const electron = await import('electron');
    ipcMain = electron.ipcMain as unknown as typeof ipcMain;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Device Code Parsing', () => {
    it('should parse device code from standard gh CLI output format', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);
      mockOpenExternal.mockResolvedValue(undefined);

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      // Start the handler
      const resultPromise = ipcMain.invokeHandler('github:startAuth', {});

      // Simulate gh CLI output with device code
      mockProcess.stderr?.emit('data', '! First copy your one-time code: ABCD-1234\n');
      mockProcess.stderr?.emit('data', '- Press Enter to open github.com in your browser...\n');

      // Complete the process
      mockProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      const data = (result as { data: { deviceCode: string } }).data;
      expect(data.deviceCode).toBe('ABCD-1234');
    });

    it('should parse device code from alternate output format (lowercase "code")', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);
      mockOpenExternal.mockResolvedValue(undefined);

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      const resultPromise = ipcMain.invokeHandler('github:startAuth', {});

      // Alternate format: "code: XXXX-XXXX" without "one-time"
      mockProcess.stderr?.emit('data', 'Enter the code: EFGH-5678\n');
      mockProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: { deviceCode: string } }).data;
      expect(data.deviceCode).toBe('EFGH-5678');
    });

    it('should parse device code from stdout (not just stderr)', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);
      mockOpenExternal.mockResolvedValue(undefined);

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      const resultPromise = ipcMain.invokeHandler('github:startAuth', {});

      // Device code in stdout instead of stderr
      mockProcess.stdout?.emit('data', '! First copy your one-time code: IJKL-9012\n');
      mockProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: { deviceCode: string } }).data;
      expect(data.deviceCode).toBe('IJKL-9012');
    });

    it('should handle output without device code gracefully', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      const resultPromise = ipcMain.invokeHandler('github:startAuth', {});

      // Output without device code
      mockProcess.stderr?.emit('data', 'Some other message\n');
      mockProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: { deviceCode?: string } }).data;
      expect(data.deviceCode).toBeUndefined();
    });

    it('should extract URL from output containing https://github.com/login/device', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);
      mockOpenExternal.mockResolvedValue(undefined);

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      const resultPromise = ipcMain.invokeHandler('github:startAuth', {});

      mockProcess.stderr?.emit('data', '! First copy your one-time code: MNOP-3456\n');
      mockProcess.stderr?.emit('data', 'Then visit https://github.com/login/device to authenticate\n');
      mockProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: { authUrl: string } }).data;
      expect(data.authUrl).toBe('https://github.com/login/device');
    });
  });

  describe('shell.openExternal Handling', () => {
    it('should call shell.openExternal with extracted URL when device code found', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);
      mockOpenExternal.mockResolvedValue(undefined);

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      const resultPromise = ipcMain.invokeHandler('github:startAuth', {});

      mockProcess.stderr?.emit('data', '! First copy your one-time code: QRST-7890\n');

      // Wait for next tick to allow async browser opening
      await new Promise(resolve => setTimeout(resolve, 10));

      mockProcess.emit('close', 0);
      await resultPromise;

      expect(mockOpenExternal).toHaveBeenCalledWith('https://github.com/login/device');
    });

    it('should set browserOpened to true when shell.openExternal succeeds', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);
      mockOpenExternal.mockResolvedValue(undefined);

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      const resultPromise = ipcMain.invokeHandler('github:startAuth', {});

      mockProcess.stderr?.emit('data', '! First copy your one-time code: UVWX-1234\n');

      // Wait for async browser opening
      await new Promise(resolve => setTimeout(resolve, 10));

      mockProcess.emit('close', 0);
      const result = await resultPromise;

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: { browserOpened: boolean } }).data;
      expect(data.browserOpened).toBe(true);
    });

    it('should set browserOpened to false when shell.openExternal fails', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);
      mockOpenExternal.mockRejectedValue(new Error('Failed to open browser'));

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      const resultPromise = ipcMain.invokeHandler('github:startAuth', {});

      mockProcess.stderr?.emit('data', '! First copy your one-time code: YZAB-5678\n');

      // Wait for async browser opening to fail
      await new Promise(resolve => setTimeout(resolve, 10));

      mockProcess.emit('close', 0);
      const result = await resultPromise;

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: { browserOpened: boolean } }).data;
      expect(data.browserOpened).toBe(false);
    });

    it('should provide fallbackUrl when browser fails to open', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);
      mockOpenExternal.mockRejectedValue(new Error('Failed to open browser'));

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      const resultPromise = ipcMain.invokeHandler('github:startAuth', {});

      mockProcess.stderr?.emit('data', '! First copy your one-time code: CDEF-9012\n');

      // Wait for async browser opening to fail
      await new Promise(resolve => setTimeout(resolve, 10));

      mockProcess.emit('close', 0);
      const result = await resultPromise;

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: { fallbackUrl?: string } }).data;
      expect(data.fallbackUrl).toBe('https://github.com/login/device');
    });

    it('should not provide fallbackUrl when browser opens successfully', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);
      mockOpenExternal.mockResolvedValue(undefined);

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      const resultPromise = ipcMain.invokeHandler('github:startAuth', {});

      mockProcess.stderr?.emit('data', '! First copy your one-time code: GHIJ-3456\n');

      // Wait for async browser opening
      await new Promise(resolve => setTimeout(resolve, 10));

      mockProcess.emit('close', 0);
      const result = await resultPromise;

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: { fallbackUrl?: string } }).data;
      expect(data.fallbackUrl).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle gh CLI process error', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      const resultPromise = ipcMain.invokeHandler('github:startAuth', {});

      // Emit error event
      mockProcess.emit('error', new Error('spawn gh ENOENT'));

      const result = await resultPromise;

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error', 'spawn gh ENOENT');
      const data = (result as { data: { fallbackUrl: string } }).data;
      expect(data.fallbackUrl).toBe('https://github.com/login/device');
    });

    it('should handle non-zero exit code', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      const resultPromise = ipcMain.invokeHandler('github:startAuth', {});

      mockProcess.stderr?.emit('data', 'error: some authentication error\n');
      mockProcess.emit('close', 1);

      const result = await resultPromise;

      expect(result).toHaveProperty('success', false);
      const data = (result as { data: { fallbackUrl: string } }).data;
      expect(data.fallbackUrl).toBe('https://github.com/login/device');
    });

    it('should include device code in error result if it was extracted before failure', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);
      mockOpenExternal.mockResolvedValue(undefined);

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      const resultPromise = ipcMain.invokeHandler('github:startAuth', {});

      // Device code output followed by failure
      mockProcess.stderr?.emit('data', '! First copy your one-time code: KLMN-7890\n');

      // Wait for async browser opening
      await new Promise(resolve => setTimeout(resolve, 10));

      mockProcess.stderr?.emit('data', 'error: authentication failed\n');
      mockProcess.emit('close', 1);

      const result = await resultPromise;

      expect(result).toHaveProperty('success', false);
      const data = (result as { data: { deviceCode: string; fallbackUrl: string } }).data;
      expect(data.deviceCode).toBe('KLMN-7890');
      expect(data.fallbackUrl).toBe('https://github.com/login/device');
    });

    it('should provide user-friendly error message on process spawn failure', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      const resultPromise = ipcMain.invokeHandler('github:startAuth', {});

      mockProcess.emit('error', new Error('spawn gh ENOENT'));

      const result = await resultPromise;

      expect(result).toHaveProperty('success', false);
      const data = (result as { data: { message: string } }).data;
      expect(data.message).toContain('Failed to start GitHub CLI');
    });
  });

  describe('gh CLI Check Handler', () => {
    it('should return installed: true when gh CLI is found', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('which gh') || cmd.includes('where gh')) {
          return '/usr/local/bin/gh\n';
        }
        if (cmd === 'gh --version') {
          return 'gh version 2.65.0 (2024-01-15)\n';
        }
        return '';
      });

      const { registerCheckGhCli } = await import('../oauth-handlers');
      registerCheckGhCli();

      const result = await ipcMain.invokeHandler('github:checkCli', {});

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: { installed: boolean; version: string } }).data;
      expect(data.installed).toBe(true);
      expect(data.version).toContain('gh version');
    });

    it('should return installed: false when gh CLI is not found', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      const { registerCheckGhCli } = await import('../oauth-handlers');
      registerCheckGhCli();

      const result = await ipcMain.invokeHandler('github:checkCli', {});

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: { installed: boolean } }).data;
      expect(data.installed).toBe(false);
    });
  });

  describe('gh Auth Check Handler', () => {
    it('should return authenticated: true with username when logged in', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'gh auth status') {
          return 'Logged in to github.com as testuser\n';
        }
        if (cmd === 'gh api user --jq .login') {
          return 'testuser\n';
        }
        return '';
      });

      const { registerCheckGhAuth } = await import('../oauth-handlers');
      registerCheckGhAuth();

      const result = await ipcMain.invokeHandler('github:checkAuth', {});

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: { authenticated: boolean; username: string } }).data;
      expect(data.authenticated).toBe(true);
      expect(data.username).toBe('testuser');
    });

    it('should return authenticated: false when not logged in', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('You are not logged into any GitHub hosts');
      });

      const { registerCheckGhAuth } = await import('../oauth-handlers');
      registerCheckGhAuth();

      const result = await ipcMain.invokeHandler('github:checkAuth', {});

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: { authenticated: boolean } }).data;
      expect(data.authenticated).toBe(false);
    });
  });

  describe('Spawn Arguments', () => {
    it('should spawn gh with correct auth login arguments', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const { registerStartGhAuth } = await import('../oauth-handlers');
      registerStartGhAuth();

      ipcMain.invokeHandler('github:startAuth', {});

      expect(mockSpawn).toHaveBeenCalledWith(
        'gh',
        ['auth', 'login', '--web', '--scopes', 'repo'],
        expect.objectContaining({
          stdio: ['pipe', 'pipe', 'pipe']
        })
      );
    });
  });

  describe('Repository Validation', () => {
    it('should reject invalid repository format', async () => {
      const { registerGetGitHubBranches } = await import('../oauth-handlers');
      registerGetGitHubBranches();

      // Test with injection attempt
      const result = await ipcMain.invokeHandler(
        'github:getBranches',
        {},
        'owner/repo; rm -rf /',
        'token'
      );

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error', 'Invalid repository format. Expected: owner/repo');
    });

    it('should accept valid repository format', async () => {
      mockExecFileSync.mockReturnValue('main\nfeature-branch\n');

      const { registerGetGitHubBranches } = await import('../oauth-handlers');
      registerGetGitHubBranches();

      const result = await ipcMain.invokeHandler(
        'github:getBranches',
        {},
        'valid-owner/valid-repo',
        'token'
      );

      expect(result).toHaveProperty('success', true);
      const data = (result as { data: string[] }).data;
      expect(data).toContain('main');
      expect(data).toContain('feature-branch');
    });
  });
});
