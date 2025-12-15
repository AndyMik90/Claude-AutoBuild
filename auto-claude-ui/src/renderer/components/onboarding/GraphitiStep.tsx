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
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '../ui/tooltip';
import { useSettingsStore } from '../../stores/settings-store';

interface GraphitiStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

interface GraphitiConfig {
  enabled: boolean;
  falkorDbUri: string;
  openAiApiKey: string;
}

interface ValidationStatus {
  falkordb: { tested: boolean; success: boolean; message: string } | null;
  openai: { tested: boolean; success: boolean; message: string } | null;
}

/**
 * Graphiti/FalkorDB configuration step for the onboarding wizard.
 * Allows users to optionally configure Graphiti memory backend.
 * This step is entirely optional and can be skipped.
 */
export function GraphitiStep({ onNext, onBack, onSkip }: GraphitiStepProps) {
  const { settings, updateSettings } = useSettingsStore();
  const [config, setConfig] = useState<GraphitiConfig>({
    enabled: false,
    falkorDbUri: 'bolt://localhost:6379',  // Standard FalkorDB port, will be auto-detected from Docker
    openAiApiKey: settings.globalOpenAIApiKey || ''
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
    openai: null
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
    setValidationStatus({ falkordb: null, openai: null });
  };

  const handleTestConnection = async () => {
    if (!config.openAiApiKey.trim()) {
      setError('Please enter an OpenAI API key to test the connection');
      return;
    }

    setIsValidating(true);
    setError(null);
    setValidationStatus({ falkordb: null, openai: null });

    try {
      const result = await window.electronAPI.testGraphitiConnection(
        config.falkorDbUri,
        config.openAiApiKey.trim()
      );

      if (result?.success && result?.data) {
        setValidationStatus({
          falkordb: {
            tested: true,
            success: result.data.falkordb.success,
            message: result.data.falkordb.message
          },
          openai: {
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
            errors.push(`OpenAI: ${result.data.openai.message}`);
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

    if (!config.openAiApiKey.trim()) {
      setError('OpenAI API key is required for Graphiti embeddings');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Save OpenAI API key to global settings
      const result = await window.electronAPI.saveSettings({
        globalOpenAIApiKey: config.openAiApiKey.trim()
      });

      if (result?.success) {
        // Update local settings store
        updateSettings({ globalOpenAIApiKey: config.openAiApiKey.trim() });
        setSuccess(true);
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
                    <CheckCircle2 className="h-6 w-6 text-success flex-shrink-0 mt-0.5" />
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
                        <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
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
                        <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
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
                      <Info className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
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
                            Requires FalkorDB (Docker) and OpenAI API key
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

                    {/* OpenAI API Key */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="openai-key" className="text-sm font-medium text-foreground">
                          OpenAI API Key
                        </Label>
                        {validationStatus.openai && (
                          <div className="flex items-center gap-1.5">
                            {validationStatus.openai.success ? (
                              <CheckCircle2 className="h-4 w-4 text-success" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                            <span className={`text-xs ${validationStatus.openai.success ? 'text-success' : 'text-destructive'}`}>
                              {validationStatus.openai.success ? 'Valid' : 'Invalid'}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="relative">
                        <Input
                          id="openai-key"
                          type={showApiKey ? 'text' : 'password'}
                          value={config.openAiApiKey}
                          onChange={(e) => {
                            setConfig(prev => ({ ...prev, openAiApiKey: e.target.value }));
                            setValidationStatus(prev => ({ ...prev, openai: null }));
                          }}
                          placeholder="sk-..."
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
                        Required for generating embeddings. Get your key from{' '}
                        <a
                          href="https://platform.openai.com/api-keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80"
                        >
                          OpenAI
                        </a>
                      </p>
                    </div>

                    {/* Test Connection Button */}
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        onClick={handleTestConnection}
                        disabled={!config.openAiApiKey.trim() || isValidating || isSaving}
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
                      {validationStatus.falkordb?.success && validationStatus.openai?.success && (
                        <p className="text-xs text-success text-center mt-2">
                          All connections validated successfully!
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
              disabled={isCheckingDocker || (config.enabled && !config.openAiApiKey.trim() && !success) || isSaving || isValidating}
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
