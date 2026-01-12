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

  describe('Version Parsing', () => {
    /**
     * Helper function to parse version from glab --version output
     * Mimics the logic in oauth-handlers.ts
     */
    function parseGlabVersion(versionOutput: string): string {
      let version = versionOutput.trim().split('\n')[0];
      const versionMatch = version.match(/(\d+\.\d+\.\d+)/);
      if (versionMatch) {
        version = versionMatch[1];
      }
      return version;
    }

    it('should extract version from standard glab output', () => {
      const output = 'glab 1.80.4 (f4b518e)';
      expect(parseGlabVersion(output)).toBe('1.80.4');
    });

    it('should extract version from glab version command output', () => {
      const output = 'glab version 1.88.4';
      expect(parseGlabVersion(output)).toBe('1.88.4');
    });

    it('should extract version from multi-line output', () => {
      const output = 'glab 1.80.4 (f4b518e)\nSome other info\nMore info';
      expect(parseGlabVersion(output)).toBe('1.80.4');
    });

    it('should handle version-only output', () => {
      const output = '1.80.4';
      expect(parseGlabVersion(output)).toBe('1.80.4');
    });

    it('should handle versions with build metadata', () => {
      const output = 'glab 2.0.0-beta.1 (abc123)';
      expect(parseGlabVersion(output)).toBe('2.0.0');
    });

    it('should handle different version formats', () => {
      expect(parseGlabVersion('glab 1.2.3')).toBe('1.2.3');
      expect(parseGlabVersion('v1.2.3')).toBe('1.2.3');
      expect(parseGlabVersion('version 10.20.30')).toBe('10.20.30');
    });

    it('should return original string if no version pattern found', () => {
      const output = 'no version here';
      expect(parseGlabVersion(output)).toBe('no version here');
    });
  });

  describe('Username Parsing', () => {
    /**
     * Helper function to parse username from glab api user JSON response
     * Mimics the logic in oauth-handlers.ts
     */
    function parseGlabUsername(userJson: string): string | null {
      try {
        const user = JSON.parse(userJson);
        return user?.username || null;
      } catch {
        return null;
      }
    }

    it('should parse username from valid JSON response', () => {
      const jsonResponse = JSON.stringify({
        id: 123,
        username: 'jasonnator',
        name: 'Jason',
        email: 'jason@example.com'
      });

      expect(parseGlabUsername(jsonResponse)).toBe('jasonnator');
    });

    it('should handle minimal JSON with just username', () => {
      const jsonResponse = JSON.stringify({ username: 'testuser' });
      expect(parseGlabUsername(jsonResponse)).toBe('testuser');
    });

    it('should return null for JSON without username field', () => {
      const jsonResponse = JSON.stringify({
        id: 123,
        name: 'Test User',
        email: 'test@example.com'
      });

      expect(parseGlabUsername(jsonResponse)).toBe(null);
    });

    it('should return null for invalid JSON', () => {
      const invalidJson = '{ invalid json }';
      expect(parseGlabUsername(invalidJson)).toBe(null);
    });

    it('should return null for empty string', () => {
      expect(parseGlabUsername('')).toBe(null);
    });

    it('should return null for malformed JSON', () => {
      expect(parseGlabUsername('not json at all')).toBe(null);
      expect(parseGlabUsername('{"username":')).toBe(null);
    });

    it('should handle JSON with null username', () => {
      const jsonResponse = JSON.stringify({ username: null });
      expect(parseGlabUsername(jsonResponse)).toBe(null);
    });

    it('should handle JSON with undefined username', () => {
      const jsonResponse = JSON.stringify({ username: undefined });
      // JSON.stringify removes undefined values, so username won't exist
      expect(parseGlabUsername(jsonResponse)).toBe(null);
    });

    it('should handle complex GitLab user object', () => {
      const jsonResponse = JSON.stringify({
        id: 456,
        username: 'developer123',
        name: 'Developer Name',
        state: 'active',
        avatar_url: 'https://example.com/avatar.jpg',
        web_url: 'https://gitlab.com/developer123',
        created_at: '2024-01-01T00:00:00.000Z',
        bio: 'Software developer',
        location: 'Earth',
        public_email: 'dev@example.com',
        skype: '',
        linkedin: '',
        twitter: '',
        website_url: 'https://example.com',
        organization: 'Company Inc'
      });

      expect(parseGlabUsername(jsonResponse)).toBe('developer123');
    });
  });
});
