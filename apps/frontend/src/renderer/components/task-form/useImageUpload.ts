/**
 * useImageUpload - Shared hook for handling image paste and drag-drop in task forms
 *
 * Extracts the duplicated image handling logic from TaskCreationWizard and TaskEditDialog
 * into a reusable hook.
 */
import { useState, useCallback, useRef, useEffect, type ClipboardEvent, type DragEvent } from 'react';
import {
  generateImageId,
  blobToBase64,
  createThumbnail,
  isValidImageMimeType,
  resolveFilename
} from '../ImageUpload';
import type { ImageAttachment } from '../../../shared/types';
import {
  MAX_IMAGES_PER_TASK,
  ALLOWED_IMAGE_TYPES_DISPLAY
} from '../../../shared/constants';

interface UseImageUploadOptions {
  /** Current images array */
  images: ImageAttachment[];
  /** Callback when images change */
  onImagesChange: (images: ImageAttachment[]) => void;
  /** Whether the form is disabled (e.g., during submission) */
  disabled?: boolean;
  /** Callback to set error message */
  onError?: (error: string | null) => void;
}

interface UseImageUploadReturn {
  /** Whether user is dragging over the textarea */
  isDragOver: boolean;
  /** Whether an image was just successfully added */
  pasteSuccess: boolean;
  /** Handle paste event on textarea */
  handlePaste: (e: ClipboardEvent<HTMLTextAreaElement>) => Promise<void>;
  /** Handle drag over event on textarea */
  handleDragOver: (e: DragEvent<HTMLTextAreaElement>) => void;
  /** Handle drag leave event on textarea */
  handleDragLeave: (e: DragEvent<HTMLTextAreaElement>) => void;
  /** Handle drop event on textarea */
  handleDrop: (e: DragEvent<HTMLTextAreaElement>) => Promise<void>;
  /** Remove an image by ID */
  removeImage: (imageId: string) => void;
  /** Whether more images can be added */
  canAddMore: boolean;
  /** Number of remaining image slots */
  remainingSlots: number;
}

export function useImageUpload({
  images,
  onImagesChange,
  disabled = false,
  onError
}: UseImageUploadOptions): UseImageUploadReturn {
  const [isDragOver, setIsDragOver] = useState(false);
  const [pasteSuccess, setPasteSuccess] = useState(false);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const remainingSlots = MAX_IMAGES_PER_TASK - images.length;
  const canAddMore = remainingSlots > 0;

  /**
   * Process image items and add them to the images array
   */
  const processImageItems = useCallback(
    async (
      items: DataTransferItem[] | File[],
      options: { isFromPaste?: boolean } = {}
    ) => {
      if (disabled) return;

      if (remainingSlots <= 0) {
        onError?.(`Maximum of ${MAX_IMAGES_PER_TASK} images allowed`);
        return;
      }

      onError?.(null);

      const newImages: ImageAttachment[] = [];
      const existingFilenames = images.map((img) => img.filename);

      // Process items up to remaining slots
      const itemsToProcess = items.slice(0, remainingSlots);

      for (const item of itemsToProcess) {
        let file: File | null = null;

        if (item instanceof File) {
          file = item;
        } else if ('getAsFile' in item) {
          file = item.getAsFile();
        }

        if (!file) continue;

        // Validate image type
        if (!isValidImageMimeType(file.type)) {
          onError?.(`Invalid image type. Allowed: ${ALLOWED_IMAGE_TYPES_DISPLAY}`);
          continue;
        }

        try {
          const dataUrl = await blobToBase64(file);
          const thumbnail = await createThumbnail(dataUrl);

          // Generate filename based on source
          let baseFilename: string;
          if (options.isFromPaste || !file.name || file.name === 'image.png') {
            const extension = file.type.split('/')[1] || 'png';
            baseFilename = `screenshot-${Date.now()}.${extension}`;
          } else {
            baseFilename = file.name;
          }

          const resolvedFilename = resolveFilename(baseFilename, [
            ...existingFilenames,
            ...newImages.map((img) => img.filename)
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
          onError?.(options.isFromPaste ? 'Failed to process pasted image' : 'Failed to process dropped image');
        }
      }

      if (newImages.length > 0) {
        onImagesChange([...images, ...newImages]);
        // Show success feedback (clear any existing timeout first)
        if (successTimeoutRef.current) {
          clearTimeout(successTimeoutRef.current);
        }
        setPasteSuccess(true);
        successTimeoutRef.current = setTimeout(() => setPasteSuccess(false), 2000);
      }
    },
    [images, onImagesChange, disabled, remainingSlots, onError]
  );

  /**
   * Handle paste event for screenshot support
   */
  const handlePaste = useCallback(
    async (e: ClipboardEvent<HTMLTextAreaElement>) => {
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

      await processImageItems(imageItems, { isFromPaste: true });
    },
    [processImageItems]
  );

  /**
   * Handle drag over textarea
   */
  const handleDragOver = useCallback((e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  /**
   * Handle drag leave from textarea
   */
  const handleDragLeave = useCallback((e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  /**
   * Handle drop on textarea for image files
   */
  const handleDrop = useCallback(
    async (e: DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (disabled) return;

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

      await processImageItems(imageFiles, { isFromPaste: false });
    },
    [disabled, processImageItems]
  );

  /**
   * Remove an image by ID
   */
  const removeImage = useCallback(
    (imageId: string) => {
      onImagesChange(images.filter((img) => img.id !== imageId));
    },
    [images, onImagesChange]
  );

  return {
    isDragOver,
    pasteSuccess,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    removeImage,
    canAddMore,
    remainingSlots
  };
}
