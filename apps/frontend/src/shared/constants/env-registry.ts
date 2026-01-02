/**
 * Environment Variables Registry
 *
 * Centralized registry of all environment variables used by Auto-Claude.
 * This registry is used to:
 * - Generate consistent .env files
 * - Display environment settings in the UI
 * - Validate environment configuration
 */

export type EnvCategory = 'ai-providers' | 'memory' | 'integrations' | 'advanced';
export type EnvScope = 'global' | 'project' | 'both';

export interface EnvVarDefinition {
  key: string;
  label: string;
  description: string;
  category: EnvCategory;
  scope: EnvScope;
  secret: boolean;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  // For select/dropdown fields
  options?: { value: string; label: string }[];
  // For conditional display (e.g., only show if another field has specific value)
  dependsOn?: {
    key: string;
    value: string | string[];
  };
}

/**
 * AI Provider environment variables
 */
const AI_PROVIDER_VARS: EnvVarDefinition[] = [
  {
    key: 'OPENAI_API_KEY',
    label: 'OpenAI API Key',
    description: 'API key for OpenAI services (embeddings, GPT models)',
    category: 'ai-providers',
    scope: 'both',
    secret: true,
    placeholder: 'sk-...'
  },
  {
    key: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API Key',
    description: 'API key for Anthropic Claude models',
    category: 'ai-providers',
    scope: 'both',
    secret: true,
    placeholder: 'sk-ant-...'
  },
  {
    key: 'GOOGLE_API_KEY',
    label: 'Google AI API Key',
    description: 'API key for Google AI (Gemini) services',
    category: 'ai-providers',
    scope: 'both',
    secret: true,
    placeholder: 'AIza...'
  },
  {
    key: 'GROQ_API_KEY',
    label: 'Groq API Key',
    description: 'API key for Groq inference services',
    category: 'ai-providers',
    scope: 'both',
    secret: true,
    placeholder: 'gsk_...'
  },
  {
    key: 'VOYAGE_API_KEY',
    label: 'Voyage AI API Key',
    description: 'API key for Voyage AI embeddings',
    category: 'ai-providers',
    scope: 'both',
    secret: true,
    placeholder: 'pa-...'
  },
  // Azure OpenAI
  {
    key: 'AZURE_OPENAI_API_KEY',
    label: 'Azure OpenAI API Key',
    description: 'API key for Azure OpenAI services',
    category: 'ai-providers',
    scope: 'both',
    secret: true
  },
  {
    key: 'AZURE_OPENAI_BASE_URL',
    label: 'Azure OpenAI Endpoint',
    description: 'Azure OpenAI endpoint URL (e.g., https://your-resource.openai.azure.com)',
    category: 'ai-providers',
    scope: 'both',
    secret: false,
    placeholder: 'https://your-resource.openai.azure.com'
  },
  {
    key: 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT',
    label: 'Azure Embedding Deployment',
    description: 'Deployment name for Azure OpenAI embeddings',
    category: 'ai-providers',
    scope: 'both',
    secret: false,
    placeholder: 'text-embedding-ada-002'
  }
];

/**
 * Memory/Graphiti environment variables
 */
const MEMORY_VARS: EnvVarDefinition[] = [
  {
    key: 'GRAPHITI_ENABLED',
    label: 'Enable Graph Memory',
    description: 'Enable Graphiti memory integration for cross-session context',
    category: 'memory',
    scope: 'project',
    secret: false,
    defaultValue: 'false',
    options: [
      { value: 'true', label: 'Enabled' },
      { value: 'false', label: 'Disabled' }
    ]
  },
  {
    key: 'GRAPHITI_EMBEDDER_PROVIDER',
    label: 'Embedding Provider',
    description: 'Provider for generating embeddings',
    category: 'memory',
    scope: 'both',
    secret: false,
    defaultValue: 'openai',
    options: [
      { value: 'openai', label: 'OpenAI' },
      { value: 'voyage', label: 'Voyage AI' },
      { value: 'azure_openai', label: 'Azure OpenAI' },
      { value: 'ollama', label: 'Ollama (Local)' },
      { value: 'google', label: 'Google AI' }
    ]
  },
  {
    key: 'GRAPHITI_DATABASE',
    label: 'Database Name',
    description: 'Name of the Graphiti database',
    category: 'memory',
    scope: 'project',
    secret: false,
    defaultValue: 'auto_claude_memory'
  },
  {
    key: 'GRAPHITI_DB_PATH',
    label: 'Database Path',
    description: 'Path to store Graphiti database files',
    category: 'memory',
    scope: 'global',
    secret: false,
    defaultValue: '~/.auto-claude/memories'
  },
  // Ollama specific
  {
    key: 'OLLAMA_BASE_URL',
    label: 'Ollama Server URL',
    description: 'URL of the Ollama server',
    category: 'memory',
    scope: 'global',
    secret: false,
    defaultValue: 'http://localhost:11434',
    dependsOn: { key: 'GRAPHITI_EMBEDDER_PROVIDER', value: 'ollama' }
  },
  {
    key: 'OLLAMA_EMBEDDING_MODEL',
    label: 'Ollama Embedding Model',
    description: 'Ollama model to use for embeddings',
    category: 'memory',
    scope: 'both',
    secret: false,
    placeholder: 'nomic-embed-text',
    dependsOn: { key: 'GRAPHITI_EMBEDDER_PROVIDER', value: 'ollama' }
  },
  {
    key: 'OLLAMA_EMBEDDING_DIM',
    label: 'Embedding Dimension',
    description: 'Dimension of Ollama embeddings (auto-detected for known models)',
    category: 'memory',
    scope: 'both',
    secret: false,
    placeholder: '768',
    dependsOn: { key: 'GRAPHITI_EMBEDDER_PROVIDER', value: 'ollama' }
  }
];

