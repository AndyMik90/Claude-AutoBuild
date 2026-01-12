/**
 * Unit tests for GitLab utility functions
 * Tests authentication, sanitization, and URL parsing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, execFileSync } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}));

// Mock env-utils
vi.mock('../../../env-utils', () => ({
  getAugmentedEnv: vi.fn(() => ({ PATH: '/mock/path' })),
}));

// Import the functions we're testing
// Note: We need to import after mocking to get the mocked versions
import { authenticateGlabCli } from '../utils';

/**
 * Helper to create a mock child process for spawn
 */
function createMockChildProcess(exitCode: number = 0, shouldError: boolean = false) {
  const mockChild = new EventEmitter() as any;

  // Add stdin, stdout, stderr streams
  mockChild.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  mockChild.stdout = new EventEmitter();
  mockChild.stderr = new EventEmitter();

  // Simulate process completion after a tick
  process.nextTick(() => {
    if (shouldError) {
      mockChild.emit('error', new Error('spawn glab ENOENT'));
    } else {
      mockChild.emit('close', exitCode);
    }
  });

  return mockChild;
}

describe('GitLab Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authenticateGlabCli', () => {
    it('should authenticate successfully with valid token and default URL', async () => {
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockReturnValue(createMockChildProcess(0));

      const result = await authenticateGlabCli('glpat-test123token', 'https://gitlab.com');

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'glab',
        ['auth', 'login', '--stdin', '--hostname', 'gitlab.com'],
        expect.objectContaining({
          env: expect.objectContaining({ PATH: '/mock/path' }),
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      );
    });

    it('should authenticate with self-hosted GitLab instance', async () => {
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockReturnValue(createMockChildProcess(0));

      const result = await authenticateGlabCli('glpat-test123token', 'https://gitlab.mycompany.com');

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'glab',
        ['auth', 'login', '--stdin', '--hostname', 'gitlab.mycompany.com'],
        expect.any(Object)
      );
    });

    it('should use default URL when none provided', async () => {
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockReturnValue(createMockChildProcess(0));

      const result = await authenticateGlabCli('glpat-test123token');

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'glab',
        ['auth', 'login', '--stdin', '--hostname', 'gitlab.com'],
        expect.any(Object)
      );
    });

    it('should return false for empty token', async () => {
      const mockSpawn = vi.mocked(spawn);

      const result = await authenticateGlabCli('');

      expect(result).toBe(false);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should return false for whitespace-only token', async () => {
      const mockSpawn = vi.mocked(spawn);

      const result = await authenticateGlabCli('   \n\t  ');

      expect(result).toBe(false);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should sanitize token by removing control characters', async () => {
      const mockSpawn = vi.mocked(spawn);
      const mockChild = createMockChildProcess(0);
      mockSpawn.mockReturnValue(mockChild);

      // Token with control characters (should be stripped)
      const dirtyToken = 'glpat-test\x00\x01\x1Ftoken';
      const cleanToken = 'glpat-testtoken';

      const result = await authenticateGlabCli(dirtyToken);

      expect(result).toBe(true);
      expect(mockChild.stdin.write).toHaveBeenCalledWith(`${cleanToken}\n`);
    });

    it('should return false for invalid instance URL', async () => {
      const mockSpawn = vi.mocked(spawn);

      const result = await authenticateGlabCli('glpat-test123token', 'not-a-valid-url');

      expect(result).toBe(false);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should return false when glab CLI execution fails', async () => {
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockReturnValue(createMockChildProcess(0, true)); // shouldError = true

      const result = await authenticateGlabCli('glpat-test123token');

      expect(result).toBe(false);
    });

    it('should handle authentication failure gracefully', async () => {
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockReturnValue(createMockChildProcess(1)); // exit code 1 = failure

      const result = await authenticateGlabCli('glpat-test123token');

      expect(result).toBe(false);
    });

    it('should truncate extremely long tokens', async () => {
      const mockSpawn = vi.mocked(spawn);
      const mockChild = createMockChildProcess(0);
      mockSpawn.mockReturnValue(mockChild);

      // Create a token longer than 512 characters
      const longToken = 'glpat-' + 'a'.repeat(520);
      const expectedToken = longToken.substring(0, 512);

      const result = await authenticateGlabCli(longToken);

      expect(result).toBe(true);
      expect(mockChild.stdin.write).toHaveBeenCalledWith(`${expectedToken}\n`);
    });

    it('should handle URLs with trailing slashes', async () => {
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockReturnValue(createMockChildProcess(0));

      const result = await authenticateGlabCli('glpat-test123token', 'https://gitlab.com/');

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'glab',
        ['auth', 'login', '--stdin', '--hostname', 'gitlab.com'],
        expect.any(Object)
      );
    });

    it('should handle URLs with paths', async () => {
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockReturnValue(createMockChildProcess(0));

      const result = await authenticateGlabCli('glpat-test123token', 'https://gitlab.com/api/v4');

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'glab',
        ['auth', 'login', '--stdin', '--hostname', 'gitlab.com'],
        expect.any(Object)
      );
    });

    it('should reject URLs with credentials', async () => {
      const mockSpawn = vi.mocked(spawn);

      const result = await authenticateGlabCli('glpat-test123token', 'https://user:pass@gitlab.com');

      expect(result).toBe(false);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should accept HTTP URLs (for local development)', async () => {
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockReturnValue(createMockChildProcess(0));

      const result = await authenticateGlabCli('glpat-test123token', 'http://localhost:8080');

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'glab',
        ['auth', 'login', '--stdin', '--hostname', 'localhost'],
        expect.any(Object)
      );
    });

    it('should use augmented environment from getAugmentedEnv', async () => {
      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockReturnValue(createMockChildProcess(0));

      await authenticateGlabCli('glpat-test123token');

      expect(mockSpawn).toHaveBeenCalledWith(
        'glab',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            PATH: '/mock/path',
          }),
        })
      );
    });

    it('should use shell:true on Windows platform', async () => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      const mockSpawn = vi.mocked(spawn);
      mockSpawn.mockReturnValue(createMockChildProcess(0));

      await authenticateGlabCli('glpat-test123token');

      expect(mockSpawn).toHaveBeenCalledWith(
        'glab',
        expect.any(Array),
        expect.objectContaining({
          shell: true,
        })
      );

      // Restore original descriptor
      if (originalDescriptor) {
        Object.defineProperty(process, 'platform', originalDescriptor);
      }
    });
  });
});
