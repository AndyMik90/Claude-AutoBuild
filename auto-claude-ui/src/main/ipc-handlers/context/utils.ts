import { app } from 'electron';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import type { GraphitiLLMProvider, GraphitiEmbeddingProvider } from '../../../shared/types/project';

export interface EnvironmentVars {
  [key: string]: string;
}

export interface GlobalSettings {
  autoBuildPath?: string;
  globalOpenAIApiKey?: string;
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
 * Provider-to-environment variable mapping
 * Maps provider names to their required environment variable names
 */
export const PROVIDER_ENV_MAP: Record<string, string> = {
  // LLM Providers
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  azure_openai: 'AZURE_OPENAI_API_KEY',
  ollama: 'OLLAMA_BASE_URL',  // Optional, defaults to localhost
  groq: 'GROQ_API_KEY',
  // Embedding Providers (additional)
  voyage: 'VOYAGE_API_KEY',
  huggingface: 'HUGGINGFACE_API_KEY',
};

/**
 * Providers that don't require an API key (local deployments)
 */
export const OPTIONAL_CREDENTIAL_PROVIDERS = ['ollama'];

/**
 * Get the environment variable name for a given provider
 * @param provider - The provider name (e.g., 'openai', 'anthropic', 'voyage')
 * @returns The environment variable name or undefined if provider is unknown
 */
export function getProviderEnvVarName(provider: string): string | undefined {
  return PROVIDER_ENV_MAP[provider];
}

/**
 * Get the list of unique providers that require credentials
 * Deduplicates when LLM and embedding providers are the same
 * @param llmProvider - The LLM provider
 * @param embeddingProvider - The embedding provider
 * @returns Array of unique provider names that need credentials
 */
export function getRequiredProviders(
  llmProvider: GraphitiLLMProvider,
  embeddingProvider: GraphitiEmbeddingProvider
): string[] {
  const providers = new Set<string>();

  // Add LLM provider if it requires credentials
  if (!OPTIONAL_CREDENTIAL_PROVIDERS.includes(llmProvider)) {
    providers.add(llmProvider);
  }

  // Add embedding provider if it requires credentials (and is different from LLM)
  if (!OPTIONAL_CREDENTIAL_PROVIDERS.includes(embeddingProvider)) {
    providers.add(embeddingProvider);
  }

  return Array.from(providers);
}

/**
 * Check if a specific provider has credentials available
 * Priority: project .env > global settings > process.env
 * Special handling: ollama doesn't require credentials (local deployment)
 */
export function hasProviderCredentials(
  provider: string,
  projectEnvVars: EnvironmentVars,
  globalSettings: GlobalSettings
): boolean {
  // Ollama doesn't require credentials (local deployment)
  if (OPTIONAL_CREDENTIAL_PROVIDERS.includes(provider)) {
    return true;
  }

  const envVarName = PROVIDER_ENV_MAP[provider];
  if (!envVarName) {
    // Unknown provider, assume no credentials needed
    return false;
  }

  // Special handling for OpenAI - check global settings
  if (provider === 'openai') {
    return !!(
      projectEnvVars[envVarName] ||
      globalSettings.globalOpenAIApiKey ||
      process.env[envVarName]
    );
  }

  // For other providers, check project env vars and process.env
  return !!(
    projectEnvVars[envVarName] ||
    process.env[envVarName]
  );
}

/**
 * Get Graphiti connection details
 */
export interface GraphitiConnectionDetails {
  host: string;
  port: number;
  database: string;
}

export function getGraphitiConnectionDetails(projectEnvVars: EnvironmentVars): GraphitiConnectionDetails {
  const host = projectEnvVars['GRAPHITI_FALKORDB_HOST'] ||
               process.env.GRAPHITI_FALKORDB_HOST ||
               'localhost';

  const port = parseInt(
    projectEnvVars['GRAPHITI_FALKORDB_PORT'] ||
    process.env.GRAPHITI_FALKORDB_PORT ||
    '6380',
    10
  );

  const database = projectEnvVars['GRAPHITI_DATABASE'] ||
                   process.env.GRAPHITI_DATABASE ||
                   'auto_claude_memory';

  return { host, port, database };
}
