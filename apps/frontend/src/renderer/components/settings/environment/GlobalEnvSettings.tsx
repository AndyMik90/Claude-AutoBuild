import { Bot, Database, Settings2 } from 'lucide-react';
import { ApiKeyInput } from './ApiKeyInput';
import { SimpleEnvSection } from './EnvCategorySection';
import { ProviderSelector, type ProviderConfig } from './ProviderSelector';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import type { GlobalEnvConfig, EmbeddingProvider } from '../../../../shared/types/settings';

interface GlobalEnvSettingsProps {
  config: GlobalEnvConfig;
  onChange: (config: Partial<GlobalEnvConfig>) => void;
  disabled?: boolean;
}

/**
 * Global environment settings form
 * Displays default API keys and memory configuration used across all projects
 */
export function GlobalEnvSettings({
  config,
  onChange,
  disabled = false
}: GlobalEnvSettingsProps) {
  // Convert GlobalEnvConfig to ProviderConfig for the selector
  const providerConfig: ProviderConfig = {
    provider: config.defaultEmbeddingProvider || 'openai',
    openaiApiKey: config.openaiApiKey,
    voyageApiKey: config.voyageApiKey,
    azureOpenaiApiKey: config.azureOpenaiApiKey,
    azureOpenaiBaseUrl: config.azureOpenaiBaseUrl,
    azureOpenaiEmbeddingDeployment: config.azureOpenaiEmbeddingDeployment,
    ollamaBaseUrl: config.ollamaBaseUrl,
    googleApiKey: config.googleApiKey
  };

  const handleProviderConfigChange = (updates: Partial<ProviderConfig>) => {
    const envUpdates: Partial<GlobalEnvConfig> = {};

    if (updates.provider !== undefined) {
      envUpdates.defaultEmbeddingProvider = updates.provider;
    }
    if (updates.openaiApiKey !== undefined) {
      envUpdates.openaiApiKey = updates.openaiApiKey;
    }
    if (updates.voyageApiKey !== undefined) {
      envUpdates.voyageApiKey = updates.voyageApiKey;
    }
    if (updates.azureOpenaiApiKey !== undefined) {
      envUpdates.azureOpenaiApiKey = updates.azureOpenaiApiKey;
    }
    if (updates.azureOpenaiBaseUrl !== undefined) {
      envUpdates.azureOpenaiBaseUrl = updates.azureOpenaiBaseUrl;
    }
    if (updates.azureOpenaiEmbeddingDeployment !== undefined) {
      envUpdates.azureOpenaiEmbeddingDeployment = updates.azureOpenaiEmbeddingDeployment;
    }
    if (updates.ollamaBaseUrl !== undefined) {
      envUpdates.ollamaBaseUrl = updates.ollamaBaseUrl;
    }
    if (updates.googleApiKey !== undefined) {
      envUpdates.googleApiKey = updates.googleApiKey;
    }

    onChange(envUpdates);
  };

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          These settings are used as defaults for all projects. Projects can override these values with their own configuration.
        </p>
      </div>

      {/* AI Providers */}
      <SimpleEnvSection
        title="AI Providers"
        description="API keys for AI model providers"
        icon={<Bot className="h-4 w-4" />}
        defaultOpen={true}
      >
        <div className="space-y-4">
          <ApiKeyInput
            id="global-openai-key"
            label="OpenAI API Key"
            description="Used for GPT models and embeddings"
            value={config.openaiApiKey || ''}
            onChange={(value) => onChange({ openaiApiKey: value })}
            placeholder="sk-..."
            disabled={disabled}
          />

          <ApiKeyInput
            id="global-anthropic-key"
            label="Anthropic API Key"
            description="Used for Claude models"
            value={config.anthropicApiKey || ''}
            onChange={(value) => onChange({ anthropicApiKey: value })}
            placeholder="sk-ant-..."
            disabled={disabled}
          />

          <ApiKeyInput
            id="global-google-key"
            label="Google AI API Key"
            description="Used for Gemini models and embeddings"
            value={config.googleApiKey || ''}
            onChange={(value) => onChange({ googleApiKey: value })}
            placeholder="AIza..."
            disabled={disabled}
          />

          <ApiKeyInput
            id="global-groq-key"
            label="Groq API Key"
            description="Used for fast inference"
            value={config.groqApiKey || ''}
            onChange={(value) => onChange({ groqApiKey: value })}
            placeholder="gsk_..."
            disabled={disabled}
          />

          <ApiKeyInput
            id="global-voyage-key"
            label="Voyage AI API Key"
            description="Used for Voyage embeddings"
            value={config.voyageApiKey || ''}
            onChange={(value) => onChange({ voyageApiKey: value })}
            placeholder="pa-..."
            disabled={disabled}
          />
        </div>
      </SimpleEnvSection>

      {/* Azure OpenAI */}
      <SimpleEnvSection
        title="Azure OpenAI"
        description="Enterprise Azure OpenAI deployment"
        icon={<Bot className="h-4 w-4" />}
        defaultOpen={false}
      >
        <div className="space-y-4">
          <ApiKeyInput
            id="global-azure-key"
            label="Azure OpenAI API Key"
            value={config.azureOpenaiApiKey || ''}
            onChange={(value) => onChange({ azureOpenaiApiKey: value })}
            disabled={disabled}
          />

          <div className="space-y-2">
            <Label htmlFor="global-azure-url">Endpoint URL</Label>
            <Input
              id="global-azure-url"
              value={config.azureOpenaiBaseUrl || ''}
              onChange={(e) => onChange({ azureOpenaiBaseUrl: e.target.value })}
              placeholder="https://your-resource.openai.azure.com"
              disabled={disabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="global-azure-deployment">Embedding Deployment</Label>
            <Input
              id="global-azure-deployment"
              value={config.azureOpenaiEmbeddingDeployment || ''}
              onChange={(e) => onChange({ azureOpenaiEmbeddingDeployment: e.target.value })}
              placeholder="text-embedding-ada-002"
              disabled={disabled}
            />
          </div>
        </div>
      </SimpleEnvSection>

      {/* Memory Defaults */}
      <SimpleEnvSection
        title="Memory Defaults"
        description="Default embedding provider and database settings"
        icon={<Database className="h-4 w-4" />}
        defaultOpen={true}
      >
        <div className="space-y-4">
          <ProviderSelector
            config={providerConfig}
            onChange={handleProviderConfigChange}
            disabled={disabled}
            hideProviderSelect={false}
          />

          <div className="space-y-2">
            <Label htmlFor="global-db-path">Database Path</Label>
            <Input
              id="global-db-path"
              value={config.graphitiDbPath || '~/.auto-claude/memories'}
              onChange={(e) => onChange({ graphitiDbPath: e.target.value })}
              placeholder="~/.auto-claude/memories"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Default location for Graphiti memory databases
            </p>
          </div>
        </div>
      </SimpleEnvSection>

      {/* Advanced */}
      <SimpleEnvSection
        title="Advanced"
        description="Debug and development options"
        icon={<Settings2 className="h-4 w-4" />}
        defaultOpen={false}
      >
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="global-debug">Debug Mode</Label>
            <p className="text-xs text-muted-foreground">
              Enable verbose logging for troubleshooting
            </p>
          </div>
          <Switch
            id="global-debug"
            checked={config.debugMode || false}
            onCheckedChange={(checked) => onChange({ debugMode: checked })}
            disabled={disabled}
          />
        </div>
      </SimpleEnvSection>
    </div>
  );
}
