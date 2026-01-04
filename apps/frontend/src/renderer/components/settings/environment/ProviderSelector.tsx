import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../ui/select';
import { ApiKeyInput } from './ApiKeyInput';
import type { EmbeddingProvider } from '../../../../shared/types/settings';

interface ProviderConfig {
  provider: EmbeddingProvider;
  // OpenAI
  openaiApiKey?: string;
  // Voyage
  voyageApiKey?: string;
  // Azure OpenAI
  azureOpenaiApiKey?: string;
  azureOpenaiBaseUrl?: string;
  azureOpenaiEmbeddingDeployment?: string;
  // Ollama
  ollamaBaseUrl?: string;
  ollamaEmbeddingModel?: string;
  ollamaEmbeddingDim?: string;
  // Google
  googleApiKey?: string;
}

interface ProviderSelectorProps {
  config: ProviderConfig;
  onChange: (config: Partial<ProviderConfig>) => void;
  disabled?: boolean;
  /** Hide provider selector, only show provider-specific fields */
  hideProviderSelect?: boolean;
  /** Custom render function for Ollama provider (e.g., for model discovery UI) */
  renderOllama?: () => React.ReactNode;
}

const PROVIDER_OPTIONS: { value: EmbeddingProvider; label: string; description: string }[] = [
  { value: 'openai', label: 'OpenAI', description: 'text-embedding-3-small' },
  { value: 'voyage', label: 'Voyage AI', description: 'voyage-3' },
  { value: 'azure_openai', label: 'Azure OpenAI', description: 'Enterprise deployment' },
  { value: 'ollama', label: 'Ollama', description: 'Local embeddings' },
  { value: 'google', label: 'Google AI', description: 'text-embedding-004' }
];

/**
 * Embedding provider selector with dynamic configuration fields
 */
export function ProviderSelector({
  config,
  onChange,
  disabled = false,
  hideProviderSelect = false,
  renderOllama
}: ProviderSelectorProps) {
  const handleProviderChange = (provider: EmbeddingProvider) => {
    onChange({ provider });
  };

  return (
    <div className="space-y-4">
      {!hideProviderSelect && (
        <div className="space-y-2">
          <Label>Embedding Provider</Label>
          <Select
            value={config.provider}
            onValueChange={(value) => handleProviderChange(value as EmbeddingProvider)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Provider-specific fields */}
      {config.provider === 'openai' && (
        <ApiKeyInput
          id="openai-api-key"
          label="OpenAI API Key"
          description="Required for OpenAI embeddings"
          value={config.openaiApiKey || ''}
          onChange={(value) => onChange({ openaiApiKey: value })}
          placeholder="sk-..."
          disabled={disabled}
        />
      )}

      {config.provider === 'voyage' && (
        <ApiKeyInput
          id="voyage-api-key"
          label="Voyage AI API Key"
          description="Required for Voyage embeddings"
          value={config.voyageApiKey || ''}
          onChange={(value) => onChange({ voyageApiKey: value })}
          placeholder="pa-..."
          disabled={disabled}
        />
      )}

      {config.provider === 'azure_openai' && (
        <div className="space-y-4">
          <ApiKeyInput
            id="azure-openai-api-key"
            label="Azure OpenAI API Key"
            value={config.azureOpenaiApiKey || ''}
            onChange={(value) => onChange({ azureOpenaiApiKey: value })}
            disabled={disabled}
          />
          <div className="space-y-2">
            <Label htmlFor="azure-openai-base-url">Endpoint URL</Label>
            <Input
              id="azure-openai-base-url"
              value={config.azureOpenaiBaseUrl || ''}
              onChange={(e) => onChange({ azureOpenaiBaseUrl: e.target.value })}
              placeholder="https://your-resource.openai.azure.com"
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="azure-openai-deployment">Embedding Deployment</Label>
            <Input
              id="azure-openai-deployment"
              value={config.azureOpenaiEmbeddingDeployment || ''}
              onChange={(e) => onChange({ azureOpenaiEmbeddingDeployment: e.target.value })}
              placeholder="text-embedding-ada-002"
              disabled={disabled}
            />
          </div>
        </div>
      )}

      {config.provider === 'ollama' && (
        renderOllama ? renderOllama() : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ollama-base-url">Ollama Server URL</Label>
              <Input
                id="ollama-base-url"
                value={config.ollamaBaseUrl || 'http://localhost:11434'}
                onChange={(e) => onChange({ ollamaBaseUrl: e.target.value })}
                placeholder="http://localhost:11434"
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">
                URL of your local Ollama server
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ollama-model">Embedding Model</Label>
              <Input
                id="ollama-model"
                value={config.ollamaEmbeddingModel || ''}
                onChange={(e) => onChange({ ollamaEmbeddingModel: e.target.value })}
                placeholder="nomic-embed-text"
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">
                Model name (e.g., nomic-embed-text, mxbai-embed-large)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ollama-dim">Embedding Dimension (optional)</Label>
              <Input
                id="ollama-dim"
                value={config.ollamaEmbeddingDim || ''}
                onChange={(e) => onChange({ ollamaEmbeddingDim: e.target.value })}
                placeholder="768"
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">
                Auto-detected for known models. Override if needed.
              </p>
            </div>
          </div>
        )
      )}

      {config.provider === 'google' && (
        <ApiKeyInput
          id="google-api-key"
          label="Google AI API Key"
          description="Required for Google AI embeddings"
          value={config.googleApiKey || ''}
          onChange={(value) => onChange({ googleApiKey: value })}
          placeholder="AIza..."
          disabled={disabled}
        />
      )}
    </div>
  );
}

export type { ProviderConfig };
