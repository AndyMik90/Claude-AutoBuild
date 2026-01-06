import { getOAuthModeClearVars } from '../../../agent/env-utils';
import { getAPIProfileEnv } from '../../../services/profile';
import { getProfileEnv } from '../../../rate-limit-detector';

/**
 * Get environment variables for Python runner subprocesses.
 *
 * Environment variable precedence (lowest to highest):
 * 1. apiProfileEnv - Custom Anthropic-compatible API profile (ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN)
 * 2. oauthModeClearVars - Clears stale ANTHROPIC_* vars when in OAuth mode
 * 3. profileEnv - Claude OAuth token from profile manager (CLAUDE_CODE_OAUTH_TOKEN)
 * 4. extraEnv - Caller-specific vars (e.g., USE_CLAUDE_MD)
 *
 * The profileEnv is critical for OAuth authentication (#563) - it retrieves the
 * decrypted OAuth token from the profile manager's encrypted storage (macOS Keychain
 * via Electron's safeStorage API).
 */
export async function getRunnerEnv(
  extraEnv?: Record<string, string>
): Promise<Record<string, string>> {
  const apiProfileEnv = await getAPIProfileEnv();
  const oauthModeClearVars = getOAuthModeClearVars(apiProfileEnv);
  const profileEnv = getProfileEnv();

  return {
    ...apiProfileEnv,
    ...oauthModeClearVars,
    ...profileEnv,  // OAuth token from profile manager (fixes #563)
    ...extraEnv,
  };
}