/**
 * Integration environment variables (Linear, GitHub)
 */
const INTEGRATION_VARS: EnvVarDefinition[] = [
  // Linear
  {
    key: 'LINEAR_API_KEY',
    label: 'Linear API Key',
    description: 'API key for Linear integration',
    category: 'integrations',
    scope: 'project',
    secret: true
  },
  {
    key: 'LINEAR_TEAM_ID',
    label: 'Linear Team ID',
    description: 'ID of the Linear team to sync with',
    category: 'integrations',
    scope: 'project',
    secret: false
  },
  {
    key: 'LINEAR_PROJECT_ID',
    label: 'Linear Project ID',
    description: 'ID of the Linear project to sync with',
    category: 'integrations',
    scope: 'project',
    secret: false
  },
  {
    key: 'LINEAR_REALTIME_SYNC',
    label: 'Linear Realtime Sync',
    description: 'Enable realtime sync with Linear',
    category: 'integrations',
    scope: 'project',
    secret: false,
    defaultValue: 'false',
    options: [
      { value: 'true', label: 'Enabled' },
      { value: 'false', label: 'Disabled' }
    ]
  },
  // GitHub
  {
    key: 'GITHUB_TOKEN',
    label: 'GitHub Token',
    description: 'Personal access token for GitHub integration',
    category: 'integrations',
    scope: 'project',
    secret: true
  },
  {
    key: 'GITHUB_REPO',
    label: 'GitHub Repository',
    description: 'Repository in format owner/repo',
    category: 'integrations',
    scope: 'project',
    secret: false,
    placeholder: 'owner/repo'
  },
  {
    key: 'GITHUB_AUTO_SYNC',
    label: 'GitHub Auto Sync',
    description: 'Automatically sync issues with GitHub',
    category: 'integrations',
    scope: 'project',
    secret: false,
    defaultValue: 'false',
    options: [
      { value: 'true', label: 'Enabled' },
      { value: 'false', label: 'Disabled' }
    ]
  }
];

/**
 * Advanced environment variables
 */
const ADVANCED_VARS: EnvVarDefinition[] = [
  {
    key: 'DEFAULT_BRANCH',
    label: 'Default Branch',
    description: 'Default Git branch for worktree creation',
    category: 'advanced',
    scope: 'project',
    secret: false,
    defaultValue: 'main'
  },
  {
    key: 'DEBUG',
    label: 'Debug Mode',
    description: 'Enable debug logging',
    category: 'advanced',
    scope: 'both',
    secret: false,
    defaultValue: 'false',
    options: [
      { value: 'true', label: 'Enabled' },
      { value: 'false', label: 'Disabled' }
    ]
  },
  {
    key: 'ENABLE_FANCY_UI',
    label: 'Fancy UI',
    description: 'Enable premium UI features',
    category: 'advanced',
    scope: 'project',
    secret: false,
    defaultValue: 'true',
    options: [
      { value: 'true', label: 'Enabled' },
      { value: 'false', label: 'Disabled' }
    ]
  }
];

/**
 * Complete environment variables registry
 */
export const ENV_VARS_REGISTRY: EnvVarDefinition[] = [
  ...AI_PROVIDER_VARS,
  ...MEMORY_VARS,
  ...INTEGRATION_VARS,
  ...ADVANCED_VARS
];

/**
 * Get environment variables by category
 */
export function getEnvVarsByCategory(category: EnvCategory): EnvVarDefinition[] {
  return ENV_VARS_REGISTRY.filter(v => v.category === category);
}

/**
 * Get environment variables by scope
 */
export function getEnvVarsByScope(scope: EnvScope): EnvVarDefinition[] {
  return ENV_VARS_REGISTRY.filter(v => v.scope === scope || v.scope === 'both');
}

/**
 * Get global-only environment variables
 */
export function getGlobalEnvVars(): EnvVarDefinition[] {
  return ENV_VARS_REGISTRY.filter(v => v.scope === 'global' || v.scope === 'both');
}

/**
 * Get project-only environment variables
 */
export function getProjectEnvVars(): EnvVarDefinition[] {
  return ENV_VARS_REGISTRY.filter(v => v.scope === 'project' || v.scope === 'both');
}

/**
 * Get environment variable definition by key
 */
export function getEnvVarDefinition(key: string): EnvVarDefinition | undefined {
  return ENV_VARS_REGISTRY.find(v => v.key === key);
}

/**
 * Category display information
 */
export const ENV_CATEGORY_INFO: Record<EnvCategory, { label: string; description: string }> = {
  'ai-providers': {
    label: 'AI Providers',
    description: 'API keys for AI model providers'
  },
  'memory': {
    label: 'Memory & Embeddings',
    description: 'Graph memory and embedding configuration'
  },
  'integrations': {
    label: 'Integrations',
    description: 'Third-party service integrations'
  },
  'advanced': {
    label: 'Advanced',
    description: 'Advanced settings and debug options'
  }
};
