/**
 * Unit tests for GitLab utility functions
 * Tests authentication, sanitization, and URL parsing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
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

describe('GitLab Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authenticateGlabCli', () => {
    it('should authenticate successfully with valid token and default URL', () => {
      const mockExecFileSync = vi.mocked(execFileSync);
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      const result = authenticateGlabCli('glpat-test123token', 'https://gitlab.com');

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'glab',
        ['auth', 'login', '--stdin', '--hostname', 'gitlab.com'],
        expect.objectContaining({
          input: 'glpat-test123token\n',
          encoding: 'utf-8',
          stdio: 'pipe',
        })
      );
    });

    it('should authenticate with self-hosted GitLab instance', () => {
      const mockExecFileSync = vi.mocked(execFileSync);
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      const result = authenticateGlabCli('glpat-test123token', 'https://gitlab.mycompany.com');

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'glab',
        ['auth', 'login', '--stdin', '--hostname', 'gitlab.mycompany.com'],
        expect.objectContaining({
          input: 'glpat-test123token\n',
        })
      );
    });

    it('should use default URL when none provided', () => {
      const mockExecFileSync = vi.mocked(execFileSync);
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      const result = authenticateGlabCli('glpat-test123token');

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'glab',
        ['auth', 'login', '--stdin', '--hostname', 'gitlab.com'],
        expect.any(Object)
      );
    });

    it('should return false for empty token', () => {
      const mockExecFileSync = vi.mocked(execFileSync);

      const result = authenticateGlabCli('');

      expect(result).toBe(false);
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it('should return false for whitespace-only token', () => {
      const mockExecFileSync = vi.mocked(execFileSync);

      const result = authenticateGlabCli('   \n\t  ');

      expect(result).toBe(false);
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it('should sanitize token by removing control characters', () => {
      const mockExecFileSync = vi.mocked(execFileSync);
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      // Token with control characters (should be stripped)
      const dirtyToken = 'glpat-test\x00\x01\x1Ftoken';
      const cleanToken = 'glpat-testtoken';

      const result = authenticateGlabCli(dirtyToken);

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'glab',
        expect.any(Array),
        expect.objectContaining({
          input: `${cleanToken}\n`,
        })
      );
    });

    it('should return false for invalid instance URL', () => {
      const mockExecFileSync = vi.mocked(execFileSync);

      const result = authenticateGlabCli('glpat-test123token', 'not-a-valid-url');

      expect(result).toBe(false);
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it('should return false when glab CLI execution fails', () => {
      const mockExecFileSync = vi.mocked(execFileSync);
      mockExecFileSync.mockImplementation(() => {
        throw new Error('glab command not found');
      });

      const result = authenticateGlabCli('glpat-test123token');

      expect(result).toBe(false);
    });

    it('should handle authentication failure gracefully', () => {
      const mockExecFileSync = vi.mocked(execFileSync);
      mockExecFileSync.mockImplementation(() => {
        const error = new Error('authentication failed') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      });

      const result = authenticateGlabCli('glpat-test123token');

      expect(result).toBe(false);
    });

    it('should truncate extremely long tokens', () => {
      const mockExecFileSync = vi.mocked(execFileSync);
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      // Create a token longer than 512 characters
      const longToken = 'glpat-' + 'a'.repeat(520);
      const expectedToken = longToken.substring(0, 512);

      const result = authenticateGlabCli(longToken);

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'glab',
        expect.any(Array),
        expect.objectContaining({
          input: `${expectedToken}\n`,
        })
      );
    });

    it('should handle URLs with trailing slashes', () => {
      const mockExecFileSync = vi.mocked(execFileSync);
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      const result = authenticateGlabCli('glpat-test123token', 'https://gitlab.com/');

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'glab',
        ['auth', 'login', '--stdin', '--hostname', 'gitlab.com'],
        expect.any(Object)
      );
    });

    it('should handle URLs with paths', () => {
      const mockExecFileSync = vi.mocked(execFileSync);
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      const result = authenticateGlabCli('glpat-test123token', 'https://gitlab.com/api/v4');

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'glab',
        ['auth', 'login', '--stdin', '--hostname', 'gitlab.com'],
        expect.any(Object)
      );
    });

    it('should reject URLs with credentials', () => {
      const mockExecFileSync = vi.mocked(execFileSync);

      const result = authenticateGlabCli('glpat-test123token', 'https://user:pass@gitlab.com');

      expect(result).toBe(false);
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it('should accept HTTP URLs (for local development)', () => {
      const mockExecFileSync = vi.mocked(execFileSync);
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      const result = authenticateGlabCli('glpat-test123token', 'http://localhost:8080');

      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'glab',
        ['auth', 'login', '--stdin', '--hostname', 'localhost'],
        expect.any(Object)
      );
    });

    it('should use augmented environment from getAugmentedEnv', () => {
      const mockExecFileSync = vi.mocked(execFileSync);
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      authenticateGlabCli('glpat-test123token');

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'glab',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            PATH: '/mock/path',
          }),
        })
      );
    });
  });
});
