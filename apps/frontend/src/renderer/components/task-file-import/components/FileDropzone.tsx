/**
 * FileDropzone - Drag & drop zone for JSON task files
 *
 * Supports:
 * - Drag & drop multiple .json files
 * - Click to browse file picker
 * - Visual feedback during drag-over
 */

import { useRef, useState, useCallback, type DragEvent, type ChangeEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileJson, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface FileDropzoneProps {
  onFileDrop: (files: FileList) => void;
  onFileSelect: (files: FileList) => void;
  isParsing: boolean;
  disabled?: boolean;
}

export function FileDropzone({
  onFileDrop,
  onFileSelect,
  isParsing,
  disabled = false
}: FileDropzoneProps) {
  const { t } = useTranslation(['tasks']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isParsing) {
      setIsDragOver(true);
    }
  }, [disabled, isParsing]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (disabled || isParsing) return;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      onFileDrop(files);
    }
  }, [disabled, isParsing, onFileDrop]);

  const handleFileInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files);
    }
    // Reset input so same files can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onFileSelect]);

  const handleClick = useCallback(() => {
    if (!disabled && !isParsing) {
      fileInputRef.current?.click();
    }
  }, [disabled, isParsing]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && !disabled && !isParsing) {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  }, [disabled, isParsing]);

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-4 p-8',
        'border-2 border-dashed rounded-lg transition-all cursor-pointer',
        'min-h-[200px]',
        isDragOver && !disabled && !isParsing
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30',
        (disabled || isParsing) && 'opacity-50 cursor-not-allowed'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={t('taskFileImport.dropzone.title')}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
        disabled={disabled || isParsing}
      />

      {/* Icon */}
      <div className={cn(
        'flex items-center justify-center w-16 h-16 rounded-full',
        'bg-muted/50 transition-colors',
        isDragOver && 'bg-primary/10'
      )}>
        {isParsing ? (
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        ) : (
          <Upload className={cn(
            'h-8 w-8 transition-colors',
            isDragOver ? 'text-primary' : 'text-muted-foreground'
          )} />
        )}
      </div>

      {/* Text */}
      <div className="text-center space-y-1">
        <p className={cn(
          'font-medium transition-colors',
          isDragOver ? 'text-primary' : 'text-foreground'
        )}>
          {isParsing
            ? t('taskFileImport.parsing')
            : t('taskFileImport.dropzone.title')
          }
        </p>
        {!isParsing && (
          <p className="text-sm text-muted-foreground">
            {t('taskFileImport.dropzone.hint')}
          </p>
        )}
      </div>

      {/* Supported formats */}
      {!isParsing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileJson className="h-4 w-4" />
          <span>{t('taskFileImport.dropzone.formats')}</span>
        </div>
      )}
    </div>
  );
}
