import { useState, useEffect } from 'react';
import {
  Brain,
  Database,
  Info,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { OllamaModelSelector } from './OllamaModelSelector';
import { useSettingsStore } from '../../stores/settings-store';
import type { GraphitiEmbeddingProvider, AppSettings } from '../../../shared/types';

interface MemoryStepProps {
  onNext: () => void;
  onBack: () => void;
}

// Embedding provider configurations (LLM provider removed - Claude SDK handles RAG)
const EMBEDDING_PROVIDERS: Array<{
  id: GraphitiEmbeddingProvider;
  name: string;
  description: string;
  requiresApiKey: boolean;
}> = [
  { id: 'ollama', name: 'Ollama (Local)', description: 'Free, local embeddings', requiresApiKey: false },
  { id: 'openai', name: 'OpenAI', description: 'text-embedding-3-small', requiresApiKey: true },
  { id: 'voyage', name: 'Voyage AI', description: 'voyage-3 (high quality)', requiresApiKey: true },
  { id: 'google', name: 'Google AI', description: 'text-embedding-004', requiresApiKey: true },
  { id: 'azure_openai', name: 'Azure OpenAI', description: 'Enterprise deployment', requiresApiKey: true },
];

interface MemoryConfig {
  database: string;
  embeddingProvider: GraphitiEmbeddingProvider;
  // OpenAI
  openaiApiKey: string;
  // Azure OpenAI
  azureOpenaiApiKey: string;
  azureOpenaiBaseUrl: string;
  azureOpenaiEmbeddingDeployment: string;
  // Voyage
  voyageApiKey: string;
  // Google
  googleApiKey: string;
  // Ollama
  ollamaBaseUrl: string;
  ollamaEmbeddingModel: string;
  ollamaEmbeddingDim: number;
}

/**
 * Memory configuration step for the onboarding wizard.
 *
 * Key simplifications from the previous GraphitiStep:
 * - Memory is always enabled (no toggle)
 * - LLM provider removed (Claude SDK handles RAG queries)
 * - Ollama is the default with model discovery + download
 * - Keyword search works as fallback without embeddings
 */
export function MemoryStep({ onNext, onBack }: MemoryStepProps) {
  const { settings, updateSettings } = useSettingsStore();
  const [config, setConfig] = useState<MemoryConfig>({
    database: 'auto_claude_memory',
    embeddingProvider: 'ollama',
    openaiApiKey: settings.globalOpenAIApiKey || '',
    azureOpenaiApiKey: '',
    azureOpenaiBaseUrl: '',
    azureOpenaiEmbeddingDeployment: '',
    voyageApiKey: '',
    googleApiKey: settings.globalGoogleApiKey || '',
    ollamaBaseUrl: settings.ollamaBaseUrl || 'http://localhost:11434',
    ollamaEmbeddingModel: 'qwen3-embedding:4b',
    ollamaEmbeddingDim: 2560,
  });
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingInfra, setIsCheckingInfra] = useState(true);
  const [kuzuAvailable, setKuzuAvailable] = useState<boolean | null>(null);

  // Check LadybugDB/Kuzu availability on mount
  useEffect(() => {
    const checkInfrastructure = async () => {
      setIsCheckingInfra(true);
      try {
        const result = await window.electronAPI.getMemoryInfrastructureStatus();
        setKuzuAvailable(result?.success && result?.data?.memory?.kuzuInstalled ? true : false);
      } catch {
        setKuzuAvailable(false);
      } finally {
        setIsCheckingInfra(false);
      }
    };

    checkInfrastructure();
  }, []);

  const toggleShowApiKey = (key: string) => {
    setShowApiKey(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Check if we have valid configuration
  const isConfigValid = (): boolean => {
    const { embeddingProvider } = config;

    // Ollama just needs a model selected
    if (embeddingProvider === 'ollama') {
      return !!config.ollamaEmbeddingModel.trim();
    }

    // Other providers need API keys
    if (embeddingProvider === 'openai' && !config.openaiApiKey.trim()) return false;
    if (embeddingProvider === 'voyage' && !config.voyageApiKey.trim()) return false;
    if (embeddingProvider === 'google' && !config.googleApiKey.trim()) return false;
    if (embeddingProvider === 'azure_openai') {
      if (!config.azureOpenaiApiKey.trim()) return false;
      if (!config.azureOpenaiBaseUrl.trim()) return false;
      if (!config.azureOpenaiEmbeddingDeployment.trim()) return false;
    }

    return true;
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Save complete memory configuration to global settings
      // This includes all settings needed for backend to use memory
      const settingsToSave: Record<string, string | number | boolean | undefined> = {
        // Core memory settings (CRITICAL - these were missing before)
        memoryEnabled: true,
        memoryEmbeddingProvider: config.embeddingProvider,
        memoryOllamaEmbeddingModel: config.ollamaEmbeddingModel || undefined,
        memoryOllamaEmbeddingDim: config.ollamaEmbeddingDim || undefined,
        // Ollama base URL
        ollamaBaseUrl: config.ollamaBaseUrl.trim() || undefined,
        // Global API keys (shared across features)
        globalOpenAIApiKey: config.openaiApiKey.trim() || undefined,
        globalGoogleApiKey: config.googleApiKey.trim() || undefined,
        // Provider-specific keys for memory
        memoryVoyageApiKey: config.voyageApiKey.trim() || undefined,
        memoryAzureApiKey: config.azureOpenaiApiKey.trim() || undefined,
        memoryAzureBaseUrl: config.azureOpenaiBaseUrl.trim() || undefined,
        memoryAzureEmbeddingDeployment: config.azureOpenaiEmbeddingDeployment.trim() || undefined,
      };

      const result = await window.electronAPI.saveSettings(settingsToSave);

      if (result?.success) {
        // Update local settings store with all memory config
        const storeUpdate: Partial<AppSettings> = {
          memoryEnabled: true,
          memoryEmbeddingProvider: config.embeddingProvider,
          memoryOllamaEmbeddingModel: config.ollamaEmbeddingModel || undefined,
          memoryOllamaEmbeddingDim: config.ollamaEmbeddingDim || undefined,
          ollamaBaseUrl: config.ollamaBaseUrl.trim() || undefined,
          globalOpenAIApiKey: config.openaiApiKey.trim() || undefined,
          globalGoogleApiKey: config.googleApiKey.trim() || undefined,
          memoryVoyageApiKey: config.voyageApiKey.trim() || undefined,
          memoryAzureApiKey: config.azureOpenaiApiKey.trim() || undefined,
          memoryAzureBaseUrl: config.azureOpenaiBaseUrl.trim() || undefined,
          memoryAzureEmbeddingDeployment: config.azureOpenaiEmbeddingDeployment.trim() || undefined,
        };
        updateSettings(storeUpdate);
        onNext();
      } else {
        setError(result?.error || 'Failed to save memory configuration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleContinue = () => {
    handleSave();
  };

  const handleOllamaModelSelect = (modelName: string, dim: number) => {
    setConfig(prev => ({
      ...prev,
      ollamaEmbeddingModel: modelName,
      ollamaEmbeddingDim: dim,
    }));
  };

  // Render provider-specific configuration fields
  const renderProviderFields = () => {
    const { embeddingProvider } = config;

    if (embeddingProvider === 'ollama') {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              Select Embedding Model
            </Label>
            <OllamaModelSelector
              selectedModel={config.ollamaEmbeddingModel}
              onModelSelect={handleOllamaModelSelect}
              disabled={isSaving}
            />
          </div>
        </div>
      );
    }

    if (embeddingProvider === 'openai') {
      return (
        <div className="space-y-2">
          <Label htmlFor="openai-key" className="text-sm font-medium text-foreground">
            OpenAI API Key
          </Label>
          <div className="relative">
            <Input
              id="openai-key"
              type={showApiKey['openai'] ? 'text' : 'password'}
              value={config.openaiApiKey}
              onChange={(e) => setConfig(prev => ({ ...prev, openaiApiKey: e.target.value }))}
              placeholder="sk-..."
              className="pr-10 font-mono text-sm"
              disabled={isSaving}
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
      );
    }

    if (embeddingProvider === 'voyage') {
      return (
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
              disabled={isSaving}
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
      );
    }

    if (embeddingProvider === 'google') {
      return (
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
              disabled={isSaving}
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
      );
    }

    if (embeddingProvider === 'azure_openai') {
      return (
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
                disabled={isSaving}
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
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="azure-embedding-deployment" className="text-xs text-muted-foreground">Embedding Deployment Name</Label>
            <Input
              id="azure-embedding-deployment"
              type="text"
              value={config.azureOpenaiEmbeddingDeployment}
              onChange={(e) => setConfig(prev => ({ ...prev, azureOpenaiEmbeddingDeployment: e.target.value }))}
              placeholder="text-embedding-ada-002"
              className="font-mono text-sm"
              disabled={isSaving}
            />
          </div>
        </div>
      );
    }

    return null;
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
            Memory
          </h1>
          <p className="mt-2 text-muted-foreground">
            Auto Claude Memory helps remember context across your coding sessions
          </p>
        </div>

        {/* Loading state for infrastructure check */}
        {isCheckingInfra && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Main content */}
        {!isCheckingInfra && (
          <div className="space-y-6">
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

            {/* Kuzu status notice */}
            {kuzuAvailable === false && (
              <Card className="border border-info/30 bg-info/10">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-info">
                        Database will be created automatically
                      </p>
                      <p className="text-sm text-info/80 mt-1">
                        Memory uses an embedded database - no Docker required.
                        It will be created when you first use memory features.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Info card about Memory */}
            <Card className="border border-info/30 bg-info/10">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <p className="text-sm font-medium text-foreground">
                      What does Memory do?
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Memory stores discoveries, patterns, and insights about your codebase
                      so future sessions start with context already loaded.
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
                      <li>Remembers patterns across sessions</li>
                      <li>Understands your codebase over time</li>
                      <li>Works offline - no cloud required</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Database info */}
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <Database className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Memory Database
                </p>
                <p className="text-xs text-muted-foreground">
                  Stored in ~/.auto-claude/memories/
                </p>
              </div>
              {kuzuAvailable && (
                <CheckCircle2 className="h-4 w-4 text-success ml-auto" />
              )}
            </div>

            {/* Embedding Provider Selection */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  Embedding Provider (for semantic search)
                </Label>
                <Select
                  value={config.embeddingProvider}
                  onValueChange={(value: GraphitiEmbeddingProvider) => {
                    setConfig(prev => ({ ...prev, embeddingProvider: value }));
                  }}
                  disabled={isSaving}
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

              {/* Provider-specific fields */}
              {renderProviderFields()}
            </div>

            {/* Fallback info */}
            <p className="text-xs text-muted-foreground text-center">
              No embedding provider? Memory still works with keyword search. Semantic search is an upgrade.
            </p>
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
          <Button
            onClick={handleContinue}
            disabled={isCheckingInfra || !isConfigValid() || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save & Continue'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
