import { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  Loader2,
  Moon,
  Sun,
  Monitor,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  CloudDownload,
  Key,
  Eye,
  EyeOff,
  Info
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { ScrollArea } from './ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select';
import { Separator } from './ui/separator';
import { useSettingsStore, saveSettings, loadSettings } from '../stores/settings-store';
import { AVAILABLE_MODELS } from '../../shared/constants';
import type {
  AppSettings as AppSettingsType,
  AutoBuildSourceUpdateCheck,
  AutoBuildSourceUpdateProgress
} from '../../shared/types';
import { Progress } from './ui/progress';

interface AppSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AppSettingsDialog({ open, onOpenChange }: AppSettingsDialogProps) {
  const currentSettings = useSettingsStore((state) => state.settings);
  const [settings, setSettings] = useState<AppSettingsType>(currentSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<string>('');

  // Auto Claude source update state
  const [sourceUpdateCheck, setSourceUpdateCheck] = useState<AutoBuildSourceUpdateCheck | null>(null);
  const [isCheckingSourceUpdate, setIsCheckingSourceUpdate] = useState(false);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<AutoBuildSourceUpdateProgress | null>(null);

  // Password visibility toggles for global API keys
  const [showGlobalClaudeToken, setShowGlobalClaudeToken] = useState(false);
  const [showGlobalOpenAIKey, setShowGlobalOpenAIKey] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
    window.electronAPI.getAppVersion().then(setVersion);

    // Check for auto-claude source updates
    checkForSourceUpdates();
  }, []);

  // Listen for download progress
  useEffect(() => {
    const cleanup = window.electronAPI.onAutoBuildSourceUpdateProgress((progress) => {
      setDownloadProgress(progress);
      if (progress.stage === 'complete') {
        setIsDownloadingUpdate(false);
        // Refresh the update check
        checkForSourceUpdates();
      } else if (progress.stage === 'error') {
        setIsDownloadingUpdate(false);
      }
    });

    return cleanup;
  }, []);

  const checkForSourceUpdates = async () => {
    setIsCheckingSourceUpdate(true);
    try {
      const result = await window.electronAPI.checkAutoBuildSourceUpdate();
      if (result.success && result.data) {
        setSourceUpdateCheck(result.data);
      }
    } catch (err) {
      console.error('Failed to check for source updates:', err);
    } finally {
      setIsCheckingSourceUpdate(false);
    }
  };

  const handleDownloadSourceUpdate = () => {
    setIsDownloadingUpdate(true);
    setDownloadProgress(null);
    window.electronAPI.downloadAutoBuildSourceUpdate();
  };

  // Sync with store
  useEffect(() => {
    setSettings(currentSettings);
  }, [currentSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const success = await saveSettings(settings);
      if (success) {
        // Apply theme immediately
        applyTheme(settings.theme);
        onOpenChange(false);
      } else {
        setError('Failed to save settings');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  const applyTheme = (theme: 'light' | 'dark' | 'system') => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // System preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const getThemeIcon = (theme: string) => {
    switch (theme) {
      case 'light':
        return <Sun className="h-4 w-4" />;
      case 'dark':
        return <Moon className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Settings className="h-5 w-5" />
            Application Settings
          </DialogTitle>
          <DialogDescription>
            Configure global application settings
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6 min-h-0">
          <div className="py-4 space-y-6">
            {/* Appearance */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Appearance</h3>
              <div className="space-y-2">
                <Label htmlFor="theme" className="text-sm font-medium text-foreground">Theme</Label>
                <Select
                  value={settings.theme}
                  onValueChange={(value: 'light' | 'dark' | 'system') =>
                    setSettings({ ...settings, theme: value })
                  }
                >
                  <SelectTrigger id="theme">
                    <SelectValue>
                      <span className="flex items-center gap-2">
                        {getThemeIcon(settings.theme)}
                        {settings.theme === 'system'
                          ? 'System'
                          : settings.theme === 'dark'
                          ? 'Dark'
                          : 'Light'}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">
                      <span className="flex items-center gap-2">
                        <Monitor className="h-4 w-4" />
                        System
                      </span>
                    </SelectItem>
                    <SelectItem value="light">
                      <span className="flex items-center gap-2">
                        <Sun className="h-4 w-4" />
                        Light
                      </span>
                    </SelectItem>
                    <SelectItem value="dark">
                      <span className="flex items-center gap-2">
                        <Moon className="h-4 w-4" />
                        Dark
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>

            <Separator />

            {/* Default Agent Settings */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Default Agent Settings</h3>
              <div className="space-y-2">
                <Label htmlFor="defaultModel" className="text-sm font-medium text-foreground">Default Model</Label>
                <Select
                  value={settings.defaultModel}
                  onValueChange={(value) =>
                    setSettings({ ...settings, defaultModel: value })
                  }
                >
                  <SelectTrigger id="defaultModel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_MODELS.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultParallelism" className="text-sm font-medium text-foreground">Default Parallelism</Label>
                <Input
                  id="defaultParallelism"
                  type="number"
                  min={1}
                  max={8}
                  value={settings.defaultParallelism}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultParallelism: parseInt(e.target.value) || 1
                    })
                  }
                />
              </div>
            </section>

            <Separator />

            {/* Paths */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Paths</h3>
              <div className="space-y-2">
                <Label htmlFor="pythonPath" className="text-sm font-medium text-foreground">Python Path</Label>
                <Input
                  id="pythonPath"
                  placeholder="python3 (default)"
                  value={settings.pythonPath || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, pythonPath: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Path to Python executable (leave empty for default)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="autoBuildPath" className="text-sm font-medium text-foreground">Auto Claude Path</Label>
                <Input
                  id="autoBuildPath"
                  placeholder="auto-claude (default)"
                  value={settings.autoBuildPath || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, autoBuildPath: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Relative path to auto-claude directory in projects
                </p>
              </div>
            </section>

            <Separator />

            {/* Global API Keys */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                <h3 className="text-sm font-semibold text-foreground">Global API Keys</h3>
              </div>
              <div className="rounded-lg bg-info/10 border border-info/30 p-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Set API keys here to use them across all projects. Individual projects can override these in their settings.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="globalClaudeToken" className="text-sm font-medium text-foreground">
                  Claude OAuth Token
                </Label>
                <div className="relative">
                  <Input
                    id="globalClaudeToken"
                    type={showGlobalClaudeToken ? 'text' : 'password'}
                    placeholder="Enter your Claude OAuth token..."
                    value={settings.globalClaudeOAuthToken || ''}
                    onChange={(e) =>
                      setSettings({ ...settings, globalClaudeOAuthToken: e.target.value || undefined })
                    }
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGlobalClaudeToken(!showGlobalClaudeToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showGlobalClaudeToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your token by running <code className="px-1 py-0.5 bg-muted rounded font-mono">claude setup-token</code>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="globalOpenAIKey" className="text-sm font-medium text-foreground">
                  OpenAI API Key
                </Label>
                <div className="relative">
                  <Input
                    id="globalOpenAIKey"
                    type={showGlobalOpenAIKey ? 'text' : 'password'}
                    placeholder="sk-..."
                    value={settings.globalOpenAIApiKey || ''}
                    onChange={(e) =>
                      setSettings({ ...settings, globalOpenAIApiKey: e.target.value || undefined })
                    }
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGlobalOpenAIKey(!showGlobalOpenAIKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showGlobalOpenAIKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Required for Graphiti memory backend (embeddings)
                </p>
              </div>
            </section>

            <Separator />

            {/* Auto Claude Framework Updates */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Auto Claude Framework</h3>
              <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
                {isCheckingSourceUpdate ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking for updates...
                  </div>
                ) : sourceUpdateCheck ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Current Version: {sourceUpdateCheck.currentVersion}
                        </p>
                        {sourceUpdateCheck.latestVersion && sourceUpdateCheck.updateAvailable && (
                          <p className="text-xs text-info">
                            New version available: {sourceUpdateCheck.latestVersion}
                          </p>
                        )}
                      </div>
                      {sourceUpdateCheck.updateAvailable ? (
                        <AlertCircle className="h-5 w-5 text-info" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      )}
                    </div>

                    {sourceUpdateCheck.error && (
                      <p className="text-xs text-destructive">{sourceUpdateCheck.error}</p>
                    )}

                    {!sourceUpdateCheck.updateAvailable && !sourceUpdateCheck.error && (
                      <p className="text-xs text-muted-foreground">
                        You're running the latest version of the Auto Claude framework.
                      </p>
                    )}

                    {sourceUpdateCheck.updateAvailable && (
                      <div className="space-y-3">
                        {sourceUpdateCheck.releaseNotes && (
                          <div className="text-xs text-muted-foreground bg-background rounded p-2 max-h-24 overflow-y-auto">
                            <pre className="whitespace-pre-wrap font-sans">
                              {sourceUpdateCheck.releaseNotes}
                            </pre>
                          </div>
                        )}

                        {isDownloadingUpdate ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              <span>{downloadProgress?.message || 'Downloading...'}</span>
                            </div>
                            {downloadProgress?.percent !== undefined && (
                              <Progress value={downloadProgress.percent} className="h-2" />
                            )}
                          </div>
                        ) : downloadProgress?.stage === 'complete' ? (
                          <div className="flex items-center gap-2 text-sm text-success">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{downloadProgress.message}</span>
                          </div>
                        ) : downloadProgress?.stage === 'error' ? (
                          <div className="flex items-center gap-2 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            <span>{downloadProgress.message}</span>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            onClick={handleDownloadSourceUpdate}
                          >
                            <CloudDownload className="mr-2 h-4 w-4" />
                            Download Update
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="h-4 w-4" />
                    Unable to check for updates
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={checkForSourceUpdates}
                    disabled={isCheckingSourceUpdate}
                  >
                    <RefreshCw className={`mr-2 h-3 w-3 ${isCheckingSourceUpdate ? 'animate-spin' : ''}`} />
                    Check for Updates
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Updates the bundled Auto Claude framework from GitHub. Individual projects can then be updated from Project Settings.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-normal text-foreground">Auto-Update Projects</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically update Auto Claude in projects when a new version is available
                  </p>
                </div>
                <Switch
                  checked={settings.autoUpdateAutoBuild}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, autoUpdateAutoBuild: checked })
                  }
                />
              </div>
            </section>

            <Separator />

            {/* Notifications */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Default Notifications</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="font-normal text-foreground">On Task Complete</Label>
                  <Switch
                    checked={settings.notifications.onTaskComplete}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        notifications: {
                          ...settings.notifications,
                          onTaskComplete: checked
                        }
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-normal text-foreground">On Task Failed</Label>
                  <Switch
                    checked={settings.notifications.onTaskFailed}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        notifications: {
                          ...settings.notifications,
                          onTaskFailed: checked
                        }
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-normal text-foreground">On Review Needed</Label>
                  <Switch
                    checked={settings.notifications.onReviewNeeded}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        notifications: {
                          ...settings.notifications,
                          onReviewNeeded: checked
                        }
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-normal text-foreground">Sound</Label>
                  <Switch
                    checked={settings.notifications.sound}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        notifications: {
                          ...settings.notifications,
                          sound: checked
                        }
                      })
                    }
                  />
                </div>
              </div>
            </section>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-[var(--error-light)] border border-[var(--error)]/30 p-3 text-sm text-[var(--error)]">
                {error}
              </div>
            )}

            {/* Version */}
            {version && (
              <div className="text-xs text-muted-foreground text-center pt-2">
                Version {version}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
