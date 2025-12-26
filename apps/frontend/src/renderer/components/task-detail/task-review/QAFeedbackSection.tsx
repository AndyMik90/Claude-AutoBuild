import { useState, useCallback, type ClipboardEvent, type DragEvent } from 'react';
import { AlertCircle, RotateCcw, Loader2 } from 'lucide-react';
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
  // Drag-and-drop state for images over textarea
  const [isDragOver, setIsDragOver] = useState(false);

  /**
   * Handle drag over textarea for image drops
   */
  const handleTextareaDragOver = useCallback((e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  /**
   * Handle drag leave from textarea
   */
  const handleTextareaDragLeave = useCallback((e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  /**
   * Handle drop on textarea for images
   */
  const handleTextareaDrop = useCallback(
    async (e: DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (isSubmitting) return;

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      // Filter for image files
      const imageFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          imageFiles.push(file);
        }
      }

      if (imageFiles.length === 0) return;

      // Check if we can add more images
      const remainingSlots = MAX_IMAGES_PER_TASK - images.length;
      if (remainingSlots <= 0) {
        onImageError(`Maximum of ${MAX_IMAGES_PER_TASK} images allowed`);
        return;
      }

      onImageError(null);

      // Process image files
      const newImages: ImageAttachment[] = [];
      const existingFilenames = images.map(img => img.filename);

      for (const file of imageFiles.slice(0, remainingSlots)) {
        // Validate image type
        if (!isValidImageMimeType(file.type)) {
          onImageError(`Invalid image type. Allowed: ${ALLOWED_IMAGE_TYPES_DISPLAY}`);
          continue;
        }

        try {
          const dataUrl = await blobToBase64(file);
          const thumbnail = await createThumbnail(dataUrl);

          // Use original filename or generate one
          const baseFilename = file.name || `dropped-image-${Date.now()}.${file.type.split('/')[1] || 'png'}`;
          const resolvedFilename = resolveFilename(baseFilename, [
            ...existingFilenames,
            ...newImages.map(img => img.filename)
          ]);

          newImages.push({
            id: generateImageId(),
            filename: resolvedFilename,
            mimeType: file.type,
            size: file.size,
            data: dataUrl.split(',')[1], // Store base64 without data URL prefix
            thumbnail
          });
        } catch {
          onImageError('Failed to process dropped image');
        }
      }

      if (newImages.length > 0) {
        onImagesChange([...images, ...newImages]);
      }
    },
    [images, isSubmitting, onImagesChange, onImageError]
  );

  /**
   * Handle paste event for screenshot support
   */
  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
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

    // Process image items
    const newImages: ImageAttachment[] = [];
    const existingFilenames = images.map(img => img.filename);

    for (const item of imageItems.slice(0, remainingSlots)) {
      const file = item.getAsFile();
      if (!file) continue;

      // Validate image type
      if (!isValidImageMimeType(file.type)) {
        onImageError(`Invalid image type. Allowed: ${ALLOWED_IMAGE_TYPES_DISPLAY}`);
        continue;
      }

      try {
        const dataUrl = await blobToBase64(file);
        const thumbnail = await createThumbnail(dataUrl);

        // Generate filename for pasted images (screenshot-timestamp.ext)
        const extension = file.type.split('/')[1] || 'png';
        const baseFilename = `screenshot-${Date.now()}.${extension}`;
        const resolvedFilename = resolveFilename(baseFilename, [
          ...existingFilenames,
          ...newImages.map(img => img.filename)
        ]);

        newImages.push({
          id: generateImageId(),
          filename: resolvedFilename,
          mimeType: file.type,
          size: file.size,
          data: dataUrl.split(',')[1], // Store base64 without data URL prefix
          thumbnail
        });
      } catch {
        onImageError('Failed to process pasted image');
      }
    }

    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages]);
    }
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
        onDragOver={handleTextareaDragOver}
        onDragLeave={handleTextareaDragLeave}
        onDrop={handleTextareaDrop}
        className={cn(
          "mb-3",
          // Visual feedback when dragging over textarea
          isDragOver && !isSubmitting && "border-primary bg-primary/5 ring-2 ring-primary/20"
        )}
        rows={3}
      />
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
