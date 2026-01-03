import { useState, useEffect, useMemo } from 'react';
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
  AppUpdateProgress
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
  // Auto Claude source update state
  const [sourceUpdateCheck, setSourceUpdateCheck] = useState<AutoBuildSourceUpdateCheck | null>(null);
  const [isCheckingSourceUpdate, setIsCheckingSourceUpdate] = useState(false);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<AutoBuildSourceUpdateProgress | null>(null);

  // Electron app update state
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateAvailableEvent | null>(null);
  const [_isCheckingAppUpdate, setIsCheckingAppUpdate] = useState(false);
  const [isDownloadingAppUpdate, setIsDownloadingAppUpdate] = useState(false);
  const [appDownloadProgress, setAppDownloadProgress] = useState<AppUpdateProgress | null>(null);
  const [isAppUpdateDownloaded, setIsAppUpdateDownloaded] = useState(false);

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
    setIsCheckingSourceUpdate(true);
    try {
      const result = await window.electronAPI.checkAutoBuildSourceUpdate();
      if (result.success && result.data) {
        setSourceUpdateCheck(result.data);
      }
    } catch (err) {
      // Silent fail - user can retry via button
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
        title="Updates"
        description="Manage Auto Claude updates"
      >
        <div className="space-y-6">
          {/* Electron App Update Section */}
          {(appUpdateInfo || isAppUpdateDownloaded) && (
            <div className="rounded-lg border-2 border-info/50 bg-info/5 p-5 space-y-4">
              <div className="flex items-center gap-2 text-info">
                <Sparkles className="h-5 w-5" />
                <h3 className="font-semibold">App Update Ready</h3>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    New Version
                  </p>
                  <p className="text-base font-medium text-foreground">
                    {appUpdateInfo?.version || 'Unknown'}
                  </p>
                  {appUpdateInfo?.releaseDate && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Released {new Date(appUpdateInfo.releaseDate).toLocaleDateString()}
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
                    <span className="text-muted-foreground">Downloading...</span>
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
                  <span>Update downloaded! Click Install to restart and apply the update.</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                {isAppUpdateDownloaded ? (
                  <Button onClick={handleInstallAppUpdate}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Install and Restart
                  </Button>
                ) : (
                  <Button
                    onClick={handleDownloadAppUpdate}
                    disabled={isDownloadingAppUpdate}
                  >
                    {isDownloadingAppUpdate ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download Update
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
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Version</p>
                <p className="text-base font-medium text-foreground">
                  {version || 'Loading...'}
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
                Checking for updates...
              </p>
            ) : sourceUpdateCheck ? (
              <>
                {sourceUpdateCheck.latestVersion && sourceUpdateCheck.updateAvailable && (
                  <p className="text-sm text-info">
                    New version available: {sourceUpdateCheck.latestVersion}
                  </p>
                )}

                {sourceUpdateCheck.error && (
                  <p className="text-sm text-destructive">{sourceUpdateCheck.error}</p>
                )}

                {!sourceUpdateCheck.updateAvailable && !sourceUpdateCheck.error && (
                  <p className="text-sm text-muted-foreground">
                    You&apos;re running the latest version.
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
                        View full release on GitHub
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
                        Download Update
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Unable to check for updates
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
                Check for Updates
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div className="space-y-1">
              <Label className="font-medium text-foreground">Auto-Update Projects</Label>
              <p className="text-sm text-muted-foreground">
                Automatically update Auto Claude in projects when a new version is available
              </p>
            </div>
            <Switch
              checked={settings.autoUpdateAutoBuild}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, autoUpdateAutoBuild: checked })
              }
            />
          </div>
        </div>
      </SettingsSection>
    );
  }

  // notifications section
  return (
    <SettingsSection
      title="Notifications"
      description="Configure default notification preferences"
    >
      <div className="space-y-4">
        {[
          { key: 'onTaskComplete', label: 'On Task Complete', description: 'Notify when a task finishes successfully' },
          { key: 'onTaskFailed', label: 'On Task Failed', description: 'Notify when a task encounters an error' },
          { key: 'onReviewNeeded', label: 'On Review Needed', description: 'Notify when QA requires your review' },
          { key: 'sound', label: 'Sound', description: 'Play sound with notifications' }
        ].map((item) => (
          <div key={item.key} className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div className="space-y-1">
              <Label className="font-medium text-foreground">{item.label}</Label>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
            <Switch
              checked={settings.notifications[item.key as keyof typeof settings.notifications]}
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
