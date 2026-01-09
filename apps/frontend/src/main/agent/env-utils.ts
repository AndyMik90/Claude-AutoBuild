/**
 * Utility functions for managing environment variables in agent spawning
 */

/**
 * Get environment variables to clear ANTHROPIC_* vars when in OAuth mode
 *
 * When switching from API Profile mode to OAuth mode, residual ANTHROPIC_*
 * environment variables from process.env can cause authentication failures.
 * This function returns an object with empty strings for these vars when
 * no API profile is active, ensuring OAuth tokens are used correctly.
 *
 * **Why empty strings?** Setting environment variables to empty strings (rather than
 * undefined) ensures they override any stale values from process.env. Python's SDK
 * treats empty strings as falsy in conditional checks like `if token:`, so empty
 * strings effectively disable these authentication parameters without leaving
 * undefined values that might be ignored during object spreading.
 *
 * @param apiProfileEnv - Environment variables from getAPIProfileEnv()
 * @returns Object with empty ANTHROPIC_* vars if in OAuth mode, empty object otherwise
 */
export function getOAuthModeClearVars(apiProfileEnv: Record<string, string>): Record<string, string> {
  // If API profile is active (has ANTHROPIC_* vars), don't clear anything
  if (apiProfileEnv && Object.keys(apiProfileEnv).some(key => key.startsWith('ANTHROPIC_'))) {
    return {};
  }

  // In OAuth mode (no API profile), clear all ANTHROPIC_* vars
  // Setting to empty string ensures they override any values from process.env
  // Python's `if token:` checks treat empty strings as falsy
  //
  // IMPORTANT: ANTHROPIC_API_KEY is included to prevent Claude Code from using
  // API keys that may be present in the shell environment instead of OAuth tokens.
  // Without clearing this, Claude Code would show "Claude API" instead of "Claude Max".
  return {
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_AUTH_TOKEN: '',
    ANTHROPIC_BASE_URL: '',
    ANTHROPIC_MODEL: '',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
    ANTHROPIC_DEFAULT_SONNET_MODEL: '',
    ANTHROPIC_DEFAULT_OPUS_MODEL: ''
  };
}
