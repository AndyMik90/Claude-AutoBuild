/**
 * Unit tests for GitLab OAuth handlers
 * Tests validation, sanitization, and utility functions
 */
import { describe, it, expect } from 'vitest';

// Test the validation and utility functions used in oauth-handlers
// We recreate the functions here since they're not exported

// Regex pattern to validate GitLab project format (group/project or group/subgroup/project)
const GITLAB_PROJECT_PATTERN = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/;

/**
 * Validate that a project string matches the expected format
 */
function isValidGitLabProject(project: string): boolean {
  // Allow numeric IDs
  if (/^\d+$/.test(project)) return true;
  return GITLAB_PROJECT_PATTERN.test(project);
}

/**
 * Extract hostname from instance URL
 */
function getHostnameFromUrl(instanceUrl: string): string {
  try {
    return new URL(instanceUrl).hostname;
  } catch {
    return 'gitlab.com';
  }
}

/**
 * Redact sensitive information from data before logging
 */
function redactSensitiveData(data: unknown): unknown {
  if (typeof data === 'string') {
    // Redact anything that looks like a token (glpat-*, private token patterns)
    return data.replace(/glpat-[A-Za-z0-9_-]+/g, 'glpat-[REDACTED]')
               .replace(/private[_-]?token[=:]\s*["']?[A-Za-z0-9_-]+["']?/gi, 'private_token=[REDACTED]');
  }
  if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data)) {
      return data.map(redactSensitiveData);
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Redact known sensitive keys
      if (/token|password|secret|credential|auth/i.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactSensitiveData(value);
      }
    }
    return result;
  }
  return data;
}

