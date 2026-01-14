import { RefreshCw, Download, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import type { AutoBuildVersionInfo } from '../../../shared/types';

interface AutoBuildIntegrationProps {
  autoBuildPath: string | null;
  versionInfo: AutoBuildVersionInfo | null;
  isCheckingVersion: boolean;
  isUpdating: boolean;
  onInitialize: () => void;
  onUpdate: () => void;
}

export function AutoBuildIntegration({
  autoBuildPath,
  versionInfo,
  isCheckingVersion,
  isUpdating,
  onInitialize,
  onUpdate: _onUpdate,
}: AutoBuildIntegrationProps) {
  const { t } = useTranslation('settings');

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">{t('projectSections.general.autoBuildIntegration')}</h3>
      {!autoBuildPath ? (
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{t('projectSections.general.notInitialized')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('projectSections.general.notInitializedDescription')}
              </p>
              <Button
                size="sm"
                className="mt-3"
                onClick={onInitialize}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    {t('projectSections.general.initializing')}
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    {t('projectSections.general.initializeAutoBuild')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-sm font-medium text-foreground">{t('projectSections.general.initialized')}</span>
            </div>
            <code className="text-xs bg-background px-2 py-1 rounded">
              {autoBuildPath}
            </code>
          </div>
          {isCheckingVersion ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('projectSections.general.checkingStatus')}
            </div>
          ) : versionInfo && (
            <div className="text-xs text-muted-foreground">
              {versionInfo.isInitialized ? t('projectSections.general.initialized') : t('projectSections.general.notInitialized')}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
