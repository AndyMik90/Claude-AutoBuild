import type { APIProfileType } from '../types/profile';

export type ApiProviderPreset = {
  id: string;
  baseUrl: string;
  labelKey: string;
  type?: APIProfileType; // Profile type - defaults to 'anthropic'
};

export const API_PROVIDER_PRESETS: readonly ApiProviderPreset[] = [
  {
    id: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    labelKey: 'settings:apiProfiles.presets.anthropic',
    type: 'anthropic'
  },
  {
    id: 'azure-foundry',
    baseUrl: '', // User provides resource name or custom URL
    labelKey: 'settings:apiProfiles.presets.azureFoundry',
    type: 'foundry'
  },
  {
    id: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    labelKey: 'settings:apiProfiles.presets.openrouter',
    type: 'anthropic'
  },
  {
    id: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    labelKey: 'settings:apiProfiles.presets.groq',
    type: 'anthropic'
  },
  {
    id: 'glm-global',
    baseUrl: 'https://api.z.ai/api/anthropic',
    labelKey: 'settings:apiProfiles.presets.glmGlobal',
    type: 'anthropic'
  },
  {
    id: 'glm-cn',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    labelKey: 'settings:apiProfiles.presets.glmChina',
    type: 'anthropic'
  }
];
