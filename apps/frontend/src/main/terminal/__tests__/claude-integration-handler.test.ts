import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type * as pty from '@lydell/node-pty';
import type { TerminalProcess } from '../types';

/** Escape special regex characters in a string for safe use in RegExp constructor */
const escapeForRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const mockGetClaudeCliInvocation = vi.fn();
const mockGetClaudeProfileManager = vi.fn();
const mockPersistSession = vi.fn();
const mockReleaseSessionId = vi.fn();

const createMockDisposable = (): pty.IDisposable => ({ dispose: vi.fn() });

const createMockPty = (): pty.IPty => ({
  pid: 123,
  cols: 80,
  rows: 24,
  process: 'bash',
  handleFlowControl: false,
  onData: vi.fn(() => createMockDisposable()),
  onExit: vi.fn(() => createMockDisposable()),
  write: vi.fn(),
  resize: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  kill: vi.fn(),
  clear: vi.fn(),
});

const createMockTerminal = (overrides: Partial<TerminalProcess> = {}): TerminalProcess => ({
  id: 'term-1',
  pty: createMockPty(),
  outputBuffer: '',
  isClaudeMode: false,
  claudeSessionId: undefined,
  claudeProfileId: undefined,
  title: 'Claude',
  cwd: '/tmp/project',
  projectPath: '/tmp/project',
  ...overrides,
});

vi.mock('../../claude-cli-utils', () => ({
  getClaudeCliInvocation: mockGetClaudeCliInvocation,
}));

vi.mock('../../claude-profile-manager', () => ({
  getClaudeProfileManager: mockGetClaudeProfileManager,
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    writeFileSync: vi.fn(),
  };
});

vi.mock('../session-handler', () => ({
  persistSession: mockPersistSession,
  releaseSessionId: mockReleaseSessionId,
}));

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    tmpdir: vi.fn(() => '/tmp'),
  };
});

