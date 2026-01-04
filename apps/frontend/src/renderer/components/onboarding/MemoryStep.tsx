import { useState, useEffect } from 'react';
import {
  Brain,
  Database,
  Info,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import { OllamaModelSelector } from './OllamaModelSelector';
import { ProviderSelector, type ProviderConfig } from '../settings/environment/ProviderSelector';
import { useSettingsStore } from '../../stores/settings-store';
import type { AppSettings } from '../../../shared/types';

interface MemoryStepProps {
  onNext: () => void;
  onBack: () => void;
}

interface MemoryConfig {
  database: string;
  providerConfig: ProviderConfig;
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
    providerConfig: {
      provider: 'ollama',
      openaiApiKey: settings.globalOpenAIApiKey || '',
      googleApiKey: settings.globalGoogleApiKey || '',
      ollamaBaseUrl: settings.ollamaBaseUrl || 'http://localhost:11434',
      ollamaEmbeddingModel: 'embeddinggemma',
    },
    ollamaEmbeddingDim: 768,
  });
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

  // Check if we have valid configuration
  const isConfigValid = (): boolean => {
    const { provider } = config.providerConfig;

    // Ollama just needs a model selected
    if (provider === 'ollama') {
      return !!(config.providerConfig.ollamaEmbeddingModel?.trim());
    }

    // Other providers need API keys
    if (provider === 'openai' && !config.providerConfig.openaiApiKey?.trim()) return false;
    if (provider === 'voyage' && !config.providerConfig.voyageApiKey?.trim()) return false;
    if (provider === 'google' && !config.providerConfig.googleApiKey?.trim()) return false;
    if (provider === 'azure_openai') {
      if (!config.providerConfig.azureOpenaiApiKey?.trim()) return false;
      if (!config.providerConfig.azureOpenaiBaseUrl?.trim()) return false;
      if (!config.providerConfig.azureOpenaiEmbeddingDeployment?.trim()) return false;
    }

    return true;
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Save the API keys to global settings
      const settingsToSave: Record<string, string | undefined> = {};
      const pc = config.providerConfig;

      if (pc.openaiApiKey?.trim()) {
        settingsToSave.globalOpenAIApiKey = pc.openaiApiKey.trim();
      }
      if (pc.googleApiKey?.trim()) {
        settingsToSave.globalGoogleApiKey = pc.googleApiKey.trim();
      }
      if (pc.ollamaBaseUrl?.trim()) {
        settingsToSave.ollamaBaseUrl = pc.ollamaBaseUrl.trim();
      }

      const result = await window.electronAPI.saveSettings(settingsToSave);

      if (result?.success) {
        // Update local settings store
        const storeUpdate: Partial<Pick<AppSettings, 'globalOpenAIApiKey' | 'globalGoogleApiKey' | 'ollamaBaseUrl'>> = {};
        if (pc.openaiApiKey?.trim()) storeUpdate.globalOpenAIApiKey = pc.openaiApiKey.trim();
        if (pc.googleApiKey?.trim()) storeUpdate.globalGoogleApiKey = pc.googleApiKey.trim();
        if (pc.ollamaBaseUrl?.trim()) storeUpdate.ollamaBaseUrl = pc.ollamaBaseUrl.trim();
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
      providerConfig: {
        ...prev.providerConfig,
        ollamaEmbeddingModel: modelName,
      },
      ollamaEmbeddingDim: dim,
    }));
  };

  const handleProviderConfigChange = (updates: Partial<ProviderConfig>) => {
    setConfig(prev => ({
      ...prev,
      providerConfig: {
        ...prev.providerConfig,
        ...updates,
      },
    }));
  };

  // Render custom Ollama UI with model selector
  const renderOllamaFields = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">
          Select Embedding Model
        </Label>
        <OllamaModelSelector
          selectedModel={config.providerConfig.ollamaEmbeddingModel || ''}
          onModelSelect={handleOllamaModelSelect}
          disabled={isSaving}
        />
      </div>
    </div>
  );

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
              <Label className="text-sm font-medium text-foreground">
                Embedding Provider (for semantic search)
              </Label>
              <ProviderSelector
                config={config.providerConfig}
                onChange={handleProviderConfigChange}
                disabled={isSaving}
                renderOllama={renderOllamaFields}
              />
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
