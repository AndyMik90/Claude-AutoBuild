import { useState, useEffect } from 'react';
import {
  Check,
  Download,
  Loader2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface OllamaModel {
  name: string;
  description: string;
  size_estimate?: string;
  dim: number;
  installed: boolean;
}

interface OllamaModelSelectorProps {
  selectedModel: string;
  onModelSelect: (model: string, dim: number) => void;
  disabled?: boolean;
  className?: string;
}

// Recommended embedding models for Auto Claude Memory
// embeddinggemma is first as the recommended default
const RECOMMENDED_MODELS: OllamaModel[] = [
  {
    name: 'embeddinggemma',
    description: "Google's lightweight embedding model (Recommended)",
    size_estimate: '621 MB',
    dim: 768,
    installed: false,
  },
  {
    name: 'nomic-embed-text',
    description: 'Popular general-purpose embeddings',
    size_estimate: '274 MB',
    dim: 768,
    installed: false,
  },
  {
    name: 'mxbai-embed-large',
    description: 'MixedBread AI large embeddings',
    size_estimate: '670 MB',
    dim: 1024,
    installed: false,
  },
];

/**
 * OllamaModelSelector - Select or download Ollama embedding models
 *
 * Shows installed models with checkmarks and recommended models with download buttons.
 * Automatically refreshes the list after successful downloads.
 */
export function OllamaModelSelector({
  selectedModel,
  onModelSelect,
  disabled = false,
  className,
}: OllamaModelSelectorProps) {
  const [models, setModels] = useState<OllamaModel[]>(RECOMMENDED_MODELS);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ollamaAvailable, setOllamaAvailable] = useState(true);

  // Check installed models - used by both mount effect and refresh after download
  const checkInstalledModels = async (abortSignal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);

    try {
      // Check Ollama status first
      const statusResult = await window.electronAPI.checkOllamaStatus();
      if (abortSignal?.aborted) return;

      if (!statusResult?.success || !statusResult?.data?.running) {
        setOllamaAvailable(false);
        setIsLoading(false);
        return;
      }

      setOllamaAvailable(true);

      // Get list of installed embedding models
      const result = await window.electronAPI.listOllamaEmbeddingModels();
      if (abortSignal?.aborted) return;

      if (result?.success && result?.data?.embedding_models) {
        const installedNames = new Set(
          result.data.embedding_models.map((m: { name: string }) => {
            // Normalize: "embeddinggemma:latest" -> "embeddinggemma"
            const name = m.name;
            return name.includes(':') ? name.split(':')[0] : name;
          })
        );

        // Update models with installation status
        setModels(
          RECOMMENDED_MODELS.map(model => {
            const baseName = model.name.includes(':') ? model.name.split(':')[0] : model.name;
            return {
              ...model,
              installed: installedNames.has(baseName) || installedNames.has(model.name),
            };
          })
        );
      }
    } catch (err) {
      if (!abortSignal?.aborted) {
        console.error('Failed to check Ollama models:', err);
        setError('Failed to check Ollama models');
      }
    } finally {
      if (!abortSignal?.aborted) {
        setIsLoading(false);
      }
    }
  };

  // Fetch installed models on mount with cleanup
  useEffect(() => {
    const controller = new AbortController();
    checkInstalledModels(controller.signal);
    return () => controller.abort();
  }, []);

  const handleDownload = async (modelName: string) => {
    setIsDownloading(modelName);
    setError(null);

    try {
      const result = await window.electronAPI.pullOllamaModel(modelName);
      if (result?.success) {
        // Refresh the model list
        await checkInstalledModels();
      } else {
        setError(result?.error || `Failed to download ${modelName}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(null);
    }
  };

  const handleSelect = (model: OllamaModel) => {
    if (!model.installed || disabled) return;
    onModelSelect(model.name, model.dim);
  };

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Checking Ollama models...</span>
      </div>
    );
  }

  if (!ollamaAvailable) {
    return (
      <div className={cn('rounded-lg border border-warning/30 bg-warning/10 p-4', className)}>
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-warning">Ollama not running</p>
            <p className="text-sm text-warning/80 mt-1">
              Start Ollama to use local embedding models. Memory will still work with keyword search.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkInstalledModels()}
              className="mt-3"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
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

      <div className="space-y-2">
        {models.map(model => {
          const isSelected = selectedModel === model.name;
          const isCurrentlyDownloading = isDownloading === model.name;

          return (
            <div
              key={model.name}
              className={cn(
                'flex items-center justify-between rounded-lg border p-3 transition-colors',
                model.installed && !disabled
                  ? 'cursor-pointer hover:bg-accent/50'
                  : 'cursor-default',
                isSelected && 'border-primary bg-primary/5',
                !model.installed && 'bg-muted/30'
              )}
              onClick={() => handleSelect(model)}
            >
              <div className="flex items-center gap-3">
                {/* Selection/Status indicator */}
                <div
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border-2',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : model.installed
                        ? 'border-muted-foreground/30'
                        : 'border-muted-foreground/20 bg-muted/50'
                  )}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{model.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({model.dim} dim)
                    </span>
                    {model.installed && (
                      <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                        Installed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{model.description}</p>
                </div>
              </div>

              {/* Download button for non-installed models */}
              {!model.installed && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(model.name);
                  }}
                  disabled={isCurrentlyDownloading || disabled}
                  className="shrink-0"
                >
                  {isCurrentlyDownloading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Download
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
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Select an installed model for semantic search. Memory works with keyword search even without embeddings.
      </p>
    </div>
  );
}