describe('claude-integration-handler', () => {
  beforeEach(() => {
    mockGetClaudeCliInvocation.mockClear();
    mockGetClaudeProfileManager.mockClear();
    mockPersistSession.mockClear();
    mockReleaseSessionId.mockClear();
    vi.mocked(writeFileSync).mockClear();
  });

  it('uses the resolved CLI path and PATH prefix when invoking Claude', async () => {
    mockGetClaudeCliInvocation.mockReturnValue({
      command: "/opt/claude bin/claude's",
      env: { PATH: '/opt/claude/bin:/usr/bin' },
    });
    const profileManager = {
      getActiveProfile: vi.fn(() => ({ id: 'default', name: 'Default', isDefault: true })),
      getProfile: vi.fn(),
      getProfileToken: vi.fn(() => null),
      markProfileUsed: vi.fn(),
    };
    mockGetClaudeProfileManager.mockReturnValue(profileManager);

    const terminal = createMockTerminal();

    const { invokeClaude } = await import('../claude-integration-handler');
    invokeClaude(terminal, '/tmp/project', undefined, () => null, vi.fn());

    const written = vi.mocked(terminal.pty.write).mock.calls[0][0] as string;
    expect(written).toContain("cd '/tmp/project' && ");
    expect(written).toContain("PATH='/opt/claude/bin:/usr/bin' ");
    expect(written).toContain("'/opt/claude bin/claude'\\''s'");
    expect(mockReleaseSessionId).toHaveBeenCalledWith('term-1');
    expect(mockPersistSession).toHaveBeenCalledWith(terminal);
    expect(profileManager.getActiveProfile).toHaveBeenCalled();
    expect(profileManager.markProfileUsed).toHaveBeenCalledWith('default');
  });

  it('converts Windows PATH separators to colons for bash invocations', async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });

    try {
      mockGetClaudeCliInvocation.mockReturnValue({
        command: 'C:\\Tools\\claude\\claude.exe',
        env: { PATH: 'C:\\Tools\\claude;C:\\Windows' },
      });
      const profileManager = {
        getActiveProfile: vi.fn(() => ({ id: 'default', name: 'Default', isDefault: true })),
        getProfile: vi.fn(),
        getProfileToken: vi.fn(() => null),
        markProfileUsed: vi.fn(),
      };
      mockGetClaudeProfileManager.mockReturnValue(profileManager);

      const terminal = createMockTerminal();

      const { invokeClaude } = await import('../claude-integration-handler');
      invokeClaude(terminal, '/tmp/project', undefined, () => null, vi.fn());

      const written = vi.mocked(terminal.pty.write).mock.calls[0][0] as string;
      expect(written).toContain("PATH='C:\\Tools\\claude:C:\\Windows' ");
      expect(written).not.toContain('C:\\Tools\\claude;C:\\Windows');
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    }
  });

  it('throws when invokeClaude cannot resolve the CLI invocation', async () => {
    mockGetClaudeCliInvocation.mockImplementation(() => {
      throw new Error('boom');
    });
    const profileManager = {
      getActiveProfile: vi.fn(() => ({ id: 'default', name: 'Default', isDefault: true })),
      getProfile: vi.fn(),
      getProfileToken: vi.fn(() => null),
      markProfileUsed: vi.fn(),
    };
    mockGetClaudeProfileManager.mockReturnValue(profileManager);

    const terminal = createMockTerminal({ id: 'term-err' });

    const { invokeClaude } = await import('../claude-integration-handler');
    expect(() => invokeClaude(terminal, '/tmp/project', undefined, () => null, vi.fn())).toThrow('boom');
    expect(mockReleaseSessionId).toHaveBeenCalledWith('term-err');
    expect(terminal.pty.write).not.toHaveBeenCalled();
  });

  it('throws when resumeClaude cannot resolve the CLI invocation', async () => {
    mockGetClaudeCliInvocation.mockImplementation(() => {
      throw new Error('boom');
    });

    const terminal = createMockTerminal({
      id: 'term-err-2',
      cwd: undefined,
      projectPath: '/tmp/project',
    });

    const { resumeClaude } = await import('../claude-integration-handler');
    expect(() => resumeClaude(terminal, 'abc123', () => null)).toThrow('boom');
    expect(terminal.pty.write).not.toHaveBeenCalled();
  });

  it('throws when writing the OAuth token temp file fails', async () => {
    mockGetClaudeCliInvocation.mockReturnValue({
      command: '/opt/claude/bin/claude',
      env: { PATH: '/opt/claude/bin:/usr/bin' },
    });
    const profileManager = {
      getActiveProfile: vi.fn(),
      getProfile: vi.fn(() => ({
        id: 'prof-err',
        name: 'Work',
        isDefault: false,
        oauthToken: 'token-value',
      })),
      getProfileToken: vi.fn(() => 'token-value'),
      markProfileUsed: vi.fn(),
    };
    mockGetClaudeProfileManager.mockReturnValue(profileManager);
    vi.mocked(writeFileSync).mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const terminal = createMockTerminal({ id: 'term-err-3' });

    const { invokeClaude } = await import('../claude-integration-handler');
    expect(() => invokeClaude(terminal, '/tmp/project', 'prof-err', () => null, vi.fn())).toThrow('disk full');
    expect(terminal.pty.write).not.toHaveBeenCalled();
  });

  it('uses the temp token flow when the active profile has an oauth token', async () => {
    const command = '/opt/claude/bin/claude';
    const profileManager = {
      getActiveProfile: vi.fn(),
      getProfile: vi.fn(() => ({
        id: 'prof-1',
        name: 'Work',
        isDefault: false,
        oauthToken: 'token-value',
      })),
      getProfileToken: vi.fn(() => 'token-value'),
      markProfileUsed: vi.fn(),
    };

    mockGetClaudeCliInvocation.mockReturnValue({
      command,
      env: { PATH: '/opt/claude/bin:/usr/bin' },
    });
    mockGetClaudeProfileManager.mockReturnValue(profileManager);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234);

    const terminal = createMockTerminal({ id: 'term-3' });

    const { invokeClaude } = await import('../claude-integration-handler');
    invokeClaude(terminal, '/tmp/project', 'prof-1', () => null, vi.fn());

    const tokenPath = vi.mocked(writeFileSync).mock.calls[0]?.[0] as string;
    const tokenContents = vi.mocked(writeFileSync).mock.calls[0]?.[1] as string;
    const tmpDir = escapeForRegex(tmpdir());
    expect(tokenPath).toMatch(new RegExp(`^${tmpDir}/\\.claude-token-1234-[0-9a-f]{16}$`));
    expect(tokenContents).toBe("export CLAUDE_CODE_OAUTH_TOKEN='token-value'\n");
    const written = vi.mocked(terminal.pty.write).mock.calls[0][0] as string;
    expect(written).toContain("HISTFILE= HISTCONTROL=ignorespace ");
    expect(written).toContain(`source '${tokenPath}'`);
    expect(written).toContain(`rm -f '${tokenPath}'`);
    expect(written).toContain(`exec '${command}'`);
    expect(profileManager.getProfile).toHaveBeenCalledWith('prof-1');
    expect(mockPersistSession).toHaveBeenCalledWith(terminal);

    nowSpy.mockRestore();
  });

  it('prefers the temp token flow when profile has both oauth token and config dir', async () => {
    const command = '/opt/claude/bin/claude';
    const profileManager = {
      getActiveProfile: vi.fn(),
      getProfile: vi.fn(() => ({
        id: 'prof-both',
        name: 'Work',
        isDefault: false,
        oauthToken: 'token-value',
        configDir: '/tmp/claude-config',
      })),
      getProfileToken: vi.fn(() => 'token-value'),
      markProfileUsed: vi.fn(),
    };

    mockGetClaudeCliInvocation.mockReturnValue({
      command,
      env: { PATH: '/opt/claude/bin:/usr/bin' },
    });
    mockGetClaudeProfileManager.mockReturnValue(profileManager);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(5678);

    const terminal = createMockTerminal({ id: 'term-both' });

    const { invokeClaude } = await import('../claude-integration-handler');
    invokeClaude(terminal, '/tmp/project', 'prof-both', () => null, vi.fn());

    const tokenPath = vi.mocked(writeFileSync).mock.calls[0]?.[0] as string;
    const tokenContents = vi.mocked(writeFileSync).mock.calls[0]?.[1] as string;
    const tmpDir = escapeForRegex(tmpdir());
    expect(tokenPath).toMatch(new RegExp(`^${tmpDir}/\\.claude-token-5678-[0-9a-f]{16}$`));
    expect(tokenContents).toBe("export CLAUDE_CODE_OAUTH_TOKEN='token-value'\n");
    const written = vi.mocked(terminal.pty.write).mock.calls[0][0] as string;
    expect(written).toContain(`source '${tokenPath}'`);
    expect(written).toContain(`rm -f '${tokenPath}'`);
    expect(written).toContain(`exec '${command}'`);
    expect(written).not.toContain('CLAUDE_CONFIG_DIR=');
    expect(profileManager.getProfile).toHaveBeenCalledWith('prof-both');
    expect(mockPersistSession).toHaveBeenCalledWith(terminal);
    expect(profileManager.markProfileUsed).toHaveBeenCalledWith('prof-both');

    nowSpy.mockRestore();
  });

  it('handles missing profiles by falling back to the default command', async () => {
    const command = '/opt/claude/bin/claude';
    const profileManager = {
      getActiveProfile: vi.fn(),
      getProfile: vi.fn(() => undefined),
      getProfileToken: vi.fn(() => null),
      markProfileUsed: vi.fn(),
    };

    mockGetClaudeCliInvocation.mockReturnValue({
      command,
      env: { PATH: '/opt/claude/bin:/usr/bin' },
    });
    mockGetClaudeProfileManager.mockReturnValue(profileManager);

    const terminal = createMockTerminal({ id: 'term-6' });

    const { invokeClaude } = await import('../claude-integration-handler');
    invokeClaude(terminal, '/tmp/project', 'missing', () => null, vi.fn());

    const written = vi.mocked(terminal.pty.write).mock.calls[0][0] as string;
    expect(written).toContain(`'${command}'`);
    expect(profileManager.getProfile).toHaveBeenCalledWith('missing');
    expect(profileManager.markProfileUsed).not.toHaveBeenCalled();
  });

  it('uses the config dir flow when the active profile has a config dir', async () => {
    const command = '/opt/claude/bin/claude';
    const profileManager = {
      getActiveProfile: vi.fn(),
      getProfile: vi.fn(() => ({
        id: 'prof-2',
        name: 'Work',
        isDefault: false,
        configDir: '/tmp/claude-config',
      })),
      getProfileToken: vi.fn(() => null),
      markProfileUsed: vi.fn(),
    };

    mockGetClaudeCliInvocation.mockReturnValue({
      command,
      env: { PATH: '/opt/claude/bin:/usr/bin' },
    });
    mockGetClaudeProfileManager.mockReturnValue(profileManager);

    const terminal = createMockTerminal({ id: 'term-4' });

    const { invokeClaude } = await import('../claude-integration-handler');
    invokeClaude(terminal, '/tmp/project', 'prof-2', () => null, vi.fn());

    const written = vi.mocked(terminal.pty.write).mock.calls[0][0] as string;
    expect(written).toContain("HISTFILE= HISTCONTROL=ignorespace ");
    expect(written).toContain("CLAUDE_CONFIG_DIR='/tmp/claude-config'");
    expect(written).toContain(`exec '${command}'`);
    expect(profileManager.getProfile).toHaveBeenCalledWith('prof-2');
    expect(profileManager.markProfileUsed).toHaveBeenCalledWith('prof-2');
    expect(mockPersistSession).toHaveBeenCalledWith(terminal);
  });

  it('uses profile switching when a non-default profile is requested', async () => {
    const command = '/opt/claude/bin/claude';
    const profileManager = {
      getActiveProfile: vi.fn(),
      getProfile: vi.fn(() => ({
        id: 'prof-3',
        name: 'Team',
        isDefault: false,
      })),
      getProfileToken: vi.fn(() => null),
      markProfileUsed: vi.fn(),
    };

    mockGetClaudeCliInvocation.mockReturnValue({
      command,
      env: { PATH: '/opt/claude/bin:/usr/bin' },
    });
    mockGetClaudeProfileManager.mockReturnValue(profileManager);

    const terminal = createMockTerminal({ id: 'term-5' });

    const { invokeClaude } = await import('../claude-integration-handler');
    invokeClaude(terminal, '/tmp/project', 'prof-3', () => null, vi.fn());

    const written = vi.mocked(terminal.pty.write).mock.calls[0][0] as string;
    expect(written).toContain(`'${command}'`);
    expect(written).toContain("PATH='/opt/claude/bin:/usr/bin' ");
    expect(profileManager.getProfile).toHaveBeenCalledWith('prof-3');
    expect(profileManager.markProfileUsed).toHaveBeenCalledWith('prof-3');
    expect(mockPersistSession).toHaveBeenCalledWith(terminal);
  });

  it('uses --continue regardless of sessionId (sessionId is deprecated)', async () => {
    mockGetClaudeCliInvocation.mockReturnValue({
      command: '/opt/claude/bin/claude',
      env: { PATH: '/opt/claude/bin:/usr/bin' },
    });

    const terminal = createMockTerminal({
      id: 'term-2',
      cwd: undefined,
      projectPath: '/tmp/project',
    });

    const { resumeClaude } = await import('../claude-integration-handler');

    // Even when sessionId is passed, it should be ignored and --continue used
    resumeClaude(terminal, 'abc123', () => null);

    const resumeCall = vi.mocked(terminal.pty.write).mock.calls[0][0] as string;
    expect(resumeCall).toContain("PATH='/opt/claude/bin:/usr/bin' ");
    expect(resumeCall).toContain("'/opt/claude/bin/claude' --continue");
    expect(resumeCall).not.toContain('--resume');
    // sessionId is cleared because --continue doesn't track specific sessions
    expect(terminal.claudeSessionId).toBeUndefined();
    expect(terminal.isClaudeMode).toBe(true);
    expect(mockPersistSession).toHaveBeenCalledWith(terminal);

    vi.mocked(terminal.pty.write).mockClear();
    mockPersistSession.mockClear();
    terminal.projectPath = undefined;
    terminal.isClaudeMode = false;
    resumeClaude(terminal, undefined, () => null);
    const continueCall = vi.mocked(terminal.pty.write).mock.calls[0][0] as string;
    expect(continueCall).toContain("'/opt/claude/bin/claude' --continue");
    expect(terminal.isClaudeMode).toBe(true);
    expect(terminal.claudeSessionId).toBeUndefined();
    expect(mockPersistSession).not.toHaveBeenCalled();
  });
});

