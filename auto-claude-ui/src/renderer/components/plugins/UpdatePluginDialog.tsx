import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  FileText,
  FilePlus,
  FileMinus,
  FileEdit,
  History,
  Download,
  Check,
  Shield,
  Eye,
  Plus,
  Minus,
  X
} from 'lucide-react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { cn } from '../../lib/utils';
import {
  usePluginStore,
  checkPluginUpdates,
  applyPluginUpdates
} from '../../stores/plugin-store';
import type {
  Plugin,
  UpdateCategory,
  UpdateFile,
  PluginUpdateResult
} from '../../../shared/types';

interface UpdatePluginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plugin: Plugin | null;
  onSuccess?: () => void;
}

type DialogStep = 'checking' | 'categories' | 'preview' | 'applying' | 'complete' | 'error' | 'up_to_date';

/** Interface for parsed diff lines */
interface DiffLine {
  type: 'header' | 'hunk' | 'added' | 'deleted' | 'context' | 'empty';
  content: string;
  lineNumber?: { old?: number; new?: number };
}

/**
 * UpdatePluginDialog - Dialog for checking and applying plugin updates
 *
 * Features:
 * - Check for updates from remote repository
 * - Display updates grouped by category (skills, patterns, config, etc.)
 * - Highlight files with local conflicts
 * - Allow selective file/category update selection
 * - Preview diffs for individual files
 * - Apply selected updates with backup option
 * - Show progress and completion status
 */
