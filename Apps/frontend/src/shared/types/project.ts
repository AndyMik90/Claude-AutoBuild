/**
 * Project-related types
 */

export interface Project {
  id: string;
  name: string;
  path: string;
  autoBuildPath: string;
  settings: ProjectSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectSettings {
  model: string;
  memoryBackend: 'graphiti' | 'file';
  linearSync: boolean;
  linearTeamId?: string;
  notifications: NotificationSettings;
  /** Enable Graphiti MCP server for agent-accessible knowledge graph */
  graphitiMcpEnabled: boolean;
  /** Graphiti MCP server URL (default: http://localhost:8000/mcp/) */
  graphitiMcpUrl?: string;
  /** Main branch name for worktree creation (default: auto-detected or 'main') */
  mainBranch?: string;
}

export interface NotificationSettings {
  onTaskComplete: boolean;
  onTaskFailed: boolean;
  onReviewNeeded: boolean;
  sound: boolean;
}

// ============================================
// Context Types (Project Index & Memories)
// ============================================

export interface ProjectIndex {
  project_root: string;
  project_type: 'single' | 'monorepo';
  services: Record<string, ServiceInfo>;
  infrastructure: InfrastructureInfo;
  conventions: ConventionsInfo;
}

export interface ServiceInfo {
  name: string;
  path: string;
  language?: string;
  framework?: string;
  type?: 'backend' | 'frontend' | 'worker' | 'scraper' | 'library' | 'proxy' | 'unknown';
  package_manager?: string;
  default_port?: number;
  entry_point?: string;
  key_directories?: Record<string, { path: string; purpose: string }>;
  dependencies?: string[];
  dev_dependencies?: string[];
  testing?: string;
  e2e_testing?: string;
  test_directory?: string;
  orm?: string;
  task_queue?: string;
  styling?: string;
  state_management?: string;
  build_tool?: string;
  dockerfile?: string;
  consumes?: string[];
  environment?: {
    detected_count: number;
    variables: Record<string, {
      type: string;
      sensitive: boolean;
      required: boolean;
    }>;
  };
  api?: {
    total_routes: number;
    routes: Array<{
      path: string;
      methods: string[];
      requires_auth?: boolean;
    }>;
  };
  database?: {
    total_models: number;
    model_names: string[];
    models: Record<string, {
      orm: string;
      fields: Record<string, unknown>;
    }>;
  };
  services?: {
    databases?: Array<{
      type?: string;
      client?: string;
    }>;
    email?: Array<{
      provider?: string;
      client?: string;
    }>;
    payments?: Array<{
      provider?: string;
      client?: string;
    }>;
    cache?: Array<{
      type?: string;
      client?: string;
    }>;
  };
  monitoring?: {
    metrics_endpoint?: string;
    metrics_type?: string;
    health_checks?: string[];
  };
}

export interface InfrastructureInfo {
  docker_compose?: string;
  docker_services?: string[];
  dockerfile?: string;
  docker_directory?: string;
  dockerfiles?: string[];
  ci?: string;
  ci_workflows?: string[];
  deployment?: string;
}

export interface ConventionsInfo {
  python_linting?: string;
  python_formatting?: string;
  js_linting?: string;
  formatting?: string;
  typescript?: boolean;
  git_hooks?: string;
}

export interface GraphitiMemoryStatus {
  enabled: boolean;
  available: boolean;
  database?: string;
  dbPath?: string;
  reason?: string;
}

// Memory Infrastructure Types
export interface MemoryDatabaseStatus {
  kuzuInstalled: boolean;
  databasePath: string;
  databaseExists: boolean;
  databases: string[];
  error?: string;
}

export interface InfrastructureStatus {
  memory: MemoryDatabaseStatus;
  ready: boolean; // True if memory database is available
}

// Graphiti Validation Types
export interface GraphitiValidationResult {
  success: boolean;
  message: string;
  details?: {
    provider?: string;
    model?: string;
    latencyMs?: number;
  };
}

export interface GraphitiConnectionTestResult {
  database: GraphitiValidationResult;
  llmProvider: GraphitiValidationResult;
  ready: boolean;
}

// Memory Provider Types
// Embedding Providers: OpenAI, Voyage AI, Azure OpenAI, Ollama (local), Google
// Note: LLM provider removed - Claude SDK handles RAG queries
export type GraphitiEmbeddingProvider = 'openai' | 'voyage' | 'azure_openai' | 'ollama' | 'google';

// Legacy type aliases for backward compatibility
export type GraphitiLLMProvider = 'openai' | 'anthropic' | 'azure_openai' | 'ollama' | 'google' | 'groq';
export type GraphitiProviderType = GraphitiLLMProvider;

export interface GraphitiProviderConfig {
  // Embedding Provider (LLM provider removed - Claude SDK handles RAG)
  embeddingProvider: GraphitiEmbeddingProvider;
  embeddingModel?: string;  // Embedding model, uses provider default if not specified

