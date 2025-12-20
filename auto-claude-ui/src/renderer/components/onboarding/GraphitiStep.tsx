import { useState, useEffect } from 'react';
import {
  Brain,
  Database,
  Info,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Server,
  Zap,
  XCircle
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { useSettingsStore } from '../../stores/settings-store';
import type { GraphitiLLMProvider, GraphitiEmbeddingProvider } from '../../../shared/types';

interface GraphitiStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

// Provider configurations with descriptions
const LLM_PROVIDERS: Array<{
  id: GraphitiLLMProvider;
  name: string;
  description: string;
  requiresApiKey: boolean;
}> = [
  { id: 'openai', name: 'OpenAI', description: 'GPT models (recommended)', requiresApiKey: true },
  { id: 'anthropic', name: 'Anthropic', description: 'Claude models', requiresApiKey: true },
  { id: 'google', name: 'Google AI', description: 'Gemini models', requiresApiKey: true },
  { id: 'groq', name: 'Groq', description: 'Llama models (fast inference)', requiresApiKey: true },
  { id: 'azure_openai', name: 'Azure OpenAI', description: 'Enterprise Azure deployment', requiresApiKey: true },
  { id: 'ollama', name: 'Ollama', description: 'Local models (free)', requiresApiKey: false }
];

const EMBEDDING_PROVIDERS: Array<{
  id: GraphitiEmbeddingProvider;
  name: string;
  description: string;
  requiresApiKey: boolean;
}> = [
  { id: 'openai', name: 'OpenAI', description: 'text-embedding-3-small (recommended)', requiresApiKey: true },
  { id: 'voyage', name: 'Voyage AI', description: 'voyage-3 (great with Anthropic)', requiresApiKey: true },
  { id: 'google', name: 'Google AI', description: 'Gemini text-embedding-004', requiresApiKey: true },
  { id: 'huggingface', name: 'HuggingFace', description: 'Open source models', requiresApiKey: true },
  { id: 'azure_openai', name: 'Azure OpenAI', description: 'Enterprise Azure embeddings', requiresApiKey: true },
  { id: 'ollama', name: 'Ollama', description: 'Local embeddings (free)', requiresApiKey: false }
];

interface GraphitiConfig {
  enabled: boolean;
  falkorDbUri: string;
  llmProvider: GraphitiLLMProvider;
  embeddingProvider: GraphitiEmbeddingProvider;
  // OpenAI
  openaiApiKey: string;
  // Anthropic
  anthropicApiKey: string;
  // Azure OpenAI
  azureOpenaiApiKey: string;
  azureOpenaiBaseUrl: string;
  azureOpenaiLlmDeployment: string;
  azureOpenaiEmbeddingDeployment: string;
  // Voyage
  voyageApiKey: string;
  // Google
  googleApiKey: string;
  // Groq
  groqApiKey: string;
  // HuggingFace
  huggingfaceApiKey: string;
  // Ollama
  ollamaBaseUrl: string;
  ollamaLlmModel: string;
  ollamaEmbeddingModel: string;
  ollamaEmbeddingDim: string;
}

interface ValidationStatus {
  falkordb: { tested: boolean; success: boolean; message: string } | null;
  provider: { tested: boolean; success: boolean; message: string } | null;
}

/**
 * Graphiti/FalkorDB configuration step for the onboarding wizard.
 * Allows users to optionally configure Graphiti memory backend with multiple provider options.
 * This step is entirely optional and can be skipped.
 */
export function GraphitiStep({ onNext, onBack, onSkip }: GraphitiStepProps) {
  const { settings, updateSettings } = useSettingsStore();
  const [config, setConfig] = useState<GraphitiConfig>({
    enabled: false,
    falkorDbUri: 'bolt://localhost:6380',
    llmProvider: 'openai',
    embeddingProvider: 'openai',
    openaiApiKey: settings.globalOpenAIApiKey || '',
    anthropicApiKey: settings.globalAnthropicApiKey || '',
    azureOpenaiApiKey: '',
    azureOpenaiBaseUrl: '',
    azureOpenaiLlmDeployment: '',
    azureOpenaiEmbeddingDeployment: '',
    voyageApiKey: '',
    googleApiKey: settings.globalGoogleApiKey || '',
    groqApiKey: settings.globalGroqApiKey || '',
    huggingfaceApiKey: '',
    ollamaBaseUrl: settings.ollamaBaseUrl || 'http://localhost:11434',
    ollamaLlmModel: '',
    ollamaEmbeddingModel: '',
    ollamaEmbeddingDim: '768'
  });
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isCheckingDocker, setIsCheckingDocker] = useState(true);
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>({
    falkordb: null,
    provider: null
  });

  // Check Docker/Infrastructure availability on mount
  useEffect(() => {
    const checkInfrastructure = async () => {
      setIsCheckingDocker(true);
      try {
        const result = await window.electronAPI.getInfrastructureStatus();
        setDockerAvailable(result?.success && result?.data?.docker?.running ? true : false);

        if (result?.success && result?.data?.falkordb?.containerRunning) {
          const detectedPort = result.data.falkordb.port;
          setConfig(prev => ({
            ...prev,
            falkorDbUri: `bolt://localhost:${detectedPort}`
          }));
        }
      } catch {
        setDockerAvailable(false);
      } finally {
        setIsCheckingDocker(false);
      }
    };

    checkInfrastructure();
  }, []);

  const handleToggleEnabled = (checked: boolean) => {
    setConfig(prev => ({ ...prev, enabled: checked }));
    setError(null);
    setSuccess(false);
    setValidationStatus({ falkordb: null, provider: null });
  };

  const toggleShowApiKey = (key: string) => {
    setShowApiKey(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Get the required API key for the current provider configuration
  const getRequiredApiKey = (): string | null => {
    const { llmProvider, embeddingProvider } = config;

    // Check LLM provider
    if (llmProvider === 'openai' || embeddingProvider === 'openai') {
      if (!config.openaiApiKey.trim()) return 'OpenAI API key';
    }
    if (llmProvider === 'anthropic') {
      if (!config.anthropicApiKey.trim()) return 'Anthropic API key';
    }
    if (llmProvider === 'azure_openai' || embeddingProvider === 'azure_openai') {
      if (!config.azureOpenaiApiKey.trim()) return 'Azure OpenAI API key';
      if (!config.azureOpenaiBaseUrl.trim()) return 'Azure OpenAI Base URL';
      if (llmProvider === 'azure_openai' && !config.azureOpenaiLlmDeployment.trim()) {
        return 'Azure OpenAI LLM deployment name';
      }
      if (embeddingProvider === 'azure_openai' && !config.azureOpenaiEmbeddingDeployment.trim()) {
        return 'Azure OpenAI embedding deployment name';
      }
    }
    if (embeddingProvider === 'voyage') {
      if (!config.voyageApiKey.trim()) return 'Voyage API key';
    }
    if (llmProvider === 'google' || embeddingProvider === 'google') {
      if (!config.googleApiKey.trim()) return 'Google API key';
    }
    if (llmProvider === 'groq') {
      if (!config.groqApiKey.trim()) return 'Groq API key';
    }
    if (embeddingProvider === 'huggingface') {
      if (!config.huggingfaceApiKey.trim()) return 'HuggingFace API key';
    }
    if (llmProvider === 'ollama') {
      if (!config.ollamaLlmModel.trim()) return 'Ollama LLM model name';
    }
    if (embeddingProvider === 'ollama') {
      if (!config.ollamaEmbeddingModel.trim()) return 'Ollama embedding model name';
    }

    return null;
  };

  const handleTestConnection = async () => {
    const missingKey = getRequiredApiKey();
    if (missingKey) {
      setError(`Please enter ${missingKey} to test the connection`);
      return;
    }

    setIsValidating(true);
    setError(null);
    setValidationStatus({ falkordb: null, provider: null });

    try {
      // For now, use the existing OpenAI validation - this will be expanded
      const apiKey = config.llmProvider === 'openai' ? config.openaiApiKey :
                     config.embeddingProvider === 'openai' ? config.openaiApiKey : '';

      const result = await window.electronAPI.testGraphitiConnection(
        config.falkorDbUri,
        apiKey.trim()
      );

      if (result?.success && result?.data) {
        setValidationStatus({
          falkordb: {
            tested: true,
            success: result.data.falkordb.success,
            message: result.data.falkordb.message
          },
          provider: {
            tested: true,
            success: result.data.openai.success,
            message: result.data.openai.success
              ? `${config.llmProvider} / ${config.embeddingProvider} providers configured`
              : result.data.openai.message
          }
        });

        if (!result.data.ready) {
          const errors: string[] = [];
          if (!result.data.falkordb.success) {
            errors.push(`FalkorDB: ${result.data.falkordb.message}`);
          }
          if (!result.data.openai.success) {
            errors.push(`Provider: ${result.data.openai.message}`);
          }
          if (errors.length > 0) {
            setError(errors.join('\n'));
          }
        }
      } else {
        setError(result?.error || 'Failed to test connection');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = async () => {
    if (!config.enabled) {
      onNext();
      return;
    }

    const missingKey = getRequiredApiKey();
    if (missingKey) {
      setError(`${missingKey} is required`);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Save the primary API keys to global settings based on providers
      const settingsToSave: Record<string, string> = {
        graphitiLlmProvider: config.llmProvider,
      };

      if (config.openaiApiKey.trim()) {
        settingsToSave.globalOpenAIApiKey = config.openaiApiKey.trim();
      }
      if (config.anthropicApiKey.trim()) {
        settingsToSave.globalAnthropicApiKey = config.anthropicApiKey.trim();
      }
      if (config.googleApiKey.trim()) {
        settingsToSave.globalGoogleApiKey = config.googleApiKey.trim();
      }
      if (config.groqApiKey.trim()) {
        settingsToSave.globalGroqApiKey = config.groqApiKey.trim();
      }
      if (config.ollamaBaseUrl.trim()) {
        settingsToSave.ollamaBaseUrl = config.ollamaBaseUrl.trim();
      }

      const result = await window.electronAPI.saveSettings(settingsToSave);

      if (result?.success) {
        // Update local settings store
        const storeUpdate: Record<string, string> = {};
        if (config.openaiApiKey.trim()) storeUpdate.globalOpenAIApiKey = config.openaiApiKey.trim();
        if (config.anthropicApiKey.trim()) storeUpdate.globalAnthropicApiKey = config.anthropicApiKey.trim();
        if (config.googleApiKey.trim()) storeUpdate.globalGoogleApiKey = config.googleApiKey.trim();
        if (config.groqApiKey.trim()) storeUpdate.globalGroqApiKey = config.groqApiKey.trim();
        if (config.ollamaBaseUrl.trim()) storeUpdate.ollamaBaseUrl = config.ollamaBaseUrl.trim();
        updateSettings(storeUpdate);
        onNext();
      } else {
        setError(result?.error || 'Failed to save Graphiti configuration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleContinue = () => {
    if (config.enabled && !success) {
      handleSave();
    } else {
      onNext();
    }
  };

  const handleOpenDocs = () => {
    window.open('https://github.com/getzep/graphiti', '_blank');
  };

  const handleReconfigure = () => {
    setSuccess(false);
    setError(null);
  };

  // Render provider-specific configuration fields
  const renderProviderFields = () => {
    const { llmProvider, embeddingProvider } = config;
    const needsOpenAI = llmProvider === 'openai' || embeddingProvider === 'openai';
    const needsAnthropic = llmProvider === 'anthropic';
    const needsAzure = llmProvider === 'azure_openai' || embeddingProvider === 'azure_openai';
    const needsVoyage = embeddingProvider === 'voyage';
    const needsGoogle = llmProvider === 'google' || embeddingProvider === 'google';
    const needsGroq = llmProvider === 'groq';
    const needsHuggingFace = embeddingProvider === 'huggingface';
    const needsOllama = llmProvider === 'ollama' || embeddingProvider === 'ollama';

    return (
      <div className="space-y-4">
        {/* OpenAI API Key */}
        {needsOpenAI && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="openai-key" className="text-sm font-medium text-foreground">
                OpenAI API Key
              </Label>
              {validationStatus.provider?.tested && needsOpenAI && (
                <div className="flex items-center gap-1.5">
                  {validationStatus.provider.success ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                </div>
              )}
            </div>
            <div className="relative">
              <Input
                id="openai-key"
                type={showApiKey['openai'] ? 'text' : 'password'}
                value={config.openaiApiKey}
                onChange={(e) => {
                  setConfig(prev => ({ ...prev, openaiApiKey: e.target.value }));
                  setValidationStatus(prev => ({ ...prev, provider: null }));
                }}
                placeholder="sk-..."
                className="pr-10 font-mono text-sm"
                disabled={isSaving || isValidating}
              />
              <button
                type="button"
                onClick={() => toggleShowApiKey('openai')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey['openai'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key from{' '}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                OpenAI
              </a>
            </p>
          </div>
        )}

        {/* Anthropic API Key */}
        {needsAnthropic && (
          <div className="space-y-2">
            <Label htmlFor="anthropic-key" className="text-sm font-medium text-foreground">
              Anthropic API Key
            </Label>
            <div className="relative">
              <Input
                id="anthropic-key"
                type={showApiKey['anthropic'] ? 'text' : 'password'}
                value={config.anthropicApiKey}
                onChange={(e) => setConfig(prev => ({ ...prev, anthropicApiKey: e.target.value }))}
                placeholder="sk-ant-..."
                className="pr-10 font-mono text-sm"
                disabled={isSaving || isValidating}
              />
              <button
                type="button"
                onClick={() => toggleShowApiKey('anthropic')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey['anthropic'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key from{' '}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                Anthropic Console
              </a>
            </p>
          </div>
        )}

        {/* Azure OpenAI Settings */}
        {needsAzure && (
          <div className="space-y-3 p-3 rounded-md bg-muted/50">
            <p className="text-sm font-medium text-foreground">Azure OpenAI Settings</p>
            <div className="space-y-2">
              <Label htmlFor="azure-key" className="text-xs text-muted-foreground">API Key</Label>
              <div className="relative">
                <Input
                  id="azure-key"
                  type={showApiKey['azure'] ? 'text' : 'password'}
                  value={config.azureOpenaiApiKey}
                  onChange={(e) => setConfig(prev => ({ ...prev, azureOpenaiApiKey: e.target.value }))}
                  placeholder="Azure API key"
                  className="pr-10 font-mono text-sm"
                  disabled={isSaving || isValidating}
                />
                <button
                  type="button"
                  onClick={() => toggleShowApiKey('azure')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey['azure'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="azure-url" className="text-xs text-muted-foreground">Base URL</Label>
              <Input
                id="azure-url"
                type="text"
                value={config.azureOpenaiBaseUrl}
                onChange={(e) => setConfig(prev => ({ ...prev, azureOpenaiBaseUrl: e.target.value }))}
                placeholder="https://your-resource.openai.azure.com"
                className="font-mono text-sm"
                disabled={isSaving || isValidating}
              />
            </div>
            {llmProvider === 'azure_openai' && (
              <div className="space-y-2">
                <Label htmlFor="azure-llm-deployment" className="text-xs text-muted-foreground">LLM Deployment Name</Label>
                <Input
                  id="azure-llm-deployment"
                  type="text"
                  value={config.azureOpenaiLlmDeployment}
                  onChange={(e) => setConfig(prev => ({ ...prev, azureOpenaiLlmDeployment: e.target.value }))}
                  placeholder="gpt-4"
                  className="font-mono text-sm"
                  disabled={isSaving || isValidating}
                />
              </div>
            )}
            {embeddingProvider === 'azure_openai' && (
              <div className="space-y-2">
                <Label htmlFor="azure-embedding-deployment" className="text-xs text-muted-foreground">Embedding Deployment Name</Label>
                <Input
                  id="azure-embedding-deployment"
                  type="text"
                  value={config.azureOpenaiEmbeddingDeployment}
                  onChange={(e) => setConfig(prev => ({ ...prev, azureOpenaiEmbeddingDeployment: e.target.value }))}
                  placeholder="text-embedding-ada-002"
                  className="font-mono text-sm"
                  disabled={isSaving || isValidating}
                />
              </div>
            )}
          </div>
        )}

        {/* Voyage API Key */}
        {needsVoyage && (
          <div className="space-y-2">
            <Label htmlFor="voyage-key" className="text-sm font-medium text-foreground">
              Voyage API Key
            </Label>
            <div className="relative">
              <Input
                id="voyage-key"
                type={showApiKey['voyage'] ? 'text' : 'password'}
                value={config.voyageApiKey}
                onChange={(e) => setConfig(prev => ({ ...prev, voyageApiKey: e.target.value }))}
                placeholder="pa-..."
                className="pr-10 font-mono text-sm"
                disabled={isSaving || isValidating}
              />
              <button
                type="button"
                onClick={() => toggleShowApiKey('voyage')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey['voyage'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key from{' '}
              <a href="https://dash.voyageai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                Voyage AI
              </a>
            </p>
          </div>
        )}

        {/* Google API Key */}
        {needsGoogle && (
          <div className="space-y-2">
            <Label htmlFor="google-key" className="text-sm font-medium text-foreground">
              Google API Key
            </Label>
            <div className="relative">
              <Input
                id="google-key"
                type={showApiKey['google'] ? 'text' : 'password'}
                value={config.googleApiKey}
                onChange={(e) => setConfig(prev => ({ ...prev, googleApiKey: e.target.value }))}
                placeholder="AIza..."
                className="pr-10 font-mono text-sm"
                disabled={isSaving || isValidating}
              />
              <button
                type="button"
                onClick={() => toggleShowApiKey('google')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey['google'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key from{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                Google AI Studio
              </a>
            </p>
          </div>
        )}

        {/* Groq API Key */}
        {needsGroq && (
          <div className="space-y-2">
            <Label htmlFor="groq-key" className="text-sm font-medium text-foreground">
              Groq API Key
            </Label>
            <div className="relative">
              <Input
                id="groq-key"
                type={showApiKey['groq'] ? 'text' : 'password'}
                value={config.groqApiKey}
                onChange={(e) => setConfig(prev => ({ ...prev, groqApiKey: e.target.value }))}
                placeholder="gsk_..."
                className="pr-10 font-mono text-sm"
                disabled={isSaving || isValidating}
              />
              <button
                type="button"
                onClick={() => toggleShowApiKey('groq')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey['groq'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key from{' '}
              <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                Groq Console
              </a>
            </p>
          </div>
        )}

        {/* HuggingFace API Key */}
        {needsHuggingFace && (
          <div className="space-y-2">
            <Label htmlFor="huggingface-key" className="text-sm font-medium text-foreground">
              HuggingFace API Key
            </Label>
            <div className="relative">
              <Input
                id="huggingface-key"
                type={showApiKey['huggingface'] ? 'text' : 'password'}
                value={config.huggingfaceApiKey}
                onChange={(e) => setConfig(prev => ({ ...prev, huggingfaceApiKey: e.target.value }))}
                placeholder="hf_..."
                className="pr-10 font-mono text-sm"
                disabled={isSaving || isValidating}
              />
              <button
                type="button"
                onClick={() => toggleShowApiKey('huggingface')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey['huggingface'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key from{' '}
              <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                HuggingFace
              </a>
            </p>
          </div>
        )}

        {/* Ollama Settings */}
        {needsOllama && (
          <div className="space-y-3 p-3 rounded-md bg-muted/50">
            <p className="text-sm font-medium text-foreground">Ollama Settings (Local)</p>
            <div className="space-y-2">
              <Label htmlFor="ollama-url" className="text-xs text-muted-foreground">Base URL</Label>
              <Input
                id="ollama-url"
                type="text"
                value={config.ollamaBaseUrl}
                onChange={(e) => setConfig(prev => ({ ...prev, ollamaBaseUrl: e.target.value }))}
                placeholder="http://localhost:11434"
                className="font-mono text-sm"
                disabled={isSaving || isValidating}
              />
            </div>
            {llmProvider === 'ollama' && (
              <div className="space-y-2">
                <Label htmlFor="ollama-llm" className="text-xs text-muted-foreground">LLM Model</Label>
                <Input
                  id="ollama-llm"
                  type="text"
                  value={config.ollamaLlmModel}
                  onChange={(e) => setConfig(prev => ({ ...prev, ollamaLlmModel: e.target.value }))}
                  placeholder="llama3.2, deepseek-r1:7b, etc."
                  className="font-mono text-sm"
                  disabled={isSaving || isValidating}
                />
              </div>
            )}
            {embeddingProvider === 'ollama' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ollama-embedding" className="text-xs text-muted-foreground">Embedding Model</Label>
                  <Input
                    id="ollama-embedding"
                    type="text"
                    value={config.ollamaEmbeddingModel}
                    onChange={(e) => setConfig(prev => ({ ...prev, ollamaEmbeddingModel: e.target.value }))}
                    placeholder="nomic-embed-text"
                    className="font-mono text-sm"
                    disabled={isSaving || isValidating}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ollama-dim" className="text-xs text-muted-foreground">Embedding Dimension</Label>
                  <Input
                    id="ollama-dim"
                    type="number"
                    value={config.ollamaEmbeddingDim}
                    onChange={(e) => setConfig(prev => ({ ...prev, ollamaEmbeddingDim: e.target.value }))}
                    placeholder="768"
                    className="font-mono text-sm"
                    disabled={isSaving || isValidating}
                  />
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Ensure Ollama is running locally. See{' '}
              <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                ollama.ai
              </a>
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Brain className="h-7 w-7" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Memory & Context (Optional)
          </h1>
          <p className="mt-2 text-muted-foreground">
            Enable Graphiti for persistent memory across coding sessions
          </p>
        </div>

        {/* Loading state for Docker check */}
        {isCheckingDocker && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Main content */}
        {!isCheckingDocker && (
          <div className="space-y-6">
            {/* Success state */}
            {success && (
              <Card className="border border-success/30 bg-success/10">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <CheckCircle2 className="h-6 w-6 text-success shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-success">
                        Graphiti configured successfully
                      </h3>
                      <p className="mt-1 text-sm text-success/80">
                        Memory features are enabled. Auto Claude will maintain context
                        across sessions for improved code understanding.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reconfigure link after success */}
            {success && (
              <div className="text-center text-sm text-muted-foreground">
                <button
                  onClick={handleReconfigure}
                  className="text-primary hover:text-primary/80 underline-offset-4 hover:underline"
                >
                  Reconfigure Graphiti settings
                </button>
              </div>
            )}

            {/* Configuration form */}
            {!success && (
              <>
                {/* Error banner */}
                {error && (
                  <Card className="border border-destructive/30 bg-destructive/10">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                        <p className="text-sm text-destructive whitespace-pre-line">{error}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Docker warning */}
                {dockerAvailable === false && (
                  <Card className="border border-warning/30 bg-warning/10">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-warning">
                            Docker not detected
                          </p>
                          <p className="text-sm text-warning/80 mt-1">
                            FalkorDB requires Docker to run. You can still configure Graphiti now
                            and set up Docker later.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Info card about Graphiti */}
                <Card className="border border-info/30 bg-info/10">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-3">
                        <p className="text-sm font-medium text-foreground">
                          What is Graphiti?
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Graphiti is an intelligent memory layer that helps Auto Claude remember
                          context across sessions. It uses a knowledge graph to store discoveries,
                          patterns, and insights about your codebase.
                        </p>
                        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
                          <li>Persistent memory across coding sessions</li>
                          <li>Better understanding of your codebase over time</li>
                          <li>Reduces repetitive explanations</li>
                        </ul>
                        <button
                          onClick={handleOpenDocs}
                          className="text-sm text-info hover:text-info/80 flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Learn more about Graphiti
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Enable toggle */}
                <Card className="border border-border bg-card">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Database className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <Label htmlFor="enable-graphiti" className="text-sm font-medium text-foreground cursor-pointer">
                            Enable Graphiti Memory
                          </Label>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Requires FalkorDB (Docker) and an LLM/embedding provider
                          </p>
                        </div>
                      </div>
                      <Switch
                        id="enable-graphiti"
                        checked={config.enabled}
                        onCheckedChange={handleToggleEnabled}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Configuration fields (shown when enabled) */}
                {config.enabled && (
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                    {/* FalkorDB URI */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor="falkordb-uri" className="text-sm font-medium text-foreground">
                            FalkorDB URI
                          </Label>
                        </div>
                        {validationStatus.falkordb && (
                          <div className="flex items-center gap-1.5">
                            {validationStatus.falkordb.success ? (
                              <CheckCircle2 className="h-4 w-4 text-success" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                            <span className={`text-xs ${validationStatus.falkordb.success ? 'text-success' : 'text-destructive'}`}>
                              {validationStatus.falkordb.success ? 'Connected' : 'Failed'}
                            </span>
                          </div>
                        )}
                      </div>
                      <Input
                        id="falkordb-uri"
                        type="text"
                        value={config.falkorDbUri}
                        onChange={(e) => {
                          setConfig(prev => ({ ...prev, falkorDbUri: e.target.value }));
                          setValidationStatus(prev => ({ ...prev, falkordb: null }));
                        }}
                        placeholder="bolt://localhost:6379"
                        className="font-mono text-sm"
                        disabled={isSaving || isValidating}
                      />
                      <p className="text-xs text-muted-foreground">
                        Auto-detected from Docker if FalkorDB is running
                      </p>
                    </div>

                    {/* Provider Selection */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* LLM Provider */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">
                          LLM Provider
                        </Label>
                        <Select
                          value={config.llmProvider}
                          onValueChange={(value: GraphitiLLMProvider) => {
                            setConfig(prev => ({ ...prev, llmProvider: value }));
                            setValidationStatus(prev => ({ ...prev, provider: null }));
                          }}
                          disabled={isSaving || isValidating}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LLM_PROVIDERS.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                <div className="flex flex-col">
                                  <span>{p.name}</span>
                                  <span className="text-xs text-muted-foreground">{p.description}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Embedding Provider */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">
                          Embedding Provider
                        </Label>
                        <Select
                          value={config.embeddingProvider}
                          onValueChange={(value: GraphitiEmbeddingProvider) => {
                            setConfig(prev => ({ ...prev, embeddingProvider: value }));
                            setValidationStatus(prev => ({ ...prev, provider: null }));
                          }}
                          disabled={isSaving || isValidating}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EMBEDDING_PROVIDERS.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                <div className="flex flex-col">
                                  <span>{p.name}</span>
                                  <span className="text-xs text-muted-foreground">{p.description}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Provider-specific fields */}
                    {renderProviderFields()}

                    {/* Test Connection Button */}
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        onClick={handleTestConnection}
                        disabled={!!getRequiredApiKey() || isValidating || isSaving}
                        className="w-full"
                      >
                        {isValidating ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Testing connection...
                          </>
                        ) : (
                          <>
                            <Zap className="h-4 w-4 mr-2" />
                            Test Connection
                          </>
                        )}
                      </Button>
                      {validationStatus.falkordb?.success && validationStatus.provider?.success && (
                        <p className="text-xs text-success text-center mt-2">
                          All connections validated successfully!
                        </p>
                      )}
                      {config.llmProvider !== 'openai' && config.llmProvider !== 'ollama' && (
                        <p className="text-xs text-muted-foreground text-center mt-2">
                          Note: API key validation currently only fully supports OpenAI. Your key will be saved and used at runtime.
                        </p>
                      )}
                      {config.llmProvider === 'ollama' && (
                        <p className="text-xs text-muted-foreground text-center mt-2">
                          Note: Ollama connection will be tested by checking if the server is reachable.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between items-center mt-10 pt-6 border-t border-border">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
          >
            Back
          </Button>
          <div className="flex gap-4">
            <Button
              variant="ghost"
              onClick={onSkip}
              className="text-muted-foreground hover:text-foreground"
            >
              Skip
            </Button>
            <Button
              onClick={handleContinue}
              disabled={isCheckingDocker || (config.enabled && !!getRequiredApiKey() && !success) || isSaving || isValidating}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : config.enabled && !success ? (
                'Save & Continue'
              ) : (
                'Continue'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
