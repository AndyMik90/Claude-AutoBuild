import { Bot, Database, GitBranch, Link2, Settings2 } from 'lucide-react';
import { ApiKeyInput } from './ApiKeyInput';
import { SimpleEnvSection } from './EnvCategorySection';
import { ProviderSelector, type ProviderConfig } from './ProviderSelector';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import type { GlobalEnvConfig, EmbeddingProvider, EnvValueSource } from '../../../../shared/types/settings';
import type { ProjectEnvConfig } from '../../../../shared/types/project';

interface ProjectEnvSettingsProps {
  config: ProjectEnvConfig;
  globalConfig: GlobalEnvConfig | null;
  sources: Record<string, EnvValueSource>;
  onChange: (updates: Partial<ProjectEnvConfig>) => void;
  onOverrideGlobal: (key: string) => void;
  onUseGlobal: (key: string) => void;
  disabled?: boolean;
}

/**
 * Project-specific environment settings form
 * Shows source indicators for values inherited from global settings
 */
export function ProjectEnvSettings({
  config,
  globalConfig,
  sources,
  onChange,
  onOverrideGlobal,
  onUseGlobal,
  disabled = false
}: ProjectEnvSettingsProps) {
  // Check if a field is overriding global
  const isOverriding = (key: string): boolean => {
    return sources[key] === 'project';
  };

  // Get source for a field
  const getSource = (key: string): EnvValueSource => {
    return sources[key] || 'none';
  };

  // Convert config to ProviderConfig for the selector
  const getProviderConfig = (): ProviderConfig => {
    const pc = config.graphitiProviderConfig;
    return {
      provider: pc?.embeddingProvider || globalConfig?.defaultEmbeddingProvider || 'openai',
      openaiApiKey: pc?.openaiApiKey || globalConfig?.openaiApiKey,
      voyageApiKey: pc?.voyageApiKey || globalConfig?.voyageApiKey,
      azureOpenaiApiKey: pc?.azureOpenaiApiKey || globalConfig?.azureOpenaiApiKey,
      azureOpenaiBaseUrl: pc?.azureOpenaiBaseUrl || globalConfig?.azureOpenaiBaseUrl,
      azureOpenaiEmbeddingDeployment: pc?.azureOpenaiEmbeddingDeployment || globalConfig?.azureOpenaiEmbeddingDeployment,
      ollamaBaseUrl: pc?.ollamaBaseUrl || globalConfig?.ollamaBaseUrl,
      ollamaEmbeddingModel: pc?.ollamaEmbeddingModel,
      ollamaEmbeddingDim: pc?.ollamaEmbeddingDim?.toString(),
      googleApiKey: pc?.googleApiKey || globalConfig?.googleApiKey
    };
  };

  const handleProviderConfigChange = (updates: Partial<ProviderConfig>) => {
    // Get current config with a default embeddingProvider
    const defaultProvider = globalConfig?.defaultEmbeddingProvider || 'openai';
    const currentConfig = config.graphitiProviderConfig || { embeddingProvider: defaultProvider };
    const newConfig = { ...currentConfig };

    if (updates.provider !== undefined) {
      newConfig.embeddingProvider = updates.provider;
    }
    if (updates.openaiApiKey !== undefined) {
      newConfig.openaiApiKey = updates.openaiApiKey;
    }
    if (updates.voyageApiKey !== undefined) {
      newConfig.voyageApiKey = updates.voyageApiKey;
    }
    if (updates.azureOpenaiApiKey !== undefined) {
      newConfig.azureOpenaiApiKey = updates.azureOpenaiApiKey;
    }
    if (updates.azureOpenaiBaseUrl !== undefined) {
      newConfig.azureOpenaiBaseUrl = updates.azureOpenaiBaseUrl;
    }
    if (updates.azureOpenaiEmbeddingDeployment !== undefined) {
      newConfig.azureOpenaiEmbeddingDeployment = updates.azureOpenaiEmbeddingDeployment;
    }
    if (updates.ollamaBaseUrl !== undefined) {
      newConfig.ollamaBaseUrl = updates.ollamaBaseUrl;
    }
    if (updates.ollamaEmbeddingModel !== undefined) {
      newConfig.ollamaEmbeddingModel = updates.ollamaEmbeddingModel;
    }
    if (updates.ollamaEmbeddingDim !== undefined) {
      const parsed = parseInt(updates.ollamaEmbeddingDim, 10);
      newConfig.ollamaEmbeddingDim = !isNaN(parsed) ? parsed : undefined;
    }
    if (updates.googleApiKey !== undefined) {
      newConfig.googleApiKey = updates.googleApiKey;
    }

    onChange({ graphitiProviderConfig: newConfig });
  };

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          Project-specific settings override global defaults. Fields showing "Using global" inherit from your global configuration.
        </p>
      </div>

      {/* AI Providers - Override Global */}
      <SimpleEnvSection
        title="AI Providers"
        description="Project-specific API keys (override global defaults)"
        icon={<Bot className="h-4 w-4" />}
        defaultOpen={true}
      >
        <div className="space-y-4">
          <ApiKeyInput
            id="project-openai-key"
            label="OpenAI API Key"
            description="Override global OpenAI key for this project"
            value={config.openaiApiKey || ''}
            onChange={(value) => onChange({ openaiApiKey: value })}
            placeholder="sk-..."
            disabled={disabled}
            showSourceBadge={true}
            source={getSource('openaiApiKey')}
            isOverriding={isOverriding('openaiApiKey')}
            onOverride={() => onOverrideGlobal('openaiApiKey')}
            onUseGlobal={() => onUseGlobal('openaiApiKey')}
          />

          <ApiKeyInput
            id="project-voyage-key"
            label="Voyage AI API Key"
            description="Override global Voyage key for embeddings"
            value={config.graphitiProviderConfig?.voyageApiKey || ''}
            onChange={(value) => handleProviderConfigChange({ voyageApiKey: value })}
            placeholder="pa-..."
            disabled={disabled}
          />

          <ApiKeyInput
            id="project-google-key"
            label="Google AI API Key"
            description="Override global Google key for embeddings"
            value={config.graphitiProviderConfig?.googleApiKey || ''}
            onChange={(value) => handleProviderConfigChange({ googleApiKey: value })}
            placeholder="AIza..."
            disabled={disabled}
          />

          {/* Azure OpenAI */}
          <div className="space-y-3 pt-2 border-t border-border/50">
            <p className="text-sm font-medium text-muted-foreground">Azure OpenAI</p>
            <ApiKeyInput
              id="project-azure-key"
              label="Azure OpenAI API Key"
              value={config.graphitiProviderConfig?.azureOpenaiApiKey || ''}
              onChange={(value) => handleProviderConfigChange({ azureOpenaiApiKey: value })}
              disabled={disabled}
            />
            <div className="space-y-2">
              <Label htmlFor="project-azure-url">Endpoint URL</Label>
              <Input
                id="project-azure-url"
                value={config.graphitiProviderConfig?.azureOpenaiBaseUrl || ''}
                onChange={(e) => handleProviderConfigChange({ azureOpenaiBaseUrl: e.target.value })}
                placeholder="https://your-resource.openai.azure.com"
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-azure-deployment">Embedding Deployment</Label>
              <Input
                id="project-azure-deployment"
                value={config.graphitiProviderConfig?.azureOpenaiEmbeddingDeployment || ''}
                onChange={(e) => handleProviderConfigChange({ azureOpenaiEmbeddingDeployment: e.target.value })}
                placeholder="text-embedding-ada-002"
                disabled={disabled}
              />
            </div>
          </div>

          {/* Ollama */}
          <div className="space-y-3 pt-2 border-t border-border/50">
            <p className="text-sm font-medium text-muted-foreground">Ollama (Local)</p>
            <div className="space-y-2">
              <Label htmlFor="project-ollama-url">Ollama Server URL</Label>
              <Input
                id="project-ollama-url"
                value={config.graphitiProviderConfig?.ollamaBaseUrl || ''}
                onChange={(e) => handleProviderConfigChange({ ollamaBaseUrl: e.target.value })}
                placeholder="http://localhost:11434"
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-ollama-model">Embedding Model</Label>
              <Input
                id="project-ollama-model"
                value={config.graphitiProviderConfig?.ollamaEmbeddingModel || ''}
                onChange={(e) => handleProviderConfigChange({ ollamaEmbeddingModel: e.target.value })}
                placeholder="nomic-embed-text"
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      </SimpleEnvSection>

      {/* Memory Settings */}
      <SimpleEnvSection
        title="Memory & Embeddings"
        description="Graphiti memory configuration for this project"
        icon={<Database className="h-4 w-4" />}
        defaultOpen={true}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="project-graphiti-enabled">Enable Graphiti Memory</Label>
              <p className="text-xs text-muted-foreground">
                Use graph-based memory for cross-session context
              </p>
            </div>
            <Switch
              id="project-graphiti-enabled"
              checked={config.graphitiEnabled || false}
              onCheckedChange={(checked) => onChange({ graphitiEnabled: checked })}
              disabled={disabled}
            />
          </div>

          {config.graphitiEnabled && (
            <>
              <ProviderSelector
                config={getProviderConfig()}
                onChange={handleProviderConfigChange}
                disabled={disabled}
                hideProviderSelect={false}
              />

              <div className="space-y-2">
                <Label htmlFor="project-db-name">Database Name</Label>
                <Input
                  id="project-db-name"
                  value={config.graphitiDatabase || config.graphitiProviderConfig?.database || ''}
                  onChange={(e) => {
                    const defaultProvider = globalConfig?.defaultEmbeddingProvider || 'openai';
                    onChange({
                      graphitiDatabase: e.target.value,
                      graphitiProviderConfig: {
                        embeddingProvider: defaultProvider,
                        ...config.graphitiProviderConfig,
                        database: e.target.value
                      }
                    });
                  }}
                  placeholder="auto_claude_memory"
                  disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">
                  Unique name for this project's memory database
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-db-path">Database Path</Label>
                <Input
                  id="project-db-path"
                  value={config.graphitiDbPath || config.graphitiProviderConfig?.dbPath || ''}
                  onChange={(e) => {
                    const defaultProvider = globalConfig?.defaultEmbeddingProvider || 'openai';
                    onChange({
                      graphitiDbPath: e.target.value,
                      graphitiProviderConfig: {
                        embeddingProvider: defaultProvider,
                        ...config.graphitiProviderConfig,
                        dbPath: e.target.value
                      }
                    });
                  }}
                  placeholder="~/.auto-claude/memories"
                  disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">
                  Location to store Graphiti memory database
                </p>
              </div>
            </>
          )}
        </div>
      </SimpleEnvSection>

      {/* Linear Integration */}
      <SimpleEnvSection
        title="Linear Integration"
        description="Connect to Linear for task management"
        icon={<Link2 className="h-4 w-4" />}
        defaultOpen={false}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="project-linear-enabled">Enable Linear</Label>
              <p className="text-xs text-muted-foreground">
                Sync tasks with Linear project management
              </p>
            </div>
            <Switch
              id="project-linear-enabled"
              checked={config.linearEnabled || false}
              onCheckedChange={(checked) => onChange({ linearEnabled: checked })}
              disabled={disabled}
            />
          </div>

          {config.linearEnabled && (
            <>
              <ApiKeyInput
                id="project-linear-key"
                label="Linear API Key"
                value={config.linearApiKey || ''}
                onChange={(value) => onChange({ linearApiKey: value })}
                placeholder="lin_api_..."
                disabled={disabled}
              />

              <div className="space-y-2">
                <Label htmlFor="project-linear-team">Team ID</Label>
                <Input
                  id="project-linear-team"
                  value={config.linearTeamId || ''}
                  onChange={(e) => onChange({ linearTeamId: e.target.value })}
                  placeholder="ABC123"
                  disabled={disabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-linear-project">Project ID (Optional)</Label>
                <Input
                  id="project-linear-project"
                  value={config.linearProjectId || ''}
                  onChange={(e) => onChange({ linearProjectId: e.target.value })}
                  placeholder="DEF456"
                  disabled={disabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="project-linear-sync">Realtime Sync</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically sync new Linear tasks
                  </p>
                </div>
                <Switch
                  id="project-linear-sync"
                  checked={config.linearRealtimeSync || false}
                  onCheckedChange={(checked) => onChange({ linearRealtimeSync: checked })}
                  disabled={disabled}
                />
              </div>
            </>
          )}
        </div>
      </SimpleEnvSection>

      {/* GitHub Integration */}
      <SimpleEnvSection
        title="GitHub Integration"
        description="Connect to GitHub for issue tracking"
        icon={<GitBranch className="h-4 w-4" />}
        defaultOpen={false}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="project-github-enabled">Enable GitHub</Label>
              <p className="text-xs text-muted-foreground">
                Sync issues with GitHub repository
              </p>
            </div>
            <Switch
              id="project-github-enabled"
              checked={config.githubEnabled || false}
              onCheckedChange={(checked) => onChange({ githubEnabled: checked })}
              disabled={disabled}
            />
          </div>

          {config.githubEnabled && (
            <>
              {/* Authentication Method */}
              <div className="space-y-3 p-3 rounded-md bg-muted/30 border border-border/50">
                <p className="text-sm font-medium">Authentication Method</p>

                {/* GitHub CLI / OAuth (Recommended) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm font-medium">GitHub CLI (Recommended)</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-4">
                    Uses <code className="px-1 py-0.5 rounded bg-muted">gh auth login</code> for secure OAuth authentication.
                    Run this command in your terminal to authenticate.
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/50" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                {/* Personal Access Token */}
                <div className="space-y-2">
                  <ApiKeyInput
                    id="project-github-token"
                    label="Personal Access Token"
                    description="Alternative: Use a GitHub PAT with repo scope"
                    value={config.githubToken || ''}
                    onChange={(value) => onChange({ githubToken: value })}
                    placeholder="ghp_... or github_pat_..."
                    disabled={disabled}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-github-repo">Repository</Label>
                <Input
                  id="project-github-repo"
                  value={config.githubRepo || ''}
                  onChange={(e) => onChange({ githubRepo: e.target.value })}
                  placeholder="owner/repo"
                  disabled={disabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="project-github-sync">Auto Sync</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically sync issues on project load
                  </p>
                </div>
                <Switch
                  id="project-github-sync"
                  checked={config.githubAutoSync || false}
                  onCheckedChange={(checked) => onChange({ githubAutoSync: checked })}
                  disabled={disabled}
                />
              </div>
            </>
          )}
        </div>
      </SimpleEnvSection>

      {/* Advanced Settings */}
      <SimpleEnvSection
        title="Advanced"
        description="Git and UI configuration"
        icon={<Settings2 className="h-4 w-4" />}
        defaultOpen={false}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-default-branch">Default Branch</Label>
            <Input
              id="project-default-branch"
              value={config.defaultBranch || ''}
              onChange={(e) => onChange({ defaultBranch: e.target.value })}
              placeholder="main"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Base branch for worktree creation (auto-detected if not set)
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="project-fancy-ui">Fancy UI</Label>
              <p className="text-xs text-muted-foreground">
                Enable enhanced visual effects
              </p>
            </div>
            <Switch
              id="project-fancy-ui"
              checked={config.enableFancyUi}
              onCheckedChange={(checked) => onChange({ enableFancyUi: checked })}
              disabled={disabled}
            />
          </div>
        </div>
      </SimpleEnvSection>
    </div>
  );
}
