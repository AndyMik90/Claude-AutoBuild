import { AlertCircle, RotateCcw, Loader2, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';
import { cn } from '../../../lib/utils';
import { useImageUpload } from '../../task-form/useImageUpload';
import { formatFileSize } from '../../ImageUpload';
import type { ImageAttachment } from '../../../../shared/types';

interface QAFeedbackSectionProps {
  feedback: string;
  isSubmitting: boolean;
  images: ImageAttachment[];
  onFeedbackChange: (value: string) => void;
  onImagesChange: (images: ImageAttachment[]) => void;
  onReject: () => void;
}

/**
 * Displays the QA feedback section where users can request changes
 */
export function QAFeedbackSection({
  feedback,
  isSubmitting,
  images,
  onFeedbackChange,
  onImagesChange,
  onReject
}: QAFeedbackSectionProps) {
  // Image upload handling (paste/drag-drop)
  const {
    isDragOver,
    pasteSuccess,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    removeImage,
    canAddMore,
    remainingSlots
  } = useImageUpload({
    images,
    onImagesChange,
    disabled: isSubmitting
  });

  return (
    <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
      <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-warning" />
        Request Changes
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        Found issues? Describe what needs to be fixed and the AI will continue working on it. You can paste screenshots to show visual problems.
      </p>
      <div className="relative">
        <Textarea
          placeholder="Describe the issues or changes needed... (paste screenshots directly here)"
          value={feedback}
          onChange={(e) => onFeedbackChange(e.target.value)}
          onPaste={handlePaste}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'mb-3 transition-colors',
            isDragOver && 'border-primary bg-primary/5',
            pasteSuccess && 'border-success bg-success/5'
          )}
          rows={3}
          disabled={isSubmitting}
        />
        {/* Image count indicator */}
        {images.length > 0 && (
          <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-background/90 border border-border text-xs text-muted-foreground flex items-center gap-1">
            <ImageIcon className="h-3 w-3" />
            {images.length} {canAddMore && `(${remainingSlots} more)`}
          </div>
        )}
      </div>

      {/* Image previews */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          {images.map((image) => (
            <div
              key={image.id}
              className="relative group rounded-lg border border-border bg-card overflow-hidden"
            >
              {/* Thumbnail */}
              <div className="aspect-square flex items-center justify-center bg-muted">
                {image.thumbnail ? (
                  <img
                    src={image.thumbnail}
                    alt={image.filename}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>

              {/* File info overlay */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <p className="text-xs text-white font-medium truncate">{image.filename}</p>
                <p className="text-[10px] text-white/70">{formatFileSize(image.size)}</p>
              </div>

              {/* Remove button */}
              {!isSubmitting && (
                <Button
                  variant="destructive"
                  size="icon"
                  className={cn(
                    'absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity',
                    'rounded-full'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(image.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Button
        variant="warning"
        onClick={onReject}
        disabled={isSubmitting || (!feedback.trim() && images.length === 0)}
        className="w-full"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <RotateCcw className="mr-2 h-4 w-4" />
            Request Changes
          </>
        )}
      </Button>
    </div>
  );
}
