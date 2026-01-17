import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Check,
  Download,
  Loader2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { Button } from '../ui/button';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

interface OllamaModel {
  name: string;
  description: string;
  size_estimate?: string;
  dim: number;
  installed: boolean;
  badge?: string;
}

interface OllamaModelSelectorProps {
  selectedModel?: string;
  onModelSelect: (modelName: string, dim: number) => void;
  disabled?: boolean;
  className?: string;
  onDownloadComplete?: (modelName: string) => void;
}

// Recommended embedding models for Auto Claude Memory
// embeddinggemma is first as the recommended default
const RECOMMENDED_MODELS: OllamaModel[] = [
  {
    name: 'embeddinggemma',
    description: 'ollama.modelDescriptions.embeddinggemma',
    size_estimate: '621 MB',
    dim: 768,
    installed: false,
  },
  {
    name: 'qwen3-embedding:4b',
    description: 'ollama.modelDescriptions.qwen3-embedding:4b',
    size_estimate: '3.1 GB',
    dim: 2560,
    installed: false,
  },
  {
    name: 'qwen3-embedding:8b',
    description: 'ollama.modelDescriptions.qwen3-embedding:8b',
    size_estimate: '6.0 GB',
    dim: 4096,
    installed: false,
  },
  {
    name: 'qwen3-embedding:0.6b',
    description: 'ollama.modelDescriptions.qwen3-embedding:0.6b',
    size_estimate: '494 MB',
    dim: 1024,
    installed: false,
  },
  {
    name: 'nomic-embed-text',
    description: 'ollama.modelDescriptions.nomic-embed-text',
    size_estimate: '274 MB',
    dim: 768,
    installed: false,
  },
  {
    name: 'mxbai-embed-large',
    description: 'ollama.modelDescriptions.mxbai-embed-large',
    size_estimate: '670 MB',
    dim: 1024,
    installed: false,
  },
];

/**
 * Progress state for a single model download.
 * Tracks percentage completion, download speed, and estimated time remaining.
 */
interface DownloadProgress {
  [modelName: string]: {
    percentage: number;
    speed?: string;
    timeRemaining?: string;
  };
}

/**
 * OllamaModelSelector Component
 *
 * Provides UI for selecting and downloading Ollama embedding models for semantic search.
 * Features:
 * - Displays list of recommended embedding models (embeddinggemma, nomic-embed-text, mxbai-embed-large)
 * - Shows installation status with checkmarks for installed models
 * - Download buttons with file size estimates for uninstalled models
 * - Real-time download progress tracking with speed and ETA
 * - Automatic list refresh after successful downloads
 * - Graceful handling when Ollama service is not running
 *
 * @component
 * @param {Object} props - Component props
 * @param {string} props.selectedModel - Currently selected model name
 * @param {Function} props.onModelSelect - Callback when a model is selected (model: string, dim: number) => void
 * @param {boolean} [props.disabled=false] - If true, disables selection and downloads
 * @param {string} [props.className] - Additional CSS classes to apply to root element
 *
 * @example
 * ```tsx
 * <OllamaModelSelector
 *   selectedModel="embeddinggemma"
 *   onModelSelect={(model, dim) => console.log(`Selected ${model} with ${dim} dimensions`)}
 *   onDownloadComplete={(modelName) => console.log(`Finished downloading ${modelName}`)}
 * />
 * ```
 */
