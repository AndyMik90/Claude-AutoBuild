import { describe, it, expect } from 'vitest';
import path from 'path';
import { shouldExecuteSetup, _testExports } from '../worktree-setup';

const { truncateOutput, validateWorktreePath, sanitizeForLogging, SENSITIVE_PATTERNS } = _testExports;

describe('worktree-setup', () => {
  describe('truncateOutput', () => {
    it('should return original string if under limit', () => {
      const output = 'short output';
      expect(truncateOutput(output, 100)).toBe(output);
    });

    it('should truncate and preserve tail when over limit', () => {
      const output = 'a'.repeat(100);
      const result = truncateOutput(output, 50);
      
      expect(result.startsWith('[...truncated...]\n')).toBe(true);
      expect(result.length).toBeLessThanOrEqual(50);
      expect(result.endsWith('a')).toBe(true);
    });

    it('should preserve the most recent content (tail)', () => {
      const output = 'START_' + 'x'.repeat(100) + '_END';
      const result = truncateOutput(output, 50);
      
      expect(result).toContain('_END');
      expect(result).not.toContain('START_');
    });
  });

  describe('validateWorktreePath', () => {
    const projectPath = '/home/user/my-project';

    it('should accept valid worktree path inside .worktrees', () => {
      const worktreePath = '/home/user/my-project/.worktrees/001-feature';
      expect(validateWorktreePath(worktreePath, projectPath)).toBe(true);
    });

    it('should accept .worktrees directory itself', () => {
      const worktreePath = '/home/user/my-project/.worktrees';
      expect(validateWorktreePath(worktreePath, projectPath)).toBe(true);
    });

    it('should reject path outside .worktrees', () => {
      const worktreePath = '/home/user/my-project/src';
      expect(validateWorktreePath(worktreePath, projectPath)).toBe(false);
    });

    it('should reject path traversal attempt', () => {
      const worktreePath = '/home/user/my-project/.worktrees/../../../etc/passwd';
      expect(validateWorktreePath(worktreePath, projectPath)).toBe(false);
    });

    it('should reject path outside project entirely', () => {
      const worktreePath = '/tmp/malicious';
      expect(validateWorktreePath(worktreePath, projectPath)).toBe(false);
    });

    it('should reject sibling directory with similar name', () => {
      const worktreePath = '/home/user/my-project/.worktrees-fake/001-feature';
      expect(validateWorktreePath(worktreePath, projectPath)).toBe(false);
    });

    it('should handle nested worktree paths', () => {
      const worktreePath = '/home/user/my-project/.worktrees/001-feature/subdir';
      expect(validateWorktreePath(worktreePath, projectPath)).toBe(true);
    });

    it('should handle Windows-style paths', () => {
      const winProject = 'C:\\Users\\dev\\project';
      const winWorktree = path.join(winProject, '.worktrees', '001-feature');
      expect(validateWorktreePath(winWorktree, winProject)).toBe(true);
    });
  });

  describe('sanitizeForLogging', () => {
    it('should redact API keys in various formats', () => {
      const inputs = [
        'api_key=abc123xyz',
        'apikey: secret123',
        'API-KEY=mykey',
        'api-key: "quoted_value"',
      ];
      
      for (const input of inputs) {
        expect(sanitizeForLogging(input)).toBe('[REDACTED]');
      }
    });

    it('should redact Bearer tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload';
      expect(sanitizeForLogging(input)).toContain('[REDACTED]');
      expect(sanitizeForLogging(input)).not.toContain('Bearer');
    });

    it('should redact OpenAI API keys', () => {
      const input = 'OPENAI_API_KEY=sk-abc123def456ghi789jkl012mno345pqr678stu901vwx';
      const result = sanitizeForLogging(input);
      expect(result).not.toContain('sk-abc123');
    });

    it('should redact GitHub PATs', () => {
      const input = 'token=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const result = sanitizeForLogging(input);
      expect(result).not.toContain('ghp_');
    });

    it('should redact npm tokens', () => {
      const input = 'NPM_TOKEN=npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const result = sanitizeForLogging(input);
      expect(result).not.toContain('npm_');
    });

    it('should redact password fields', () => {
      const input = 'password=mysecretpassword123';
      expect(sanitizeForLogging(input)).toBe('[REDACTED]');
    });

    it('should preserve non-sensitive content', () => {
      const input = 'Installing packages...\nDone in 5.2s';
      expect(sanitizeForLogging(input)).toBe(input);
    });

    it('should handle mixed content', () => {
      const input = 'Connecting with api_key=secret123\nDownloading...\ntoken: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nComplete!';
      const result = sanitizeForLogging(input);
      
      expect(result).toContain('Connecting with');
      expect(result).toContain('[REDACTED]');
      expect(result).toContain('Downloading...');
      expect(result).toContain('Complete!');
      expect(result).not.toContain('secret123');
      expect(result).not.toContain('ghp_');
    });
  });

  describe('SENSITIVE_PATTERNS', () => {
    it('should have patterns for common sensitive data', () => {
      expect(SENSITIVE_PATTERNS.length).toBeGreaterThanOrEqual(5);
    });

    it('should include OpenAI key pattern', () => {
      const hasOpenAIPattern = SENSITIVE_PATTERNS.some(p => 
        p.test('sk-abcdefghijklmnopqrstuvwxyz')
      );
      expect(hasOpenAIPattern).toBe(true);
    });

    it('should include GitHub PAT pattern', () => {
      const hasGitHubPattern = SENSITIVE_PATTERNS.some(p => 
        p.test('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
      );
      expect(hasGitHubPattern).toBe(true);
    });
  });

  describe('shouldExecuteSetup', () => {
    it('should return false for undefined config', () => {
      expect(shouldExecuteSetup(undefined)).toBe(false);
    });

    it('should return false when disabled', () => {
      expect(shouldExecuteSetup({ enabled: false, commands: ['npm ci'], timeout: 300000 })).toBe(false);
    });

    it('should return false when commands array is empty', () => {
      expect(shouldExecuteSetup({ enabled: true, commands: [], timeout: 300000 })).toBe(false);
    });

    it('should return true when enabled with commands', () => {
      expect(shouldExecuteSetup({ enabled: true, commands: ['npm ci'], timeout: 300000 })).toBe(true);
    });

    it('should return true with multiple commands', () => {
      expect(shouldExecuteSetup({ 
        enabled: true, 
        commands: ['npm ci', 'cp .env.example .env'], 
        timeout: 300000 
      })).toBe(true);
    });
  });

  describe('timeout calculation', () => {
    it('should enforce minimum 30s per command', () => {
      const MIN_COMMAND_TIMEOUT_MS = 30_000;
      const totalTimeout = 60_000;
      const commandCount = 10;
      
      const calculatedPerCommand = Math.floor(totalTimeout / commandCount);
      const perCommandTimeout = Math.max(calculatedPerCommand, MIN_COMMAND_TIMEOUT_MS);
      
      expect(calculatedPerCommand).toBe(6_000);
      expect(perCommandTimeout).toBe(MIN_COMMAND_TIMEOUT_MS);
    });

    it('should use calculated timeout when above minimum', () => {
      const MIN_COMMAND_TIMEOUT_MS = 30_000;
      const totalTimeout = 300_000;
      const commandCount = 2;
      
      const calculatedPerCommand = Math.floor(totalTimeout / commandCount);
      const perCommandTimeout = Math.max(calculatedPerCommand, MIN_COMMAND_TIMEOUT_MS);
      
      expect(calculatedPerCommand).toBe(150_000);
      expect(perCommandTimeout).toBe(150_000);
    });
  });
});
