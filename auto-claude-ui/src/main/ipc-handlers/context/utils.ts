import { app } from 'electron';
import path from 'path';
import { existsSync, readFileSync } from 'fs';

export interface EnvironmentVars {
  [key: string]: string;
}

export interface GlobalSettings {
  autoBuildPath?: string;
  pythonPath?: string;
  globalOpenAIApiKey?: string;
  // New globalEnv structure from Environment settings
  globalEnv?: {
    openaiApiKey?: string;
    anthropicApiKey?: string;
    voyageApiKey?: string;
    googleApiKey?: string;
    azureOpenAIApiKey?: string;
    azureOpenaiBaseUrl?: string;
    ollamaBaseUrl?: string;
    defaultEmbeddingProvider?: string;
  };
}

/**
 * Get the Python executable path
 * Priority: settings.pythonPath > venv in autoBuildPath > 'python'
 */
export function getPythonPath(): string {
  const settings = loadGlobalSettings();

  // Use explicitly configured path first
  if (settings.pythonPath) {
    return settings.pythonPath;
  }

  // Try to use venv from autoBuildPath
  if (settings.autoBuildPath) {
    const venvPython = path.join(settings.autoBuildPath, '.venv', 'bin', 'python');
    if (existsSync(venvPython)) {
      return venvPython;
    }
    // Windows fallback
    const venvPythonWin = path.join(settings.autoBuildPath, '.venv', 'Scripts', 'python.exe');
    if (existsSync(venvPythonWin)) {
      return venvPythonWin;
    }
  }

  return 'python';
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
 * Priority: project .env > globalEnv (new) > globalOpenAIApiKey (legacy) > process.env
 */
export function hasOpenAIKey(projectEnvVars: EnvironmentVars, globalSettings: GlobalSettings): boolean {
  return !!(
    projectEnvVars['OPENAI_API_KEY'] ||
    globalSettings.globalEnv?.openaiApiKey ||
    globalSettings.globalOpenAIApiKey ||
    process.env.OPENAI_API_KEY
  );
}

/**
 * Get the configured embedding provider
 * Priority: project .env > globalEnv > default (openai)
 */
export function getEmbeddingProvider(projectEnvVars: EnvironmentVars, globalSettings: GlobalSettings): string {
  return (
    projectEnvVars['GRAPHITI_EMBEDDER_PROVIDER'] ||
    globalSettings.globalEnv?.defaultEmbeddingProvider ||
    'openai'
  );
}

/**
 * Check if the required API key for the configured embedding provider is available
 */
export function hasEmbedderApiKey(projectEnvVars: EnvironmentVars, globalSettings: GlobalSettings): { available: boolean; provider: string; reason?: string } {
  const provider = getEmbeddingProvider(projectEnvVars, globalSettings);

  switch (provider) {
    case 'openai':
      if (projectEnvVars['OPENAI_API_KEY'] || globalSettings.globalEnv?.openaiApiKey || globalSettings.globalOpenAIApiKey || process.env.OPENAI_API_KEY) {
        return { available: true, provider };
      }
      return { available: false, provider, reason: 'OPENAI_API_KEY not set (required for OpenAI embeddings)' };

    case 'voyage':
      if (projectEnvVars['VOYAGE_API_KEY'] || globalSettings.globalEnv?.voyageApiKey || process.env.VOYAGE_API_KEY) {
        return { available: true, provider };
      }
      return { available: false, provider, reason: 'VOYAGE_API_KEY not set (required for Voyage embeddings)' };

    case 'google':
      if (projectEnvVars['GOOGLE_API_KEY'] || globalSettings.globalEnv?.googleApiKey || process.env.GOOGLE_API_KEY) {
        return { available: true, provider };
      }
      return { available: false, provider, reason: 'GOOGLE_API_KEY not set (required for Google/Gemini embeddings)' };

    case 'azure':
      const hasAzureKey = projectEnvVars['AZURE_OPENAI_API_KEY'] || globalSettings.globalEnv?.azureOpenAIApiKey || process.env.AZURE_OPENAI_API_KEY;
      const hasAzureUrl = projectEnvVars['AZURE_OPENAI_BASE_URL'] || globalSettings.globalEnv?.azureOpenaiBaseUrl || process.env.AZURE_OPENAI_BASE_URL;
      if (hasAzureKey && hasAzureUrl) {
        return { available: true, provider };
      }
      if (!hasAzureKey) {
        return { available: false, provider, reason: 'AZURE_OPENAI_API_KEY not set (required for Azure embeddings)' };
      }
      return { available: false, provider, reason: 'AZURE_OPENAI_BASE_URL not set (required for Azure embeddings)' };

    case 'ollama':
      // Ollama doesn't require an API key, just needs the base URL
      const ollamaUrl = projectEnvVars['OLLAMA_BASE_URL'] || globalSettings.globalEnv?.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      return { available: true, provider };

    default:
      return { available: false, provider, reason: `Unknown embedding provider: ${provider}` };
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
