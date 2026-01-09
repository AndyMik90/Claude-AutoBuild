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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '../ui/tooltip';
import { useSettingsStore } from '../../stores/settings-store';
import type { GraphitiProviderType } from '../../../shared/types';
import type { AppSettings } from '../../../shared/types/settings';

interface GraphitiStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

interface GraphitiConfig {
  enabled: boolean;
  falkorDbUri: string;
  llmProvider: GraphitiProviderType;
  apiKey: string;
  ollamaBaseUrl: string;  // For Ollama provider (no API key needed)
}

// Provider display info
const PROVIDER_INFO: Record<GraphitiProviderType, {
  name: string;
  placeholder: string;
  link: string;
  requiresApiKey: boolean;
  description?: string;
}> = {
  openai: { name: 'OpenAI', placeholder: 'sk-...', link: 'https://platform.openai.com/api-keys', requiresApiKey: true },
  anthropic: { name: 'Anthropic', placeholder: 'sk-ant-...', link: 'https://console.anthropic.com/settings/keys', requiresApiKey: true },
  google: { name: 'Google (Gemini)', placeholder: 'AIza...', link: 'https://aistudio.google.com/apikey', requiresApiKey: true },
  groq: { name: 'Groq', placeholder: 'gsk_...', link: 'https://console.groq.com/keys', requiresApiKey: true },
  ollama: {
    name: 'Ollama',
    placeholder: 'http://localhost:11434',
    link: 'https://ollama.ai',
    requiresApiKey: false,
    description: 'Local LLM - no API key required'
  },
};

// Helper to get the saved API key for a provider from settings
function getApiKeyForProvider(provider: GraphitiProviderType, settings: AppSettings): string {
  switch (provider) {
    case 'openai': return settings.globalOpenAIApiKey || '';
    case 'anthropic': return settings.globalAnthropicApiKey || '';
    case 'google': return settings.globalGoogleApiKey || '';
    case 'groq': return settings.globalGroqApiKey || '';
    case 'ollama': return '';  // Ollama doesn't need an API key
    default: return '';
  }
}

// Helper to get the saved Ollama base URL from settings
function getOllamaBaseUrl(settings: AppSettings): string {
  return settings.ollamaBaseUrl || 'http://localhost:11434';
}

interface ValidationStatus {
  falkordb: { tested: boolean; success: boolean; message: string } | null;
  llm: { tested: boolean; success: boolean; message: string } | null;
}

/**
 * Graphiti/FalkorDB configuration step for the onboarding wizard.
 * Allows users to optionally configure Graphiti memory backend.
 * This step is entirely optional and can be skipped.
 */
