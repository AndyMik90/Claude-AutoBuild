import { Image as ImageIcon, ZoomIn, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { QAReport } from '../../../../shared/types';
import { Dialog, DialogContent } from '../../ui/dialog';

/**
 * Component for loading local screenshots via IPC (handles Electron security restrictions)
 */
function LocalScreenshot({
  specsPath,
  screenshotPath,
  index,
  onClick
}: {
  specsPath: string;
  screenshotPath: string;
  index: number;
  onClick: (dataUrl: string) => void;
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadImage = async () => {
      try {
        setLoading(true);
        setError(null);
        // Use the existing readLocalImage IPC which takes base path and relative path
        const result = await window.electronAPI.readLocalImage(specsPath, screenshotPath);
        if (result.success && result.data) {
          setImageSrc(result.data);
        } else {
          setError(result.error || 'Failed to load screenshot');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load screenshot');
      } finally {
        setLoading(false);
      }
    };

    loadImage();
  }, [specsPath, screenshotPath]);

  if (loading) {
    return (
      <div className="aspect-video flex items-center justify-center bg-muted rounded-lg">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !imageSrc) {
    return (
      <div className="aspect-video flex items-center justify-center bg-destructive/10 rounded-lg border border-destructive/30">
        <div className="text-center p-2">
          <ImageIcon className="h-6 w-6 text-destructive mx-auto mb-1" />
          <p className="text-xs text-destructive">{error || 'Not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onClick(imageSrc)}
      className="relative group rounded-lg border border-border bg-card overflow-hidden hover:border-primary transition-colors cursor-pointer w-full"
    >
      <div className="aspect-video flex items-center justify-center bg-muted">
        <img
          src={imageSrc}
          alt={`QA Screenshot ${index + 1}`}
          className="w-full h-full object-contain"
        />
      </div>
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center">
        <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <p className="text-xs text-white font-medium truncate">
          {screenshotPath.split('/').pop()}
        </p>
      </div>
    </button>
  );
}

interface QAReportSectionProps {
  qaReport: QAReport | undefined;
  specsPath: string | undefined;
}

/**
 * Displays QA report screenshots taken by Playwright during validation
 */
export function QAReportSection({ qaReport, specsPath }: QAReportSectionProps) {
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);

  // No QA report or no screenshots to display
  if (!qaReport || !qaReport.screenshots || qaReport.screenshots.length === 0) {
    return null;
  }

  // Don't show screenshots if QA hasn't run yet
  if (qaReport.status === 'pending') {
    return null;
  }

  const screenshots = qaReport.screenshots;

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          QA Screenshots ({screenshots.length})
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          Screenshots captured by the QA agent during validation.
          {qaReport.status === 'passed' && ' All checks passed.'}
          {qaReport.status === 'failed' && ' Issues were found during validation.'}
        </p>

        {/* Screenshot grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {screenshots.map((screenshot, index) => {
            // Support both string (legacy) and object format
            const screenshotPath = typeof screenshot === 'string' ? screenshot : screenshot.path;
            const verdict = typeof screenshot === 'object' ? screenshot.verdict : undefined;
            const description = typeof screenshot === 'object' ? screenshot.description : undefined;

            if (!specsPath) {
              return null;
            }

            return (
              <div key={index} className="space-y-2">
                <LocalScreenshot
                  specsPath={specsPath}
                  screenshotPath={screenshotPath}
                  index={index}
                  onClick={(dataUrl) => setSelectedScreenshot(dataUrl)}
                />

                {/* QA Verdict and Description */}
                {(verdict || description) && (
                  <div className="text-xs space-y-1">
                    {verdict && (
                      <p className="font-medium text-foreground">{verdict}</p>
                    )}
                    {description && (
                      <p className="text-muted-foreground leading-relaxed">{description}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Full-size screenshot viewer dialog */}
      {selectedScreenshot && (
        <Dialog open={!!selectedScreenshot} onOpenChange={() => setSelectedScreenshot(null)}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex-1 overflow-auto flex items-center justify-center bg-muted rounded-lg">
              <img
                src={selectedScreenshot}
                alt="QA Screenshot"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
