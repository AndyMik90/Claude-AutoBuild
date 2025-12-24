import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  CloudDownload,
  Loader2,
  ExternalLink,
  Download,
  Sparkles
} from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Progress } from '../ui/progress';
import { cn } from '../../lib/utils';
import { SettingsSection } from './SettingsSection';
import type {
  AppSettings,
  AutoBuildSourceUpdateCheck,
  AutoBuildSourceUpdateProgress,
  AppUpdateAvailableEvent,
  AppUpdateProgress,
  NotificationSettings
} from '../../../shared/types';

/**
 * Simple markdown renderer for release notes
 * Handles: headers, bold, lists, line breaks
 */
function ReleaseNotesRenderer({ markdown }: { markdown: string }) {
  const html = useMemo(() => {
    const result = markdown
      // Escape HTML
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headers (### Header -> <h3>)
      .replace(/^### (.+)$/gm, '<h4 class="text-sm font-semibold text-foreground mt-3 mb-1.5 first:mt-0">$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 class="text-sm font-semibold text-foreground mt-3 mb-1.5 first:mt-0">$1</h3>')
      // Bold (**text** -> <strong>)
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground font-medium">$1</strong>')
      // Inline code (`code` -> <code>)
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-muted rounded text-xs">$1</code>')
      // List items (- item -> <li>)
      .replace(/^- (.+)$/gm, '<li class="ml-4 text-muted-foreground before:content-[\'•\'] before:mr-2 before:text-muted-foreground/60">$1</li>')
      // Wrap consecutive list items
      .replace(/(<li[^>]*>.*?<\/li>\n?)+/g, '<ul class="space-y-1 my-2">$&</ul>')
      // Line breaks for remaining lines
      .replace(/\n\n/g, '<div class="h-2"></div>')
      .replace(/\n/g, '<br/>');

    return result;
  }, [markdown]);

  return (
    <div
      className="text-sm text-muted-foreground leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface AdvancedSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  section: 'updates' | 'notifications';
  version: string;
}

/**
 * Advanced settings for updates and notifications
 */
export function AdvancedSettings({ settings, onSettingsChange, section, version }: AdvancedSettingsProps) {
  const { t } = useTranslation('settings');

  // Auto Claude source update state
  const [sourceUpdateCheck, setSourceUpdateCheck] = useState<AutoBuildSourceUpdateCheck | null>(null);
  const [isCheckingSourceUpdate, setIsCheckingSourceUpdate] = useState(false);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<AutoBuildSourceUpdateProgress | null>(null);
  // Local version state that can be updated after successful update
  const [displayVersion, setDisplayVersion] = useState<string>(version);

  // Electron app update state
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateAvailableEvent | null>(null);
  const [_isCheckingAppUpdate, setIsCheckingAppUpdate] = useState(false);
  const [isDownloadingAppUpdate, setIsDownloadingAppUpdate] = useState(false);
  const [appDownloadProgress, setAppDownloadProgress] = useState<AppUpdateProgress | null>(null);
  const [isAppUpdateDownloaded, setIsAppUpdateDownloaded] = useState(false);

  // Sync displayVersion with prop when it changes
  useEffect(() => {
    setDisplayVersion(version);
  }, [version]);

  // Check for updates on mount
  useEffect(() => {
    if (section === 'updates') {
      checkForSourceUpdates();
      checkForAppUpdates();
    }
  }, [section]);

  // Listen for source download progress
  useEffect(() => {
    const cleanup = window.electronAPI.onAutoBuildSourceUpdateProgress((progress) => {
      setDownloadProgress(progress);
      if (progress.stage === 'complete') {
        setIsDownloadingUpdate(false);
        // Update the displayed version if a new version was provided
        if (progress.newVersion) {
          setDisplayVersion(progress.newVersion);
        }
        checkForSourceUpdates();
      } else if (progress.stage === 'error') {
        setIsDownloadingUpdate(false);
      }
    });

    return cleanup;
  }, []);

  // Listen for app update events
  useEffect(() => {
    const cleanupAvailable = window.electronAPI.onAppUpdateAvailable((info) => {
      setAppUpdateInfo(info);
      setIsCheckingAppUpdate(false);
    });

    const cleanupDownloaded = window.electronAPI.onAppUpdateDownloaded((info) => {
      setAppUpdateInfo(info);
      setIsDownloadingAppUpdate(false);
      setIsAppUpdateDownloaded(true);
      setAppDownloadProgress(null);
    });

    const cleanupProgress = window.electronAPI.onAppUpdateProgress((progress) => {
      setAppDownloadProgress(progress);
    });

    return () => {
      cleanupAvailable();
      cleanupDownloaded();
      cleanupProgress();
    };
  }, []);

  const checkForAppUpdates = async () => {
    setIsCheckingAppUpdate(true);
    try {
      const result = await window.electronAPI.checkAppUpdate();
      if (result.success && result.data) {
        setAppUpdateInfo(result.data);
      } else {
        // No update available
        setAppUpdateInfo(null);
      }
    } catch (err) {
      console.error('Failed to check for app updates:', err);
    } finally {
      setIsCheckingAppUpdate(false);
    }
  };

  const handleDownloadAppUpdate = async () => {
    setIsDownloadingAppUpdate(true);
    try {
      await window.electronAPI.downloadAppUpdate();
    } catch (err) {
      console.error('Failed to download app update:', err);
      setIsDownloadingAppUpdate(false);
    }
  };

  const handleInstallAppUpdate = () => {
    window.electronAPI.installAppUpdate();
  };

  const checkForSourceUpdates = async () => {
    console.log('[AdvancedSettings] Checking for source updates...');
    setIsCheckingSourceUpdate(true);
    try {
      const result = await window.electronAPI.checkAutoBuildSourceUpdate();
      console.log('[AdvancedSettings] Check result:', result);
      if (result.success && result.data) {
        setSourceUpdateCheck(result.data);
        // Update displayed version from the check result (most accurate)
        if (result.data.currentVersion) {
          setDisplayVersion(result.data.currentVersion);
        }
      }
    } catch (err) {
      console.error('[AdvancedSettings] Check error:', err);
    } finally {
      setIsCheckingSourceUpdate(false);
    }
  };

  const handleDownloadSourceUpdate = () => {
    setIsDownloadingUpdate(true);
    setDownloadProgress(null);
    window.electronAPI.downloadAutoBuildSourceUpdate();
  };

  if (section === 'updates') {
    return (
      <SettingsSection
        title={t('updates.title')}
        description={t('updates.description')}
      >
        <div className="space-y-6">
          {/* Electron App Update Section */}
          {(appUpdateInfo || isAppUpdateDownloaded) && (
            <div className="rounded-lg border-2 border-info/50 bg-info/5 p-5 space-y-4">
              <div className="flex items-center gap-2 text-info">
                <Sparkles className="h-5 w-5" />
                <h3 className="font-semibold">{t('updates.appUpdateReady')}</h3>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    {t('updates.newVersion')}
                  </p>
                  <p className="text-base font-medium text-foreground">
                    {appUpdateInfo?.version || 'Unknown'}
                  </p>
                  {appUpdateInfo?.releaseDate && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('updates.released')} {new Date(appUpdateInfo.releaseDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {isAppUpdateDownloaded ? (
                  <CheckCircle2 className="h-6 w-6 text-success" />
                ) : isDownloadingAppUpdate ? (
                  <RefreshCw className="h-6 w-6 animate-spin text-info" />
                ) : (
                  <Download className="h-6 w-6 text-info" />
                )}
              </div>

              {/* Release Notes */}
              {appUpdateInfo?.releaseNotes && (
                <div className="bg-background rounded-lg p-4 max-h-48 overflow-y-auto border border-border/50">
                  <ReleaseNotesRenderer markdown={appUpdateInfo.releaseNotes} />
                </div>
              )}

              {/* Download Progress */}
              {isDownloadingAppUpdate && appDownloadProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('updates.downloading')}</span>
                    <span className="text-foreground font-medium">
                      {Math.round(appDownloadProgress.percent)}%
                    </span>
                  </div>
                  <Progress value={appDownloadProgress.percent} className="h-2" />
                  <p className="text-xs text-muted-foreground text-right">
                    {(appDownloadProgress.transferred / 1024 / 1024).toFixed(2)} MB / {(appDownloadProgress.total / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              )}

              {/* Downloaded Success */}
              {isAppUpdateDownloaded && (
                <div className="flex items-center gap-3 text-sm text-success bg-success/10 border border-success/30 rounded-lg p-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span>{t('updates.updateDownloaded')}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                {isAppUpdateDownloaded ? (
                  <Button onClick={handleInstallAppUpdate}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('updates.installAndRestart')}
                  </Button>
                ) : (
                  <Button
                    onClick={handleDownloadAppUpdate}
                    disabled={isDownloadingAppUpdate}
                  >
                    {isDownloadingAppUpdate ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        {t('updates.downloading')}
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        {t('updates.downloadUpdate')}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Unified Version Display with Update Check */}
          <div className="rounded-lg border border-border bg-muted/50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t('updates.version')}</p>
                <p className="text-base font-medium text-foreground">
                  {displayVersion || t('updates.loading')}
                </p>
              </div>
              {isCheckingSourceUpdate ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : sourceUpdateCheck?.updateAvailable ? (
                <AlertCircle className="h-6 w-6 text-info" />
              ) : (
                <CheckCircle2 className="h-6 w-6 text-success" />
              )}
            </div>

            {/* Update status */}
            {isCheckingSourceUpdate ? (
              <p className="text-sm text-muted-foreground">
                {t('updates.checkingForUpdates')}
              </p>
            ) : sourceUpdateCheck ? (
              <>
                {sourceUpdateCheck.latestVersion && sourceUpdateCheck.updateAvailable && (
                  <p className="text-sm text-info">
                    {t('updates.newVersionAvailable')} {sourceUpdateCheck.latestVersion}
                  </p>
                )}

                {sourceUpdateCheck.error && (
                  <p className="text-sm text-destructive">{sourceUpdateCheck.error}</p>
                )}

                {!sourceUpdateCheck.updateAvailable && !sourceUpdateCheck.error && (
                  <p className="text-sm text-muted-foreground">
                    {t('updates.latestVersion')}
                  </p>
                )}

                {sourceUpdateCheck.updateAvailable && (
                  <div className="space-y-4 pt-2">
                    {sourceUpdateCheck.releaseNotes && (
                      <div className="bg-background rounded-lg p-4 max-h-48 overflow-y-auto border border-border/50">
                        <ReleaseNotesRenderer markdown={sourceUpdateCheck.releaseNotes} />
                      </div>
                    )}

                    {sourceUpdateCheck.releaseUrl && (
                      <button
                        onClick={() => window.electronAPI.openExternal(sourceUpdateCheck.releaseUrl!)}
                        className="inline-flex items-center gap-1.5 text-sm text-info hover:text-info/80 hover:underline transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t('updates.viewRelease')}
                      </button>
                    )}

                    {isDownloadingUpdate ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-sm">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>{downloadProgress?.message || 'Downloading...'}</span>
                        </div>
                        {downloadProgress?.percent !== undefined && (
                          <Progress value={downloadProgress.percent} className="h-2" />
                        )}
                      </div>
                    ) : downloadProgress?.stage === 'complete' ? (
                      <div className="flex items-center gap-3 text-sm text-success">
                        <CheckCircle2 className="h-5 w-5" />
                        <span>{downloadProgress.message}</span>
                      </div>
                    ) : downloadProgress?.stage === 'error' ? (
                      <div className="flex items-center gap-3 text-sm text-destructive">
                        <AlertCircle className="h-5 w-5" />
                        <span>{downloadProgress.message}</span>
                      </div>
                    ) : (
                      <Button onClick={handleDownloadSourceUpdate}>
                        <CloudDownload className="mr-2 h-4 w-4" />
                        {t('updates.downloadUpdate')}
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('updates.unableToCheck')}
              </p>
            )}

            <div className="pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={checkForSourceUpdates}
                disabled={isCheckingSourceUpdate}
              >
                <RefreshCw className={cn('mr-2 h-4 w-4', isCheckingSourceUpdate && 'animate-spin')} />
                {t('updates.checkForUpdates')}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div className="space-y-1">
              <Label className="font-medium text-foreground">{t('updates.autoUpdateProjects')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('updates.autoUpdateProjectsDescription')}
              </p>
            </div>
            <Switch
              checked={settings.autoUpdateAutoBuild}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, autoUpdateAutoBuild: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div className="space-y-1">
              <Label className="font-medium text-foreground">{t('updates.betaUpdates')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('updates.betaUpdatesDescription')}
              </p>
            </div>
            <Switch
              checked={settings.betaUpdates ?? false}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, betaUpdates: checked })
              }
            />
          </div>
        </div>
      </SettingsSection>
    );
  }

  // notifications section
  const notificationItems: Array<{
    key: keyof NotificationSettings;
    labelKey: string;
    descriptionKey: string;
  }> = [
    { key: 'onTaskComplete', labelKey: 'notifications.onTaskComplete', descriptionKey: 'notifications.onTaskCompleteDescription' },
    { key: 'onTaskFailed', labelKey: 'notifications.onTaskFailed', descriptionKey: 'notifications.onTaskFailedDescription' },
    { key: 'onReviewNeeded', labelKey: 'notifications.onReviewNeeded', descriptionKey: 'notifications.onReviewNeededDescription' },
    { key: 'sound', labelKey: 'notifications.sound', descriptionKey: 'notifications.soundDescription' }
  ];

  return (
    <SettingsSection
      title={t('notifications.title')}
      description={t('notifications.description')}
    >
      <div className="space-y-4">
        {notificationItems.map((item) => (
          <div key={item.key} className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div className="space-y-1">
              <Label className="font-medium text-foreground">{t(item.labelKey)}</Label>
              <p className="text-sm text-muted-foreground">{t(item.descriptionKey)}</p>
            </div>
            <Switch
              checked={settings.notifications[item.key]}
              onCheckedChange={(checked) =>
                onSettingsChange({
                  ...settings,
                  notifications: {
                    ...settings.notifications,
                    [item.key]: checked
                  }
                })
              }
            />
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}
