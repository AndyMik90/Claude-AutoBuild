import type { AppSettings } from '../shared/types';
import { readSettingsFile } from './settings-utils';

export type AutoBuildProvider = 'claude' | 'codex' | 'hybrid';

export function resolveAutoBuildProvider(
  settings?: Partial<AppSettings>
): AutoBuildProvider {
  const provider = settings?.autoBuildProvider;
  if (provider === 'codex' || provider === 'hybrid') {
    return provider;
  }
  return 'claude';
}

export function loadAutoBuildProvider(): AutoBuildProvider {
  const settings = readSettingsFile() as Partial<AppSettings> | undefined;
  return resolveAutoBuildProvider(settings);
}
