import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  RefreshCw,
  ExternalLink,
  FolderOpen,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import type { CondaDetectionResult } from '../../../shared/types';

interface CondaDetectionDisplayProps {
  detection: CondaDetectionResult | null;
  isLoading: boolean;
  onRefresh: () => void;
  onBrowse?: () => void;
  manualPath?: string;
  onManualPathChange?: (path: string) => void;
}

/**
 * Opens the Miniconda installation page in the default browser
 */
function openMinicondaInstallPage(): void {
  window.open('https://docs.conda.io/en/latest/miniconda.html', '_blank');
}

/**
 * Component that displays the detected Conda installation status.
 * Shows loading, not-found, or found states with appropriate UI.
 */
export function CondaDetectionDisplay({
  detection,
  isLoading,
  onRefresh,
  onBrowse,
  manualPath,
  onManualPathChange
}: CondaDetectionDisplayProps) {
  const { t } = useTranslation('settings');

  // Loading state
  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>{t('python.detecting')}</span>
      </div>
    );
  }

  // Not found state
  if (!detection || !detection.found || !detection.preferred) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-amber-500">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">{t('python.notDetected')}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={openMinicondaInstallPage}
            className="gap-1.5"
          >
            {t('python.installMiniconda')}
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('python.refresh')}
          </Button>
        </div>

        {onManualPathChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {t('python.specifyPath')}:
            </span>
            <Input
              value={manualPath || ''}
              onChange={(e) => onManualPathChange(e.target.value)}
              placeholder={t('python.pathPlaceholder')}
              className="flex-1 h-8 text-sm"
            />
            {onBrowse && (
              <Button
                variant="outline"
                size="sm"
                onClick={onBrowse}
                className="gap-1.5"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {t('python.browse')}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Found state
  const { preferred } = detection;
  const condaType = t(`python.condaTypes.${preferred.type}`, { defaultValue: t('python.condaTypes.unknown') });
  const versionDisplay = preferred.version ? ` (v${preferred.version})` : '';

  return (
    <div className="flex items-center gap-2 text-sm">
      <CheckCircle2 className="h-4 w-4 text-green-500" />
      <span className="text-muted-foreground">
        {t('python.detected')}:
      </span>
      <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
        {preferred.path}
      </code>
      <span className="text-muted-foreground">
        {condaType}{versionDisplay}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        className="h-7 px-2 gap-1"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {t('python.refresh')}
      </Button>
    </div>
  );
}
