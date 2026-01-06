import { getOAuthModeClearVars } from '../../../agent/env-utils';
import { getAPIProfileEnv } from '../../../services/profile';
import { getClaudeProfileManager } from '../../../claude-profile-manager';

export async function getRunnerEnv(
  extraEnv?: Record<string, string>
): Promise<Record<string, string>> {
  const apiProfileEnv = await getAPIProfileEnv();
  const oauthModeClearVars = getOAuthModeClearVars(apiProfileEnv);
  
  // Get Claude OAuth profile env (CLAUDE_CODE_OAUTH_TOKEN from active profile)
  // This is required for PR reviews to use the correct Claude account
  const claudeProfileManager = getClaudeProfileManager();
  const claudeProfileEnv = claudeProfileManager.getActiveProfileEnv();

  return {
    ...apiProfileEnv,
    ...oauthModeClearVars,
    ...claudeProfileEnv,  // Include Claude OAuth token from active profile
    ...extraEnv,
  };
}
