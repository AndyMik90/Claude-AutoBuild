import { app } from 'electron';
import path from 'path';
import { existsSync, readFileSync } from 'fs';

export interface EnvironmentVars {
  [key: string]: string;
}

export interface GlobalSettings {
  autoBuildPath?: string;
  globalOpenAIApiKey?: string;
  globalAnthropicApiKey?: string;
  globalAzureOpenAIApiKey?: string;
  globalVoyageApiKey?: string;
  globalGoogleApiKey?: string;
}

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

/**
 * Get the auto-build source path from settings
 */
export function getAutoBuildSourcePath(): string | null {
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content);
      if (settings.autoBuildPath && existsSync(settings.autoBuildPath)) {
        return settings.autoBuildPath;
      }
    } catch {
      // Fall through to null
    }
  }
  return null;
}

/**
 * Parse .env file content into key-value pairs
 * Handles both Unix and Windows line endings
 */
export function parseEnvFile(envContent: string): EnvironmentVars {
  const vars: EnvironmentVars = {};

  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      vars[key] = value;
    }
  }

  return vars;
}

/**
 * Load environment variables from project .env file
 */
export function loadProjectEnvVars(projectPath: string, autoBuildPath?: string): EnvironmentVars {
  if (!autoBuildPath) {
    return {};
  }

  const projectEnvPath = path.join(projectPath, autoBuildPath, '.env');
  if (!existsSync(projectEnvPath)) {
    return {};
  }

  try {
    const envContent = readFileSync(projectEnvPath, 'utf-8');
    return parseEnvFile(envContent);
  } catch {
    return {};
  }
}

/**
 * Load global settings from user data directory
 */
export function loadGlobalSettings(): GlobalSettings {
  if (!existsSync(settingsPath)) {
    return {};
  }

  try {
    const settingsContent = readFileSync(settingsPath, 'utf-8');
    return JSON.parse(settingsContent);
  } catch {
    return {};
  }
}

/**
 * Check if Graphiti is enabled in project or global environment
 */
export function isGraphitiEnabled(projectEnvVars: EnvironmentVars): boolean {
  return (
    projectEnvVars['GRAPHITI_ENABLED']?.toLowerCase() === 'true' ||
    process.env.GRAPHITI_ENABLED?.toLowerCase() === 'true'
  );
}

/**
 * Check if OpenAI API key is available
 * Priority: project .env > global settings > process.env
 */
export function hasOpenAIKey(projectEnvVars: EnvironmentVars, globalSettings: GlobalSettings): boolean {
  return !!(
    projectEnvVars['OPENAI_API_KEY'] ||
    globalSettings.globalOpenAIApiKey ||
    process.env.OPENAI_API_KEY
  );
}

/**
 * Get configured embedder provider and check if it has valid credentials
 * Supports: openai, voyage, azure_openai, ollama, google
 */
export function getEmbedderProviderStatus(
  projectEnvVars: EnvironmentVars,
  globalSettings: GlobalSettings
): { provider: string; configured: boolean; reason?: string } {
  const embedderProvider = (
    projectEnvVars['GRAPHITI_EMBEDDER_PROVIDER'] ||
    process.env.GRAPHITI_EMBEDDER_PROVIDER ||
    'openai'
  ).toLowerCase();

  switch (embedderProvider) {
    case 'openai':
      if (projectEnvVars['OPENAI_API_KEY'] || globalSettings.globalOpenAIApiKey || process.env.OPENAI_API_KEY) {
        return { provider: 'openai', configured: true };
      }
      return { provider: 'openai', configured: false, reason: 'OPENAI_API_KEY not set' };

    case 'voyage':
      if (projectEnvVars['VOYAGE_API_KEY'] || globalSettings.globalVoyageApiKey || process.env.VOYAGE_API_KEY) {
        return { provider: 'voyage', configured: true };
      }
      return { provider: 'voyage', configured: false, reason: 'VOYAGE_API_KEY not set' };

    case 'azure_openai':
      const hasAzureKey = projectEnvVars['AZURE_OPENAI_API_KEY'] || globalSettings.globalAzureOpenAIApiKey || process.env.AZURE_OPENAI_API_KEY;
      const hasAzureUrl = projectEnvVars['AZURE_OPENAI_BASE_URL'] || process.env.AZURE_OPENAI_BASE_URL;
      const hasAzureDeployment = projectEnvVars['AZURE_OPENAI_EMBEDDING_DEPLOYMENT'] || process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT;
      if (hasAzureKey && hasAzureUrl && hasAzureDeployment) {
        return { provider: 'azure_openai', configured: true };
      }
      return { provider: 'azure_openai', configured: false, reason: 'Azure OpenAI requires API key, base URL, and embedding deployment' };

    case 'ollama':
      const hasOllamaModel = projectEnvVars['OLLAMA_EMBEDDING_MODEL'] || process.env.OLLAMA_EMBEDDING_MODEL;
      if (hasOllamaModel) {
        return { provider: 'ollama', configured: true };
      }
      return { provider: 'ollama', configured: false, reason: 'OLLAMA_EMBEDDING_MODEL not set' };

    case 'google':
      if (projectEnvVars['GOOGLE_API_KEY'] || globalSettings.globalGoogleApiKey || process.env.GOOGLE_API_KEY) {
        return { provider: 'google', configured: true };
      }
      return { provider: 'google', configured: false, reason: 'GOOGLE_API_KEY not set' };

    default:
      return { provider: embedderProvider, configured: false, reason: `Unknown embedder provider: ${embedderProvider}` };
  }
}

/**
 * Get Graphiti database details (LadybugDB - embedded database)
 */
export interface GraphitiDatabaseDetails {
  dbPath: string;
  database: string;
}

export function getGraphitiDatabaseDetails(projectEnvVars: EnvironmentVars): GraphitiDatabaseDetails {
  const dbPath = projectEnvVars['GRAPHITI_DB_PATH'] ||
                 process.env.GRAPHITI_DB_PATH ||
                 require('path').join(require('os').homedir(), '.auto-claude', 'memories');

  const database = projectEnvVars['GRAPHITI_DATABASE'] ||
                   process.env.GRAPHITI_DATABASE ||
                   'auto_claude_memory';

  return { dbPath, database };
}
