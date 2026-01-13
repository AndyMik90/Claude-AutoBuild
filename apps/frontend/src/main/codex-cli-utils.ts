import { getToolInfo } from './cli-tool-manager';

export interface CodexCliCheckResult {
  ok: boolean;
  message?: string;
  path?: string;
  version?: string;
}

export function checkCodexCliReady(): CodexCliCheckResult {
  const info = getToolInfo('codex');

  if (!info.found || !info.path) {
    return {
      ok: false,
      message: info.message || 'Codex CLI not found. Install it and ensure "codex" is on PATH.',
    };
  }

  return {
    ok: true,
    path: info.path,
    version: info.version,
  };
}
