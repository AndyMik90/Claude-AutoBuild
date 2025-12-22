/**
 * Memory Service
 *
 * Queries the LadybugDB graph database for memories stored by Graphiti.
 * Uses Python subprocess to communicate with the embedded database.
 *
 * LadybugDB stores data in Kuzu format at ~/.auto-claude/memories/<database>/
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { app } from 'electron';
import { findPythonCommand, parsePythonCommand } from './python-detector';
import type { MemoryEpisode } from '../shared/types';

interface MemoryServiceConfig {
  dbPath: string;
  database: string;
}

// Embedder configuration for semantic search
export interface EmbedderConfig {
  provider: 'openai' | 'google' | 'ollama' | 'voyage' | 'azure_openai';
  // OpenAI
  openaiApiKey?: string;
  openaiEmbeddingModel?: string;
  // Google AI
  googleApiKey?: string;
  googleEmbeddingModel?: string;
  // Ollama
  ollamaBaseUrl?: string;
  ollamaEmbeddingModel?: string;
  ollamaEmbeddingDim?: number;
  // Voyage AI
  voyageApiKey?: string;
  voyageEmbeddingModel?: string;
  // Azure OpenAI
  azureOpenaiApiKey?: string;
  azureOpenaiBaseUrl?: string;
  azureOpenaiEmbeddingDeployment?: string;
}

interface SemanticSearchResult extends MemoryQueryResult {
  search_type: 'semantic' | 'keyword';
  embedder?: string;
}

interface QueryResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface MemoryQueryResult {
  memories: Array<{
    id: string;
    name: string;
    type: string;
    timestamp: string;
    content: string;
    description?: string;
    group_id?: string;
    session_number?: number;
    score?: number;
  }>;
  count: number;
  query?: string;
}

interface StatusResult {
  available: boolean;
  ladybugInstalled: boolean;
  databasePath: string;
  database: string;
  databaseExists: boolean;
  connected?: boolean;
  databases?: string[];
  error?: string | null;
}

/**
 * Get the default database path
 */
export function getDefaultDbPath(): string {
  return path.join(os.homedir(), '.auto-claude', 'memories');
}

/**
 * Get the path to the query_memory.py script
 */
