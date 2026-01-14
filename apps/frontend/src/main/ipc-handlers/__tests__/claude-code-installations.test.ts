import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import path from 'path';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { IPC_CHANNELS } from '../../../shared/constants';

class MockIpcMain extends EventEmitter {
  private handlers = new Map<string, Function>();

  handle(channel: string, handler: Function): void {
    this.handlers.set(channel, handler);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }

  clearHandlers(): void {
    this.handlers.clear();
  }

  async invokeHandler(channel: string, event: unknown, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) {
      throw new Error(`No handler registered for channel: ${channel}`);
    }
    return handler(event, ...args);
  }
}

const ipcMain = new MockIpcMain();

const execFileMock = vi.fn();
const spawnMock = vi.fn();
const execFileSyncMock = vi.fn();

// `claude-code-handlers.ts` uses `promisify(execFile)` (which relies on execFile's custom promisify behavior).
// When we mock `execFile` with `vi.fn()`, it loses `util.promisify.custom` and would resolve to stdout only,
// breaking code that expects `{ stdout, stderr }`. Re-add the custom promisify shape here for tests.
(execFileMock as unknown as Record<symbol, unknown>)[promisify.custom] = (
  file: string,
  args: string[] = [],
  options: Record<string, unknown> = {}
): Promise<{ stdout: string; stderr: string }> => new Promise((resolve, reject) => {
  execFileMock(file, args, options, (err: unknown, stdout: string, stderr: string) => {
    if (err) {
      reject(err);
      return;
    }
    resolve({ stdout, stderr });
  });
});

vi.mock('electron', () => ({ ipcMain }));

vi.mock('child_process', () => ({
  execFile: execFileMock,
  execFileSync: execFileSyncMock,
  spawn: spawnMock,
}));

vi.mock('../../settings-utils', () => ({
  readSettingsFile: () => null,
  writeSettingsFile: vi.fn(),
}));

vi.mock('../../cli-tool-manager', () => ({
  getToolInfo: vi.fn(),
  configureTools: vi.fn(),
  sortNvmVersionDirs: () => [],
  getClaudeDetectionPaths: () => ({
    homebrewPaths: [],
    platformPaths: [],
    // Only used on non-Windows in scanClaudeInstallations
    nvmVersionsDir: '',
  }),
}));

describe.skipIf(process.platform !== 'win32')('Claude Code installations scan (Windows)', () => {
  let testDir = '';
  let shimPath = '';
  let cmdPath = '';

  beforeEach(async () => {
    vi.resetModules();
    ipcMain.clearHandlers();
    execFileMock.mockReset();
    spawnMock.mockReset();
    execFileSyncMock.mockReset();

    testDir = mkdtempSync(path.join(tmpdir(), 'claude-install-scan-'));
    shimPath = path.join(testDir, 'claude');
    cmdPath = path.join(testDir, 'claude.cmd');
    writeFileSync(shimPath, '');
    writeFileSync(cmdPath, '');
    if (!existsSync(shimPath) || !existsSync(cmdPath)) {
      throw new Error(`Test setup failed; expected paths to exist: ${shimPath}, ${cmdPath}`);
    }

    execFileMock.mockImplementation((
      file: string,
      args: string[],
      options: Record<string, unknown> | ((err: unknown, stdout: string, stderr: string) => void),
      callback?: (err: unknown, stdout: string, stderr: string) => void
    ) => {
      const cb = typeof options === 'function' ? options : callback;
      const opts = typeof options === 'function' ? {} : (options || {});
      if (!cb) {
        throw new Error('execFile callback is required');
      }

      // Simulate `where claude` returning both an extensionless shim and a quoted .cmd path.
      if (file === 'where') {
        const stdout = [
          `"${shimPath}"`,
          `"${cmdPath}"`,
        ].join('\r\n');
        cb(null, `${stdout}\r\n`, '');
        return;
      }

      // Simulate validating an extensionless shim: CreateProcess-style spawn fails (ENOENT)
      const fileLower = String(file).toLowerCase();
      if (fileLower === shimPath.toLowerCase() && args[0] === '--version') {
        const err = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
        cb(err, '', '');
        return;
      }

      // Simulate validating a .cmd via cmd.exe: require verbatim arguments to succeed
      if (fileLower.endsWith('\\cmd.exe') && args[0] === '/d' && args[1] === '/s' && args[2] === '/c') {
        if (opts.windowsVerbatimArguments !== true) {
          const err = Object.assign(new Error('Command failed'), { code: 1 });
          cb(err, '', 'The system cannot find the path specified.\r\n');
          return;
        }

        // Ensure the cmdline references the unquoted .cmd path (not a quoted string from `where`)
        if (!String(args[3] || '').includes(cmdPath)) {
          cb(new Error(`cmd.exe received unexpected cmdline: ${String(args[3])}`), '', '');
          return;
        }

        cb(null, '2.1.6 (Claude Code)\r\n', '');
        return;
      }

      cb(new Error(`Unexpected execFile invocation: ${file} ${args.join(' ')}`), '', '');
    });
  });

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
    testDir = '';
    shimPath = '';
    cmdPath = '';
  });

  it('skips extensionless shims and validates quoted .cmd paths', async () => {
    const { isSecurePath } = await import('../../utils/windows-paths');
    expect(cmdPath.endsWith('.cmd')).toBe(true);
    expect(isSecurePath(cmdPath)).toBe(true);

    const { registerClaudeCodeHandlers } = await import('../claude-code-handlers');
    registerClaudeCodeHandlers();

    const result = await ipcMain.invokeHandler(IPC_CHANNELS.CLAUDE_CODE_GET_INSTALLATIONS, {});
    expect(result).toEqual(expect.objectContaining({ success: true }));

    const data = (result as { success: true; data: { installations: Array<{ path: string }> } }).data;
    expect(data.installations).toHaveLength(1);
    expect(data.installations[0]?.path).toBe(path.resolve(cmdPath));

    const validatedShim = execFileMock.mock.calls.some(([file, args]) => (
      file === shimPath
      && Array.isArray(args)
      && args[0] === '--version'
    ));
    expect(validatedShim).toBe(false);

    const calledExecutables = execFileMock.mock.calls.map(([file]) => String(file));
    expect(calledExecutables).toContain('where');

    const cmdExeCall = execFileMock.mock.calls.find(([file, args]) => (
      typeof file === 'string'
      && /\\cmd\.exe$/i.test(file)
      && Array.isArray(args)
      && args[0] === '/d'
      && args[1] === '/s'
      && args[2] === '/c'
    ));
    if (!cmdExeCall) {
      throw new Error(`Expected cmd.exe call, got: ${JSON.stringify(execFileMock.mock.calls, null, 2)}`);
    }
    expect(cmdExeCall?.[2]).toEqual(expect.objectContaining({ windowsVerbatimArguments: true }));
  });
});
