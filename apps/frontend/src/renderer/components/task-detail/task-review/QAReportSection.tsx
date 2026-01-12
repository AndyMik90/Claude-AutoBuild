import { Image as ImageIcon, ZoomIn } from 'lucide-react';
import { useState } from 'react';
import type { QAReport } from '../../../../shared/types';
import { Dialog, DialogContent } from '../../ui/dialog';

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
            // Construct full path to screenshot
            // specsPath is the full path to spec directory
            // screenshot is relative path from spec directory
            const screenshotPath = specsPath
              ? `file://${specsPath}/${screenshot}`
              : undefined;

            if (!screenshotPath) {
              return null;
            }

            return (
              <button
                key={index}
                type="button"
                onClick={() => setSelectedScreenshot(screenshotPath)}
                className="relative group rounded-lg border border-border bg-card overflow-hidden hover:border-primary transition-colors cursor-pointer"
              >
                {/* Thumbnail */}
                <div className="aspect-video flex items-center justify-center bg-muted">
                  <img
                    src={screenshotPath}
                    alt={`QA Screenshot ${index + 1}`}
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                  <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* File info */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <p className="text-xs text-white font-medium truncate">
                    {screenshot.split('/').pop()}
                  </p>
                </div>
              </button>
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