function getQueryScriptPath(): string | null {
  // Look for the script in auto-claude directory (sibling to auto-claude-ui)
  const possiblePaths = [
    // Dev mode: from dist/main -> ../../auto-claude
    path.resolve(__dirname, '..', '..', '..', 'auto-claude', 'query_memory.py'),
    // Packaged app: from app.getAppPath() (handles asar and resources correctly)
    path.resolve(app.getAppPath(), '..', 'auto-claude', 'query_memory.py'),
    // Alternative: from app root
    path.resolve(process.cwd(), 'auto-claude', 'query_memory.py'),
    // If running from repo root
    path.resolve(process.cwd(), '..', 'auto-claude', 'query_memory.py'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Execute a Python memory query command
 */
async function executeQuery(
  command: string,
  args: string[],
  timeout: number = 10000
): Promise<QueryResult> {
  const pythonCmd = findPythonCommand();
  if (!pythonCmd) {
    return { success: false, error: 'Python not found' };
  }

  const scriptPath = getQueryScriptPath();
  if (!scriptPath) {
    return { success: false, error: 'query_memory.py script not found' };
  }

  const [pythonExe, baseArgs] = parsePythonCommand(pythonCmd);

  return new Promise((resolve) => {
    const fullArgs = [...baseArgs, scriptPath, command, ...args];
    const proc = spawn(pythonExe, fullArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch {
          resolve({ success: false, error: `Invalid JSON response: ${stdout}` });
        }
      } else {
        resolve({
          success: false,
          error: stderr || `Process exited with code ${code}`,
        });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    // Handle timeout
    setTimeout(() => {
      proc.kill();
      resolve({ success: false, error: 'Query timed out' });
    }, timeout);
  });
}

/**
 * Execute semantic search with embedder configuration passed via environment
 */
async function executeSemanticQuery(
  args: string[],
  embedderConfig: EmbedderConfig,
  timeout: number = 30000 // Longer timeout for embedding operations
): Promise<QueryResult> {
  const pythonCmd = findPythonCommand();
  if (!pythonCmd) {
    return { success: false, error: 'Python not found' };
  }

  const scriptPath = getQueryScriptPath();
  if (!scriptPath) {
    return { success: false, error: 'query_memory.py script not found' };
  }

  const [pythonExe, baseArgs] = parsePythonCommand(pythonCmd);

  // Build environment with embedder configuration
  const env: Record<string, string | undefined> = { ...process.env };

  // Set the embedder provider
  env.GRAPHITI_EMBEDDER_PROVIDER = embedderConfig.provider;

  // Provider-specific configuration
  switch (embedderConfig.provider) {
    case 'openai':
      if (embedderConfig.openaiApiKey) {
        env.OPENAI_API_KEY = embedderConfig.openaiApiKey;
      }
      if (embedderConfig.openaiEmbeddingModel) {
        env.OPENAI_EMBEDDING_MODEL = embedderConfig.openaiEmbeddingModel;
      }
      break;

    case 'google':
      if (embedderConfig.googleApiKey) {
        env.GOOGLE_API_KEY = embedderConfig.googleApiKey;
      }
      if (embedderConfig.googleEmbeddingModel) {
        env.GOOGLE_EMBEDDING_MODEL = embedderConfig.googleEmbeddingModel;
      }
      break;

    case 'ollama':
      if (embedderConfig.ollamaBaseUrl) {
        env.OLLAMA_BASE_URL = embedderConfig.ollamaBaseUrl;
      }
      if (embedderConfig.ollamaEmbeddingModel) {
        env.OLLAMA_EMBEDDING_MODEL = embedderConfig.ollamaEmbeddingModel;
      }
      if (embedderConfig.ollamaEmbeddingDim) {
        env.OLLAMA_EMBEDDING_DIM = String(embedderConfig.ollamaEmbeddingDim);
      }
      break;

    case 'voyage':
      if (embedderConfig.voyageApiKey) {
        env.VOYAGE_API_KEY = embedderConfig.voyageApiKey;
      }
      if (embedderConfig.voyageEmbeddingModel) {
        env.VOYAGE_EMBEDDING_MODEL = embedderConfig.voyageEmbeddingModel;
      }
      break;

    case 'azure_openai':
      if (embedderConfig.azureOpenaiApiKey) {
        env.AZURE_OPENAI_API_KEY = embedderConfig.azureOpenaiApiKey;
      }
      if (embedderConfig.azureOpenaiBaseUrl) {
        env.AZURE_OPENAI_BASE_URL = embedderConfig.azureOpenaiBaseUrl;
      }
      if (embedderConfig.azureOpenaiEmbeddingDeployment) {
        env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT = embedderConfig.azureOpenaiEmbeddingDeployment;
      }
      break;
  }

  return new Promise((resolve) => {
    const fullArgs = [...baseArgs, scriptPath, 'semantic-search', ...args];
    const proc = spawn(pythonExe, fullArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      timeout,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch {
          resolve({ success: false, error: `Invalid JSON response: ${stdout}` });
        }
      } else {
        resolve({
          success: false,
          error: stderr || `Process exited with code ${code}`,
        });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    setTimeout(() => {
      proc.kill();
      resolve({ success: false, error: 'Semantic search timed out' });
    }, timeout);
  });
}

/**
 * Memory Service for querying graph memories from LadybugDB
 */
export class MemoryService {
  private config: MemoryServiceConfig;

  constructor(config: MemoryServiceConfig) {
    this.config = config;
  }

  /**
   * Get the full path to the database
   */
  private getDbFullPath(): string {
    return path.join(this.config.dbPath, this.config.database);
  }

  /**
   * Check if the database exists
   */
  databaseExists(): boolean {
    const dbPath = this.getDbFullPath();
    return fs.existsSync(dbPath);
  }

  /**
   * List all available databases
   */
  listDatabases(): string[] {
    try {
      const basePath = this.config.dbPath;
      if (!fs.existsSync(basePath)) {
        return [];
      }

      return fs.readdirSync(basePath).filter((name) => {
        if (name.startsWith('.')) return false;
        return true; // Include both files and directories
      });
    } catch (error) {
      console.error('Failed to list databases:', error);
      return [];
    }
  }

  /**
   * Query episodic memories from the database
   */
  async getEpisodicMemories(limit: number = 20): Promise<MemoryEpisode[]> {
    const result = await executeQuery('get-memories', [
      this.config.dbPath,
      this.config.database,
      '--limit',
      String(limit),
    ]);

    if (!result.success || !result.data) {
      console.error('Failed to get memories:', result.error);
      return [];
    }

    const data = result.data as MemoryQueryResult;
    return data.memories.map((m) => ({
      id: m.id,
      type: this.mapMemoryType(m.type),
      timestamp: m.timestamp,
      content: m.content,
      session_number: m.session_number,
    }));
  }

  /**
   * Query entity memories (patterns, gotchas, etc.) from the database
   */
  async getEntityMemories(limit: number = 20): Promise<MemoryEpisode[]> {
    const result = await executeQuery('get-entities', [
      this.config.dbPath,
      this.config.database,
      '--limit',
      String(limit),
    ]);

    if (!result.success || !result.data) {
      console.error('Failed to get entities:', result.error);
      return [];
    }

    const data = result.data as { entities: MemoryQueryResult['memories']; count: number };
    return data.entities.map((e) => ({
      id: e.id,
      type: this.mapMemoryType(e.type),
      timestamp: e.timestamp,
      content: e.content,
    }));
  }

  /**
   * Get all memories from the database
   */
  async getAllMemories(limit: number = 20): Promise<MemoryEpisode[]> {
    const [episodic, entities] = await Promise.all([
      this.getEpisodicMemories(limit),
      this.getEntityMemories(limit),
    ]);

    const memories = [...episodic, ...entities];

    // Sort by timestamp descending
    memories.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return memories.slice(0, limit);
  }

  /**
   * Search memories in the database (keyword search)
   */
  async searchMemories(searchQuery: string, limit: number = 20): Promise<MemoryEpisode[]> {
    const result = await executeQuery('search', [
      this.config.dbPath,
      this.config.database,
      searchQuery,
      '--limit',
      String(limit),
    ]);

    if (!result.success || !result.data) {
      console.error('Failed to search memories:', result.error);
      return [];
    }

    const data = result.data as MemoryQueryResult;
    return data.memories.map((m) => ({
      id: m.id,
      type: this.mapMemoryType(m.type),
      timestamp: m.timestamp,
      content: m.content,
      session_number: m.session_number,
      score: m.score,
    }));
  }

  /**
   * Semantic search using embeddings
   *
   * Uses the configured embedder to create vector embeddings and perform
   * similarity search. Falls back to keyword search if embedder fails.
   *
   * @param searchQuery The search query
   * @param embedderConfig Configuration for the embedding provider
   * @param limit Maximum number of results
   * @returns Memories with relevance scores
   */
  async searchMemoriesSemantic(
    searchQuery: string,
    embedderConfig: EmbedderConfig,
    limit: number = 20
  ): Promise<{ memories: MemoryEpisode[]; searchType: 'semantic' | 'keyword' }> {
    const result = await executeSemanticQuery(
      [this.config.dbPath, this.config.database, searchQuery, '--limit', String(limit)],
      embedderConfig
    );

    if (!result.success || !result.data) {
      console.error('Semantic search failed, falling back to keyword:', result.error);
      // Fall back to keyword search
      const memories = await this.searchMemories(searchQuery, limit);
      return { memories, searchType: 'keyword' };
    }

    const data = result.data as SemanticSearchResult;
    const memories = data.memories.map((m) => ({
      id: m.id,
      type: this.mapMemoryType(m.type),
      timestamp: m.timestamp,
      content: m.content,
      session_number: m.session_number,
      score: m.score,
    }));

    return {
      memories,
      searchType: data.search_type || 'semantic',
    };
  }

  /**
   * Test connection to the database
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const result = await executeQuery('get-status', [this.config.dbPath, this.config.database]);

    if (!result.success) {
      return {
        success: false,
        message: result.error || 'Failed to check database status',
      };
    }

    const data = result.data as StatusResult;

    if (!data.available) {
      return {
        success: false,
        message: 'LadybugDB (real_ladybug) not installed. Requires Python 3.12+',
      };
    }

    if (!data.databaseExists) {
      return {
        success: false,
        message: `Database not found at ${data.databasePath}/${data.database}`,
      };
    }

    if (!data.connected) {
      return {
        success: false,
        message: data.error || 'Failed to connect to database',
      };
    }

    const dbCount = data.databases?.length || 0;
    return {
      success: true,
      message: `Connected to LadybugDB with ${dbCount} databases`,
    };
  }

  /**
   * Close the database connection (no-op for subprocess model)
   */
  async close(): Promise<void> {
    // No persistent connection to close with subprocess model
  }

  /**
   * Map string type to MemoryEpisode type
   */
  private mapMemoryType(type: string): MemoryEpisode['type'] {
    switch (type) {
      case 'session_insight':
        return 'session_insight';
      case 'pattern':
        return 'pattern';
      case 'gotcha':
        return 'gotcha';
      case 'codebase_discovery':
        return 'codebase_discovery';
      case 'task_outcome':
        return 'task_outcome';
      default:
        return 'session_insight';
    }
  }
}

// Singleton instance for reuse
let serviceInstance: MemoryService | null = null;

/**
 * Get or create a Memory service instance
 */
export function getMemoryService(config: MemoryServiceConfig): MemoryService {
  if (
    !serviceInstance ||
    serviceInstance['config'].dbPath !== config.dbPath ||
    serviceInstance['config'].database !== config.database
  ) {
    serviceInstance = new MemoryService(config);
  }
  return serviceInstance;
}

/**
 * Close the singleton service instance
 */
export async function closeMemoryService(): Promise<void> {
  if (serviceInstance) {
    await serviceInstance.close();
    serviceInstance = null;
  }
}

/**
 * Check if Python with LadybugDB is available
 */
export function isKuzuAvailable(): boolean {
  // Check if Python is available
  const pythonCmd = findPythonCommand();
  if (!pythonCmd) {
    return false;
  }

  // Check if query script exists
  const scriptPath = getQueryScriptPath();
  return scriptPath !== null;
}

/**
 * Get memory service status
 */
export interface MemoryServiceStatus {
  kuzuInstalled: boolean;
  databasePath: string;
  databaseExists: boolean;
  databases: string[];
}

export function getMemoryServiceStatus(dbPath?: string): MemoryServiceStatus {
  const basePath = dbPath || getDefaultDbPath();

  const databases = fs.existsSync(basePath)
    ? fs.readdirSync(basePath).filter((name) => !name.startsWith('.'))
    : [];

  // Check if Python and script are available
  const pythonAvailable = findPythonCommand() !== null;
  const scriptAvailable = getQueryScriptPath() !== null;

  return {
    kuzuInstalled: pythonAvailable && scriptAvailable,
    databasePath: basePath,
    databaseExists: databases.length > 0,
    databases,
  };
}
