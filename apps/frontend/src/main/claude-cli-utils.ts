import path from 'path';
import { getAugmentedEnv } from './env-utils';
import { getToolPath } from './cli-tool-manager';

export type ClaudeCliInvocation = {
  command: string;
  env: Record<string, string>;
};

function ensureCommandDirInPath(command: string, env: Record<string, string>): Record<string, string> {
  if (!path.isAbsolute(command)) {
    return env;
  }

  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  const commandDir = path.dirname(command);
  const currentPath = env.PATH || '';
  const pathEntries = currentPath.split(pathSeparator);
  const normalizedCommandDir = path.normalize(commandDir);
  const hasCommandDir = process.platform === 'win32'
    ? pathEntries
      .map((entry) => path.normalize(entry).toLowerCase())
      .includes(normalizedCommandDir.toLowerCase())
    : pathEntries
      .map((entry) => path.normalize(entry))
      .includes(normalizedCommandDir);

  if (hasCommandDir) {
    return env;
  }

  return {
    ...env,
    PATH: [commandDir, currentPath].filter(Boolean).join(pathSeparator),
  };
}

/**
 * Returns the Claude CLI command path and an environment with PATH updated to include the CLI directory.
 */
export function getClaudeCliInvocation(): ClaudeCliInvocation {
  const command = getToolPath('claude');
  const env = getAugmentedEnv();

  return {
    command,
    env: ensureCommandDirInPath(command, env),
  };
}
