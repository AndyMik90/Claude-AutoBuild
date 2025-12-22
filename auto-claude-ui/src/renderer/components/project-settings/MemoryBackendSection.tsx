import { Database, Globe } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import { InfrastructureStatus } from './InfrastructureStatus';
import { PasswordInput } from './PasswordInput';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Separator } from '../ui/separator';
import type { ProjectEnvConfig, ProjectSettings, InfrastructureStatus as InfrastructureStatusType, GraphitiLLMProvider, GraphitiEmbeddingProvider, GraphitiProviderConfig } from '../../../shared/types';

/**
 * Returns unique set of selected providers for UI rendering purposes.
 * Deduplicates when same provider is used for both.
 *
 * Note: Unlike backend getRequiredProviders() in utils.ts, this includes ALL providers
 * (including Ollama) since we need to render configuration inputs for each selected provider.
 */
function getRequiredCredentialProviders(
  llmProvider: GraphitiLLMProvider,
  embeddingProvider: GraphitiEmbeddingProvider
): string[] {
  const providers = new Set<string>();
  providers.add(llmProvider);
  providers.add(embeddingProvider);
  return Array.from(providers);
}

/**
 * Props for individual provider credential input sections
 */
interface ProviderCredentialInputsProps {
  envConfig: ProjectEnvConfig;
  onUpdateConfig: (updates: Partial<ProjectEnvConfig>) => void;
}

/**
 * Renders conditional credential inputs based on selected LLM and embedding providers.
 * Handles deduplication when same provider is used for both LLM and embeddings.
 */
