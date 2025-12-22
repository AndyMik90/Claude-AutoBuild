import { useState, useEffect, useRef } from 'react';
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
 *   disabled={false}
 * />
 * ```
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
          speedStr = `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
        } else if (speed > 1024) {
          speedStr = `${(speed / 1024).toFixed(1)} KB/s`;
        } else if (speed > 0) {
          speedStr = `${Math.round(speed)} B/s`;
        }

        // Format time remaining
        if (timeRemaining > 3600) {
          timeStr = `${Math.ceil(timeRemaining / 3600)}h remaining`;
        } else if (timeRemaining > 60) {
          timeStr = `${Math.ceil(timeRemaining / 60)}m remaining`;
        } else if (timeRemaining > 0) {
          timeStr = `${Math.ceil(timeRemaining)}s remaining`;
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
  }, []);

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

   /**
    * Handles model selection by calling the parent callback.
    * Only allows selection of installed models and when component is not disabled.
    *
    * @param {OllamaModel} model - The model to select
    * @returns {void}
    */
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
           const progress = downloadProgress[model.name];

           return (
             <div
               key={model.name}
               className={cn(
                 'rounded-lg border transition-colors',
                 model.installed && !disabled
                   ? 'cursor-pointer hover:bg-accent/50'
                   : 'cursor-default',
                 isSelected && 'border-primary bg-primary/5',
                 !model.installed && 'bg-muted/30'
               )}
               onClick={() => handleSelect(model)}
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
        Select an installed model for semantic search. Memory works with keyword search even without embeddings.
      </p>
    </div>
  );
}
