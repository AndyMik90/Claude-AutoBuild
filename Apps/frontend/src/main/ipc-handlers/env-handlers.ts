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
    // Graphiti Provider Configuration
    if (config.graphitiProviderConfig) {
      const pc = config.graphitiProviderConfig;
      if (pc.llmProvider) existingVars['GRAPHITI_LLM_PROVIDER'] = pc.llmProvider;
      if (pc.embeddingProvider) existingVars['GRAPHITI_EMBEDDER_PROVIDER'] = pc.embeddingProvider;
      // OpenAI
      if (pc.openaiApiKey) existingVars['OPENAI_API_KEY'] = pc.openaiApiKey;
      if (pc.openaiModel) existingVars['OPENAI_MODEL'] = pc.openaiModel;
      if (pc.openaiEmbeddingModel) existingVars['OPENAI_EMBEDDING_MODEL'] = pc.openaiEmbeddingModel;
      // Anthropic
      if (pc.anthropicApiKey) existingVars['ANTHROPIC_API_KEY'] = pc.anthropicApiKey;
      if (pc.anthropicModel) existingVars['GRAPHITI_ANTHROPIC_MODEL'] = pc.anthropicModel;
      // Azure OpenAI
      if (pc.azureOpenaiApiKey) existingVars['AZURE_OPENAI_API_KEY'] = pc.azureOpenaiApiKey;
      if (pc.azureOpenaiBaseUrl) existingVars['AZURE_OPENAI_BASE_URL'] = pc.azureOpenaiBaseUrl;
      if (pc.azureOpenaiLlmDeployment) existingVars['AZURE_OPENAI_LLM_DEPLOYMENT'] = pc.azureOpenaiLlmDeployment;
      if (pc.azureOpenaiEmbeddingDeployment) existingVars['AZURE_OPENAI_EMBEDDING_DEPLOYMENT'] = pc.azureOpenaiEmbeddingDeployment;
      // Voyage
      if (pc.voyageApiKey) existingVars['VOYAGE_API_KEY'] = pc.voyageApiKey;
      if (pc.voyageEmbeddingModel) existingVars['VOYAGE_EMBEDDING_MODEL'] = pc.voyageEmbeddingModel;
      // Google
      if (pc.googleApiKey) existingVars['GOOGLE_API_KEY'] = pc.googleApiKey;
      if (pc.googleLlmModel) existingVars['GOOGLE_LLM_MODEL'] = pc.googleLlmModel;
      if (pc.googleEmbeddingModel) existingVars['GOOGLE_EMBEDDING_MODEL'] = pc.googleEmbeddingModel;
      // Ollama
      if (pc.ollamaBaseUrl) existingVars['OLLAMA_BASE_URL'] = pc.ollamaBaseUrl;
      if (pc.ollamaLlmModel) existingVars['OLLAMA_LLM_MODEL'] = pc.ollamaLlmModel;
      if (pc.ollamaEmbeddingModel) existingVars['OLLAMA_EMBEDDING_MODEL'] = pc.ollamaEmbeddingModel;
      if (pc.ollamaEmbeddingDim) existingVars['OLLAMA_EMBEDDING_DIM'] = String(pc.ollamaEmbeddingDim);
      // FalkorDB
      if (pc.falkorDbHost) existingVars['GRAPHITI_FALKORDB_HOST'] = pc.falkorDbHost;
      if (pc.falkorDbPort) existingVars['GRAPHITI_FALKORDB_PORT'] = String(pc.falkorDbPort);
      if (pc.falkorDbPassword) existingVars['GRAPHITI_FALKORDB_PASSWORD'] = pc.falkorDbPassword;
    }
    // Legacy fields (still supported)
    if (config.openaiApiKey !== undefined) {
      existingVars['OPENAI_API_KEY'] = config.openaiApiKey;
    }
    if (config.graphitiFalkorDbHost !== undefined) {
      existingVars['GRAPHITI_FALKORDB_HOST'] = config.graphitiFalkorDbHost;
    }
    if (config.graphitiFalkorDbPort !== undefined) {
      existingVars['GRAPHITI_FALKORDB_PORT'] = String(config.graphitiFalkorDbPort);
    }
    if (config.graphitiFalkorDbPassword !== undefined) {
      existingVars['GRAPHITI_FALKORDB_PASSWORD'] = config.graphitiFalkorDbPassword;
    }
    if (config.graphitiDatabase !== undefined) {
      existingVars['GRAPHITI_DATABASE'] = config.graphitiDatabase;
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
# GRAPHITI MEMORY INTEGRATION (OPTIONAL)
# Multi-provider support: OpenAI, Anthropic, Google AI, Azure OpenAI, Ollama, Voyage
# =============================================================================
${existingVars['GRAPHITI_ENABLED'] ? `GRAPHITI_ENABLED=${existingVars['GRAPHITI_ENABLED']}` : '# GRAPHITI_ENABLED=false'}

# Provider Selection
${existingVars['GRAPHITI_LLM_PROVIDER'] ? `GRAPHITI_LLM_PROVIDER=${existingVars['GRAPHITI_LLM_PROVIDER']}` : '# GRAPHITI_LLM_PROVIDER=openai'}
${existingVars['GRAPHITI_EMBEDDER_PROVIDER'] ? `GRAPHITI_EMBEDDER_PROVIDER=${existingVars['GRAPHITI_EMBEDDER_PROVIDER']}` : '# GRAPHITI_EMBEDDER_PROVIDER=openai'}

# OpenAI Settings
${existingVars['OPENAI_API_KEY'] ? `OPENAI_API_KEY=${existingVars['OPENAI_API_KEY']}` : '# OPENAI_API_KEY='}
${existingVars['OPENAI_MODEL'] ? `OPENAI_MODEL=${existingVars['OPENAI_MODEL']}` : '# OPENAI_MODEL=gpt-4o-mini'}
${existingVars['OPENAI_EMBEDDING_MODEL'] ? `OPENAI_EMBEDDING_MODEL=${existingVars['OPENAI_EMBEDDING_MODEL']}` : '# OPENAI_EMBEDDING_MODEL=text-embedding-3-small'}

# Anthropic Settings (LLM only - use with Voyage or OpenAI for embeddings)
${existingVars['ANTHROPIC_API_KEY'] ? `ANTHROPIC_API_KEY=${existingVars['ANTHROPIC_API_KEY']}` : '# ANTHROPIC_API_KEY='}
${existingVars['GRAPHITI_ANTHROPIC_MODEL'] ? `GRAPHITI_ANTHROPIC_MODEL=${existingVars['GRAPHITI_ANTHROPIC_MODEL']}` : '# GRAPHITI_ANTHROPIC_MODEL=claude-sonnet-4-5-latest'}

# Azure OpenAI Settings
${existingVars['AZURE_OPENAI_API_KEY'] ? `AZURE_OPENAI_API_KEY=${existingVars['AZURE_OPENAI_API_KEY']}` : '# AZURE_OPENAI_API_KEY='}
${existingVars['AZURE_OPENAI_BASE_URL'] ? `AZURE_OPENAI_BASE_URL=${existingVars['AZURE_OPENAI_BASE_URL']}` : '# AZURE_OPENAI_BASE_URL='}
${existingVars['AZURE_OPENAI_LLM_DEPLOYMENT'] ? `AZURE_OPENAI_LLM_DEPLOYMENT=${existingVars['AZURE_OPENAI_LLM_DEPLOYMENT']}` : '# AZURE_OPENAI_LLM_DEPLOYMENT='}
${existingVars['AZURE_OPENAI_EMBEDDING_DEPLOYMENT'] ? `AZURE_OPENAI_EMBEDDING_DEPLOYMENT=${existingVars['AZURE_OPENAI_EMBEDDING_DEPLOYMENT']}` : '# AZURE_OPENAI_EMBEDDING_DEPLOYMENT='}

# Voyage AI Settings (Embeddings only - great with Anthropic)
${existingVars['VOYAGE_API_KEY'] ? `VOYAGE_API_KEY=${existingVars['VOYAGE_API_KEY']}` : '# VOYAGE_API_KEY='}
${existingVars['VOYAGE_EMBEDDING_MODEL'] ? `VOYAGE_EMBEDDING_MODEL=${existingVars['VOYAGE_EMBEDDING_MODEL']}` : '# VOYAGE_EMBEDDING_MODEL=voyage-3'}

# Google AI Settings (LLM and Embeddings - Gemini)
${existingVars['GOOGLE_API_KEY'] ? `GOOGLE_API_KEY=${existingVars['GOOGLE_API_KEY']}` : '# GOOGLE_API_KEY='}
${existingVars['GOOGLE_LLM_MODEL'] ? `GOOGLE_LLM_MODEL=${existingVars['GOOGLE_LLM_MODEL']}` : '# GOOGLE_LLM_MODEL=gemini-2.0-flash'}
${existingVars['GOOGLE_EMBEDDING_MODEL'] ? `GOOGLE_EMBEDDING_MODEL=${existingVars['GOOGLE_EMBEDDING_MODEL']}` : '# GOOGLE_EMBEDDING_MODEL=text-embedding-004'}

# Ollama Settings (Local - free)
${existingVars['OLLAMA_BASE_URL'] ? `OLLAMA_BASE_URL=${existingVars['OLLAMA_BASE_URL']}` : '# OLLAMA_BASE_URL=http://localhost:11434'}
${existingVars['OLLAMA_LLM_MODEL'] ? `OLLAMA_LLM_MODEL=${existingVars['OLLAMA_LLM_MODEL']}` : '# OLLAMA_LLM_MODEL='}
${existingVars['OLLAMA_EMBEDDING_MODEL'] ? `OLLAMA_EMBEDDING_MODEL=${existingVars['OLLAMA_EMBEDDING_MODEL']}` : '# OLLAMA_EMBEDDING_MODEL='}
${existingVars['OLLAMA_EMBEDDING_DIM'] ? `OLLAMA_EMBEDDING_DIM=${existingVars['OLLAMA_EMBEDDING_DIM']}` : '# OLLAMA_EMBEDDING_DIM=768'}

# FalkorDB Connection
${existingVars['GRAPHITI_FALKORDB_HOST'] ? `GRAPHITI_FALKORDB_HOST=${existingVars['GRAPHITI_FALKORDB_HOST']}` : '# GRAPHITI_FALKORDB_HOST=localhost'}
${existingVars['GRAPHITI_FALKORDB_PORT'] ? `GRAPHITI_FALKORDB_PORT=${existingVars['GRAPHITI_FALKORDB_PORT']}` : '# GRAPHITI_FALKORDB_PORT=6380'}
${existingVars['GRAPHITI_FALKORDB_PASSWORD'] ? `GRAPHITI_FALKORDB_PASSWORD=${existingVars['GRAPHITI_FALKORDB_PASSWORD']}` : '# GRAPHITI_FALKORDB_PASSWORD='}
${existingVars['GRAPHITI_DATABASE'] ? `GRAPHITI_DATABASE=${existingVars['GRAPHITI_DATABASE']}` : '# GRAPHITI_DATABASE=auto_claude_memory'}
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

      if (vars['GRAPHITI_FALKORDB_HOST']) {
        config.graphitiFalkorDbHost = vars['GRAPHITI_FALKORDB_HOST'];
      }
      if (vars['GRAPHITI_FALKORDB_PORT']) {
        config.graphitiFalkorDbPort = parseInt(vars['GRAPHITI_FALKORDB_PORT'], 10);
      }
      if (vars['GRAPHITI_FALKORDB_PASSWORD']) {
        config.graphitiFalkorDbPassword = vars['GRAPHITI_FALKORDB_PASSWORD'];
      }
      if (vars['GRAPHITI_DATABASE']) {
        config.graphitiDatabase = vars['GRAPHITI_DATABASE'];
      }

      if (vars['ENABLE_FANCY_UI']?.toLowerCase() === 'false') {
        config.enableFancyUi = false;
      }

      // Populate graphitiProviderConfig from .env file
      const llmProvider = vars['GRAPHITI_LLM_PROVIDER'];
      const embeddingProvider = vars['GRAPHITI_EMBEDDER_PROVIDER'];
      if (llmProvider || embeddingProvider || vars['ANTHROPIC_API_KEY'] || vars['AZURE_OPENAI_API_KEY'] ||
          vars['VOYAGE_API_KEY'] || vars['GOOGLE_API_KEY'] || vars['OLLAMA_BASE_URL']) {
        config.graphitiProviderConfig = {
          llmProvider: (llmProvider as 'openai' | 'anthropic' | 'azure_openai' | 'ollama' | 'google' | 'groq') || 'openai',
          embeddingProvider: (embeddingProvider as 'openai' | 'voyage' | 'azure_openai' | 'ollama' | 'google' | 'huggingface') || 'openai',
          // OpenAI
          openaiApiKey: vars['OPENAI_API_KEY'],
          openaiModel: vars['OPENAI_MODEL'],
          openaiEmbeddingModel: vars['OPENAI_EMBEDDING_MODEL'],
          // Anthropic
          anthropicApiKey: vars['ANTHROPIC_API_KEY'],
          anthropicModel: vars['GRAPHITI_ANTHROPIC_MODEL'],
          // Azure OpenAI
          azureOpenaiApiKey: vars['AZURE_OPENAI_API_KEY'],
          azureOpenaiBaseUrl: vars['AZURE_OPENAI_BASE_URL'],
          azureOpenaiLlmDeployment: vars['AZURE_OPENAI_LLM_DEPLOYMENT'],
          azureOpenaiEmbeddingDeployment: vars['AZURE_OPENAI_EMBEDDING_DEPLOYMENT'],
          // Voyage
          voyageApiKey: vars['VOYAGE_API_KEY'],
          voyageEmbeddingModel: vars['VOYAGE_EMBEDDING_MODEL'],
          // Google
          googleApiKey: vars['GOOGLE_API_KEY'],
          googleLlmModel: vars['GOOGLE_LLM_MODEL'],
          googleEmbeddingModel: vars['GOOGLE_EMBEDDING_MODEL'],
          // Ollama
          ollamaBaseUrl: vars['OLLAMA_BASE_URL'],
          ollamaLlmModel: vars['OLLAMA_LLM_MODEL'],
          ollamaEmbeddingModel: vars['OLLAMA_EMBEDDING_MODEL'],
          ollamaEmbeddingDim: vars['OLLAMA_EMBEDDING_DIM'] ? parseInt(vars['OLLAMA_EMBEDDING_DIM'], 10) : undefined,
          // FalkorDB
          falkorDbHost: vars['GRAPHITI_FALKORDB_HOST'],
          falkorDbPort: vars['GRAPHITI_FALKORDB_PORT'] ? parseInt(vars['GRAPHITI_FALKORDB_PORT'], 10) : undefined,
          falkorDbPassword: vars['GRAPHITI_FALKORDB_PASSWORD'],
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