  // OpenAI Embeddings
  openaiApiKey?: string;
  openaiEmbeddingModel?: string;

  // Azure OpenAI Embeddings
  azureOpenaiApiKey?: string;
  azureOpenaiBaseUrl?: string;
  azureOpenaiEmbeddingDeployment?: string;

  // Voyage AI Embeddings
  voyageApiKey?: string;
  voyageEmbeddingModel?: string;

  // Google AI Embeddings
  googleApiKey?: string;
  googleEmbeddingModel?: string;

  // Ollama Embeddings (local, no API key required)
  ollamaBaseUrl?: string;  // Default: http://localhost:11434
  ollamaEmbeddingModel?: string;
  ollamaEmbeddingDim?: number;

  // LadybugDB settings (embedded database - no Docker required)
  database?: string;  // Database name (default: auto_claude_memory)
  dbPath?: string;    // Database storage path (default: ~/.auto-claude/memories)
}

export interface GraphitiProviderInfo {
  id: GraphitiProviderType;
  name: string;
  description: string;
  requiresApiKey: boolean;
  defaultModel: string;
  supportedModels: string[];
}

export interface GraphitiMemoryState {
  initialized: boolean;
  database?: string;
  indices_built: boolean;
  created_at?: string;
  last_session?: number;
  episode_count: number;
  error_log: Array<{ timestamp: string; error: string }>;
}

export interface MemoryEpisode {
  id: string;
  type: 'session_insight' | 'codebase_discovery' | 'codebase_map' | 'pattern' | 'gotcha' | 'task_outcome';
  timestamp: string;
  content: string;
  session_number?: number;
  score?: number;
}

export interface ContextSearchResult {
  content: string;
  score: number;
  type: string;
}

export interface ProjectContextData {
  projectIndex: ProjectIndex | null;
  memoryStatus: GraphitiMemoryStatus | null;
  memoryState: GraphitiMemoryState | null;
  recentMemories: MemoryEpisode[];
  isLoading: boolean;
  error?: string;
}

// Environment Configuration for project .env files
export interface ProjectEnvConfig {
  // Claude Authentication
  claudeOAuthToken?: string;
  claudeAuthStatus: 'authenticated' | 'token_set' | 'not_configured';
  // Indicates if the Claude token is from global settings (not project-specific)
  claudeTokenIsGlobal?: boolean;

  // Model Override
  autoBuildModel?: string;

  // Linear Integration
  linearEnabled: boolean;
  linearApiKey?: string;
  linearTeamId?: string;
  linearProjectId?: string;
  linearRealtimeSync?: boolean; // Enable real-time sync of new Linear tasks

  // GitHub Integration
  githubEnabled: boolean;
  githubToken?: string;
  githubRepo?: string; // Format: owner/repo
  githubAutoSync?: boolean; // Auto-sync issues on project load

  // Git/Worktree Settings
  defaultBranch?: string; // Base branch for worktree creation (e.g., 'main', 'develop')

  // Graphiti Memory Integration (V2 - Multi-provider support)
  // Uses LadybugDB embedded database (no Docker required, Python 3.12+)
  graphitiEnabled: boolean;
  graphitiProviderConfig?: GraphitiProviderConfig;  // Provider configuration
  // Legacy fields (still supported for backward compatibility)
  openaiApiKey?: string;
  // Indicates if the OpenAI key is from global settings (not project-specific)
  openaiKeyIsGlobal?: boolean;
  graphitiDatabase?: string;
  graphitiDbPath?: string;

  // UI Settings
  enableFancyUi: boolean;
}

// Auto Claude Initialization Types
export interface AutoBuildVersionInfo {
  isInitialized: boolean;
  updateAvailable: boolean; // Always false - .auto-claude only contains data, no code to update
}

export interface InitializationResult {
  success: boolean;
  error?: string;
}

export interface GitStatus {
  isGitRepo: boolean;
  hasCommits: boolean;
  currentBranch: string | null;
  error?: string;
}

export interface CreateProjectFolderResult {
  path: string;
  name: string;
  gitInitialized: boolean;
}

// File Explorer Types
export interface FileNode {
  path: string;
  name: string;
  isDirectory: boolean;
}
