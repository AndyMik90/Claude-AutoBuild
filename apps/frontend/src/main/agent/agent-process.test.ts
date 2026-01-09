/**
 * Integration tests for AgentProcessManager
 * Tests API profile environment variable injection into spawnProcess
 *
 * Story 2.3: Env Var Injection - AC1, AC2, AC3, AC4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Create a mock process object that will be returned by spawn
function createMockProcess() {
  return {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, callback: any) => {
      if (event === 'exit') {
        // Simulate immediate exit with code 0
        setTimeout(() => callback(0), 10);
      }
    }),
    kill: vi.fn()
  };
}

// Mock child_process - must be BEFORE imports of modules that use it
const spawnCalls: Array<{ command: string; args: string[]; options: { env: Record<string, string>; cwd?: string; [key: string]: unknown } }> = [];

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  const mockSpawn = vi.fn((command: string, args: string[], options: { env: Record<string, string>; cwd?: string; [key: string]: unknown }) => {
    // Record the call for test assertions
    spawnCalls.push({ command, args, options });
    return createMockProcess();
  });

  return {
    ...actual,
    spawn: mockSpawn,
    execSync: vi.fn((command: string) => {
      if (command.includes('git')) {
        return '/fake/path';
      }
      return '';
    })
  };
});

// Mock project-initializer to avoid child_process.execSync issues
vi.mock('../project-initializer', () => ({
  getAutoBuildPath: vi.fn(() => '/fake/auto-build'),
  isInitialized: vi.fn(() => true),
  initializeProject: vi.fn(),
  getProjectStorePath: vi.fn(() => '/fake/store/path')
}));

// Mock project-store BEFORE agent-process imports it
vi.mock('../project-store', () => ({
  projectStore: {
    getProject: vi.fn(),
    listProjects: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    getProjectSettings: vi.fn(),
    updateProjectSettings: vi.fn()
  }
}));

// Mock claude-profile-manager
vi.mock('../claude-profile-manager', () => ({
  getClaudeProfileManager: vi.fn(() => ({
    getProfilePath: vi.fn(() => '/fake/profile/path'),
    ensureProfileDir: vi.fn(),
    readProfile: vi.fn(),
    writeProfile: vi.fn(),
    deleteProfile: vi.fn()
  }))
}));

// Mock dependencies
vi.mock('../services/profile', () => ({
  getAPIProfileEnv: vi.fn()
}));

vi.mock('../rate-limit-detector', () => ({
  getProfileEnv: vi.fn(() => ({})),
  detectRateLimit: vi.fn(() => ({ isRateLimited: false })),
  createSDKRateLimitInfo: vi.fn(),
  detectAuthFailure: vi.fn(() => ({ isAuthFailure: false }))
}));

vi.mock('../python-detector', () => ({
  findPythonCommand: vi.fn(() => 'python'),
  parsePythonCommand: vi.fn(() => ['python', []])
}));

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/fake/app/path')
  }
}));

// Import AFTER all mocks are set up
import { AgentProcessManager } from './agent-process';
import { AgentState } from './agent-state';
import { AgentEvents } from './agent-events';
import * as profileService from '../services/profile';
import * as rateLimitDetector from '../rate-limit-detector';

describe('AgentProcessManager - API Profile Env Injection (Story 2.3)', () => {
  let processManager: AgentProcessManager;
  let state: AgentState;
  let events: AgentEvents;
  let emitter: EventEmitter;

  beforeEach(() => {
    // Reset all mocks and spawn calls
    vi.clearAllMocks();
    spawnCalls.length = 0;

    // Clear environment variables that could interfere with tests
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

    // Initialize components
    state = new AgentState();
    events = new AgentEvents();
    emitter = new EventEmitter();
    processManager = new AgentProcessManager(state, events, emitter);
  });

  afterEach(() => {
    processManager.killAllProcesses();
  });

  describe('AC1: API Profile Env Var Injection', () => {
    it('should inject ANTHROPIC_BASE_URL when active profile has baseUrl', async () => {
      const mockApiProfileEnv = {
        ANTHROPIC_BASE_URL: 'https://custom.api.com',
        ANTHROPIC_AUTH_TOKEN: 'sk-test-key'
      };

      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValue(mockApiProfileEnv);

      await processManager.spawnProcess('task-1', '/fake/cwd', ['run.py'], {}, 'task-execution');

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].command).toBe('python');
      expect(spawnCalls[0].args).toContain('run.py');
      expect(spawnCalls[0].options.env).toMatchObject({
        ANTHROPIC_BASE_URL: 'https://custom.api.com',
        ANTHROPIC_AUTH_TOKEN: 'sk-test-key'
      });
    });

    it('should inject ANTHROPIC_AUTH_TOKEN when active profile has apiKey', async () => {
      const mockApiProfileEnv = {
        ANTHROPIC_AUTH_TOKEN: 'sk-custom-key-12345678'
      };

      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValue(mockApiProfileEnv);

      await processManager.spawnProcess('task-1', '/fake/cwd', ['run.py'], {}, 'task-execution');

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].options.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-custom-key-12345678');
    });

    it('should inject model env vars when active profile has models configured', async () => {
      const mockApiProfileEnv = {
        ANTHROPIC_MODEL: 'claude-3-5-sonnet-20241022',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-3-5-haiku-20241022',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-3-5-sonnet-20241022',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-3-5-opus-20241022'
      };

      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValue(mockApiProfileEnv);

      await processManager.spawnProcess('task-1', '/fake/cwd', ['run.py'], {}, 'task-execution');

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].options.env).toMatchObject({
        ANTHROPIC_MODEL: 'claude-3-5-sonnet-20241022',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-3-5-haiku-20241022',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-3-5-sonnet-20241022',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-3-5-opus-20241022'
      });
    });

    it('should give API profile env vars highest precedence over extraEnv', async () => {
      const extraEnv = {
        ANTHROPIC_AUTH_TOKEN: 'sk-extra-token',
        ANTHROPIC_BASE_URL: 'https://extra.com'
      };

      const mockApiProfileEnv = {
        ANTHROPIC_AUTH_TOKEN: 'sk-profile-token',
        ANTHROPIC_BASE_URL: 'https://profile.com'
      };

      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValue(mockApiProfileEnv);

      await processManager.spawnProcess('task-1', '/fake/cwd', ['run.py'], extraEnv, 'task-execution');

      expect(spawnCalls).toHaveLength(1);
      // API profile should override extraEnv
      expect(spawnCalls[0].options.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-profile-token');
      expect(spawnCalls[0].options.env.ANTHROPIC_BASE_URL).toBe('https://profile.com');
    });
  });

  describe('AC2: OAuth Mode (No Active Profile)', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      // Save original environment before each test
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      // Restore original environment after each test
      process.env = originalEnv;
    });

    it('should NOT set ANTHROPIC_AUTH_TOKEN when no active profile (OAuth mode)', async () => {
      // Return empty object = OAuth mode
      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValue({});

      // Set OAuth token via getProfileEnv (existing flow)
      vi.mocked(rateLimitDetector.getProfileEnv).mockReturnValue({
        CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token-123'
      });

      await processManager.spawnProcess('task-1', '/fake/cwd', ['run.py'], {}, 'task-execution');

      expect(spawnCalls).toHaveLength(1);
      const envArg = spawnCalls[0].options.env as Record<string, unknown>;
      expect(envArg.CLAUDE_CODE_OAUTH_TOKEN).toBe('oauth-token-123');
      // OAuth mode clears ANTHROPIC_AUTH_TOKEN with empty string (not undefined)
      expect(envArg.ANTHROPIC_AUTH_TOKEN).toBe('');
    });

    it('should return empty object from getAPIProfileEnv when activeProfileId is null', async () => {
      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValue({});

      const result = await profileService.getAPIProfileEnv();
      expect(result).toEqual({});
    });

    it('should clear stale ANTHROPIC_AUTH_TOKEN from process.env when switching to OAuth mode', async () => {
      // Simulate process.env having stale ANTHROPIC_* vars from previous session
      process.env = {
        ...originalEnv,
        ANTHROPIC_AUTH_TOKEN: 'stale-token-from-env',
        ANTHROPIC_BASE_URL: 'https://stale.example.com'
      };

      // OAuth mode - no active API profile
      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValue({});

      // Set OAuth token
      vi.mocked(rateLimitDetector.getProfileEnv).mockReturnValue({
        CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token-456'
      });

      await processManager.spawnProcess('task-1', '/fake/cwd', ['run.py'], {}, 'task-execution');

      const envArg = spawnCalls[0].options.env as Record<string, unknown>;

      // OAuth token should be present
      expect(envArg.CLAUDE_CODE_OAUTH_TOKEN).toBe('oauth-token-456');

      // Stale ANTHROPIC_* vars should be cleared (empty string overrides process.env)
      expect(envArg.ANTHROPIC_AUTH_TOKEN).toBe('');
      expect(envArg.ANTHROPIC_BASE_URL).toBe('');
    });

    it('should clear stale ANTHROPIC_BASE_URL when switching to OAuth mode', async () => {
      process.env = {
        ...originalEnv,
        ANTHROPIC_BASE_URL: 'https://old-custom-endpoint.com'
      };

      // OAuth mode
      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValue({});
      vi.mocked(rateLimitDetector.getProfileEnv).mockReturnValue({
        CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token-789'
      });

      await processManager.spawnProcess('task-1', '/fake/cwd', ['run.py'], {}, 'task-execution');

      const envArg = spawnCalls[0].options.env as Record<string, unknown>;

      // Should clear the base URL (so Python uses default api.anthropic.com)
      expect(envArg.ANTHROPIC_BASE_URL).toBe('');
      expect(envArg.CLAUDE_CODE_OAUTH_TOKEN).toBe('oauth-token-789');
    });

    it('should NOT clear ANTHROPIC_* vars when API Profile is active', async () => {
      process.env = {
        ...originalEnv,
        ANTHROPIC_AUTH_TOKEN: 'old-token-in-env'
      };

      // API Profile mode - active profile
      const mockApiProfileEnv = {
        ANTHROPIC_AUTH_TOKEN: 'sk-profile-active',
        ANTHROPIC_BASE_URL: 'https://active-profile.com'
      };
      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValue(mockApiProfileEnv);

      await processManager.spawnProcess('task-1', '/fake/cwd', ['run.py'], {}, 'task-execution');

      const envArg = spawnCalls[0].options.env as Record<string, unknown>;

      // Should use API profile vars, NOT clear them
      expect(envArg.ANTHROPIC_AUTH_TOKEN).toBe('sk-profile-active');
      expect(envArg.ANTHROPIC_BASE_URL).toBe('https://active-profile.com');
    });
  });

  describe('AC4: No API Key Logging', () => {
    it('should never log full API keys in spawn env vars', async () => {
      const mockApiProfileEnv = {
        ANTHROPIC_AUTH_TOKEN: 'sk-sensitive-api-key-12345678',
        ANTHROPIC_BASE_URL: 'https://api.example.com'
      };

      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValue(mockApiProfileEnv);

      // Mock ALL console methods to capture any debug/error output
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      await processManager.spawnProcess('task-1', '/fake/cwd', ['run.py'], {}, 'task-execution');

      // Get the env object passed to spawn
      const envArg = spawnCalls[0].options.env as Record<string, unknown>;

      // Verify the full API key is in the env (for Python subprocess)
      expect(envArg.ANTHROPIC_AUTH_TOKEN).toBe('sk-sensitive-api-key-12345678');

      // Collect ALL console output from all methods
      const allLogCalls = [
        ...consoleLogSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
        ...consoleWarnSpy.mock.calls,
        ...consoleDebugSpy.mock.calls
      ].flatMap(call => call.map(String));
      const logString = JSON.stringify(allLogCalls);

      // The full API key should NOT appear in any logs (AC4 compliance)
      expect(logString).not.toContain('sk-sensitive-api-key-12345678');

      // Restore all spies
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleDebugSpy.mockRestore();
    });

    it('should not log API key even in error scenarios', async () => {
      const mockApiProfileEnv = {
        ANTHROPIC_AUTH_TOKEN: 'sk-secret-key-for-error-test',
        ANTHROPIC_BASE_URL: 'https://api.example.com'
      };

      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValue(mockApiProfileEnv);

      // Mock console methods
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await processManager.spawnProcess('task-1', '/fake/cwd', ['run.py'], {}, 'task-execution');

      // Collect all error and log output
      const allOutput = [
        ...consoleErrorSpy.mock.calls,
        ...consoleLogSpy.mock.calls
      ].flatMap(call => call.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)));
      const outputString = allOutput.join(' ');

      // Verify API key is never exposed in logs
      expect(outputString).not.toContain('sk-secret-key-for-error-test');

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });

  describe('AC3: Profile Switching Between Builds', () => {
    it('should allow different profiles for different spawn calls', async () => {
      // First spawn with Profile A
      const profileAEnv = {
        ANTHROPIC_AUTH_TOKEN: 'sk-profile-a',
        ANTHROPIC_BASE_URL: 'https://api-a.com'
      };

      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValueOnce(profileAEnv);

      await processManager.spawnProcess('task-1', '/fake/cwd', ['run.py'], {}, 'task-execution');

      const firstEnv = spawnCalls[0].options.env as Record<string, unknown>;
      expect(firstEnv.ANTHROPIC_AUTH_TOKEN).toBe('sk-profile-a');

      // Second spawn with Profile B (user switched active profile)
      const profileBEnv = {
        ANTHROPIC_AUTH_TOKEN: 'sk-profile-b',
        ANTHROPIC_BASE_URL: 'https://api-b.com'
      };

      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValueOnce(profileBEnv);

      await processManager.spawnProcess('task-2', '/fake/cwd', ['run.py'], {}, 'task-execution');

      const secondEnv = spawnCalls[1].options.env as Record<string, unknown>;
      expect(secondEnv.ANTHROPIC_AUTH_TOKEN).toBe('sk-profile-b');

      // Verify first spawn's env is NOT affected by second spawn
      expect(firstEnv.ANTHROPIC_AUTH_TOKEN).toBe('sk-profile-a');
    });
  });

  describe('Integration: Combined env precedence', () => {
    it('should merge env vars in correct precedence order', async () => {
      const extraEnv = {
        CUSTOM_VAR: 'from-extra'
      };

      const profileEnv = {
        CLAUDE_CONFIG_DIR: '/custom/config'
      };

      const apiProfileEnv = {
        ANTHROPIC_AUTH_TOKEN: 'sk-api-profile',
        ANTHROPIC_BASE_URL: 'https://api-profile.com'
      };

      vi.mocked(rateLimitDetector.getProfileEnv).mockReturnValue(profileEnv);
      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValue(apiProfileEnv);

      await processManager.spawnProcess('task-1', '/fake/cwd', ['run.py'], extraEnv, 'task-execution');

      const envArg = spawnCalls[0].options.env as Record<string, unknown>;

      // Verify all sources are included
      expect(envArg.CUSTOM_VAR).toBe('from-extra'); // From extraEnv
      expect(envArg.CLAUDE_CONFIG_DIR).toBe('/custom/config'); // From profileEnv
      expect(envArg.ANTHROPIC_AUTH_TOKEN).toBe('sk-api-profile'); // From apiProfileEnv (highest for ANTHROPIC_*)

      // Verify standard Python env vars
      expect(envArg.PYTHONUNBUFFERED).toBe('1');
      expect(envArg.PYTHONIOENCODING).toBe('utf-8');
      expect(envArg.PYTHONUTF8).toBe('1');
    });

    it('should call getOAuthModeClearVars and apply clearing when in OAuth mode', async () => {
      // OAuth mode - empty API profile
      vi.mocked(profileService.getAPIProfileEnv).mockResolvedValue({});

      await processManager.spawnProcess('task-1', '/fake/cwd', ['run.py'], {}, 'task-execution');

      const envArg = spawnCalls[0].options.env as Record<string, unknown>;

      // Verify clearing vars are applied (empty strings for ANTHROPIC_* vars)
      expect(envArg.ANTHROPIC_AUTH_TOKEN).toBe('');
      expect(envArg.ANTHROPIC_BASE_URL).toBe('');
      expect(envArg.ANTHROPIC_MODEL).toBe('');
      expect(envArg.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('');
      expect(envArg.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('');
      expect(envArg.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('');
    });

    it('should handle getAPIProfileEnv errors gracefully', async () => {
      // Simulate service error
      vi.mocked(profileService.getAPIProfileEnv).mockRejectedValue(new Error('Service unavailable'));

      // Should not throw - should fall back to OAuth mode
      await expect(
        processManager.spawnProcess('task-1', '/fake/cwd', ['run.py'], {}, 'task-execution')
      ).resolves.not.toThrow();

      const envArg = spawnCalls[0].options.env as Record<string, unknown>;

      // Should have clearing vars (falls back to OAuth mode on error)
      expect(envArg.ANTHROPIC_AUTH_TOKEN).toBe('');
      expect(envArg.ANTHROPIC_BASE_URL).toBe('');
    });
  });
});
