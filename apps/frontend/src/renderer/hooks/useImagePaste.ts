/**
 * useImagePaste - Shared hook for image paste/drop functionality
 *
 * Provides consistent image paste and drop handling across components.
 * Extracts the duplicated logic from TaskCreationWizard, TaskEditDialog,
 * and QAFeedbackSection into a reusable hook.
 *
 * Features:
 * - Clipboard paste handling for screenshots
 * - Drag-and-drop file handling
 * - Image validation (type, size limits)
 * - Thumbnail generation
 * - Duplicate filename resolution
 * - Max image limit enforcement
 * - Custom drop handling (for file references, etc.)
 *
 * @example
 * ```tsx
 * const {
 *   images,
 *   setImages,
 *   error,
 *   setError,
 *   isDragOver,
 *   handlePaste,
 *   handleDragOver,
 *   handleDragLeave,
 *   handleDrop,
 *   processImageFiles,
 *   removeImage,
 *   canAddMore
 * } = useImagePaste({
 *   maxImages: 5,
 *   onSuccess: () => console.log('Image added!')
 * });
 * ```
 */
import { useState, useCallback, type ClipboardEvent, type DragEvent } from 'react';
import {
  generateImageId,
  blobToBase64,
  createThumbnail,
  isValidImageMimeType,
  resolveFilename
} from '../components/ImageUpload';
import { MAX_IMAGES_PER_TASK, ALLOWED_IMAGE_TYPES_DISPLAY } from '../../shared/constants';
import type { ImageAttachment } from '../../shared/types';

export interface UseImagePasteOptions {
  /** Initial images (optional) */
  initialImages?: ImageAttachment[];
  /** Maximum number of images allowed (defaults to MAX_IMAGES_PER_TASK) */
  maxImages?: number;
  /** Callback when images are successfully added */
  onSuccess?: () => void;
  /** Whether paste/drop is disabled */
  disabled?: boolean;
  /**
   * Custom drop handler for special cases (e.g., file references).
   * Return true if the drop was handled, false to continue with image processing.
   */
  customDropHandler?: (e: DragEvent<HTMLTextAreaElement>) => boolean | Promise<boolean>;
}

export interface UseImagePasteReturn {
  /** Current images array */
  images: ImageAttachment[];
  /** Set images directly (for external control) */
  setImages: React.Dispatch<React.SetStateAction<ImageAttachment[]>>;
  /** Current error message */
  error: string | null;
  /** Set error directly (for external control) */
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  /** Whether currently dragging over the drop zone */
  isDragOver: boolean;
  /** Handle paste event - attach to textarea/input onPaste */
  handlePaste: (e: ClipboardEvent<HTMLTextAreaElement>) => Promise<void>;
  /** Handle drag over - attach to element onDragOver */
  handleDragOver: (e: DragEvent<HTMLTextAreaElement>) => void;
  /** Handle drag leave - attach to element onDragLeave */
  handleDragLeave: (e: DragEvent<HTMLTextAreaElement>) => void;
  /** Handle drop - attach to element onDrop */
  handleDrop: (e: DragEvent<HTMLTextAreaElement>) => Promise<void>;
  /** Process image files directly - useful for custom drop handlers */
  processImageFiles: (files: File[]) => Promise<void>;
  /** Remove an image by ID */
  removeImage: (imageId: string) => void;
  /** Whether more images can be added */
  canAddMore: boolean;
  /** Clear error */
  clearError: () => void;
}

/**
 * Process image files and create ImageAttachment objects
 */
async function createImageAttachments(
  files: File[],
  existingFilenames: string[],
  remainingSlots: number,
  filenamePrefix: string,
  onError: (msg: string) => void
): Promise<ImageAttachment[]> {
  const newImages: ImageAttachment[] = [];
  const newFilenames: string[] = [];

  for (const file of files.slice(0, remainingSlots)) {
    // Validate image type
    if (!isValidImageMimeType(file.type)) {
      onError(`Invalid image type. Allowed: ${ALLOWED_IMAGE_TYPES_DISPLAY}`);
      continue;
    }

    try {
      const dataUrl = await blobToBase64(file);
      const thumbnail = await createThumbnail(dataUrl);

      // Generate filename
      const extension = file.type.split('/')[1] || 'png';
      const baseFilename = file.name || `${filenamePrefix}-${Date.now()}.${extension}`;
      const resolvedFilename = resolveFilename(baseFilename, [
        ...existingFilenames,
        ...newFilenames
      ]);
      newFilenames.push(resolvedFilename);

      newImages.push({
        id: generateImageId(),
        filename: resolvedFilename,
        mimeType: file.type,
        size: file.size,
        data: dataUrl.split(',')[1], // Store base64 without data URL prefix
        thumbnail
      });
    } catch {
      onError(`Failed to process ${filenamePrefix}`);
    }
  }

  return newImages;
}

/**
 * Hook for handling image paste and drop functionality
 */
export function useImagePaste(options: UseImagePasteOptions = {}): UseImagePasteReturn {
  const {
    initialImages = [],
    maxImages = MAX_IMAGES_PER_TASK,
    onSuccess,
    disabled = false,
    customDropHandler
  } = options;

  const [images, setImages] = useState<ImageAttachment[]>(initialImages);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const canAddMore = images.length < maxImages;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Remove an image by ID
   */
  const removeImage = useCallback((imageId: string) => {
    setImages(prev => prev.filter(img => img.id !== imageId));
    setError(null);
  }, []);

  /**
   * Process image files and add them to the images array
   * Exposed for custom drop handlers to use
   */
  const processImageFiles = useCallback(async (files: File[]) => {
    // Filter for image files
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    // Check if we can add more images
    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) {
      setError(`Maximum of ${maxImages} images allowed`);
      return;
    }

    setError(null);

    const existingFilenames = images.map(img => img.filename);
    const newImages = await createImageAttachments(
      imageFiles,
      existingFilenames,
      remainingSlots,
      'dropped-image',
      setError
    );

    if (newImages.length > 0) {
      setImages(prev => [...prev, ...newImages]);
      onSuccess?.();
    }
  }, [images, maxImages, onSuccess]);

  /**
   * Handle paste event for screenshot support
   */
  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;

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
    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) {
      setError(`Maximum of ${maxImages} images allowed`);
      return;
    }

    setError(null);

    // Convert DataTransferItems to Files
    const files: File[] = [];
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }

    const existingFilenames = images.map(img => img.filename);
    const newImages = await createImageAttachments(
      files,
      existingFilenames,
      remainingSlots,
      'screenshot',
      setError
    );

    if (newImages.length > 0) {
      setImages(prev => [...prev, ...newImages]);
      onSuccess?.();
    }
  }, [disabled, images, maxImages, onSuccess]);

  /**
   * Handle drag over for image drops
   */
  const handleDragOver = useCallback((e: DragEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, [disabled]);

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

    if (disabled) return;

    // Check for custom drop handler first
    if (customDropHandler) {
      const handled = await customDropHandler(e);
      if (handled) return; // Custom handler took care of it
    }

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // Convert FileList to array and process
    const fileArray = Array.from(files);
    await processImageFiles(fileArray);
  }, [disabled, customDropHandler, processImageFiles]);

  return {
    images,
    setImages,
    error,
    setError,
    isDragOver,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    processImageFiles,
    removeImage,
    canAddMore,
    clearError
  };
}