export function GraphitiStep({ onNext, onBack, onSkip }: GraphitiStepProps) {
  const { settings, updateSettings } = useSettingsStore();
  // Load saved provider preference, defaulting to 'openai'
  const savedProvider = settings.graphitiLlmProvider || 'openai';
  const [config, setConfig] = useState<GraphitiConfig>({
    enabled: false,
    falkorDbUri: 'bolt://localhost:6379',  // Standard FalkorDB port, will be auto-detected from Docker
    llmProvider: savedProvider,
    apiKey: getApiKeyForProvider(savedProvider, settings),
    ollamaBaseUrl: getOllamaBaseUrl(settings)
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isCheckingDocker, setIsCheckingDocker] = useState(true);
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>({
    falkordb: null,
    llm: null
  });

  // Check Docker/Infrastructure availability on mount
  useEffect(() => {
    const checkInfrastructure = async () => {
      setIsCheckingDocker(true);
      try {
        // Check infrastructure status via the electronAPI
        const result = await window.electronAPI.getInfrastructureStatus();
        setDockerAvailable(result?.success && result?.data?.docker?.running ? true : false);

        // If FalkorDB is running, auto-detect and set the correct port
        if (result?.success && result?.data?.falkordb?.containerRunning) {
          const detectedPort = result.data.falkordb.port;
          setConfig(prev => ({
            ...prev,
            falkorDbUri: `bolt://localhost:${detectedPort}`
          }));
        }
      } catch {
        // Infrastructure check may fail, assume unavailable
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
    // Reset validation status when toggling
    setValidationStatus({ falkordb: null, llm: null });
  };

  const handleProviderChange = (provider: GraphitiProviderType) => {
    // Load saved API key or base URL for the selected provider
    const savedKey = getApiKeyForProvider(provider, settings);
    const savedOllamaUrl = getOllamaBaseUrl(settings);
    setConfig(prev => ({
      ...prev,
      llmProvider: provider,
      apiKey: savedKey,
      ollamaBaseUrl: savedOllamaUrl
    }));
    setValidationStatus(prev => ({ ...prev, llm: null }));
    setError(null);
  };

  const handleTestConnection = async () => {
    const providerName = PROVIDER_INFO[config.llmProvider].name;
    const providerInfo = PROVIDER_INFO[config.llmProvider];

    // Validate input based on provider type
    if (providerInfo.requiresApiKey && !config.apiKey.trim()) {
      setError(`Please enter a ${providerName} API key to test the connection`);
      return;
    }
    if (config.llmProvider === 'ollama' && !config.ollamaBaseUrl.trim()) {
      setError('Please enter the Ollama server URL to test the connection');
      return;
    }

    setIsValidating(true);
    setError(null);
    setValidationStatus({ falkordb: null, llm: null });

    try {
      // For now, we still use the OpenAI test endpoint, but pass the provider info
      // TODO: Add provider-specific validation endpoints
      // For Ollama, pass the base URL instead of API key
      const testCredential = config.llmProvider === 'ollama'
        ? config.ollamaBaseUrl.trim()
        : config.apiKey.trim();
      const result = await window.electronAPI.testGraphitiConnection(
        config.falkorDbUri,
        testCredential
      );

      if (result?.success && result?.data) {
        setValidationStatus({
          falkordb: {
            tested: true,
            success: result.data.falkordb.success,
            message: result.data.falkordb.message
          },
          llm: {
            tested: true,
            success: result.data.openai.success,
            message: result.data.openai.message
          }
        });

        if (!result.data.ready) {
          const errors: string[] = [];
          if (!result.data.falkordb.success) {
            errors.push(`FalkorDB: ${result.data.falkordb.message}`);
          }
          if (!result.data.openai.success) {
            errors.push(`${providerName}: ${result.data.openai.message}`);
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
      // If not enabled, just continue
      onNext();
      return;
    }

    const providerName = PROVIDER_INFO[config.llmProvider].name;
    const providerInfo = PROVIDER_INFO[config.llmProvider];

    // Validate input based on provider type
    if (providerInfo.requiresApiKey && !config.apiKey.trim()) {
      setError(`${providerName} API key is required for Graphiti`);
      return;
    }
    if (config.llmProvider === 'ollama' && !config.ollamaBaseUrl.trim()) {
      setError('Ollama server URL is required for Graphiti');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Build settings update based on selected provider
      const settingsUpdate: Record<string, string> = {
        graphitiLlmProvider: config.llmProvider,
      };

      // Save the API key or base URL for the selected provider
      if (config.llmProvider === 'openai') {
        settingsUpdate.globalOpenAIApiKey = config.apiKey.trim();
      } else if (config.llmProvider === 'anthropic') {
        settingsUpdate.globalAnthropicApiKey = config.apiKey.trim();
      } else if (config.llmProvider === 'google') {
        settingsUpdate.globalGoogleApiKey = config.apiKey.trim();
      } else if (config.llmProvider === 'groq') {
        settingsUpdate.globalGroqApiKey = config.apiKey.trim();
      } else if (config.llmProvider === 'ollama') {
        settingsUpdate.ollamaBaseUrl = config.ollamaBaseUrl.trim();
      }

      const result = await window.electronAPI.saveSettings(settingsUpdate);

      if (result?.success) {
        // Update local settings store for all providers
        const storeUpdate: Record<string, string> = {};
        if (config.llmProvider === 'openai') {
          storeUpdate.globalOpenAIApiKey = config.apiKey.trim();
        } else if (config.llmProvider === 'anthropic') {
          storeUpdate.globalAnthropicApiKey = config.apiKey.trim();
        } else if (config.llmProvider === 'google') {
          storeUpdate.globalGoogleApiKey = config.apiKey.trim();
        } else if (config.llmProvider === 'groq') {
          storeUpdate.globalGroqApiKey = config.apiKey.trim();
        } else if (config.llmProvider === 'ollama') {
          storeUpdate.ollamaBaseUrl = config.ollamaBaseUrl.trim();
        }
        updateSettings(storeUpdate);
        // Proceed to next step immediately after successful save
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
                        <p className="text-sm text-destructive">{error}</p>
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
                            Requires FalkorDB (Docker) and an LLM provider (API key or local Ollama)
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
                    {/* LLM Provider Selection */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">LLM Provider</Label>
                      <p className="text-xs text-muted-foreground">
                        Select the AI provider for graph operations
                      </p>
                      <Select
                        value={config.llmProvider}
                        onValueChange={(value) => handleProviderChange(value as GraphitiProviderType)}
                        disabled={isSaving || isValidating}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                          <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                          <SelectItem value="google">Google (Gemini)</SelectItem>
                          <SelectItem value="groq">Groq (Llama)</SelectItem>
                          <SelectItem value="ollama">Ollama (Local)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

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

                    {/* Dynamic credential field based on provider */}
                    {config.llmProvider === 'ollama' ? (
                      /* Ollama Base URL field */
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="ollama-url" className="text-sm font-medium text-foreground">
                            Ollama Server URL
                          </Label>
                          {validationStatus.llm && (
                            <div className="flex items-center gap-1.5">
                              {validationStatus.llm.success ? (
                                <CheckCircle2 className="h-4 w-4 text-success" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive" />
                              )}
                              <span className={`text-xs ${validationStatus.llm.success ? 'text-success' : 'text-destructive'}`}>
                                {validationStatus.llm.success ? 'Connected' : 'Failed'}
                              </span>
                            </div>
                          )}
                        </div>
                        <Input
                          id="ollama-url"
                          type="text"
                          value={config.ollamaBaseUrl}
                          onChange={(e) => {
                            setConfig(prev => ({ ...prev, ollamaBaseUrl: e.target.value }));
                            setValidationStatus(prev => ({ ...prev, llm: null }));
                          }}
                          placeholder="http://localhost:11434"
                          className="font-mono text-sm"
                          disabled={isSaving || isValidating}
                        />
                        <p className="text-xs text-muted-foreground">
                          No API key required. Make sure{' '}
                          <a
                            href="https://ollama.ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80"
                          >
                            Ollama
                          </a>
                          {' '}is running locally.
                        </p>
                      </div>
                    ) : (
                      /* API Key field for other providers */
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="api-key" className="text-sm font-medium text-foreground">
                            {PROVIDER_INFO[config.llmProvider].name} API Key
                          </Label>
                          {validationStatus.llm && (
                            <div className="flex items-center gap-1.5">
                              {validationStatus.llm.success ? (
                                <CheckCircle2 className="h-4 w-4 text-success" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive" />
                              )}
                              <span className={`text-xs ${validationStatus.llm.success ? 'text-success' : 'text-destructive'}`}>
                                {validationStatus.llm.success ? 'Valid' : 'Invalid'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="relative">
                          <Input
                            id="api-key"
                            type={showApiKey ? 'text' : 'password'}
                            value={config.apiKey}
                            onChange={(e) => {
                              setConfig(prev => ({ ...prev, apiKey: e.target.value }));
                              setValidationStatus(prev => ({ ...prev, llm: null }));
                            }}
                            placeholder={PROVIDER_INFO[config.llmProvider].placeholder}
                            className="pr-10 font-mono text-sm"
                            disabled={isSaving || isValidating}
                          />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showApiKey ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {showApiKey ? 'Hide API key' : 'Show API key'}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Required for graph operations. Get your key from{' '}
                          <a
                            href={PROVIDER_INFO[config.llmProvider].link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80"
                          >
                            {PROVIDER_INFO[config.llmProvider].name}
                          </a>
                        </p>
                      </div>
                    )}

                    {/* Test Connection Button */}
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        onClick={handleTestConnection}
                        disabled={(config.llmProvider === 'ollama' ? !config.ollamaBaseUrl.trim() : !config.apiKey.trim()) || isValidating || isSaving}
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
                      {validationStatus.falkordb?.success && validationStatus.llm?.success && (
                        <p className="text-xs text-success text-center mt-2">
                          All connections validated successfully!
                        </p>
                      )}
                      {config.llmProvider !== 'openai' && config.llmProvider !== 'ollama' && (
                        <p className="text-xs text-muted-foreground text-center mt-2">
                          Note: API key validation currently only fully supports OpenAI. Your {PROVIDER_INFO[config.llmProvider].name} key will be saved and used at runtime.
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
              disabled={isCheckingDocker || (config.enabled && !success && (config.llmProvider === 'ollama' ? !config.ollamaBaseUrl.trim() : !config.apiKey.trim())) || isSaving || isValidating}
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