/**
 * Unit tests for helper functions
 */
describe('claude-integration-handler - Helper Functions', () => {
  describe('buildClaudeShellCommand', () => {
    it('should build default command without cwd or PATH prefix', async () => {
      const { buildClaudeShellCommand } = await import('../claude-integration-handler');
      const result = buildClaudeShellCommand('', '', "'/opt/bin/claude'", { method: 'default' });

      expect(result).toBe("'/opt/bin/claude'\r");
    });

    it('should build command with cwd', async () => {
      const { buildClaudeShellCommand } = await import('../claude-integration-handler');
      const result = buildClaudeShellCommand("cd '/tmp/project' && ", '', "'/opt/bin/claude'", { method: 'default' });

      expect(result).toBe("cd '/tmp/project' && '/opt/bin/claude'\r");
    });

    it('should build command with PATH prefix', async () => {
      const { buildClaudeShellCommand } = await import('../claude-integration-handler');
      const result = buildClaudeShellCommand('', "PATH='/custom/path' ", "'/opt/bin/claude'", { method: 'default' });

      expect(result).toBe("PATH='/custom/path' '/opt/bin/claude'\r");
    });

    it('should build temp-file method command with history-safe prefixes', async () => {
      const { buildClaudeShellCommand } = await import('../claude-integration-handler');
      const result = buildClaudeShellCommand(
        "cd '/tmp/project' && ",
        "PATH='/opt/bin' ",
        "'/opt/bin/claude'",
        { method: 'temp-file', escapedTempFile: "'/tmp/.token-123'" }
      );

      expect(result).toContain('clear && ');
      expect(result).toContain("cd '/tmp/project' && ");
      expect(result).toContain('HISTFILE= HISTCONTROL=ignorespace');
      expect(result).toContain("PATH='/opt/bin' ");
      expect(result).toContain("source '/tmp/.token-123'");
      expect(result).toContain("rm -f '/tmp/.token-123'");
      expect(result).toContain("exec '/opt/bin/claude'");
    });

    it('should build config-dir method command with CLAUDE_CONFIG_DIR', async () => {
      const { buildClaudeShellCommand } = await import('../claude-integration-handler');
      const result = buildClaudeShellCommand(
        "cd '/tmp/project' && ",
        "PATH='/opt/bin' ",
        "'/opt/bin/claude'",
        { method: 'config-dir', escapedConfigDir: "'/home/user/.claude-work'" }
      );

      expect(result).toContain('clear && ');
      expect(result).toContain("cd '/tmp/project' && ");
      expect(result).toContain('HISTFILE= HISTCONTROL=ignorespace');
      expect(result).toContain("CLAUDE_CONFIG_DIR='/home/user/.claude-work'");
      expect(result).toContain("PATH='/opt/bin' ");
      expect(result).toContain("exec '/opt/bin/claude'");
    });

    it('should handle empty cwdCommand for temp-file method', async () => {
      const { buildClaudeShellCommand } = await import('../claude-integration-handler');
      const result = buildClaudeShellCommand(
        '',
        '',
        "'/opt/bin/claude'",
        { method: 'temp-file', escapedTempFile: "'/tmp/.token'" }
      );

      expect(result).toContain('clear && ');
      expect(result).toContain('HISTFILE= HISTCONTROL=ignorespace');
      expect(result).not.toContain('cd ');
      expect(result).toContain("source '/tmp/.token'");
    });
  });

  describe('finalizeClaudeInvoke', () => {
    it('should set terminal title to "Claude" for default profile', async () => {
      const { finalizeClaudeInvoke } = await import('../claude-integration-handler');
      const terminal = createMockTerminal();
      const mockWindow = {
        webContents: { send: vi.fn() }
      };

      finalizeClaudeInvoke(
        terminal,
        { name: 'Default', isDefault: true },
        '/tmp/project',
        Date.now(),
        () => mockWindow as any,
        vi.fn()
      );

      expect(terminal.title).toBe('Claude');
    });

    it('should set terminal title to "Claude (ProfileName)" for non-default profile', async () => {
      const { finalizeClaudeInvoke } = await import('../claude-integration-handler');
      const terminal = createMockTerminal();
      const mockWindow = {
        webContents: { send: vi.fn() }
      };

      finalizeClaudeInvoke(
        terminal,
        { name: 'Work Profile', isDefault: false },
        '/tmp/project',
        Date.now(),
        () => mockWindow as any,
        vi.fn()
      );

      expect(terminal.title).toBe('Claude (Work Profile)');
    });

    it('should send IPC message to renderer', async () => {
      const { finalizeClaudeInvoke } = await import('../claude-integration-handler');
      const terminal = createMockTerminal();
      const mockSend = vi.fn();
      const mockWindow = {
        webContents: { send: mockSend }
      };

      finalizeClaudeInvoke(
        terminal,
        undefined,
        '/tmp/project',
        Date.now(),
        () => mockWindow as any,
        vi.fn()
      );

      expect(mockSend).toHaveBeenCalledWith(
        expect.stringContaining('title'),
        terminal.id,
        'Claude'
      );
    });

    it('should persist session when terminal has projectPath', async () => {
      const { finalizeClaudeInvoke } = await import('../claude-integration-handler');
      const terminal = createMockTerminal({ projectPath: '/tmp/project' });

      finalizeClaudeInvoke(
        terminal,
        undefined,
        '/tmp/project',
        Date.now(),
        () => null,
        vi.fn()
      );

      expect(mockPersistSession).toHaveBeenCalledWith(terminal);
    });

    it('should call onSessionCapture when projectPath is provided', async () => {
      const { finalizeClaudeInvoke } = await import('../claude-integration-handler');
      const terminal = createMockTerminal();
      const mockOnSessionCapture = vi.fn();
      const startTime = Date.now();

      finalizeClaudeInvoke(
        terminal,
        undefined,
        '/tmp/project',
        startTime,
        () => null,
        mockOnSessionCapture
      );

      expect(mockOnSessionCapture).toHaveBeenCalledWith(terminal.id, '/tmp/project', startTime);
    });

    it('should not crash when getWindow returns null', async () => {
      const { finalizeClaudeInvoke } = await import('../claude-integration-handler');
      const terminal = createMockTerminal();

      expect(() => {
        finalizeClaudeInvoke(
          terminal,
          undefined,
          '/tmp/project',
          Date.now(),
          () => null,
          vi.fn()
        );
      }).not.toThrow();
    });
  });
});
