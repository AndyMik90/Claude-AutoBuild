import { getOAuthModeClearVars } from '../../../agent/env-utils';
import { getAPIProfileEnv } from '../../../services/profile';
import { getProfileEnv } from '../../../rate-limit-detector';
import { pythonEnvManager } from '../../../python-env-manager';

/**
 * Get environment variables for Python runner subprocesses.
 *
 * Environment variable precedence (lowest to highest):
 * 1. pythonEnv - Python environment including PYTHONPATH for bundled packages (fixes #139)
 * 2. apiProfileEnv - Custom Anthropic-compatible API profile (ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN)
 * 3. oauthModeClearVars - Clears stale ANTHROPIC_* vars when in OAuth mode
 * 4. profileEnv - Claude OAuth token from profile manager (CLAUDE_CODE_OAUTH_TOKEN)
 * 5. extraEnv - Caller-specific vars (e.g., USE_CLAUDE_MD)
 *
 * The pythonEnv is critical for packaged apps (#139) - without PYTHONPATH, Python
 * cannot find bundled dependencies like dotenv, claude_agent_sdk, etc.
 *
 * The profileEnv is critical for OAuth authentication (#563) - it retrieves the
 * decrypted OAuth token from the profile manager's encrypted storage (macOS Keychain
 * via Electron's safeStorage API).
 */
export async function getRunnerEnv(
  extraEnv?: Record<string, string>
): Promise<Record<string, string>> {
  const pythonEnv = pythonEnvManager.getPythonEnv();
  const apiProfileEnv = await getAPIProfileEnv();
  const oauthModeClearVars = getOAuthModeClearVars(apiProfileEnv);
  const profileEnv = getProfileEnv();

  return {
    ...pythonEnv,  // Python environment including PYTHONPATH (fixes #139)
    ...apiProfileEnv,
    ...oauthModeClearVars,
    ...profileEnv,  // OAuth token from profile manager (fixes #563)
    ...extraEnv,
  };
}
