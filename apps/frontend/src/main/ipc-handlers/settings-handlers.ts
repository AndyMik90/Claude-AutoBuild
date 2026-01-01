import { ipcMain, dialog, app, shell } from 'electron';
import { existsSync, writeFileSync, mkdirSync, statSync, readFileSync } from 'fs';
import { execFileSync } from 'node:child_process';
import path from 'path';
import { is } from '@electron-toolkit/utils';
import { IPC_CHANNELS, DEFAULT_APP_SETTINGS, DEFAULT_AGENT_PROFILES } from '../../shared/constants';
import type {
  AppSettings,
  IPCResult,
  ProjectEnvConfig
} from '../../shared/types';
import { AgentManager } from '../agent';
import type { BrowserWindow } from 'electron';
import { getEffectiveVersion } from '../auto-claude-updater';
import { setUpdateChannel } from '../app-updater';
import { getSettingsPath, readSettingsFile } from '../settings-utils';
import { configureTools, getToolPath, getToolInfo } from '../cli-tool-manager';
import { getClaudeProfileManager } from '../claude-profile-manager';
import { decryptToken } from '../claude-profile/token-encryption';
import { parseEnvFile } from './utils';

// GitLab environment variable keys (reused from env-handlers)
const GITLAB_ENV_KEYS = {
  ENABLED: 'GITLAB_ENABLED',
  TOKEN: 'GITLAB_TOKEN',
  INSTANCE_URL: 'GITLAB_INSTANCE_URL',
  PROJECT: 'GITLAB_PROJECT',
  AUTO_SYNC: 'GITLAB_AUTO_SYNC'
} as const;

const settingsPath = getSettingsPath();

/**
 * Auto-detect the auto-claude source path relative to the app location.
 * Works across platforms (macOS, Windows, Linux) in both dev and production modes.
 */
