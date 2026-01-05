import { writeFileSync } from 'fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TerminalProcess } from '../types';

const mockGetClaudeCliInvocation = vi.fn();
const mockGetClaudeProfileManager = vi.fn();
const mockPersistSession = vi.fn();
const mockReleaseSessionId = vi.fn();

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

describe('claude-integration-handler', () => {
  beforeEach(() => {
    mockGetClaudeCliInvocation.mockClear();
    mockGetClaudeProfileManager.mockClear();
    mockPersistSession.mockClear();
    mockReleaseSessionId.mockClear();
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

    const terminal = {
      id: 'term-1',
      pty: { write: vi.fn() },
      outputBuffer: '',
      isClaudeMode: false,
      claudeSessionId: undefined,
      claudeProfileId: undefined,
      cwd: '/tmp/project',
      projectPath: '/tmp/project',
    } as unknown as TerminalProcess;

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

    const terminal = {
      id: 'term-err',
      pty: { write: vi.fn() },
      outputBuffer: '',
      isClaudeMode: false,
      claudeSessionId: undefined,
      claudeProfileId: undefined,
      cwd: '/tmp/project',
      projectPath: '/tmp/project',
    } as unknown as TerminalProcess;

    const { invokeClaude } = await import('../claude-integration-handler');
    expect(() => invokeClaude(terminal, '/tmp/project', undefined, () => null, vi.fn())).toThrow('boom');
    expect(mockReleaseSessionId).toHaveBeenCalledWith('term-err');
    expect(terminal.pty.write).not.toHaveBeenCalled();
  });

  it('throws when resumeClaude cannot resolve the CLI invocation', async () => {
    mockGetClaudeCliInvocation.mockImplementation(() => {
      throw new Error('boom');
    });

    const terminal = {
      id: 'term-err-2',
      pty: { write: vi.fn() },
      outputBuffer: '',
      isClaudeMode: false,
      claudeSessionId: undefined,
      claudeProfileId: undefined,
      projectPath: '/tmp/project',
    } as unknown as TerminalProcess;

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

    const terminal = {
      id: 'term-err-3',
      pty: { write: vi.fn() },
      outputBuffer: '',
      isClaudeMode: false,
      claudeSessionId: undefined,
      claudeProfileId: undefined,
      cwd: '/tmp/project',
      projectPath: '/tmp/project',
    } as unknown as TerminalProcess;

    const { invokeClaude } = await import('../claude-integration-handler');
    expect(() => invokeClaude(terminal, '/tmp/project', 'prof-err', () => null, vi.fn())).toThrow('disk full');
    expect(terminal.pty.write).not.toHaveBeenCalled();
  });

  it('uses the temp token flow when the active profile has an oauth token', async () => {
    const command = '/opt/claude/bin/claude';
    const expectedTokenPath = "/tmp/.claude-token-1234";
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

    const terminal = {
      id: 'term-3',
      pty: { write: vi.fn() },
      outputBuffer: '',
      isClaudeMode: false,
      claudeSessionId: undefined,
      claudeProfileId: undefined,
      cwd: '/tmp/project',
      projectPath: '/tmp/project',
    } as unknown as TerminalProcess;

    const { invokeClaude } = await import('../claude-integration-handler');
    invokeClaude(terminal, '/tmp/project', 'prof-1', () => null, vi.fn());

    expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
      expectedTokenPath,
      'export CLAUDE_CODE_OAUTH_TOKEN="token-value"\n',
      { mode: 0o600 }
    );
    const written = vi.mocked(terminal.pty.write).mock.calls[0][0] as string;
    expect(written).toContain("HISTFILE= HISTCONTROL=ignorespace ");
    expect(written).toContain(`source '${expectedTokenPath}'`);
    expect(written).toContain(`rm -f '${expectedTokenPath}'`);
    expect(written).toContain(`exec '${command}'`);
    expect(profileManager.getProfile).toHaveBeenCalledWith('prof-1');
    expect(mockPersistSession).toHaveBeenCalledWith(terminal);

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

    const terminal = {
      id: 'term-6',
      pty: { write: vi.fn() },
      outputBuffer: '',
      isClaudeMode: false,
      claudeSessionId: undefined,
      claudeProfileId: undefined,
      cwd: '/tmp/project',
      projectPath: '/tmp/project',
    } as unknown as TerminalProcess;

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

    const terminal = {
      id: 'term-4',
      pty: { write: vi.fn() },
      outputBuffer: '',
      isClaudeMode: false,
      claudeSessionId: undefined,
      claudeProfileId: undefined,
      cwd: '/tmp/project',
      projectPath: '/tmp/project',
    } as unknown as TerminalProcess;

    const { invokeClaude } = await import('../claude-integration-handler');
    invokeClaude(terminal, '/tmp/project', 'prof-2', () => null, vi.fn());

    const written = vi.mocked(terminal.pty.write).mock.calls[0][0] as string;
    expect(written).toContain("HISTFILE= HISTCONTROL=ignorespace ");
    expect(written).toContain("CLAUDE_CONFIG_DIR='/tmp/claude-config'");
    expect(written).toContain(`exec '${command}'`);
    expect(profileManager.getProfile).toHaveBeenCalledWith('prof-2');
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

    const terminal = {
      id: 'term-5',
      pty: { write: vi.fn() },
      outputBuffer: '',
      isClaudeMode: false,
      claudeSessionId: undefined,
      claudeProfileId: undefined,
      cwd: '/tmp/project',
      projectPath: '/tmp/project',
    } as unknown as TerminalProcess;

    const { invokeClaude } = await import('../claude-integration-handler');
    invokeClaude(terminal, '/tmp/project', 'prof-3', () => null, vi.fn());

    const written = vi.mocked(terminal.pty.write).mock.calls[0][0] as string;
    expect(written).toContain(`'${command}'`);
    expect(written).toContain("PATH='/opt/claude/bin:/usr/bin' ");
    expect(profileManager.getProfile).toHaveBeenCalledWith('prof-3');
    expect(profileManager.markProfileUsed).toHaveBeenCalledWith('prof-3');
    expect(mockPersistSession).toHaveBeenCalledWith(terminal);
  });

  it('uses the resolved CLI path for resume and continue', async () => {
    mockGetClaudeCliInvocation.mockReturnValue({
      command: '/opt/claude/bin/claude',
      env: { PATH: '/opt/claude/bin:/usr/bin' },
    });

    const terminal = {
      id: 'term-2',
      pty: { write: vi.fn() },
      outputBuffer: '',
      isClaudeMode: false,
      claudeSessionId: undefined,
      claudeProfileId: undefined,
      projectPath: '/tmp/project',
    } as unknown as TerminalProcess;

    const { resumeClaude } = await import('../claude-integration-handler');
    resumeClaude(terminal, 'abc123', () => null);

    const resumeCall = vi.mocked(terminal.pty.write).mock.calls[0][0] as string;
    expect(resumeCall).toContain("PATH='/opt/claude/bin:/usr/bin' ");
    expect(resumeCall).toContain("'/opt/claude/bin/claude' --resume 'abc123'");
    expect(terminal.claudeSessionId).toBe('abc123');
    expect(terminal.isClaudeMode).toBe(true);
    expect(mockPersistSession).toHaveBeenCalledWith(terminal);

    vi.mocked(terminal.pty.write).mockClear();
    mockPersistSession.mockClear();
    terminal.projectPath = undefined;
    terminal.claudeSessionId = undefined;
    terminal.isClaudeMode = false;
    resumeClaude(terminal, undefined, () => null);
    const continueCall = vi.mocked(terminal.pty.write).mock.calls[0][0] as string;
    expect(continueCall).toContain("'/opt/claude/bin/claude' --continue");
    expect(terminal.isClaudeMode).toBe(true);
    expect(terminal.claudeSessionId).toBeUndefined();
    expect(mockPersistSession).not.toHaveBeenCalled();
  });
});
