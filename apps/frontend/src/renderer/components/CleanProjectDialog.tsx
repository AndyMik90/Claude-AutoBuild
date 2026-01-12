import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Archive, Loader2, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';

interface CleanupItem {
  name: string;
  size: number;
  type: 'file' | 'directory';
  specCount?: number;
  worktreeCount?: number;
}

interface CleanupPreview {
  items: CleanupItem[];
  totalSize: number;
  archiveLocation: string;
}

interface CleanupResult {
  success: boolean;
  count: number;
  size: number;
  duration: number;
  mode: 'archive' | 'delete';
  error?: string;
}

interface CleanProjectDialogProps {
  open: boolean;
  projectPath: string | null;
  onOpenChange: (open: boolean) => void;
}

type DialogStep = 'preview' | 'confirm' | 'cleaning' | 'result';

/**
 * Dialog for cleaning project Auto-Claude data with preview and confirmation
 */
export function CleanProjectDialog({
  open,
  projectPath,
  onOpenChange,
}: CleanProjectDialogProps) {
  const { t } = useTranslation(['common']);
  const [step, setStep] = useState<DialogStep>('preview');
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [selectedMode, setSelectedMode] = useState<'archive' | 'delete'>('archive');
  const [confirmText, setConfirmText] = useState('');
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!projectPath) return;

    setLoading(true);
    setError(null);

    try {
      const response = await window.electronAPI.cleanupPreview(projectPath);

      if (response.success && response.preview) {
        setPreview(response.preview);
      } else {
        setError(response.error || t('common:cleanProject.errors.loadPreviewFailed'));
      }
    } catch (err) {
      console.error('Error loading cleanup preview:', err);
      setError(err instanceof Error ? err.message : t('common:cleanProject.errors.unknown'));
    } finally {
      setLoading(false);
    }
  }, [projectPath, t]);

  // Load preview when dialog opens
  useEffect(() => {
    if (open && projectPath) {
      loadPreview();
    }
  }, [open, projectPath, loadPreview]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      const timeoutId = setTimeout(() => {
        setStep('preview');
        setPreview(null);
        setSelectedMode('archive');
        setConfirmText('');
        setResult(null);
        setError(null);
      }, 200);

      return () => clearTimeout(timeoutId);
    }
  }, [open]);

  const executeCleanup = useCallback(async () => {
    if (!projectPath || !preview) return;

    setLoading(true);
    setError(null);
    setStep('cleaning');

    try {
      const response = await window.electronAPI.cleanupExecute(
        projectPath,
        selectedMode === 'archive'
      );

      if (response.success) {
        setResult({
          success: true,
          count: response.count,
          size: response.size,
          duration: response.duration,
          mode: selectedMode,
        });
        setStep('result');
      } else {
        setError(response.error || t('common:cleanProject.errors.cleanupFailed'));
        setStep('preview');
      }
    } catch (err) {
      console.error('Error executing cleanup:', err);
      setError(err instanceof Error ? err.message : t('common:cleanProject.errors.unknown'));
      setStep('preview');
    } finally {
      setLoading(false);
    }
  }, [projectPath, preview, selectedMode, t]);

  const formatBytes = (bytes: number): string => {
    // Handle edge cases
    if (!Number.isFinite(bytes) || bytes < 0) {
      return '0 B';
    }
    if (bytes === 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    // Clamp index to valid range
    const index = Math.max(0, Math.min(i, units.length - 1));

    return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
  };

  const getItemDisplayName = (item: CleanupItem): string => {
    const baseNames: Record<string, string> = {
      '.auto-claude/': t('common:cleanProject.items.autoClaudeDir'),
      '.worktrees/': t('common:cleanProject.items.worktreesDir'),
      'logs/security/': t('common:cleanProject.items.securityLogs'),
      '.auto-claude-security.json': t('common:cleanProject.items.securityJson'),
      '.auto-claude-status': t('common:cleanProject.items.statusFile'),
      '.claude_settings.json': t('common:cleanProject.items.settingsFile'),
      '.security-key': t('common:cleanProject.items.securityKey'),
    };

    return baseNames[item.name] || item.name;
  };

  const handleConfirmClick = () => {
    const confirmWord = t('common:cleanProject.confirmWord').toLowerCase();
    if (confirmText.toLowerCase() === confirmWord) {
      executeCleanup();
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
    }
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      );
    }

    if (!preview || preview.items.length === 0) {
      return (
        <div className="bg-muted/50 border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">{t('common:cleanProject.noDataToClean')}</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('common:cleanProject.description')}
        </p>

        <div>
          <h4 className="text-sm font-medium mb-2">
            {t('common:cleanProject.previewTitle')}
          </h4>
          <ScrollArea className="h-48 border rounded-md p-3">
            <div className="space-y-2">
              {preview.items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-sm py-1"
                >
                  <div className="flex items-center gap-2">
                    {item.type === 'directory' ? (
                      <Archive className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{getItemDisplayName(item)}</span>
                    {item.specCount !== undefined && item.specCount > 0 && (
                      <span className="text-muted-foreground">
                        ({item.specCount} {t('common:cleanProject.items.specs')})
                      </span>
                    )}
                    {item.worktreeCount !== undefined && item.worktreeCount > 0 && (
                      <span className="text-muted-foreground">
                        ({item.worktreeCount} {t('common:cleanProject.items.worktrees')})
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground font-mono text-xs">
                    {formatBytes(item.size)}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="bg-muted/50 rounded-lg p-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{t('common:cleanProject.totalSize')}</span>
            <span className="font-mono">{formatBytes(preview.totalSize)}</span>
          </div>
          {selectedMode === 'archive' && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t('common:cleanProject.archiveLocation')}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {preview.archiveLocation}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3 pt-2">
          <Label className="text-sm font-medium">
            {t('common:cleanProject.confirmTitle')}
          </Label>

          <button
            type="button"
            onClick={() => setSelectedMode('archive')}
            className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
              selectedMode === 'archive'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <Archive className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium">{t('common:cleanProject.mode.archive')}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {t('common:cleanProject.mode.archiveDesc')}
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMode('delete')}
            className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
              selectedMode === 'delete'
                ? 'border-destructive bg-destructive/5'
                : 'border-border hover:border-destructive/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0 text-destructive" />
              <div className="flex-1">
                <div className="font-medium text-destructive">
                  {t('common:cleanProject.mode.delete')}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {t('common:cleanProject.mode.deleteDesc')}
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  };

  const renderConfirm = () => (
    <div className="space-y-4">
      <div className={`border rounded-lg p-4 flex items-start gap-3 ${
        selectedMode === 'delete'
          ? 'bg-destructive/10 border-destructive/20'
          : 'bg-muted/50 border-border'
      }`}>
        <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
          selectedMode === 'delete' ? 'text-destructive' : 'text-muted-foreground'
        }`} />
        <p className={`text-sm ${
          selectedMode === 'delete' ? 'text-destructive' : 'text-foreground'
        }`}>
          {selectedMode === 'archive'
            ? t('common:cleanProject.confirmArchive')
            : t('common:cleanProject.confirmDelete')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-text">{t('common:cleanProject.typeToConfirm')}</Label>
        <Input
          id="confirm-text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={t('common:cleanProject.confirmWord')}
          autoComplete="off"
          autoFocus
        />
      </div>
    </div>
  );

  const renderCleaning = () => (
    <div className="flex flex-col items-center justify-center py-8 space-y-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{t('common:cleanProject.cleaning')}</p>
    </div>
  );

  const renderResult = () => {
    if (!result) return null;

    return (
      <div className="space-y-4">
        {result.success ? (
          <div className="bg-muted/50 border border-border rounded-lg p-4">
            <p className="text-center text-base text-foreground">
              {result.mode === 'archive'
                ? t('common:cleanProject.results.archived', {
                    count: result.count,
                    size: formatBytes(result.size),
                  })
                : t('common:cleanProject.results.deleted', {
                    count: result.count,
                    size: formatBytes(result.size),
                  })}
            </p>
          </div>
        ) : (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{result.error || t('common:cleanProject.error')}</p>
          </div>
        )}

        <p className="text-sm text-center text-muted-foreground">
          {t('common:cleanProject.results.duration', {
            seconds: (result.duration ?? 0).toFixed(1),
          })}
        </p>
      </div>
    );
  };

  const canProceed = () => {
    if (step === 'preview') {
      return preview && preview.items.length > 0;
    }
    if (step === 'confirm') {
      const confirmWord = t('common:cleanProject.confirmWord').toLowerCase();
      return confirmText.toLowerCase() === confirmWord;
    }
    return false;
  };

  const handlePrimaryAction = () => {
    if (step === 'preview') {
      setStep('confirm');
    } else if (step === 'confirm') {
      handleConfirmClick();
    } else if (step === 'result') {
      handleClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            {t('common:cleanProject.title')}
          </DialogTitle>
          {step !== 'result' && (
            <DialogDescription>
              {step === 'preview' && t('common:cleanProject.description')}
              {step === 'confirm' && t('common:cleanProject.confirmTitle')}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="py-4">
          {step === 'preview' && renderPreview()}
          {step === 'confirm' && renderConfirm()}
          {step === 'cleaning' && renderCleaning()}
          {step === 'result' && renderResult()}
        </div>

        <DialogFooter>
          {step !== 'cleaning' && step !== 'result' && (
            <>
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                {t('common:buttons.cancel')}
              </Button>
              {step === 'confirm' && (
                <Button
                  variant="outline"
                  onClick={() => setStep('preview')}
                  disabled={loading}
                >
                  {t('common:buttons.back')}
                </Button>
              )}
              <Button
                onClick={handlePrimaryAction}
                disabled={!canProceed() || loading}
                variant={selectedMode === 'delete' && step === 'confirm' ? 'destructive' : 'default'}
              >
                {step === 'preview' && t('common:buttons.next')}
                {step === 'confirm' &&
                  (selectedMode === 'archive'
                    ? t('common:cleanProject.mode.archive')
                    : t('common:cleanProject.mode.delete'))}
              </Button>
            </>
          )}
          {step === 'result' && (
            <Button onClick={handleClose}>{t('common:buttons.close')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