const detectAutoBuildSourcePath = (): string | null => {
  const possiblePaths: string[] = [];

  // Development mode paths
  if (is.dev) {
    // In dev, __dirname is typically apps/frontend/out/main
    // We need to go up to find apps/backend
    possiblePaths.push(
      path.resolve(__dirname, '..', '..', '..', 'backend'),      // From out/main -> apps/backend
      path.resolve(process.cwd(), 'apps', 'backend')             // From cwd (repo root)
    );
  } else {
    // Production mode paths (packaged app)
    // On Windows/Linux/macOS, the app might be installed anywhere
    // We check common locations relative to the app bundle
    const appPath = app.getAppPath();
    possiblePaths.push(
      path.resolve(appPath, '..', 'backend'),                    // Sibling to app
      path.resolve(appPath, '..', '..', 'backend'),              // Up 2 from app
      path.resolve(process.resourcesPath, '..', 'backend')       // Relative to resources
    );
  }

  // Add process.cwd() as last resort on all platforms
  possiblePaths.push(path.resolve(process.cwd(), 'apps', 'backend'));

  // Enable debug logging with DEBUG=1
  const debug = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

  if (debug) {
    console.warn('[detectAutoBuildSourcePath] Platform:', process.platform);
    console.warn('[detectAutoBuildSourcePath] Is dev:', is.dev);
    console.warn('[detectAutoBuildSourcePath] __dirname:', __dirname);
    console.warn('[detectAutoBuildSourcePath] app.getAppPath():', app.getAppPath());
    console.warn('[detectAutoBuildSourcePath] process.cwd():', process.cwd());
    console.warn('[detectAutoBuildSourcePath] Checking paths:', possiblePaths);
  }

  for (const p of possiblePaths) {
    // Use runners/spec_runner.py as marker - this is the file actually needed for task execution
    // This prevents matching legacy 'auto-claude/' directories that don't have the runners
    const markerPath = path.join(p, 'runners', 'spec_runner.py');
    const exists = existsSync(p) && existsSync(markerPath);

    if (debug) {
      console.warn(`[detectAutoBuildSourcePath] Checking ${p}: ${exists ? '✓ FOUND' : '✗ not found'}`);
    }

    if (exists) {
      console.warn(`[detectAutoBuildSourcePath] Auto-detected source path: ${p}`);
      return p;
    }
  }

  console.warn('[detectAutoBuildSourcePath] Could not auto-detect Auto Claude source path. Please configure manually in settings.');
  console.warn('[detectAutoBuildSourcePath] Set DEBUG=1 environment variable for detailed path checking.');
  return null;
};

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
  // GitLab Integration
  if (config.gitlabEnabled !== undefined) {
    existingVars[GITLAB_ENV_KEYS.ENABLED] = config.gitlabEnabled ? 'true' : 'false';
  }
  if (config.gitlabToken !== undefined) {
    existingVars[GITLAB_ENV_KEYS.TOKEN] = config.gitlabToken;
  }
  if (config.gitlabInstanceUrl !== undefined) {
    existingVars[GITLAB_ENV_KEYS.INSTANCE_URL] = config.gitlabInstanceUrl;
  }
  if (config.gitlabProject !== undefined) {
    existingVars[GITLAB_ENV_KEYS.PROJECT] = config.gitlabProject;
  }
  if (config.gitlabAutoSync !== undefined) {
    existingVars[GITLAB_ENV_KEYS.AUTO_SYNC] = config.gitlabAutoSync ? 'true' : 'false';
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

  // MCP Server Configuration
  if (config.mcpServers) {
    if (config.mcpServers.context7Enabled !== undefined) {
      existingVars['CONTEXT7_ENABLED'] = config.mcpServers.context7Enabled ? 'true' : 'false';
    }
    if (config.mcpServers.linearMcpEnabled !== undefined) {
      existingVars['LINEAR_MCP_ENABLED'] = config.mcpServers.linearMcpEnabled ? 'true' : 'false';
    }
    if (config.mcpServers.electronEnabled !== undefined) {
      existingVars['ELECTRON_MCP_ENABLED'] = config.mcpServers.electronEnabled ? 'true' : 'false';
    }
    if (config.mcpServers.puppeteerEnabled !== undefined) {
      existingVars['PUPPETEER_MCP_ENABLED'] = config.mcpServers.puppeteerEnabled ? 'true' : 'false';
    }
    // Note: graphitiEnabled is already handled via GRAPHITI_ENABLED above
  }

  // Per-agent MCP overrides (add/remove MCPs from specific agents)
  if (config.agentMcpOverrides) {
    // First, clear any existing AGENT_MCP_* entries
    Object.keys(existingVars).forEach(key => {
      if (key.startsWith('AGENT_MCP_')) {
        delete existingVars[key];
      }
    });

    // Add new overrides
    Object.entries(config.agentMcpOverrides).forEach(([agentId, override]) => {
      if (override.add && override.add.length > 0) {
        existingVars[`AGENT_MCP_${agentId}_ADD`] = override.add.join(',');
      }
      if (override.remove && override.remove.length > 0) {
        existingVars[`AGENT_MCP_${agentId}_REMOVE`] = override.remove.join(',');
      }
    });
  }

  // Custom MCP servers (user-defined)
  if (config.customMcpServers !== undefined) {
    if (config.customMcpServers.length > 0) {
      existingVars['CUSTOM_MCP_SERVERS'] = JSON.stringify(config.customMcpServers);
    } else {
      delete existingVars['CUSTOM_MCP_SERVERS'];
    }
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
# GITLAB INTEGRATION (OPTIONAL)
# =============================================================================
${existingVars[GITLAB_ENV_KEYS.ENABLED] !== undefined ? `${GITLAB_ENV_KEYS.ENABLED}=${existingVars[GITLAB_ENV_KEYS.ENABLED]}` : `# ${GITLAB_ENV_KEYS.ENABLED}=true`}
${existingVars[GITLAB_ENV_KEYS.INSTANCE_URL] ? `${GITLAB_ENV_KEYS.INSTANCE_URL}=${existingVars[GITLAB_ENV_KEYS.INSTANCE_URL]}` : `# ${GITLAB_ENV_KEYS.INSTANCE_URL}=https://gitlab.com`}
${existingVars[GITLAB_ENV_KEYS.TOKEN] ? `${GITLAB_ENV_KEYS.TOKEN}=${existingVars[GITLAB_ENV_KEYS.TOKEN]}` : `# ${GITLAB_ENV_KEYS.TOKEN}=`}
${existingVars[GITLAB_ENV_KEYS.PROJECT] ? `${GITLAB_ENV_KEYS.PROJECT}=${existingVars[GITLAB_ENV_KEYS.PROJECT]}` : `# ${GITLAB_ENV_KEYS.PROJECT}=group/project`}
${existingVars[GITLAB_ENV_KEYS.AUTO_SYNC] !== undefined ? `${GITLAB_ENV_KEYS.AUTO_SYNC}=${existingVars[GITLAB_ENV_KEYS.AUTO_SYNC]}` : `# ${GITLAB_ENV_KEYS.AUTO_SYNC}=false`}

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
# MCP SERVER CONFIGURATION (per-project overrides)
# =============================================================================
# Context7 documentation lookup (default: enabled)
${existingVars['CONTEXT7_ENABLED'] !== undefined ? `CONTEXT7_ENABLED=${existingVars['CONTEXT7_ENABLED']}` : '# CONTEXT7_ENABLED=true'}
# Linear MCP integration (default: follows LINEAR_API_KEY)
${existingVars['LINEAR_MCP_ENABLED'] !== undefined ? `LINEAR_MCP_ENABLED=${existingVars['LINEAR_MCP_ENABLED']}` : '# LINEAR_MCP_ENABLED=true'}
# Electron desktop automation - QA agents only (default: disabled)
${existingVars['ELECTRON_MCP_ENABLED'] !== undefined ? `ELECTRON_MCP_ENABLED=${existingVars['ELECTRON_MCP_ENABLED']}` : '# ELECTRON_MCP_ENABLED=false'}
# Puppeteer browser automation - QA agents only (default: disabled)
${existingVars['PUPPETEER_MCP_ENABLED'] !== undefined ? `PUPPETEER_MCP_ENABLED=${existingVars['PUPPETEER_MCP_ENABLED']}` : '# PUPPETEER_MCP_ENABLED=false'}

# =============================================================================
# PER-AGENT MCP OVERRIDES
# Add or remove MCP servers for specific agents
# Format: AGENT_MCP_<agent_type>_ADD=server1,server2
# Format: AGENT_MCP_<agent_type>_REMOVE=server1,server2
# =============================================================================
${Object.entries(existingVars)
  .filter(([key]) => key.startsWith('AGENT_MCP_'))
  .map(([key, value]) => `${key}=${value}`)
  .join('\n') || '# No per-agent overrides configured'}

# =============================================================================
# CUSTOM MCP SERVERS
# User-defined MCP servers (command-based or HTTP-based)
# JSON format: [{"id":"...","name":"...","type":"command|http",...}]
# =============================================================================
${existingVars['CUSTOM_MCP_SERVERS'] ? `CUSTOM_MCP_SERVERS=${existingVars['CUSTOM_MCP_SERVERS']}` : '# CUSTOM_MCP_SERVERS=[]'}

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

/**
 * Register all settings-related IPC handlers
 */
export function registerSettingsHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  // ============================================
  // Settings Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET,
    async (): Promise<IPCResult<AppSettings>> => {
      // Load settings using shared helper and merge with defaults
      const savedSettings = readSettingsFile();
      const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, ...savedSettings };
      let needsSave = false;

      // Migration: Set agent profile to 'auto' for users who haven't made a selection (one-time)
      // This ensures new users get the optimized 'auto' profile as the default
      // while preserving existing user preferences
      if (!settings._migratedAgentProfileToAuto) {
        // Only set 'auto' if user hasn't made a selection yet
        if (!settings.selectedAgentProfile) {
          settings.selectedAgentProfile = 'auto';
        }
        settings._migratedAgentProfileToAuto = true;
        needsSave = true;
      }

      // Migration: Sync defaultModel with selectedAgentProfile (#414)
      // Fixes bug where defaultModel was stuck at 'opus' regardless of profile selection
      if (!settings._migratedDefaultModelSync) {
        if (settings.selectedAgentProfile) {
          const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === settings.selectedAgentProfile);
          if (profile) {
            settings.defaultModel = profile.model;
          }
        }
        settings._migratedDefaultModelSync = true;
        needsSave = true;
      }

      // If no manual autoBuildPath is set, try to auto-detect
      if (!settings.autoBuildPath) {
        const detectedPath = detectAutoBuildSourcePath();
        if (detectedPath) {
          settings.autoBuildPath = detectedPath;
        }
      }

      // Persist migration changes
      if (needsSave) {
        try {
          writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        } catch (error) {
          console.error('[SETTINGS_GET] Failed to persist migration:', error);
          // Continue anyway - settings will be migrated in-memory for this session
        }
      }

      // Configure CLI tools with current settings
      configureTools({
        pythonPath: settings.pythonPath,
        gitPath: settings.gitPath,
        githubCLIPath: settings.githubCLIPath,
        claudePath: settings.claudePath,
      });

      return { success: true, data: settings as AppSettings };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SAVE,
    async (_, settings: Partial<AppSettings>): Promise<IPCResult> => {
      try {
        // Load current settings using shared helper
        const savedSettings = readSettingsFile();
        const currentSettings = { ...DEFAULT_APP_SETTINGS, ...savedSettings };
        const newSettings = { ...currentSettings, ...settings };

        // Sync defaultModel when agent profile changes (#414)
        if (settings.selectedAgentProfile) {
          const profile = DEFAULT_AGENT_PROFILES.find(p => p.id === settings.selectedAgentProfile);
          if (profile) {
            newSettings.defaultModel = profile.model;
          }
        }

        writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));

        // Apply Python path if changed
        if (settings.pythonPath || settings.autoBuildPath) {
          agentManager.configure(settings.pythonPath, settings.autoBuildPath);
        }

        // Configure CLI tools if any paths changed
        if (
          settings.pythonPath !== undefined ||
          settings.gitPath !== undefined ||
          settings.githubCLIPath !== undefined ||
          settings.claudePath !== undefined
        ) {
          configureTools({
            pythonPath: newSettings.pythonPath,
            gitPath: newSettings.gitPath,
            githubCLIPath: newSettings.githubCLIPath,
            claudePath: newSettings.claudePath,
          });
        }

        // Update auto-updater channel if betaUpdates setting changed
        if (settings.betaUpdates !== undefined) {
          const channel = settings.betaUpdates ? 'beta' : 'latest';
          setUpdateChannel(channel);
        }

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save settings'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_CLI_TOOLS_INFO,
    async (): Promise<IPCResult<{
      python: ReturnType<typeof getToolInfo>;
      git: ReturnType<typeof getToolInfo>;
      gh: ReturnType<typeof getToolInfo>;
      claude: ReturnType<typeof getToolInfo>;
    }>> => {
      try {
        return {
          success: true,
          data: {
            python: getToolInfo('python'),
            git: getToolInfo('git'),
            gh: getToolInfo('gh'),
            claude: getToolInfo('claude'),
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get CLI tools info',
        };
      }
    }
  );

  // ============================================
  // Dialog Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.DIALOG_SELECT_DIRECTORY,
    async (): Promise<string | null> => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return null;

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Project Directory'
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DIALOG_CREATE_PROJECT_FOLDER,
    async (
      _,
      location: string,
      name: string,
      initGit: boolean
    ): Promise<IPCResult<{ path: string; name: string; gitInitialized: boolean }>> => {
      try {
        // Validate inputs
        if (!location || !name) {
          return { success: false, error: 'Location and name are required' };
        }

        // Sanitize project name (convert to kebab-case, remove invalid chars)
        const sanitizedName = name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-_]/g, '')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        if (!sanitizedName) {
          return { success: false, error: 'Invalid project name' };
        }

        const projectPath = path.join(location, sanitizedName);

        // Check if folder already exists
        if (existsSync(projectPath)) {
          return { success: false, error: `Folder "${sanitizedName}" already exists at this location` };
        }

        // Create the directory
        mkdirSync(projectPath, { recursive: true });

        // Initialize git if requested
        let gitInitialized = false;
        if (initGit) {
          try {
            execFileSync(getToolPath('git'), ['init'], { cwd: projectPath, stdio: 'ignore' });
            gitInitialized = true;
          } catch {
            // Git init failed, but folder was created - continue without git
            console.warn('Failed to initialize git repository');
          }
        }

        return {
          success: true,
          data: {
            path: projectPath,
            name: sanitizedName,
            gitInitialized
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create project folder'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DIALOG_GET_DEFAULT_PROJECT_LOCATION,
    async (): Promise<string | null> => {
      try {
        // Return user's home directory + common project folders
        const homeDir = app.getPath('home');
        const commonPaths = [
          path.join(homeDir, 'Projects'),
          path.join(homeDir, 'Developer'),
          path.join(homeDir, 'Code'),
          path.join(homeDir, 'Documents')
        ];

        // Return the first one that exists, or Documents as fallback
        for (const p of commonPaths) {
          if (existsSync(p)) {
            return p;
          }
        }

        return path.join(homeDir, 'Documents');
      } catch {
        return null;
      }
    }
  );

  // ============================================
  // App Info
  // ============================================

  ipcMain.handle(IPC_CHANNELS.APP_VERSION, async (): Promise<string> => {
    // Use effective version which accounts for source updates
    const version = getEffectiveVersion();
    console.log('[settings-handlers] APP_VERSION returning:', version);
    return version;
  });

  // ============================================
  // Shell Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.SHELL_OPEN_EXTERNAL,
    async (_, url: string): Promise<void> => {
      await shell.openExternal(url);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SHELL_OPEN_TERMINAL,
    async (_, dirPath: string): Promise<IPCResult<void>> => {
      try {
        // Validate dirPath input
        if (!dirPath || typeof dirPath !== 'string' || dirPath.trim() === '') {
          return {
            success: false,
            error: 'Directory path is required and must be a non-empty string'
          };
        }

        // Resolve to absolute path
        const resolvedPath = path.resolve(dirPath);

        // Verify path exists
        if (!existsSync(resolvedPath)) {
          return {
            success: false,
            error: `Directory does not exist: ${resolvedPath}`
          };
        }

        // Verify it's a directory
        try {
          if (!statSync(resolvedPath).isDirectory()) {
            return {
              success: false,
              error: `Path is not a directory: ${resolvedPath}`
            };
          }
        } catch (statError) {
          return {
            success: false,
            error: `Cannot access path: ${resolvedPath}`
          };
        }

        const platform = process.platform;

        if (platform === 'darwin') {
          // macOS: Use execFileSync with argument array to prevent injection
          execFileSync('open', ['-a', 'Terminal', resolvedPath], { stdio: 'ignore' });
        } else if (platform === 'win32') {
          // Windows: Use cmd.exe directly with argument array
          // /C tells cmd to execute the command and terminate
          // /K keeps the window open after executing cd
          execFileSync('cmd.exe', ['/K', 'cd', '/d', resolvedPath], {
            stdio: 'ignore',
            windowsHide: false,
            shell: false  // Explicitly disable shell to prevent injection
          });
        } else {
          // Linux: Try common terminal emulators with argument arrays
          const terminals: Array<{ cmd: string; args: string[] }> = [
            { cmd: 'gnome-terminal', args: ['--working-directory', resolvedPath] },
            { cmd: 'konsole', args: ['--workdir', resolvedPath] },
            { cmd: 'xfce4-terminal', args: ['--working-directory', resolvedPath] },
            { cmd: 'xterm', args: ['-e', 'bash', '-c', `cd '${resolvedPath.replace(/'/g, "'\\''")}' && exec bash`] }
          ];

          let opened = false;
          for (const { cmd, args } of terminals) {
            try {
              execFileSync(cmd, args, { stdio: 'ignore' });
              opened = true;
              break;
            } catch {
              // Try next terminal
              continue;
            }
          }

          if (!opened) {
            return {
              success: false,
              error: 'No supported terminal emulator found. Please install gnome-terminal, konsole, xfce4-terminal, or xterm.'
            };
          }
        }

        return { success: true };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        return {
          success: false,
          error: `Failed to open terminal: ${errorMsg}`
        };
      }
    }
  );

  // ============================================
  // Profile Environment Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_ENV_GET,
    async (_, profileId: string): Promise<IPCResult<ProjectEnvConfig>> => {
      try {
        // Get the profile
        const profile = getClaudeProfileManager().getProfile(profileId);
        if (!profile) {
          return { success: false, error: 'Profile not found' };
        }

        // Default config
        const config: ProjectEnvConfig = {
          claudeAuthStatus: 'not_configured',
          linearEnabled: false,
          githubEnabled: false,
          gitlabEnabled: false,
          graphitiEnabled: false,
          enableFancyUi: true,
          claudeTokenIsGlobal: false,
          openaiKeyIsGlobal: false
        };

        // Parse profile-specific .env if it exists
        let vars: Record<string, string> = {};
        if (profile.configDir) {
          const envPath = path.join(profile.configDir, '.env');
          if (existsSync(envPath)) {
            try {
              const content = readFileSync(envPath, 'utf-8');
              vars = parseEnvFile(content);
            } catch {
              // Continue with empty vars
            }
          }
        }

        // Claude OAuth Token: from profile's token
        if (profile.oauthToken) {
          const token = decryptToken(profile.oauthToken);
          if (token) {
            config.claudeOAuthToken = token;
            config.claudeAuthStatus = 'token_set';
            config.claudeTokenIsGlobal = false;
          }
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

        // GitLab config
        if (vars[GITLAB_ENV_KEYS.TOKEN]) {
          config.gitlabToken = vars[GITLAB_ENV_KEYS.TOKEN];
          // Enable by default if token exists and GITLAB_ENABLED is not explicitly false
          config.gitlabEnabled = vars[GITLAB_ENV_KEYS.ENABLED]?.toLowerCase() !== 'false';
        }
        if (vars[GITLAB_ENV_KEYS.INSTANCE_URL]) {
          config.gitlabInstanceUrl = vars[GITLAB_ENV_KEYS.INSTANCE_URL];
        }
        if (vars[GITLAB_ENV_KEYS.PROJECT]) {
          config.gitlabProject = vars[GITLAB_ENV_KEYS.PROJECT];
        }
        if (vars[GITLAB_ENV_KEYS.AUTO_SYNC]?.toLowerCase() === 'true') {
          config.gitlabAutoSync = true;
        }

        // Git/Worktree config
        if (vars['DEFAULT_BRANCH']) {
          config.defaultBranch = vars['DEFAULT_BRANCH'];
        }

        if (vars['GRAPHITI_ENABLED']?.toLowerCase() === 'true') {
          config.graphitiEnabled = true;
        }

        // OpenAI API Key
        if (vars['OPENAI_API_KEY']) {
          config.openaiApiKey = vars['OPENAI_API_KEY'];
          config.openaiKeyIsGlobal = false;
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

        // Populate graphitiProviderConfig from .env file
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

        // MCP Server Configuration
        config.mcpServers = {
          context7Enabled: vars['CONTEXT7_ENABLED']?.toLowerCase() !== 'false',
          graphitiEnabled: config.graphitiEnabled,
          linearMcpEnabled: vars['LINEAR_MCP_ENABLED']?.toLowerCase() !== 'false',
          electronEnabled: vars['ELECTRON_MCP_ENABLED']?.toLowerCase() === 'true',
          puppeteerEnabled: vars['PUPPETEER_MCP_ENABLED']?.toLowerCase() === 'true',
        };

        // Parse per-agent MCP overrides
        const agentMcpOverrides: Record<string, { add?: string[]; remove?: string[] }> = {};
        Object.entries(vars).forEach(([key, value]) => {
          if (key.startsWith('AGENT_MCP_') && key.endsWith('_ADD')) {
            const agentId = key.replace('AGENT_MCP_', '').replace('_ADD', '');
            if (!agentMcpOverrides[agentId]) agentMcpOverrides[agentId] = {};
            agentMcpOverrides[agentId].add = value.split(',').map(s => s.trim()).filter(Boolean);
          } else if (key.startsWith('AGENT_MCP_') && key.endsWith('_REMOVE')) {
            const agentId = key.replace('AGENT_MCP_', '').replace('_REMOVE', '');
            if (!agentMcpOverrides[agentId]) agentMcpOverrides[agentId] = {};
            agentMcpOverrides[agentId].remove = value.split(',').map(s => s.trim()).filter(Boolean);
          }
        });

        if (Object.keys(agentMcpOverrides).length > 0) {
          config.agentMcpOverrides = agentMcpOverrides;
        }

        // Parse custom MCP servers
        if (vars['CUSTOM_MCP_SERVERS']) {
          try {
            config.customMcpServers = JSON.parse(vars['CUSTOM_MCP_SERVERS']);
          } catch {
            config.customMcpServers = [];
          }
        }

        return { success: true, data: config };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get profile environment'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_ENV_UPDATE,
    async (_, profileId: string, config: Partial<ProjectEnvConfig>): Promise<IPCResult> => {
      try {
        // Get the profile
        const profile = getClaudeProfileManager().getProfile(profileId);
        if (!profile) {
          return { success: false, error: 'Profile not found' };
        }

        if (!profile.configDir) {
          return { success: false, error: 'Profile config directory not set' };
        }

        const envPath = path.join(profile.configDir, '.env');

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
          error: error instanceof Error ? error.message : 'Failed to update profile environment'
        };
      }
    }
  );
}