export function UpdatePluginDialog({
  open,
  onOpenChange,
  plugin,
  onSuccess
}: UpdatePluginDialogProps) {
  // Dialog state
  const [step, setStep] = useState<DialogStep>('checking');
  const [error, setError] = useState<string | null>(null);

  // Update check state
  const isCheckingUpdates = usePluginStore((state) => state.isCheckingUpdates);
  const isApplyingUpdate = usePluginStore((state) => state.isApplyingUpdate);
  const updateCheck = usePluginStore((state) => state.updateCheck);

  // Selection state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [createBackup, setCreateBackup] = useState(true);

  // Update result
  const [updateResult, setUpdateResult] = useState<PluginUpdateResult | null>(null);

  // Diff preview state
  const [previewFile, setPreviewFile] = useState<UpdateFile | null>(null);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open && plugin) {
      setStep('checking');
      setError(null);
      setSelectedFiles(new Set());
      setExpandedCategories(new Set());
      setCreateBackup(true);
      setUpdateResult(null);
      setPreviewFile(null);
      setDiffContent(null);
      setIsLoadingDiff(false);

      // Auto-check for updates when dialog opens
      handleCheckUpdates();
    }
  }, [open, plugin?.id]);

  /**
   * Check for updates
   */
  const handleCheckUpdates = async () => {
    if (!plugin) return;

    setStep('checking');
    setError(null);

    try {
      const result = await checkPluginUpdates(plugin.id);

      if (result) {
        if (result.hasUpdate) {
          setStep('categories');
          // Auto-expand all categories with files
          setExpandedCategories(new Set(result.categories.map(c => c.id)));
          // Pre-select all non-conflicting files
          const nonConflictingFiles = new Set<string>();
          for (const category of result.categories) {
            for (const file of category.files) {
              if (!file.hasConflict) {
                nonConflictingFiles.add(file.path);
              }
            }
          }
          setSelectedFiles(nonConflictingFiles);
        } else {
          setStep('up_to_date');
        }
      } else {
        setStep('error');
        setError('Failed to check for updates');
      }
    } catch (err) {
      setStep('error');
      setError(err instanceof Error ? err.message : 'Unknown error checking updates');
    }
  };

  /**
   * Apply selected updates
   */
  const handleApplyUpdates = async () => {
    if (!plugin || selectedFiles.size === 0) return;

    setStep('applying');
    setError(null);

    try {
      const result = await applyPluginUpdates({
        pluginId: plugin.id,
        selectedFiles: Array.from(selectedFiles),
        createBackup
      });

      if (result) {
        setUpdateResult(result);
        setStep('complete');
        onSuccess?.();
      } else {
        setStep('error');
        setError('Failed to apply updates');
      }
    } catch (err) {
      setStep('error');
      setError(err instanceof Error ? err.message : 'Unknown error applying updates');
    }
  };

  /**
   * Toggle category expansion
   */
  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  /**
   * Toggle file selection
   */
  const toggleFile = useCallback((filePath: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  /**
   * Toggle all files in a category
   */
  const toggleCategory_files = useCallback((category: UpdateCategory) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      const allSelected = category.files.every(f => prev.has(f.path));

      for (const file of category.files) {
        if (allSelected) {
          next.delete(file.path);
        } else {
          next.add(file.path);
        }
      }
      return next;
    });
  }, []);

  /**
   * Select all files (non-conflicting)
   */
  const selectAll = useCallback(() => {
    if (!updateCheck) return;

    const files = new Set<string>();
    for (const category of updateCheck.categories) {
      for (const file of category.files) {
        if (!file.hasConflict) {
          files.add(file.path);
        }
      }
    }
    setSelectedFiles(files);
  }, [updateCheck]);

  /**
   * Deselect all files
   */
  const deselectAll = useCallback(() => {
    setSelectedFiles(new Set());
  }, []);

  /**
   * Preview diff for a specific file
   */
  const handlePreviewFile = useCallback(async (file: UpdateFile) => {
    if (!plugin) return;

    setPreviewFile(file);
    setIsLoadingDiff(true);
    setDiffContent(null);
    setStep('preview');

    try {
      // If the file already has diff content cached, use it
      if (file.diff) {
        setDiffContent(file.diff);
        setIsLoadingDiff(false);
        return;
      }

      // Otherwise fetch from the main process
      const result = await window.electronAPI.getPluginFileDiff(plugin.id, file.path);
      if (result.success && result.data) {
        setDiffContent(result.data);
      } else {
        setDiffContent(null);
      }
    } catch {
      setDiffContent(null);
    } finally {
      setIsLoadingDiff(false);
    }
  }, [plugin]);

  /**
   * Go back from preview to categories view
   */
  const handleBackFromPreview = useCallback(() => {
    setStep('categories');
    setPreviewFile(null);
    setDiffContent(null);
  }, []);

  /**
   * Parse unified diff into structured lines
   */
  const parseDiff = useCallback((diff: string): DiffLine[] => {
    if (!diff) return [];

    const lines = diff.split('\n');
    const result: DiffLine[] = [];
    let oldLineNum = 0;
    let newLineNum = 0;

    for (const line of lines) {
      if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
        result.push({ type: 'header', content: line });
      } else if (line.startsWith('@@')) {
        // Parse hunk header like @@ -1,5 +1,7 @@
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLineNum = parseInt(match[1], 10);
          newLineNum = parseInt(match[2], 10);
        }
        result.push({ type: 'hunk', content: line });
      } else if (line.startsWith('+')) {
        result.push({
          type: 'added',
          content: line.slice(1),
          lineNumber: { new: newLineNum++ }
        });
      } else if (line.startsWith('-')) {
        result.push({
          type: 'deleted',
          content: line.slice(1),
          lineNumber: { old: oldLineNum++ }
        });
      } else if (line.startsWith(' ')) {
        result.push({
          type: 'context',
          content: line.slice(1),
          lineNumber: { old: oldLineNum++, new: newLineNum++ }
        });
      } else if (line === '') {
        result.push({ type: 'empty', content: '' });
      } else {
        // Other lines (like binary file markers)
        result.push({ type: 'context', content: line });
      }
    }

    return result;
  }, []);

  /**
   * Get file status icon
   */
  const getFileIcon = (file: UpdateFile) => {
    switch (file.status) {
      case 'added':
        return <FilePlus className="h-4 w-4 text-success" />;
      case 'deleted':
        return <FileMinus className="h-4 w-4 text-destructive" />;
      case 'modified':
      case 'renamed':
        return <FileEdit className="h-4 w-4 text-info" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  /**
   * Get status badge for file
   */
  const getStatusBadge = (file: UpdateFile) => {
    const variants: Record<string, string> = {
      added: 'bg-success/10 text-success border-success/30',
      deleted: 'bg-destructive/10 text-destructive border-destructive/30',
      modified: 'bg-info/10 text-info border-info/30',
      renamed: 'bg-warning/10 text-warning border-warning/30'
    };

    return (
      <span className={cn('text-xs px-1.5 py-0.5 rounded border', variants[file.status])}>
        {file.status}
      </span>
    );
  };

  /**
   * Calculate summary stats
   */
  const summaryStats = useMemo(() => {
    if (!updateCheck) return null;

    return {
      totalFiles: updateCheck.summary.totalFiles,
      selectedCount: selectedFiles.size,
      conflictCount: updateCheck.summary.conflictFiles,
      addedCount: updateCheck.summary.addedFiles,
      modifiedCount: updateCheck.summary.modifiedFiles,
      deletedCount: updateCheck.summary.deletedFiles
    };
  }, [updateCheck, selectedFiles]);

  /**
   * Render checking state
   */
  const renderCheckingState = () => (
    <div className="py-12 flex flex-col items-center justify-center">
      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">
        Checking for updates...
      </p>
      <p className="text-xs text-muted-foreground">
        Fetching latest changes from {plugin?.sourceType === 'github' ? 'GitHub' : 'source'}
      </p>
    </div>
  );

  /**
   * Render up-to-date state
   */
  const renderUpToDateState = () => (
    <div className="py-12 flex flex-col items-center justify-center">
      <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
        <CheckCircle2 className="h-8 w-8 text-success" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">
        Plugin is up to date
      </p>
      <p className="text-xs text-muted-foreground">
        Version {plugin?.version} is the latest version
      </p>
    </div>
  );

  /**
   * Render categories view
   */
  const renderCategoriesView = () => {
    if (!updateCheck) return null;

    return (
      <div className="py-4 flex flex-col h-full">
        {/* Header with version info */}
        <div className="flex items-center justify-between mb-4 px-1">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono">
                v{updateCheck.currentVersion}
              </Badge>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <Badge className="text-xs font-mono bg-primary/10 text-primary border-primary/30">
                v{updateCheck.latestVersion || 'latest'}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={deselectAll}
              disabled={selectedFiles.size === 0}
              className="h-7 text-xs"
            >
              Deselect All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={selectAll}
              className="h-7 text-xs"
            >
              Select All
            </Button>
          </div>
        </div>

        {/* Summary bar */}
        {summaryStats && (
          <div className="flex items-center gap-3 mb-4 px-3 py-2 bg-muted/30 rounded-lg text-xs">
            <span className="text-muted-foreground">
              {summaryStats.totalFiles} files changed
            </span>
            <span className="text-muted-foreground">|</span>
            <span className="text-success">+{summaryStats.addedCount} added</span>
            <span className="text-info">~{summaryStats.modifiedCount} modified</span>
            <span className="text-destructive">-{summaryStats.deletedCount} deleted</span>
            {summaryStats.conflictCount > 0 && (
              <>
                <span className="text-muted-foreground">|</span>
                <span className="text-warning flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {summaryStats.conflictCount} conflicts
                </span>
              </>
            )}
          </div>
        )}

        {/* Categories list */}
        <ScrollArea className="flex-1">
          <div className="space-y-2 pr-3">
            {updateCheck.categories.map(category => (
              <div
                key={category.id}
                className={cn(
                  'rounded-lg border border-border bg-card overflow-hidden',
                  category.conflictCount > 0 && 'border-warning/50'
                )}
              >
                {/* Category header */}
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
                  onClick={() => toggleCategory(category.id)}
                >
                  <div className="flex items-center gap-2">
                    {expandedCategories.has(category.id) ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <Checkbox
                      checked={category.files.every(f => selectedFiles.has(f.path))}
                      onCheckedChange={() => toggleCategory_files(category)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-sm font-medium text-foreground">{category.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {category.files.length}
                    </Badge>
                    {category.conflictCount > 0 && (
                      <Badge variant="outline" className="text-xs text-warning border-warning/50 gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {category.conflictCount} conflict{category.conflictCount > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </button>

                {/* Category files (expanded) */}
                {expandedCategories.has(category.id) && (
                  <div className="border-t border-border">
                    {category.files.map(file => (
                      <div
                        key={file.path}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors',
                          'border-b border-border last:border-b-0',
                          file.hasConflict && 'bg-warning/5'
                        )}
                      >
                        <Checkbox
                          checked={selectedFiles.has(file.path)}
                          onCheckedChange={() => toggleFile(file.path)}
                        />
                        {getFileIcon(file)}
                        <span className="flex-1 text-sm text-foreground font-mono truncate" title={file.path}>
                          {file.path}
                        </span>
                        <div className="flex items-center gap-2">
                          {/* Preview diff button */}
                          {file.status !== 'deleted' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreviewFile(file);
                              }}
                              title="Preview changes"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {getStatusBadge(file)}
                          {file.hasConflict && (
                            <Badge
                              variant="outline"
                              className="text-xs text-warning border-warning/50 gap-1"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Conflict
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Backup option */}
        <div className="mt-4 pt-4 border-t border-border">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={createBackup}
              onCheckedChange={(checked) => setCreateBackup(checked === true)}
            />
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-foreground">Create backup before updating</span>
            <span className="text-xs text-muted-foreground">(recommended)</span>
          </label>
        </div>
      </div>
    );
  };

  /**
   * Render diff preview view
   */
  const renderPreviewView = () => {
    if (!previewFile) return null;

    const parsedLines = diffContent ? parseDiff(diffContent) : [];
    const addedCount = parsedLines.filter(l => l.type === 'added').length;
    const deletedCount = parsedLines.filter(l => l.type === 'deleted').length;

    return (
      <div className="flex flex-col h-full">
        {/* Header with file info and back button */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackFromPreview}
              className="h-8 px-2"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              {getFileIcon(previewFile)}
              <span className="text-sm font-medium font-mono text-foreground">
                {previewFile.path}
              </span>
              {getStatusBadge(previewFile)}
            </div>
          </div>
          {!isLoadingDiff && diffContent && (
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-success">
                <Plus className="h-3 w-3" />
                {addedCount} added
              </span>
              <span className="flex items-center gap-1 text-destructive">
                <Minus className="h-3 w-3" />
                {deletedCount} deleted
              </span>
            </div>
          )}
        </div>

        {/* Conflict warning if applicable */}
        {previewFile.hasConflict && (
          <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-warning/10 border border-warning/30 rounded-lg text-xs text-warning">
            <AlertTriangle className="h-4 w-4" />
            <span>This file has local modifications that may conflict with the update</span>
          </div>
        )}

        {/* Diff content area */}
        <div className="flex-1 min-h-0">
          {isLoadingDiff ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">Loading diff...</span>
            </div>
          ) : !diffContent ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileText className="h-8 w-8 mb-2" />
              <p className="text-sm">No diff available for this file</p>
              <p className="text-xs mt-1">This may be a binary file or a new file</p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="font-mono text-xs bg-muted/20 rounded-lg overflow-hidden">
                {parsedLines.map((line, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex',
                      line.type === 'added' && 'bg-success/10',
                      line.type === 'deleted' && 'bg-destructive/10',
                      line.type === 'hunk' && 'bg-info/10 text-info border-y border-info/20',
                      line.type === 'header' && 'bg-muted/50 text-muted-foreground'
                    )}
                  >
                    {/* Line numbers column */}
                    <div className="flex shrink-0 border-r border-border/50 text-muted-foreground select-none">
                      <span className="w-12 px-2 py-0.5 text-right border-r border-border/30">
                        {line.lineNumber?.old ?? ''}
                      </span>
                      <span className="w-12 px-2 py-0.5 text-right">
                        {line.lineNumber?.new ?? ''}
                      </span>
                    </div>
                    {/* Change indicator */}
                    <span
                      className={cn(
                        'w-6 shrink-0 text-center py-0.5 font-bold',
                        line.type === 'added' && 'text-success',
                        line.type === 'deleted' && 'text-destructive'
                      )}
                    >
                      {line.type === 'added' && '+'}
                      {line.type === 'deleted' && '-'}
                    </span>
                    {/* Content */}
                    <pre className="flex-1 py-0.5 pr-3 overflow-x-auto whitespace-pre">
                      {line.content || ' '}
                    </pre>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    );
  };

  /**
   * Render applying state
   */
  const renderApplyingState = () => (
    <div className="py-12 flex flex-col items-center justify-center">
      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">
        Applying updates...
      </p>
      <p className="text-xs text-muted-foreground">
        Updating {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''}
      </p>
    </div>
  );

  /**
   * Render complete state
   */
  const renderCompleteState = () => (
    <div className="py-12 flex flex-col items-center justify-center">
      <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
        <CheckCircle2 className="h-8 w-8 text-success" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">
        Update complete!
      </p>
      {updateResult && (
        <div className="text-xs text-muted-foreground text-center">
          <p>{updateResult.appliedFiles.length} files updated successfully</p>
          {updateResult.skippedFiles.length > 0 && (
            <p className="text-warning mt-1">
              {updateResult.skippedFiles.length} files skipped
            </p>
          )}
          {updateResult.backupPath && (
            <p className="mt-2 flex items-center gap-1 justify-center">
              <History className="h-3 w-3" />
              Backup created
            </p>
          )}
        </div>
      )}
    </div>
  );

  /**
   * Render error state
   */
  const renderErrorState = () => (
    <div className="py-12 flex flex-col items-center justify-center">
      <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <p className="text-sm font-medium text-destructive mb-2">
        {step === 'error' && updateCheck?.error ? 'Update check failed' : 'Update failed'}
      </p>
      {error && (
        <p className="text-xs text-muted-foreground text-center max-w-xs">
          {error}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={handleCheckUpdates}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Try Again
      </Button>
    </div>
  );

  /**
   * Render step content
   */
  const renderStepContent = () => {
    switch (step) {
      case 'checking':
        return renderCheckingState();
      case 'up_to_date':
        return renderUpToDateState();
      case 'categories':
        return renderCategoriesView();
      case 'preview':
        return renderPreviewView();
      case 'applying':
        return renderApplyingState();
      case 'complete':
        return renderCompleteState();
      case 'error':
        return renderErrorState();
      default:
        return null;
    }
  };

  /**
   * Render footer buttons
   */
  const renderFooter = () => {
    if (step === 'checking' || step === 'applying') {
      return null;
    }

    if (step === 'complete' || step === 'up_to_date') {
      return (
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            <Check className="mr-2 h-4 w-4" />
            Done
          </Button>
        </DialogFooter>
      );
    }

    if (step === 'error') {
      return (
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      );
    }

    // preview step - simplified footer with just back button
    if (step === 'preview') {
      return (
        <DialogFooter>
          <Button variant="outline" onClick={handleBackFromPreview}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Updates
          </Button>
          {previewFile && (
            <Button
              variant={selectedFiles.has(previewFile.path) ? 'destructive' : 'default'}
              onClick={() => {
                toggleFile(previewFile.path);
              }}
            >
              {selectedFiles.has(previewFile.path) ? (
                <>
                  <X className="mr-2 h-4 w-4" />
                  Deselect This File
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Select This File
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      );
    }

    // categories step
    return (
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isApplyingUpdate}>
          Cancel
        </Button>
        <Button variant="outline" onClick={handleCheckUpdates} disabled={isCheckingUpdates}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        <Button
          onClick={handleApplyUpdates}
          disabled={selectedFiles.size === 0 || isApplyingUpdate}
        >
          {isApplyingUpdate ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Applying...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Apply {selectedFiles.size} Update{selectedFiles.size !== 1 ? 's' : ''}
            </>
          )}
        </Button>
      </DialogFooter>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Update Plugin
          </DialogTitle>
          <DialogDescription>
            {plugin ? (
              <>Check for and apply updates to <span className="font-medium">{plugin.name}</span></>
            ) : (
              'Check for and apply plugin updates'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {renderStepContent()}
        </div>

        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
}