function ProviderCredentialInputs({ envConfig, onUpdateConfig }: ProviderCredentialInputsProps) {
  const llmProvider = envConfig.graphitiProviderConfig?.llmProvider || 'openai';
  const embeddingProvider = envConfig.graphitiProviderConfig?.embeddingProvider || 'openai';
  const requiredProviders = getRequiredCredentialProviders(llmProvider, embeddingProvider);
  const providerConfig = envConfig.graphitiProviderConfig;

  // Helper to update provider config with spread pattern
  const updateProviderConfig = (updates: Partial<GraphitiProviderConfig>) => {
    onUpdateConfig({
      graphitiProviderConfig: {
        ...providerConfig,
        llmProvider,
        embeddingProvider,
        ...updates,
      }
    });
  };

  return (
    <>
      {/* OpenAI Credentials */}
      {requiredProviders.includes('openai') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground">
              OpenAI API Key {envConfig.openaiKeyIsGlobal ? '(Override)' : ''}
            </Label>
            {envConfig.openaiKeyIsGlobal && (
              <span className="flex items-center gap-1 text-xs text-info">
                <Globe className="h-3 w-3" />
                Using global key
              </span>
            )}
          </div>
          {envConfig.openaiKeyIsGlobal ? (
            <p className="text-xs text-muted-foreground">
              Using key from App Settings. Enter a project-specific key below to override.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Required when using OpenAI as LLM or embedding provider
            </p>
          )}
          <PasswordInput
            value={envConfig.openaiKeyIsGlobal ? '' : (providerConfig?.openaiApiKey || envConfig.openaiApiKey || '')}
            onChange={(value) => {
              // Write to both V2 path and legacy path for backward compatibility
              // TODO: Remove legacy path write (onUpdateConfig) once migration period is complete
              updateProviderConfig({ openaiApiKey: value || undefined });
              onUpdateConfig({ openaiApiKey: value || undefined });
            }}
            placeholder={envConfig.openaiKeyIsGlobal ? 'Enter to override global key...' : 'sk-xxxxxxxx'}
          />
        </div>
      )}

      {/* Google AI Credentials */}
      {requiredProviders.includes('google') && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">Google AI API Key</Label>
          <p className="text-xs text-muted-foreground">
            Required for Google AI (Gemini) LLM or embedding provider
          </p>
          <PasswordInput
            value={providerConfig?.googleApiKey || ''}
            onChange={(value) => updateProviderConfig({ googleApiKey: value || undefined })}
            placeholder="AIzaxxxxxxxx"
          />
        </div>
      )}

      {/* Anthropic Credentials */}
      {requiredProviders.includes('anthropic') && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">Anthropic API Key</Label>
          <p className="text-xs text-muted-foreground">
            Required for Anthropic (Claude) LLM provider. Note: Anthropic does not provide embeddings - use OpenAI or Voyage for embeddings.
          </p>
          <PasswordInput
            value={providerConfig?.anthropicApiKey || ''}
            onChange={(value) => updateProviderConfig({ anthropicApiKey: value || undefined })}
            placeholder="sk-ant-xxxxxxxx"
          />
        </div>
      )}

      {/* Azure OpenAI Credentials */}
      {requiredProviders.includes('azure_openai') && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">Azure OpenAI API Key</Label>
            <p className="text-xs text-muted-foreground">
              Your Azure OpenAI resource key
            </p>
            <PasswordInput
              value={providerConfig?.azureOpenaiApiKey || ''}
              onChange={(value) => updateProviderConfig({ azureOpenaiApiKey: value || undefined })}
              placeholder="xxxxxxxx"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">Azure OpenAI Base URL</Label>
            <p className="text-xs text-muted-foreground">
              Your Azure OpenAI endpoint URL
            </p>
            <Input
              value={providerConfig?.azureOpenaiBaseUrl || ''}
              onChange={(e) => updateProviderConfig({ azureOpenaiBaseUrl: e.target.value || undefined })}
              placeholder="https://your-resource.openai.azure.com/"
            />
          </div>
          {llmProvider === 'azure_openai' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">LLM Deployment Name</Label>
              <p className="text-xs text-muted-foreground">
                Name of your deployed LLM model (e.g., gpt-4o-mini)
              </p>
              <Input
                value={providerConfig?.azureOpenaiLlmDeployment || ''}
                onChange={(e) => updateProviderConfig({ azureOpenaiLlmDeployment: e.target.value || undefined })}
                placeholder="gpt-4o-mini"
              />
            </div>
          )}
          {embeddingProvider === 'azure_openai' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Embedding Deployment Name</Label>
              <p className="text-xs text-muted-foreground">
                Name of your deployed embedding model (e.g., text-embedding-3-small)
              </p>
              <Input
                value={providerConfig?.azureOpenaiEmbeddingDeployment || ''}
                onChange={(e) => updateProviderConfig({ azureOpenaiEmbeddingDeployment: e.target.value || undefined })}
                placeholder="text-embedding-3-small"
              />
            </div>
          )}
        </div>
      )}

      {/* Voyage AI Credentials */}
      {requiredProviders.includes('voyage') && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">Voyage AI API Key</Label>
          <p className="text-xs text-muted-foreground">
            Required for Voyage AI embeddings. Commonly used with Anthropic for LLM.
          </p>
          <PasswordInput
            value={providerConfig?.voyageApiKey || ''}
            onChange={(value) => updateProviderConfig({ voyageApiKey: value || undefined })}
            placeholder="pa-xxxxxxxx"
          />
        </div>
      )}

      {/* Groq Credentials */}
      {requiredProviders.includes('groq') && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">Groq API Key</Label>
          <p className="text-xs text-muted-foreground">
            Required for Groq LLM provider
          </p>
          <PasswordInput
            value={providerConfig?.groqApiKey || ''}
            onChange={(value) => updateProviderConfig({ groqApiKey: value || undefined })}
            placeholder="gsk_xxxxxxxx"
          />
        </div>
      )}

      {/* HuggingFace Credentials */}
      {requiredProviders.includes('huggingface') && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">HuggingFace API Key</Label>
          <p className="text-xs text-muted-foreground">
            Required for HuggingFace embeddings
          </p>
          <PasswordInput
            value={providerConfig?.huggingfaceApiKey || ''}
            onChange={(value) => updateProviderConfig({ huggingfaceApiKey: value || undefined })}
            placeholder="hf_xxxxxxxx"
          />
        </div>
      )}

      {/* Ollama Configuration (no API key, just base URL) */}
      {requiredProviders.includes('ollama') && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">Ollama Base URL</Label>
          <p className="text-xs text-muted-foreground">
            URL of your local Ollama instance. No API key required.
          </p>
          <Input
            value={providerConfig?.ollamaBaseUrl || ''}
            onChange={(e) => updateProviderConfig({ ollamaBaseUrl: e.target.value || undefined })}
            placeholder="http://localhost:11434"
          />
          <div className="rounded-lg border border-info/30 bg-info/5 p-3">
            <p className="text-xs text-info">
              Ollama runs locally and does not require an API key. Make sure Ollama is running with your chosen models pulled.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

interface MemoryBackendSectionProps {
  isExpanded: boolean;
  onToggle: () => void;
  envConfig: ProjectEnvConfig;
  settings: ProjectSettings;
  onUpdateConfig: (updates: Partial<ProjectEnvConfig>) => void;
  onUpdateSettings: (updates: Partial<ProjectSettings>) => void;
  infrastructureStatus: InfrastructureStatusType | null;
  isCheckingInfrastructure: boolean;
  isStartingFalkorDB: boolean;
  isOpeningDocker: boolean;
  onStartFalkorDB: () => void;
  onOpenDockerDesktop: () => void;
  onDownloadDocker: () => void;
}

export function MemoryBackendSection({
  isExpanded,
  onToggle,
  envConfig,
  settings,
  onUpdateConfig,
  onUpdateSettings,
  infrastructureStatus,
  isCheckingInfrastructure,
  isStartingFalkorDB,
  isOpeningDocker,
  onStartFalkorDB,
  onOpenDockerDesktop,
  onDownloadDocker,
}: MemoryBackendSectionProps) {
  const badge = (
    <span className={`px-2 py-0.5 text-xs rounded-full ${
      envConfig.graphitiEnabled
        ? 'bg-success/10 text-success'
        : 'bg-muted text-muted-foreground'
    }`}>
      {envConfig.graphitiEnabled ? 'Graphiti' : 'File-based'}
    </span>
  );

  return (
    <CollapsibleSection
      title="Memory Backend"
      icon={<Database className="h-4 w-4" />}
      isExpanded={isExpanded}
      onToggle={onToggle}
      badge={badge}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="font-normal text-foreground">Use Graphiti (Recommended)</Label>
          <p className="text-xs text-muted-foreground">
            Persistent cross-session memory using FalkorDB graph database
          </p>
        </div>
        <Switch
          checked={envConfig.graphitiEnabled}
          onCheckedChange={(checked) => {
            onUpdateConfig({ graphitiEnabled: checked });
            // Also update project settings to match
            onUpdateSettings({ memoryBackend: checked ? 'graphiti' : 'file' });
          }}
        />
      </div>

      {!envConfig.graphitiEnabled && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            Using file-based memory. Session insights are stored locally in JSON files.
            Enable Graphiti for persistent cross-session memory with semantic search.
          </p>
        </div>
      )}

      {envConfig.graphitiEnabled && (
        <>
          {/* Infrastructure Status - Dynamic Docker/FalkorDB check */}
          <InfrastructureStatus
            infrastructureStatus={infrastructureStatus}
            isCheckingInfrastructure={isCheckingInfrastructure}
            isStartingFalkorDB={isStartingFalkorDB}
            isOpeningDocker={isOpeningDocker}
            onStartFalkorDB={onStartFalkorDB}
            onOpenDockerDesktop={onOpenDockerDesktop}
            onDownloadDocker={onDownloadDocker}
          />

          {/* Graphiti MCP Server Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-normal text-foreground">Enable Agent Memory Access</Label>
              <p className="text-xs text-muted-foreground">
                Allow agents to search and add to the knowledge graph via MCP
              </p>
            </div>
            <Switch
              checked={settings.graphitiMcpEnabled}
              onCheckedChange={(checked) =>
                onUpdateSettings({ graphitiMcpEnabled: checked })
              }
            />
          </div>

          {settings.graphitiMcpEnabled && (
            <div className="space-y-2 ml-6">
              <Label className="text-sm font-medium text-foreground">Graphiti MCP Server URL</Label>
              <p className="text-xs text-muted-foreground">
                URL of the Graphiti MCP server (requires Docker container)
              </p>
              <Input
                placeholder="http://localhost:8000/mcp/"
                value={settings.graphitiMcpUrl || ''}
                onChange={(e) => onUpdateSettings({ graphitiMcpUrl: e.target.value || undefined })}
              />
              <div className="rounded-lg border border-info/30 bg-info/5 p-3">
                <p className="text-xs text-info">
                  Start the MCP server with:{' '}
                  <code className="px-1 bg-info/10 rounded">docker run -d -p 8000:8000 falkordb/graphiti-knowledge-graph-mcp</code>
                </p>
              </div>
            </div>
          )}

          <Separator />

          {/* LLM Provider Selection - V2 Multi-provider support */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">LLM Provider</Label>
            <p className="text-xs text-muted-foreground">
              Provider for graph operations (extraction, search, reasoning)
            </p>
            <Select
              value={envConfig.graphitiProviderConfig?.llmProvider || 'openai'}
              onValueChange={(value) => onUpdateConfig({
                graphitiProviderConfig: {
                  ...envConfig.graphitiProviderConfig,
                  llmProvider: value as 'openai' | 'anthropic' | 'azure_openai' | 'ollama' | 'google' | 'groq',
                  embeddingProvider: envConfig.graphitiProviderConfig?.embeddingProvider || 'openai',
                }
              })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select LLM provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI (GPT-4o-mini)</SelectItem>
                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                <SelectItem value="google">Google AI (Gemini)</SelectItem>
                <SelectItem value="azure_openai">Azure OpenAI</SelectItem>
                <SelectItem value="ollama">Ollama (Local)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Embedding Provider Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">Embedding Provider</Label>
            <p className="text-xs text-muted-foreground">
              Provider for semantic search embeddings
            </p>
            <Select
              value={envConfig.graphitiProviderConfig?.embeddingProvider || 'openai'}
              onValueChange={(value) => onUpdateConfig({
                graphitiProviderConfig: {
                  ...envConfig.graphitiProviderConfig,
                  llmProvider: envConfig.graphitiProviderConfig?.llmProvider || 'openai',
                  embeddingProvider: value as 'openai' | 'voyage' | 'azure_openai' | 'ollama' | 'google' | 'huggingface',
                }
              })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select embedding provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="voyage">Voyage AI</SelectItem>
                <SelectItem value="google">Google AI</SelectItem>
                <SelectItem value="azure_openai">Azure OpenAI</SelectItem>
                <SelectItem value="ollama">Ollama (Local)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Dynamic Provider Credential Inputs */}
          <ProviderCredentialInputs
            envConfig={envConfig}
            onUpdateConfig={onUpdateConfig}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">FalkorDB Host</Label>
              <Input
                placeholder="localhost"
                value={envConfig.graphitiFalkorDbHost || ''}
                onChange={(e) => onUpdateConfig({ graphitiFalkorDbHost: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">FalkorDB Port</Label>
              <Input
                type="number"
                placeholder="6380"
                value={envConfig.graphitiFalkorDbPort || ''}
                onChange={(e) => onUpdateConfig({ graphitiFalkorDbPort: parseInt(e.target.value) || undefined })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">FalkorDB Password (Optional)</Label>
            <PasswordInput
              value={envConfig.graphitiFalkorDbPassword || ''}
              onChange={(value) => onUpdateConfig({ graphitiFalkorDbPassword: value })}
              placeholder="Leave empty if none"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">Database Name</Label>
            <Input
              placeholder="auto_claude_memory"
              value={envConfig.graphitiDatabase || ''}
              onChange={(e) => onUpdateConfig({ graphitiDatabase: e.target.value })}
            />
          </div>
        </>
      )}
    </CollapsibleSection>
  );
}
