import { getOAuthModeClearVars } from '../../../agent/env-utils';
import { getAPIProfileEnv } from '../../../services/profile';

export async function getRunnerEnv(
  extraEnv?: Record<string, string>
): Promise<Record<string, string>> {
  const apiProfileEnv = await getAPIProfileEnv();
  const oauthModeClearVars = getOAuthModeClearVars(apiProfileEnv);

  return {
    ...apiProfileEnv,
    ...oauthModeClearVars,
    ...extraEnv,
  };
}
