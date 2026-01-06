import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAPIProfileEnv = vi.fn();
const mockGetOAuthModeClearVars = vi.fn();

vi.mock('../../../../services/profile', () => ({
  getAPIProfileEnv: (...args: unknown[]) => mockGetAPIProfileEnv(...args),
}));

vi.mock('../../../../agent/env-utils', () => ({
  getOAuthModeClearVars: (...args: unknown[]) => mockGetOAuthModeClearVars(...args),
}));

import { getRunnerEnv } from '../runner-env';

describe('getRunnerEnv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges API profile env with OAuth clear vars', async () => {
    mockGetAPIProfileEnv.mockResolvedValue({
      ANTHROPIC_AUTH_TOKEN: 'token',
      ANTHROPIC_BASE_URL: 'https://api.example.com',
    });
    mockGetOAuthModeClearVars.mockReturnValue({
      ANTHROPIC_AUTH_TOKEN: '',
    });

    const result = await getRunnerEnv();

    expect(mockGetOAuthModeClearVars).toHaveBeenCalledWith({
      ANTHROPIC_AUTH_TOKEN: 'token',
      ANTHROPIC_BASE_URL: 'https://api.example.com',
    });
    expect(result).toEqual({
      ANTHROPIC_AUTH_TOKEN: '',
      ANTHROPIC_BASE_URL: 'https://api.example.com',
    });
  });

  it('includes extra env values', async () => {
    mockGetAPIProfileEnv.mockResolvedValue({
      ANTHROPIC_AUTH_TOKEN: 'token',
    });
    mockGetOAuthModeClearVars.mockReturnValue({});

    const result = await getRunnerEnv({ USE_CLAUDE_MD: 'true' });

    expect(result).toEqual({
      ANTHROPIC_AUTH_TOKEN: 'token',
      USE_CLAUDE_MD: 'true',
    });
  });
});