export function OllamaModelSelector({
  selectedModel,
  onModelSelect: onSelect,
  disabled = false,
  className,
  onDownloadComplete,
}: OllamaModelSelectorProps) {
  const { t } = useTranslation('onboarding');
  const [models, setModels] = useState<OllamaModel[]>(RECOMMENDED_MODELS);
  const [loading, setLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ollamaAvailable, setOllamaAvailable] = useState(true);
  const [ollamaInstalled, setOllamaInstalled] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({});

  // Track previous progress for speed calculation
  const downloadProgressRef = useRef<{
    [modelName: string]: {
      lastCompleted: number;
      lastUpdate: number;
    };
  }>({});

  /**
   * Checks Ollama service status and fetches list of installed embedding models.
   * Updates component state with installation status for each recommended model.
   *
   * @param {AbortSignal} [abortSignal] - Optional abort signal to cancel the request
   * @returns {Promise<void>}
   */
  const checkInstalledModels = useCallback(async (abortSignal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      // 1. Check if Ollama is installed
      const installedResult = await window.electronAPI.checkOllamaInstalled();
      if (abortSignal?.aborted) return;

      const isInstalled = !!installedResult?.success && !!installedResult?.data?.installed;
      setOllamaInstalled(isInstalled);

      if (!isInstalled) {
        setOllamaAvailable(false);
        setLoading(false);
        return;
      }

      // 2. Check if Ollama is running
      const statusResult = await window.electronAPI.checkOllamaStatus();
      if (abortSignal?.aborted) return;

      if (!statusResult?.success || !statusResult?.data?.running) {
        setOllamaAvailable(false);
        setLoading(false);
        return;
      }

      setOllamaAvailable(true);

      // 3. Get recommended models from backend (includes installation status)
      const result = await window.electronAPI.getRecommendedOllamaModels();
      if (abortSignal?.aborted) return;

      if (result?.success && result?.data?.recommended) {
        setModels(result.data.recommended.map(m => ({
          name: m.name,
          description: t(`ollama.modelDescriptions.${m.name}` as any, { defaultValue: m.description, nsSeparator: false }),
          size_estimate: m.size_estimate,
          dim: m.dim,
          installed: m.installed,
          badge: m.badge
        })));
      }
    } catch (err) {
      if (!abortSignal?.aborted) {
        console.error('Failed to check Ollama models:', err);
        setError(t('ollama.errors.checkFailed'));
      }
    } finally {
      if (!abortSignal?.aborted) {
        setLoading(false);
      }
    }
  }, [t]);

  // Fetch installed models on mount with cleanup
  useEffect(() => {
    const controller = new AbortController();
    checkInstalledModels(controller.signal);
    return () => controller.abort();
  }, [checkInstalledModels]);

  /**
   * Progress listener effect:
   * Subscribes to real-time download progress events from the main process.
   * Calculates and formats download speed (MB/s, KB/s, B/s) and time remaining.
   * Uses useRef to track previous state for accurate speed calculations.
   */
  useEffect(() => {
    const handleProgress = (data: {
      modelName: string;
      status: string;
      completed: number;
      total: number;
      percentage: number;
    }) => {
      const now = Date.now();

      // Initialize tracking for this model if needed
      if (!downloadProgressRef.current[data.modelName]) {
        downloadProgressRef.current[data.modelName] = {
          lastCompleted: data.completed,
          lastUpdate: now
        };
      }

      const prevData = downloadProgressRef.current[data.modelName];
      const timeDelta = now - prevData.lastUpdate;
      const bytesDelta = data.completed - prevData.lastCompleted;

      // Calculate speed only if we have meaningful time delta (> 100ms)
      let speedStr = '';
      let timeStr = '';

      if (timeDelta > 100 && bytesDelta > 0) {
        const speed = (bytesDelta / timeDelta) * 1000; // bytes per second
        const remaining = data.total - data.completed;
        const timeRemaining = speed > 0 ? Math.ceil(remaining / speed) : 0;

        // Format speed (MB/s or KB/s)
        if (speed > 1024 * 1024) {
          speedStr = t('ollama.speed.mbPerSec', { value: (speed / (1024 * 1024)).toFixed(1) });
        } else if (speed > 1024) {
          speedStr = t('ollama.speed.kbPerSec', { value: (speed / 1024).toFixed(1) });
        } else if (speed > 0) {
          speedStr = t('ollama.speed.bPerSec', { value: Math.round(speed) });
        }

        // Format time remaining
        if (timeRemaining > 3600) {
          timeStr = t('ollama.timeRemaining.hours', { count: Math.ceil(timeRemaining / 3600) });
        } else if (timeRemaining > 60) {
          timeStr = t('ollama.timeRemaining.minutes', { count: Math.ceil(timeRemaining / 60) });
        } else if (timeRemaining > 0) {
          timeStr = t('ollama.timeRemaining.seconds', { count: Math.ceil(timeRemaining) });
        }
      }

      // Update tracking
      downloadProgressRef.current[data.modelName] = {
        lastCompleted: data.completed,
        lastUpdate: now
      };

      setDownloadProgress(prev => {
        const updated = { ...prev };
        updated[data.modelName] = {
          percentage: data.percentage,
          speed: speedStr,
          timeRemaining: timeStr
        };
        return updated;
      });
    };

    // Register the progress listener
    let unsubscribe: (() => void) | undefined;
    if (window.electronAPI?.onDownloadProgress) {
      unsubscribe = window.electronAPI.onDownloadProgress(handleProgress);
    }

    return () => {
      // Clean up listener
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [t]);

  /**
   * Initiates download of an Ollama embedding model.
   * Updates UI state during download and refreshes model list after completion.
   *
   * @param {string} modelName - Name of the model to download (e.g., 'embeddinggemma')
   * @returns {Promise<void>}
   */
  const handleDownload = async (modelName: string) => {
    setIsDownloading(modelName);
    setError(null);

    try {
      const result = await window.electronAPI.pullOllamaModel(modelName);
      if (result?.success) {
        // Clear progress for this model
        setDownloadProgress(prev => {
          const updated = { ...prev };
          delete updated[modelName];
          return updated;
        });

        // Refresh the model list
        await checkInstalledModels();
        onDownloadComplete?.(modelName);
      } else {
        setError(result?.error || t('ollama.errors.downloadFailed', { modelName }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ollama.errors.genericDownloadFailed'));
    } finally {
      setIsDownloading(null);
    }
  };

  /**
   * Handles model selection by calling the parent callback.
   * Only allows selection of installed models and when component is not disabled.
   *
   * @param {OllamaModel} model - The model to select
   * @returns {void}
   */
  const handleSelect = (model: OllamaModel) => {
    if (!model.installed || disabled) return;
    onSelect(model.name, model.dim);
  };

  if (loading && models.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">{t('ollama.checkingModels')}</span>
      </div>
    );
  }

  if (!ollamaAvailable) {
    return (
      <div className={cn('rounded-lg border border-warning/30 bg-warning/10 p-4', className)}>
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xl font-semibold mb-2">
              {!ollamaInstalled
                ? t('ollama.notInstalled.title')
                : t('ollama.notRunning.title')}
            </p>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              {!ollamaInstalled
                ? t('ollama.notInstalled.description')
                : t('ollama.notRunning.description')}
            </p>
            <div className="flex items-center justify-center gap-3">
              {!ollamaInstalled ? (
                <Button
                  onClick={() => window.electronAPI.installOllama()}
                  disabled={loading}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t('ollama.notInstalled.installButton')}
                </Button>
              ) : (
                <Button
                  onClick={() => checkInstalledModels()}
                  disabled={loading}
                  className="bg-primary hover:bg-primary/90"
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                  {t('ollama.retry')}
                </Button>
              )}
              {!ollamaInstalled && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => checkInstalledModels()}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
                  {t('ollama.iveInstalledIt')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t('ollama.title')}</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => checkInstalledModels()}
          disabled={loading || !!isDownloading || disabled}
          className="h-8 px-2 text-xs"
        >
          <RefreshCw className={cn('mr-2 h-3.5 w-3.5', loading && 'animate-spin')} />
          {loading ? t('ollama.checkingModels') : t('ollama.refresh')}
        </Button>
      </div>

      <div className="space-y-2">
        {models.map(model => {
          const isSelected = selectedModel === model.name;
          const isCurrentlyDownloading = isDownloading === model.name;
          const progress = downloadProgress[model.name];
          const isInteractive = model.installed && !disabled && !isDownloading && !loading;

          return (
            <div
              key={model.name}
              role="button"
              tabIndex={isInteractive ? 0 : -1}
              className={cn(
                'w-full rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                isInteractive
                  ? 'cursor-pointer hover:bg-accent/50'
                  : 'cursor-default opacity-85',
                isSelected && 'border-primary bg-primary/5',
                !model.installed && 'bg-muted/30'
              )}
              onClick={() => isInteractive && handleSelect(model)}
              onKeyDown={(e) => {
                if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleSelect(model);
                }
              }}
            >
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  {/* Selection/Status indicator */}
                  <div
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full border-2 shrink-0',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : model.installed
                          ? 'border-muted-foreground/30'
                          : 'border-muted-foreground/20 bg-muted/50'
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{model.name}</span>
                      {model.badge && (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {t(`ollama.badges.${model.badge}`, { defaultValue: model.badge, nsSeparator: false })}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {t('ollama.dimLabel', { dim: model.dim })}
                      </span>
                      {model.installed && (
                        <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                          {t('ollama.installed')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {model.description.startsWith('ollama.')
                        ? t(model.description as Parameters<typeof t>[0], { nsSeparator: false })
                        : model.description}
                    </p>
                  </div>
                </div>

                {/* Download button for non-installed models */}
                {!model.installed && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDownload(model.name);
                    }}
                    disabled={isCurrentlyDownloading || !!isDownloading || loading || disabled}
                    className="shrink-0"
                  >
                    {isCurrentlyDownloading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        {t('ollama.downloading')}
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        {t('ollama.download')}
                        {model.size_estimate && (
                          <span className="ml-1 text-muted-foreground">
                            ({model.size_estimate})
                          </span>
                        )}
                      </>
                    )}
                  </Button>
                )}
              </div>

              {/* Progress bar for downloading models */}
              {isCurrentlyDownloading && progress && (
                <div className="px-3 pb-3 space-y-1.5">
                  {/* Progress bar */}
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-primary/80 transition-all duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, progress.percentage))}%` }}
                    />
                  </div>
                  {/* Progress info: percentage, speed, time remaining */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {Math.round(progress.percentage)}%
                    </span>
                    <div className="flex items-center gap-2">
                      {progress.speed && <span>{progress.speed}</span>}
                      {progress.timeRemaining && <span className="text-primary">{progress.timeRemaining}</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {t('ollama.footer')}
      </p>
    </div>
  );
}
