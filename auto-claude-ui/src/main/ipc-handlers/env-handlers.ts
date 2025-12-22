import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS, DEFAULT_APP_SETTINGS } from '../../shared/constants';
import type { IPCResult, ProjectEnvConfig, ClaudeAuthResult, AppSettings } from '../../shared/types';
import path from 'path';
import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import { projectStore } from '../project-store';
import { parseEnvFile } from './utils';


/**
 * Register all env-related IPC handlers
 */
export function registerEnvHandlers(
  _getMainWindow: () => BrowserWindow | null
): void {
  // ============================================
  // Environment Configuration Operations
  // ============================================

  // Get settings file path
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');

  /**
   * Generate .env file content from config
   */
  const generateEnvContent = (
    config: Partial<ProjectEnvConfig>,
    existingContent?: string
  ): string => {
    // Parse existing content to preserve comments and structure
    const existingVars = existingContent ? parseEnvFile(existingContent) : {};

    // Update with new values
    if (config.claudeOAuthToken !== undefined) {
      existingVars['CLAUDE_CODE_OAUTH_TOKEN'] = config.claudeOAuthToken;
    }
    if (config.autoBuildModel !== undefined) {
      existingVars['AUTO_BUILD_MODEL'] = config.autoBuildModel;
    }
    if (config.linearApiKey !== undefined) {
      existingVars['LINEAR_API_KEY'] = config.linearApiKey;
    }
    if (config.linearTeamId !== undefined) {
      existingVars['LINEAR_TEAM_ID'] = config.linearTeamId;
    }
    if (config.linearProjectId !== undefined) {
      existingVars['LINEAR_PROJECT_ID'] = config.linearProjectId;
    }
    if (config.linearRealtimeSync !== undefined) {
      existingVars['LINEAR_REALTIME_SYNC'] = config.linearRealtimeSync ? 'true' : 'false';
    }
    // GitHub Integration
    if (config.githubToken !== undefined) {
      existingVars['GITHUB_TOKEN'] = config.githubToken;
    }
    if (config.githubRepo !== undefined) {
      existingVars['GITHUB_REPO'] = config.githubRepo;
    }
    if (config.githubAutoSync !== undefined) {
      existingVars['GITHUB_AUTO_SYNC'] = config.githubAutoSync ? 'true' : 'false';
    }
    // Git/Worktree Settings
    if (config.defaultBranch !== undefined) {
      existingVars['DEFAULT_BRANCH'] = config.defaultBranch;
    }
    if (config.graphitiEnabled !== undefined) {
      existingVars['GRAPHITI_ENABLED'] = config.graphitiEnabled ? 'true' : 'false';
    }
    // Memory Provider Configuration (embeddings only - LLM uses Claude SDK)
    if (config.graphitiProviderConfig) {
      const pc = config.graphitiProviderConfig;
      // Embedding provider only (LLM provider removed - Claude SDK handles RAG)
      if (pc.embeddingProvider) existingVars['GRAPHITI_EMBEDDER_PROVIDER'] = pc.embeddingProvider;
      // OpenAI Embeddings
      if (pc.openaiApiKey) existingVars['OPENAI_API_KEY'] = pc.openaiApiKey;
      if (pc.openaiEmbeddingModel) existingVars['OPENAI_EMBEDDING_MODEL'] = pc.openaiEmbeddingModel;
      // Azure OpenAI Embeddings
      if (pc.azureOpenaiApiKey) existingVars['AZURE_OPENAI_API_KEY'] = pc.azureOpenaiApiKey;
      if (pc.azureOpenaiBaseUrl) existingVars['AZURE_OPENAI_BASE_URL'] = pc.azureOpenaiBaseUrl;
      if (pc.azureOpenaiEmbeddingDeployment) existingVars['AZURE_OPENAI_EMBEDDING_DEPLOYMENT'] = pc.azureOpenaiEmbeddingDeployment;
      // Voyage Embeddings
      if (pc.voyageApiKey) existingVars['VOYAGE_API_KEY'] = pc.voyageApiKey;
      if (pc.voyageEmbeddingModel) existingVars['VOYAGE_EMBEDDING_MODEL'] = pc.voyageEmbeddingModel;
      // Google Embeddings
      if (pc.googleApiKey) existingVars['GOOGLE_API_KEY'] = pc.googleApiKey;
      if (pc.googleEmbeddingModel) existingVars['GOOGLE_EMBEDDING_MODEL'] = pc.googleEmbeddingModel;
      // Ollama Embeddings
      if (pc.ollamaBaseUrl) existingVars['OLLAMA_BASE_URL'] = pc.ollamaBaseUrl;
      if (pc.ollamaEmbeddingModel) existingVars['OLLAMA_EMBEDDING_MODEL'] = pc.ollamaEmbeddingModel;
      if (pc.ollamaEmbeddingDim) existingVars['OLLAMA_EMBEDDING_DIM'] = String(pc.ollamaEmbeddingDim);
      // LadybugDB (embedded database)
      if (pc.dbPath) existingVars['GRAPHITI_DB_PATH'] = pc.dbPath;
      if (pc.database) existingVars['GRAPHITI_DATABASE'] = pc.database;
    }
    // Legacy fields (still supported)
    if (config.openaiApiKey !== undefined) {
      existingVars['OPENAI_API_KEY'] = config.openaiApiKey;
    }
    if (config.graphitiDatabase !== undefined) {
      existingVars['GRAPHITI_DATABASE'] = config.graphitiDatabase;
    }
    if (config.graphitiDbPath !== undefined) {
      existingVars['GRAPHITI_DB_PATH'] = config.graphitiDbPath;
    }
    if (config.enableFancyUi !== undefined) {
      existingVars['ENABLE_FANCY_UI'] = config.enableFancyUi ? 'true' : 'false';
    }

    // Generate content with sections
    const content = `# Auto Claude Framework Environment Variables
# Managed by Auto Claude UI

# Claude Code OAuth Token (REQUIRED)
CLAUDE_CODE_OAUTH_TOKEN=${existingVars['CLAUDE_CODE_OAUTH_TOKEN'] || ''}

# Model override (OPTIONAL)
${existingVars['AUTO_BUILD_MODEL'] ? `AUTO_BUILD_MODEL=${existingVars['AUTO_BUILD_MODEL']}` : '# AUTO_BUILD_MODEL=claude-opus-4-5-20251101'}

# =============================================================================
# LINEAR INTEGRATION (OPTIONAL)
# =============================================================================
${existingVars['LINEAR_API_KEY'] ? `LINEAR_API_KEY=${existingVars['LINEAR_API_KEY']}` : '# LINEAR_API_KEY='}
${existingVars['LINEAR_TEAM_ID'] ? `LINEAR_TEAM_ID=${existingVars['LINEAR_TEAM_ID']}` : '# LINEAR_TEAM_ID='}
${existingVars['LINEAR_PROJECT_ID'] ? `LINEAR_PROJECT_ID=${existingVars['LINEAR_PROJECT_ID']}` : '# LINEAR_PROJECT_ID='}
${existingVars['LINEAR_REALTIME_SYNC'] !== undefined ? `LINEAR_REALTIME_SYNC=${existingVars['LINEAR_REALTIME_SYNC']}` : '# LINEAR_REALTIME_SYNC=false'}

# =============================================================================
# GITHUB INTEGRATION (OPTIONAL)
# =============================================================================
${existingVars['GITHUB_TOKEN'] ? `GITHUB_TOKEN=${existingVars['GITHUB_TOKEN']}` : '# GITHUB_TOKEN='}
${existingVars['GITHUB_REPO'] ? `GITHUB_REPO=${existingVars['GITHUB_REPO']}` : '# GITHUB_REPO=owner/repo'}
${existingVars['GITHUB_AUTO_SYNC'] !== undefined ? `GITHUB_AUTO_SYNC=${existingVars['GITHUB_AUTO_SYNC']}` : '# GITHUB_AUTO_SYNC=false'}

# =============================================================================
# GIT/WORKTREE SETTINGS (OPTIONAL)
# =============================================================================
# Default base branch for worktree creation
# If not set, Auto Claude will auto-detect main/master, or fall back to current branch
${existingVars['DEFAULT_BRANCH'] ? `DEFAULT_BRANCH=${existingVars['DEFAULT_BRANCH']}` : '# DEFAULT_BRANCH=main'}

# =============================================================================
# UI SETTINGS (OPTIONAL)
# =============================================================================
${existingVars['ENABLE_FANCY_UI'] !== undefined ? `ENABLE_FANCY_UI=${existingVars['ENABLE_FANCY_UI']}` : '# ENABLE_FANCY_UI=true'}

# =============================================================================
# MEMORY INTEGRATION
# Embedding providers: OpenAI, Google AI, Azure OpenAI, Ollama, Voyage
# =============================================================================
${existingVars['GRAPHITI_ENABLED'] ? `GRAPHITI_ENABLED=${existingVars['GRAPHITI_ENABLED']}` : '# GRAPHITI_ENABLED=true'}

# Embedding Provider (for semantic search - optional, keyword search works without)
${existingVars['GRAPHITI_EMBEDDER_PROVIDER'] ? `GRAPHITI_EMBEDDER_PROVIDER=${existingVars['GRAPHITI_EMBEDDER_PROVIDER']}` : '# GRAPHITI_EMBEDDER_PROVIDER=ollama'}

# OpenAI Embeddings
${existingVars['OPENAI_API_KEY'] ? `OPENAI_API_KEY=${existingVars['OPENAI_API_KEY']}` : '# OPENAI_API_KEY='}
${existingVars['OPENAI_EMBEDDING_MODEL'] ? `OPENAI_EMBEDDING_MODEL=${existingVars['OPENAI_EMBEDDING_MODEL']}` : '# OPENAI_EMBEDDING_MODEL=text-embedding-3-small'}

# Azure OpenAI Embeddings
${existingVars['AZURE_OPENAI_API_KEY'] ? `AZURE_OPENAI_API_KEY=${existingVars['AZURE_OPENAI_API_KEY']}` : '# AZURE_OPENAI_API_KEY='}
${existingVars['AZURE_OPENAI_BASE_URL'] ? `AZURE_OPENAI_BASE_URL=${existingVars['AZURE_OPENAI_BASE_URL']}` : '# AZURE_OPENAI_BASE_URL='}
${existingVars['AZURE_OPENAI_EMBEDDING_DEPLOYMENT'] ? `AZURE_OPENAI_EMBEDDING_DEPLOYMENT=${existingVars['AZURE_OPENAI_EMBEDDING_DEPLOYMENT']}` : '# AZURE_OPENAI_EMBEDDING_DEPLOYMENT='}

# Voyage AI Embeddings
${existingVars['VOYAGE_API_KEY'] ? `VOYAGE_API_KEY=${existingVars['VOYAGE_API_KEY']}` : '# VOYAGE_API_KEY='}
${existingVars['VOYAGE_EMBEDDING_MODEL'] ? `VOYAGE_EMBEDDING_MODEL=${existingVars['VOYAGE_EMBEDDING_MODEL']}` : '# VOYAGE_EMBEDDING_MODEL=voyage-3'}

# Google AI Embeddings
${existingVars['GOOGLE_API_KEY'] ? `GOOGLE_API_KEY=${existingVars['GOOGLE_API_KEY']}` : '# GOOGLE_API_KEY='}
${existingVars['GOOGLE_EMBEDDING_MODEL'] ? `GOOGLE_EMBEDDING_MODEL=${existingVars['GOOGLE_EMBEDDING_MODEL']}` : '# GOOGLE_EMBEDDING_MODEL=text-embedding-004'}

# Ollama Embeddings (Local - free)
${existingVars['OLLAMA_BASE_URL'] ? `OLLAMA_BASE_URL=${existingVars['OLLAMA_BASE_URL']}` : '# OLLAMA_BASE_URL=http://localhost:11434'}
${existingVars['OLLAMA_EMBEDDING_MODEL'] ? `OLLAMA_EMBEDDING_MODEL=${existingVars['OLLAMA_EMBEDDING_MODEL']}` : '# OLLAMA_EMBEDDING_MODEL=embeddinggemma'}
${existingVars['OLLAMA_EMBEDDING_DIM'] ? `OLLAMA_EMBEDDING_DIM=${existingVars['OLLAMA_EMBEDDING_DIM']}` : '# OLLAMA_EMBEDDING_DIM=768'}

# LadybugDB Database (embedded - no Docker required)
${existingVars['GRAPHITI_DATABASE'] ? `GRAPHITI_DATABASE=${existingVars['GRAPHITI_DATABASE']}` : '# GRAPHITI_DATABASE=auto_claude_memory'}
${existingVars['GRAPHITI_DB_PATH'] ? `GRAPHITI_DB_PATH=${existingVars['GRAPHITI_DB_PATH']}` : '# GRAPHITI_DB_PATH=~/.auto-claude/memories'}
`;

    return content;
  };

  ipcMain.handle(
    IPC_CHANNELS.ENV_GET,
    async (_, projectId: string): Promise<IPCResult<ProjectEnvConfig>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      if (!project.autoBuildPath) {
        return { success: false, error: 'Project not initialized' };
      }

      const envPath = path.join(project.path, project.autoBuildPath, '.env');

      // Load global settings for fallbacks
      let globalSettings: AppSettings = { ...DEFAULT_APP_SETTINGS };
      if (existsSync(settingsPath)) {
        try {
          const content = readFileSync(settingsPath, 'utf-8');
          globalSettings = { ...globalSettings, ...JSON.parse(content) };
        } catch {
          // Use defaults
        }
      }

      // Default config
      const config: ProjectEnvConfig = {
        claudeAuthStatus: 'not_configured',
        linearEnabled: false,
        githubEnabled: false,
        graphitiEnabled: false,
        enableFancyUi: true,
        claudeTokenIsGlobal: false,
        openaiKeyIsGlobal: false
      };

      // Parse project-specific .env if it exists
      let vars: Record<string, string> = {};
      if (existsSync(envPath)) {
        try {
          const content = readFileSync(envPath, 'utf-8');
          vars = parseEnvFile(content);
        } catch {
          // Continue with empty vars
        }
      }

      // Claude OAuth Token: project-specific takes precedence, then global
      if (vars['CLAUDE_CODE_OAUTH_TOKEN']) {
        config.claudeOAuthToken = vars['CLAUDE_CODE_OAUTH_TOKEN'];
        config.claudeAuthStatus = 'token_set';
        config.claudeTokenIsGlobal = false;
      } else if (globalSettings.globalClaudeOAuthToken) {
        config.claudeOAuthToken = globalSettings.globalClaudeOAuthToken;
        config.claudeAuthStatus = 'token_set';
        config.claudeTokenIsGlobal = true;
      }

      if (vars['AUTO_BUILD_MODEL']) {
        config.autoBuildModel = vars['AUTO_BUILD_MODEL'];
      }

      if (vars['LINEAR_API_KEY']) {
        config.linearEnabled = true;
        config.linearApiKey = vars['LINEAR_API_KEY'];
      }
      if (vars['LINEAR_TEAM_ID']) {
        config.linearTeamId = vars['LINEAR_TEAM_ID'];
      }
      if (vars['LINEAR_PROJECT_ID']) {
        config.linearProjectId = vars['LINEAR_PROJECT_ID'];
      }
      if (vars['LINEAR_REALTIME_SYNC']?.toLowerCase() === 'true') {
        config.linearRealtimeSync = true;
      }

      // GitHub config
      if (vars['GITHUB_TOKEN']) {
        config.githubEnabled = true;
        config.githubToken = vars['GITHUB_TOKEN'];
      }
      if (vars['GITHUB_REPO']) {
        config.githubRepo = vars['GITHUB_REPO'];
      }
      if (vars['GITHUB_AUTO_SYNC']?.toLowerCase() === 'true') {
        config.githubAutoSync = true;
      }

      // Git/Worktree config
      if (vars['DEFAULT_BRANCH']) {
        config.defaultBranch = vars['DEFAULT_BRANCH'];
      }

      if (vars['GRAPHITI_ENABLED']?.toLowerCase() === 'true') {
        config.graphitiEnabled = true;
      }

      // OpenAI API Key: project-specific takes precedence, then global
      if (vars['OPENAI_API_KEY']) {
        config.openaiApiKey = vars['OPENAI_API_KEY'];
        config.openaiKeyIsGlobal = false;
      } else if (globalSettings.globalOpenAIApiKey) {
        config.openaiApiKey = globalSettings.globalOpenAIApiKey;
        config.openaiKeyIsGlobal = true;
      }

      if (vars['GRAPHITI_DATABASE']) {
        config.graphitiDatabase = vars['GRAPHITI_DATABASE'];
      }
      if (vars['GRAPHITI_DB_PATH']) {
        config.graphitiDbPath = vars['GRAPHITI_DB_PATH'];
      }

      if (vars['ENABLE_FANCY_UI']?.toLowerCase() === 'false') {
        config.enableFancyUi = false;
      }

      // Populate graphitiProviderConfig from .env file (embeddings only - no LLM provider)
      const embeddingProvider = vars['GRAPHITI_EMBEDDER_PROVIDER'];
      if (embeddingProvider || vars['AZURE_OPENAI_API_KEY'] ||
          vars['VOYAGE_API_KEY'] || vars['GOOGLE_API_KEY'] || vars['OLLAMA_BASE_URL']) {
        config.graphitiProviderConfig = {
          embeddingProvider: (embeddingProvider as 'openai' | 'voyage' | 'azure_openai' | 'ollama' | 'google') || 'ollama',
          // OpenAI Embeddings
          openaiApiKey: vars['OPENAI_API_KEY'],
          openaiEmbeddingModel: vars['OPENAI_EMBEDDING_MODEL'],
          // Azure OpenAI Embeddings
          azureOpenaiApiKey: vars['AZURE_OPENAI_API_KEY'],
          azureOpenaiBaseUrl: vars['AZURE_OPENAI_BASE_URL'],
          azureOpenaiEmbeddingDeployment: vars['AZURE_OPENAI_EMBEDDING_DEPLOYMENT'],
          // Voyage Embeddings
          voyageApiKey: vars['VOYAGE_API_KEY'],
          voyageEmbeddingModel: vars['VOYAGE_EMBEDDING_MODEL'],
          // Google Embeddings
          googleApiKey: vars['GOOGLE_API_KEY'],
          googleEmbeddingModel: vars['GOOGLE_EMBEDDING_MODEL'],
          // Ollama Embeddings
          ollamaBaseUrl: vars['OLLAMA_BASE_URL'],
          ollamaEmbeddingModel: vars['OLLAMA_EMBEDDING_MODEL'],
          ollamaEmbeddingDim: vars['OLLAMA_EMBEDDING_DIM'] ? parseInt(vars['OLLAMA_EMBEDDING_DIM'], 10) : undefined,
          // LadybugDB
          database: vars['GRAPHITI_DATABASE'],
          dbPath: vars['GRAPHITI_DB_PATH'],
        };
      }

      return { success: true, data: config };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ENV_UPDATE,
    async (_, projectId: string, config: Partial<ProjectEnvConfig>): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      if (!project.autoBuildPath) {
        return { success: false, error: 'Project not initialized' };
      }

      const envPath = path.join(project.path, project.autoBuildPath, '.env');

      try {
        // Read existing content if file exists
        let existingContent: string | undefined;
        if (existsSync(envPath)) {
          existingContent = readFileSync(envPath, 'utf-8');
        }

        // Generate new content
        const newContent = generateEnvContent(config, existingContent);

        // Write to file
        writeFileSync(envPath, newContent);

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update .env file'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ENV_CHECK_CLAUDE_AUTH,
    async (_, projectId: string): Promise<IPCResult<ClaudeAuthResult>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      try {
        // Check if Claude CLI is available and authenticated
        const result = await new Promise<ClaudeAuthResult>((resolve) => {
          const proc = spawn('claude', ['--version'], {
            cwd: project.path,
            env: { ...process.env },
            shell: true
          });

          let _stdout = '';
          let _stderr = '';

          proc.stdout?.on('data', (data: Buffer) => {
            _stdout += data.toString();
          });

          proc.stderr?.on('data', (data: Buffer) => {
            _stderr += data.toString();
          });

          proc.on('close', (code: number | null) => {
            if (code === 0) {
              // Claude CLI is available, check if authenticated
              // Run a simple command that requires auth
              const authCheck = spawn('claude', ['api', '--help'], {
                cwd: project.path,
                env: { ...process.env },
                shell: true
              });

              authCheck.on('close', (authCode: number | null) => {
                resolve({
                  success: true,
                  authenticated: authCode === 0
                });
              });

              authCheck.on('error', () => {
                resolve({
                  success: true,
                  authenticated: false,
                  error: 'Could not verify authentication'
                });
              });
            } else {
              resolve({
                success: false,
                authenticated: false,
                error: 'Claude CLI not found. Please install it first.'
              });
            }
          });

          proc.on('error', () => {
            resolve({
              success: false,
              authenticated: false,
              error: 'Claude CLI not found. Please install it first.'
            });
          });
        });

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check Claude auth'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ENV_INVOKE_CLAUDE_SETUP,
    async (_, projectId: string): Promise<IPCResult<ClaudeAuthResult>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      try {
        // Run claude setup-token which will open browser for OAuth
        const result = await new Promise<ClaudeAuthResult>((resolve) => {
          const proc = spawn('claude', ['setup-token'], {
            cwd: project.path,
            env: { ...process.env },
            shell: true,
            stdio: 'inherit' // This allows the terminal to handle the interactive auth
          });

          proc.on('close', (code: number | null) => {
            if (code === 0) {
              resolve({
                success: true,
                authenticated: true
              });
            } else {
              resolve({
                success: false,
                authenticated: false,
                error: 'Setup cancelled or failed'
              });
            }
          });

          proc.on('error', (err: Error) => {
            resolve({
              success: false,
              authenticated: false,
              error: err.message
            });
          });
        });

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to invoke Claude setup'
        };
      }
    }
  );

}
