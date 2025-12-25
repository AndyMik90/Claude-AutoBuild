import { useState, useEffect } from 'react';
import { Camera, Monitor, X, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import type { ScreenshotSource } from '../../preload/api/screenshot-api';

interface ScreenshotCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (dataUrl: string, filename: string) => void;
}

export function ScreenshotCapture({
  open,
  onOpenChange,
  onCapture
}: ScreenshotCaptureProps) {
  const [sources, setSources] = useState<ScreenshotSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  // Load screenshot sources when dialog opens
  useEffect(() => {
    if (open) {
      loadSources();
    } else {
      // Reset state when closing
      setSources([]);
      setSelectedSource(null);
      setError(null);
    }
  }, [open]);

  const loadSources = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.getSources();
      if (result.success && result.data) {
        setSources(result.data);
        // Auto-select the first screen (usually the primary display)
        const firstScreen = result.data.find(s => s.name.includes('Screen') || s.name.includes('Display'));
        if (firstScreen) {
          setSelectedSource(firstScreen.id);
        } else if (result.data.length > 0) {
          setSelectedSource(result.data[0].id);
        }
      } else {
        setError(result.error || 'Failed to load screenshot sources');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCapture = async () => {
    if (!selectedSource) return;

    setIsCapturing(true);
    setError(null);

    try {
      const result = await window.electronAPI.captureScreen(selectedSource);
      if (result.success && result.data) {
        // Generate filename with timestamp
        const timestamp = Date.now();
        const filename = `screenshot-${timestamp}.png`;

        // Call the onCapture callback with the data URL
        onCapture(result.data, filename);

        // Close the dialog
        onOpenChange(false);
      } else {
        setError(result.error || 'Failed to capture screenshot');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Capture Screenshot
          </DialogTitle>
          <DialogDescription>
            Select a screen or window to capture as a reference image
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              <X className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isLoading && sources.length === 0 && !error && (
            <div className="text-center py-8 text-muted-foreground">
              No screenshot sources available
            </div>
          )}

          {!isLoading && sources.length > 0 && (
            <>
              <div className="text-sm text-muted-foreground mb-2">
                Select a source to capture:
              </div>
              <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2">
                {sources.map((source) => {
                  const isScreen = source.name.includes('Screen') || source.name.includes('Display') || source.name.includes('Entire');
                  const isSelected = selectedSource === source.id;

                  return (
                    <button
                      key={source.id}
                      onClick={() => setSelectedSource(source.id)}
                      className={cn(
                        'relative rounded-lg border-2 transition-all overflow-hidden group',
                        'hover:border-primary/50 hover:shadow-md',
                        isSelected
                          ? 'border-primary shadow-lg ring-2 ring-primary/20'
                          : 'border-border'
                      )}
                    >
                      {/* Thumbnail */}
                      <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                        <img
                          src={source.thumbnail}
                          alt={source.name}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Source info */}
                      <div className="p-2 bg-card border-t border-border">
                        <div className="flex items-center gap-2">
                          <Monitor className={cn(
                            'h-4 w-4 shrink-0',
                            isScreen ? 'text-primary' : 'text-muted-foreground'
                          )} />
                          <span className="text-xs font-medium truncate text-foreground">
                            {source.name}
                          </span>
                        </div>
                      </div>

                      {/* Selected indicator */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow-lg">
                          <svg
                            className="h-4 w-4 text-primary-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => loadSources()}
            disabled={isLoading || isCapturing}
          >
            Refresh
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isCapturing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCapture}
              disabled={!selectedSource || isCapturing || isLoading}
            >
              {isCapturing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Capturing...
                </>
              ) : (
                <>
                  <Camera className="mr-2 h-4 w-4" />
                  Capture
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