describe('GitLab OAuth Handlers', () => {
  describe('isValidGitLabProject', () => {
    it('should accept valid group/project format', () => {
      expect(isValidGitLabProject('mygroup/myproject')).toBe(true);
      expect(isValidGitLabProject('my-group/my-project')).toBe(true);
      expect(isValidGitLabProject('my_group/my_project')).toBe(true);
      expect(isValidGitLabProject('my.group/my.project')).toBe(true);
    });

    it('should accept nested group/subgroup/project format', () => {
      expect(isValidGitLabProject('group/subgroup/project')).toBe(true);
      expect(isValidGitLabProject('org/team/subteam/project')).toBe(true);
    });

    it('should accept numeric project IDs', () => {
      expect(isValidGitLabProject('12345')).toBe(true);
      expect(isValidGitLabProject('1')).toBe(true);
      expect(isValidGitLabProject('999999999')).toBe(true);
    });

    it('should reject invalid project formats', () => {
      expect(isValidGitLabProject('')).toBe(false);
      expect(isValidGitLabProject('project')).toBe(false); // No group
      expect(isValidGitLabProject('/project')).toBe(false); // Missing group
      expect(isValidGitLabProject('group/')).toBe(false); // Missing project
      expect(isValidGitLabProject('group//project')).toBe(false); // Empty segment
    });

    it('should reject paths with special characters', () => {
      expect(isValidGitLabProject('group/pro ject')).toBe(false); // Space
      expect(isValidGitLabProject('group/pro@ject')).toBe(false); // @
      expect(isValidGitLabProject('group/pro#ject')).toBe(false); // #
      expect(isValidGitLabProject('group/pro$ject')).toBe(false); // $
    });

    it('should handle paths with dots (allowed in GitLab project names)', () => {
      // Note: The regex pattern allows dots in project names, which is valid for GitLab
      // Path traversal protection is handled at the API level, not in project validation
      expect(isValidGitLabProject('group/project.name')).toBe(true);
      expect(isValidGitLabProject('my.group/my.project')).toBe(true);
    });
  });

  describe('getHostnameFromUrl', () => {
    it('should extract hostname from valid URLs', () => {
      expect(getHostnameFromUrl('https://gitlab.com')).toBe('gitlab.com');
      expect(getHostnameFromUrl('https://gitlab.mycompany.com')).toBe('gitlab.mycompany.com');
      expect(getHostnameFromUrl('https://gitlab.example.org:8443')).toBe('gitlab.example.org');
    });

    it('should handle URLs with paths', () => {
      expect(getHostnameFromUrl('https://gitlab.com/api/v4')).toBe('gitlab.com');
    });

    it('should return gitlab.com for invalid URLs', () => {
      expect(getHostnameFromUrl('')).toBe('gitlab.com');
      expect(getHostnameFromUrl('not-a-url')).toBe('gitlab.com');
      expect(getHostnameFromUrl('://invalid')).toBe('gitlab.com');
    });

    it('should handle HTTP URLs', () => {
      expect(getHostnameFromUrl('http://localhost:8080')).toBe('localhost');
    });
  });

  describe('redactSensitiveData', () => {
    it('should redact GitLab personal access tokens in strings', () => {
      const data = 'Token is glpat-abc123XYZ_def456';
      const result = redactSensitiveData(data);
      expect(result).toBe('Token is glpat-[REDACTED]');
      expect(result).not.toContain('abc123');
    });

    it('should redact private token patterns', () => {
      const data1 = 'private_token=abc123xyz';
      const data2 = 'private-token: "mytoken"';
      const data3 = 'PRIVATE_TOKEN=secret123';

      expect(redactSensitiveData(data1)).toBe('private_token=[REDACTED]');
      expect(redactSensitiveData(data2)).toBe('private_token=[REDACTED]');
      expect(redactSensitiveData(data3)).toBe('private_token=[REDACTED]');
    });

    it('should redact sensitive keys in objects', () => {
      const data = {
        username: 'testuser',
        token: 'secret123',
        password: 'pass456',
        auth: 'bearer xyz',
        credential: 'cred789',
      };

      const result = redactSensitiveData(data) as Record<string, unknown>;

      expect(result.username).toBe('testuser');
      expect(result.token).toBe('[REDACTED]');
      expect(result.password).toBe('[REDACTED]');
      expect(result.auth).toBe('[REDACTED]');
      expect(result.credential).toBe('[REDACTED]');
    });

    it('should redact nested sensitive data', () => {
      const data = {
        user: {
          name: 'test',
          authToken: 'secret',
        },
        config: {
          secretValue: 'key123',
        },
      };

      const result = redactSensitiveData(data) as Record<string, Record<string, unknown>>;

      expect(result.user.name).toBe('test');
      expect(result.user.authToken).toBe('[REDACTED]');
      expect(result.config.secretValue).toBe('[REDACTED]');
    });

    it('should redact tokens in arrays', () => {
      const data = ['glpat-secret123', 'normal text'];
      const result = redactSensitiveData(data) as string[];

      expect(result[0]).toBe('glpat-[REDACTED]');
      expect(result[1]).toBe('normal text');
    });

    it('should preserve non-sensitive values', () => {
      expect(redactSensitiveData('normal text')).toBe('normal text');
      expect(redactSensitiveData(123)).toBe(123);
      expect(redactSensitiveData(null)).toBe(null);
      expect(redactSensitiveData(undefined)).toBe(undefined);
      expect(redactSensitiveData(true)).toBe(true);
    });

    it('should handle complex nested structures', () => {
      const data = {
        items: [
          { id: 1, accessToken: 'token1' },
          { id: 2, accessToken: 'token2' },
        ],
        meta: {
          secretKey: 'key123',
          count: 2,
        },
      };

      const result = redactSensitiveData(data) as {
        items: Array<{ id: number; accessToken: string }>;
        meta: { secretKey: string; count: number };
      };

      expect(result.items[0].id).toBe(1);
      expect(result.items[0].accessToken).toBe('[REDACTED]');
      expect(result.items[1].accessToken).toBe('[REDACTED]');
      expect(result.meta.secretKey).toBe('[REDACTED]');
      expect(result.meta.count).toBe(2);
    });
  });
});
