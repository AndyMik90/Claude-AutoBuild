import { useState, useCallback, useRef, type DragEvent, type ClipboardEvent } from 'react';
import { blobToBase64, isValidImageMimeType, resolveFilename } from '../../ImageUpload';
import { ALLOWED_IMAGE_TYPES_DISPLAY } from '../../../../shared/constants';

interface UseImageUploadOptions {
  projectId: string | null;
  content: string;
  onContentChange: (content: string) => void;
}

export function useImageUpload({ projectId, content, onContentChange }: UseImageUploadOptions) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertImageAtCursor = useCallback((imageMarkdown: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const cursorPos = textarea.selectionStart;
      const textBefore = content.substring(0, cursorPos);
      const textAfter = content.substring(cursorPos);
      const newContent = textBefore + imageMarkdown + textAfter;
      onContentChange(newContent);

      // Set cursor position after inserted image
      setTimeout(() => {
        const newPos = cursorPos + imageMarkdown.length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();
      }, 0);
    }
  }, [content, onContentChange]);

  const processImageFile = useCallback(async (file: File): Promise<void> => {
    if (!projectId) return;

    if (!isValidImageMimeType(file.type)) {
      setImageError(`Invalid image type. Allowed: ${ALLOWED_IMAGE_TYPES_DISPLAY}`);
      return;
    }

    try {
      const dataUrl = await blobToBase64(file);
      const extension = file.name.split('.').pop() || file.type.split('/')[1] || 'png';
      const timestamp = Date.now();
      const baseFilename = `changelog-${timestamp}.${extension}`;
      const filename = resolveFilename(baseFilename, []);

      const result = await window.electronAPI.saveChangelogImage(
        projectId,
        dataUrl,
        filename
      );

      if (result.success && result.data) {
        const imageMarkdown = `\n![${filename}](${result.data.relativePath})\n`;
        insertImageAtCursor(imageMarkdown);
      } else {
        setImageError(result.error || 'Failed to save image');
      }
    } catch (_err) {
      setImageError('Failed to process image');
    }
  }, [projectId, insertImageAtCursor]);

  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!projectId) return;

    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));

    if (imageItems.length === 0) return;

    e.preventDefault();
    setImageError(null);

    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) {
        await processImageFile(file);
      }
    }
  }, [projectId, processImageFile]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!projectId) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));

    if (imageFiles.length === 0) return;

    setImageError(null);

    for (const file of imageFiles) {
      await processImageFile(file);
    }
  }, [projectId, processImageFile]);

  return {
    textareaRef,
    isDragOver,
    imageError,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop
  };
}
