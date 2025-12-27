import { useState, useCallback, type ClipboardEvent, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, RotateCcw, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';
import {
  generateImageId,
  blobToBase64,
  createThumbnail,
  isValidImageMimeType,
  resolveFilename
} from '../../ImageUpload';
import { cn } from '../../../lib/utils';
import { MAX_IMAGES_PER_TASK, ALLOWED_IMAGE_TYPES_DISPLAY } from '../../../../shared/constants';
import type { ImageAttachment } from '../../../../shared/types';

interface QAFeedbackSectionProps {
  feedback: string;
  isSubmitting: boolean;
  onFeedbackChange: (value: string) => void;
  onReject: () => void;
  images: ImageAttachment[];
  onImagesChange: (images: ImageAttachment[]) => void;
  imageError: string | null;
  onImageError: (error: string | null) => void;
}

/**
 * Displays the QA feedback section where users can request changes
 *
 * NOTE: This component intentionally implements its own paste/drop handlers rather than
 * using the shared useImagePaste hook. This is because:
 * 1. The QA feedback flow requires different error handling (e.g., inline error display)
 * 2. The component needs to integrate with parent state (imageError, onImageError props)
 * 3. The visual feedback patterns differ (drag-over on textarea vs. separate drop zone)
 *
 * If unifying the handlers in the future, ensure the parent component's error state
 * management and the specific UX requirements of QA feedback are preserved.
 */
export function QAFeedbackSection({
  feedback,
  isSubmitting,
  onFeedbackChange,
  onReject,
  images,
  onImagesChange,
  imageError,
  onImageError
}: QAFeedbackSectionProps) {
  const { t } = useTranslation(['tasks']);
  const [isDragOver, setIsDragOver] = useState(false);

  /**
   * Handle paste event for screenshot support
   */
  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (isSubmitting) return;

    const clipboardItems = e.clipboardData?.items;
    if (!clipboardItems) return;

    // Find image items in clipboard
    const imageItems: DataTransferItem[] = [];
    for (let i = 0; i < clipboardItems.length; i++) {
      const item = clipboardItems[i];
      if (item.type.startsWith('image/')) {
        imageItems.push(item);
      }
    }

    // If no images, allow normal paste behavior
    if (imageItems.length === 0) return;

    // Prevent default paste when we have images
    e.preventDefault();

    // Check if we can add more images
    const remainingSlots = MAX_IMAGES_PER_TASK - images.length;
    if (remainingSlots <= 0) {
      onImageError(`Maximum of ${MAX_IMAGES_PER_TASK} images allowed`);
      return;
    }

    onImageError(null);

    // Convert DataTransferItems to Files and process
    const newImages: ImageAttachment[] = [];
    const existingFilenames = images.map(img => img.filename);

    for (const item of imageItems.slice(0, remainingSlots)) {
      const file = item.getAsFile();
      if (!file) continue;

      if (!isValidImageMimeType(file.type)) {
        onImageError(`Invalid image type. Allowed: ${ALLOWED_IMAGE_TYPES_DISPLAY}`);
        continue;
      }

      try {
        const dataUrl = await blobToBase64(file);
        const thumbnail = await createThumbnail(dataUrl);

        const extension = file.type.split('/')[1] || 'png';
        const baseFilename = file.name || `screenshot-${Date.now()}.${extension}`;
        const resolvedFilename = resolveFilename(baseFilename, [
          ...existingFilenames,
          ...newImages.map(img => img.filename)
        ]);

        newImages.push({
          id: generateImageId(),
          filename: resolvedFilename,
          mimeType: file.type,
          size: file.size,
          data: dataUrl.split(',')[1],
          thumbnail
        });
      } catch {
        onImageError('Failed to process screenshot');
      }
    }

    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages]);
    }
  }, [isSubmitting, images, onImagesChange, onImageError]);

  /**
   * Handle drag over
   */
  const handleDragOver = useCallback((e: DragEvent<HTMLTextAreaElement>) => {
    if (isSubmitting) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, [isSubmitting]);

  /**
   * Handle drag leave
   */
  const handleDragLeave = useCallback((e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  /**
   * Handle drop for image files
   */
  const handleDrop = useCallback(async (e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (isSubmitting) return;

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // Filter for image files
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    // Check if we can add more images
    const remainingSlots = MAX_IMAGES_PER_TASK - images.length;
    if (remainingSlots <= 0) {
      onImageError(`Maximum of ${MAX_IMAGES_PER_TASK} images allowed`);
      return;
    }

    onImageError(null);

    const newImages: ImageAttachment[] = [];
    const existingFilenames = images.map(img => img.filename);

    for (const file of imageFiles.slice(0, remainingSlots)) {
      if (!isValidImageMimeType(file.type)) {
        onImageError(`Invalid image type. Allowed: ${ALLOWED_IMAGE_TYPES_DISPLAY}`);
        continue;
      }

      try {
        const dataUrl = await blobToBase64(file);
        const thumbnail = await createThumbnail(dataUrl);

        const extension = file.type.split('/')[1] || 'png';
        const baseFilename = file.name || `dropped-image-${Date.now()}.${extension}`;
        const resolvedFilename = resolveFilename(baseFilename, [
          ...existingFilenames,
          ...newImages.map(img => img.filename)
        ]);

        newImages.push({
          id: generateImageId(),
          filename: resolvedFilename,
          mimeType: file.type,
          size: file.size,
          data: dataUrl.split(',')[1],
          thumbnail
        });
      } catch {
        onImageError('Failed to process image');
      }
    }

    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages]);
    }
  }, [isSubmitting, images, onImagesChange, onImageError]);

  /**
   * Remove an image by ID
   */
  const removeImage = useCallback((imageId: string) => {
    onImagesChange(images.filter(img => img.id !== imageId));
    onImageError(null);
  }, [images, onImagesChange, onImageError]);

  return (
    <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
      <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-warning" />
        Request Changes
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        Found issues? Describe what needs to be fixed and the AI will continue working on it.
      </p>
      <Textarea
        placeholder="Describe the issues or changes needed..."
        value={feedback}
        onChange={(e) => onFeedbackChange(e.target.value)}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          // Visual feedback when dragging over textarea
          isDragOver && !isSubmitting && "border-primary bg-primary/5 ring-2 ring-primary/20"
        )}
        rows={3}
      />
      <p className="text-xs text-muted-foreground mt-1">
        {t('tasks:images.pasteDropHintFeedback')}
      </p>

      {/* Image Thumbnails - displayed inline below textarea */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2 mb-3">
          {images.map((image) => (
            <div
              key={image.id}
              className="relative group rounded-md border border-border overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
              style={{ width: '64px', height: '64px' }}
              title={image.filename}
            >
              {image.thumbnail ? (
                <img
                  src={image.thumbnail}
                  alt={image.filename}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              {/* Remove button */}
              {!isSubmitting && (
                <button
                  type="button"
                  className="absolute top-0.5 right-0.5 h-4 w-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(image.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Image error display */}
      {imageError && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive mb-3">
          <X className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{imageError}</span>
        </div>
      )}

      {/* Spacing when no images */}
      {images.length === 0 && !imageError && <div className="mb-3" />}

      <Button
        variant="warning"
        onClick={onReject}
        disabled={isSubmitting || !feedback.trim()}
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
