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
  Info,
  Palette,
  Bot,
  FolderOpen,
  Bell,
  Package,
  Users,
  Plus,
  Trash2,
  Star,
  Check,
  Pencil,
  X
} from 'lucide-react';
import {
  FullScreenDialog,
  FullScreenDialogContent,
  FullScreenDialogHeader,
  FullScreenDialogBody,
  FullScreenDialogFooter,
  FullScreenDialogTitle,
  FullScreenDialogDescription
} from './ui/full-screen-dialog';
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
import { cn } from '../lib/utils';
import { useSettingsStore, saveSettings, loadSettings } from '../stores/settings-store';
import { loadClaudeProfiles as loadGlobalClaudeProfiles } from '../stores/claude-profile-store';
import { AVAILABLE_MODELS } from '../../shared/constants';
import type {
  AppSettings as AppSettingsType,
  AutoBuildSourceUpdateCheck,
  AutoBuildSourceUpdateProgress,
  ClaudeProfile
} from '../../shared/types';
import { Progress } from './ui/progress';

interface AppSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SettingsSection = 'appearance' | 'agent' | 'paths' | 'integrations' | 'updates' | 'notifications';

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: React.ElementType;
  description: string;
}

const navItems: NavItem[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme and visual preferences' },
  { id: 'agent', label: 'Agent Settings', icon: Bot, description: 'Default model and framework' },
  { id: 'paths', label: 'Paths', icon: FolderOpen, description: 'Python and framework paths' },
  { id: 'integrations', label: 'Integrations', icon: Key, description: 'API keys & Claude accounts' },
  { id: 'updates', label: 'Updates', icon: Package, description: 'Auto Claude updates' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alert preferences' }
];

export function AppSettingsDialog({ open, onOpenChange }: AppSettingsDialogProps) {
  const currentSettings = useSettingsStore((state) => state.settings);
  const [settings, setSettings] = useState<AppSettingsType>(currentSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<string>('');
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');

  // Auto Claude source update state
  const [sourceUpdateCheck, setSourceUpdateCheck] = useState<AutoBuildSourceUpdateCheck | null>(null);
  const [isCheckingSourceUpdate, setIsCheckingSourceUpdate] = useState(false);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<AutoBuildSourceUpdateProgress | null>(null);

  // Password visibility toggles for global API keys
  const [showGlobalClaudeToken, setShowGlobalClaudeToken] = useState(false);
  const [showGlobalOpenAIKey, setShowGlobalOpenAIKey] = useState(false);

  // Claude Accounts state
  const [claudeProfiles, setClaudeProfiles] = useState<ClaudeProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [isAddingProfile, setIsAddingProfile] = useState(false);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingProfileName, setEditingProfileName] = useState('');

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

  // Load Claude profiles when integrations section is shown
  useEffect(() => {
    if (activeSection === 'integrations' && open) {
      loadClaudeProfiles();
    }
  }, [activeSection, open]);

  // Listen for OAuth authentication completion (token is auto-saved in backend)
  useEffect(() => {
    const unsubscribe = window.electronAPI.onTerminalOAuthToken(async (info) => {
      console.log('[AppSettings] OAuth authentication event:', {
        terminalId: info.terminalId,
        profileId: info.profileId,
        email: info.email,
        success: info.success
      });

      if (info.success && info.profileId) {
        // Reload profiles to show updated state
        await loadClaudeProfiles();
        // Show simple success notification (no token exposed)
        alert(`✅ Profile authenticated successfully!\n\n${info.email ? `Account: ${info.email}` : 'Authentication complete.'}\n\nYou can now use this profile.`);
      } else if (!info.success) {
        console.log('[AppSettings] Authentication detected but not saved:', info.message);
      }
    });

    return unsubscribe;
  }, []);

  const loadClaudeProfiles = async () => {
    setIsLoadingProfiles(true);
    try {
      const result = await window.electronAPI.getClaudeProfiles();
      if (result.success && result.data) {
        setClaudeProfiles(result.data.profiles);
        setActiveProfileId(result.data.activeProfileId);
        // Also update the global store so rate limit modals see the changes
        await loadGlobalClaudeProfiles();
      }
    } catch (err) {
      console.error('Failed to load Claude profiles:', err);
    } finally {
      setIsLoadingProfiles(false);
    }
  };

  const handleAddProfile = async () => {
    if (!newProfileName.trim()) return;

    setIsAddingProfile(true);
    try {
      const profileName = newProfileName.trim();
      const profileSlug = profileName.toLowerCase().replace(/\s+/g, '-');
      
      const result = await window.electronAPI.saveClaudeProfile({
        id: `profile-${Date.now()}`,
        name: profileName,
        // Use a placeholder - the backend will resolve the actual path
        configDir: `~/.claude-profiles/${profileSlug}`,
        isDefault: false,
        createdAt: new Date()
      });

      if (result.success && result.data) {
        // Initialize the profile (creates terminal and runs claude setup-token)
        const initResult = await window.electronAPI.initializeClaudeProfile(result.data.id);
        
        if (initResult.success) {
          // Reload profiles
          await loadClaudeProfiles();
          setNewProfileName('');

          // Alert the user - browser will open for OAuth
          alert(
            `Authenticating "${profileName}"...\n\n` +
            `A browser window will open for you to log in with your Claude account.\n\n` +
            `The authentication will be saved automatically once complete.`
          );
        } else {
          // Still reload profiles in case it partially worked
          await loadClaudeProfiles();
          alert(`Failed to start authentication: ${initResult.error || 'Please try again.'}`);
        }
      }
    } catch (err) {
      console.error('Failed to add profile:', err);
      alert('Failed to add profile. Please try again.');
    } finally {
      setIsAddingProfile(false);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    setDeletingProfileId(profileId);
    try {
      const result = await window.electronAPI.deleteClaudeProfile(profileId);
      if (result.success) {
        await loadClaudeProfiles();
      }
    } catch (err) {
      console.error('Failed to delete profile:', err);
    } finally {
      setDeletingProfileId(null);
    }
  };

  const startEditingProfile = (profile: ClaudeProfile) => {
    setEditingProfileId(profile.id);
    setEditingProfileName(profile.name);
  };

  const cancelEditingProfile = () => {
    setEditingProfileId(null);
    setEditingProfileName('');
  };

  const handleRenameProfile = async () => {
    if (!editingProfileId || !editingProfileName.trim()) return;
    
    try {
      const result = await window.electronAPI.renameClaudeProfile(editingProfileId, editingProfileName.trim());
      if (result.success) {
        await loadClaudeProfiles();
      }
    } catch (err) {
      console.error('Failed to rename profile:', err);
    } finally {
      setEditingProfileId(null);
      setEditingProfileName('');
    }
  };

  const handleSetActiveProfile = async (profileId: string) => {
    try {
      const result = await window.electronAPI.setActiveClaudeProfile(profileId);
      if (result.success) {
        setActiveProfileId(profileId);
        // Also update the global store so other components see the change
        await loadGlobalClaudeProfiles();
      }
    } catch (err) {
      console.error('Failed to set active profile:', err);
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

  const renderSection = () => {
    switch (activeSection) {
      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Appearance</h3>
              <p className="text-sm text-muted-foreground">Customize how Auto Claude looks</p>
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="space-y-3">
                <Label htmlFor="theme" className="text-sm font-medium text-foreground">Theme</Label>
                <p className="text-sm text-muted-foreground">Choose your preferred color scheme</p>
                <div className="grid grid-cols-3 gap-3">
                  {(['system', 'light', 'dark'] as const).map((theme) => (
                    <button
                      key={theme}
                      onClick={() => setSettings({ ...settings, theme })}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
                        settings.theme === theme
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50 hover:bg-accent/50'
                      )}
                    >
                      {getThemeIcon(theme)}
                      <span className="text-sm font-medium capitalize">{theme}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 'agent':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Default Agent Settings</h3>
              <p className="text-sm text-muted-foreground">Configure defaults for new projects</p>
            </div>
            <Separator />
            <div className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="defaultModel" className="text-sm font-medium text-foreground">Default Model</Label>
                <p className="text-sm text-muted-foreground">The AI model used for agent tasks</p>
                <Select
                  value={settings.defaultModel}
                  onValueChange={(value) => setSettings({ ...settings, defaultModel: value })}
                >
                  <SelectTrigger id="defaultModel" className="w-full max-w-md">
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
              <div className="space-y-3">
                <Label htmlFor="agentFramework" className="text-sm font-medium text-foreground">Agent Framework</Label>
                <p className="text-sm text-muted-foreground">The coding framework used for autonomous tasks</p>
                <Select
                  value={settings.agentFramework}
                  onValueChange={(value) => setSettings({ ...settings, agentFramework: value })}
                >
                  <SelectTrigger id="agentFramework" className="w-full max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto-claude">Auto Claude</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );

      case 'paths':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Paths</h3>
              <p className="text-sm text-muted-foreground">Configure executable and framework paths</p>
            </div>
            <Separator />
            <div className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="pythonPath" className="text-sm font-medium text-foreground">Python Path</Label>
                <p className="text-sm text-muted-foreground">Path to Python executable (leave empty for default)</p>
                <Input
                  id="pythonPath"
                  placeholder="python3 (default)"
                  className="w-full max-w-lg"
                  value={settings.pythonPath || ''}
                  onChange={(e) => setSettings({ ...settings, pythonPath: e.target.value })}
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="autoBuildPath" className="text-sm font-medium text-foreground">Auto Claude Path</Label>
                <p className="text-sm text-muted-foreground">Relative path to auto-claude directory in projects</p>
                <Input
                  id="autoBuildPath"
                  placeholder="auto-claude (default)"
                  className="w-full max-w-lg"
                  value={settings.autoBuildPath || ''}
                  onChange={(e) => setSettings({ ...settings, autoBuildPath: e.target.value })}
                />
              </div>
            </div>
          </div>
        );

      case 'integrations':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Integrations</h3>
              <p className="text-sm text-muted-foreground">Manage Claude accounts and API keys</p>
            </div>
            <Separator />

            {/* Claude Accounts Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold text-foreground">Claude Accounts</h4>
              </div>
              
              <div className="rounded-lg bg-muted/30 border border-border p-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Add multiple Claude subscriptions to automatically switch between them when you hit rate limits.
                </p>

                {/* Accounts list */}
                {isLoadingProfiles ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : claudeProfiles.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center mb-4">
                    <p className="text-sm text-muted-foreground">No accounts configured yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 mb-4">
                    {claudeProfiles.map((profile) => (
                      <div
                        key={profile.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border transition-colors",
                          profile.id === activeProfileId
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background hover:bg-muted/50"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0",
                            profile.id === activeProfileId
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}>
                            {(editingProfileId === profile.id ? editingProfileName : profile.name).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            {editingProfileId === profile.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingProfileName}
                                  onChange={(e) => setEditingProfileName(e.target.value)}
                                  className="h-7 text-sm w-40"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameProfile();
                                    if (e.key === 'Escape') cancelEditingProfile();
                                  }}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={handleRenameProfile}
                                  className="h-7 w-7 text-success hover:text-success hover:bg-success/10"
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={cancelEditingProfile}
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-foreground">{profile.name}</span>
                                  {profile.isDefault && (
                                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Default</span>
                                  )}
                                  {profile.id === activeProfileId && (
                                    <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded flex items-center gap-1">
                                      <Star className="h-3 w-3" />
                                      Active
                                    </span>
                                  )}
                                  {profile.oauthToken ? (
                                    <span className="text-xs bg-success/20 text-success px-1.5 py-0.5 rounded flex items-center gap-1">
                                      <Check className="h-3 w-3" />
                                      Authenticated
                                    </span>
                                  ) : !profile.isDefault && (
                                    <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded">
                                      Needs Auth
                                    </span>
                                  )}
                                </div>
                                {profile.email && (
                                  <span className="text-xs text-muted-foreground">{profile.email}</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        {editingProfileId !== profile.id && (
                          <div className="flex items-center gap-1">
                            {profile.id !== activeProfileId && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSetActiveProfile(profile.id)}
                                className="gap-1 h-7 text-xs"
                              >
                                <Check className="h-3 w-3" />
                                Set Active
                              </Button>
                            )}
                            {!profile.isDefault && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => startEditingProfile(profile)}
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                title="Rename profile"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                            {!profile.isDefault && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteProfile(profile.id)}
                                disabled={deletingProfileId === profile.id}
                                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                title="Delete profile"
                              >
                                {deletingProfileId === profile.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new account */}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Account name (e.g., Work, Personal)"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    className="flex-1 h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newProfileName.trim()) {
                        handleAddProfile();
                      }
                    }}
                  />
                  <Button
                    onClick={handleAddProfile}
                    disabled={!newProfileName.trim() || isAddingProfile}
                    size="sm"
                    className="gap-1 shrink-0"
                  >
                    {isAddingProfile ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    Add
                  </Button>
                </div>
              </div>
            </div>

            {/* API Keys Section */}
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold text-foreground">API Keys</h4>
              </div>
              
              <div className="rounded-lg bg-info/10 border border-info/30 p-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Keys set here are used as defaults. Individual projects can override these in their settings.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="globalClaudeToken" className="text-sm font-medium text-foreground">
                    Claude OAuth Token
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Get your token by running <code className="px-1 py-0.5 bg-muted rounded font-mono text-xs">claude setup-token</code>
                  </p>
                  <div className="relative max-w-lg">
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="globalOpenAIKey" className="text-sm font-medium text-foreground">
                    OpenAI API Key
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Required for Graphiti memory backend (embeddings)
                  </p>
                  <div className="relative max-w-lg">
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
                </div>
              </div>
            </div>
          </div>
        );

      case 'updates':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Updates</h3>
              <p className="text-sm text-muted-foreground">Manage Auto Claude framework updates</p>
            </div>
            <Separator />
            <div className="space-y-6">
              {/* App Version Display */}
              <div className="rounded-lg border border-border bg-muted/50 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">App Version</p>
                    <p className="text-base font-medium text-foreground">
                      {version || 'Loading...'}
                    </p>
                  </div>
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
              </div>

              {/* Framework Version Display */}
              <div className="rounded-lg border border-border bg-muted/50 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Framework Version</p>
                  </div>
                </div>
                {isCheckingSourceUpdate ? (
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Checking for updates...
                  </div>
                ) : sourceUpdateCheck ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-base font-medium text-foreground">
                          {sourceUpdateCheck.currentVersion}
                        </p>
                        {sourceUpdateCheck.latestVersion && sourceUpdateCheck.updateAvailable && (
                          <p className="text-sm text-info mt-1">
                            New version available: {sourceUpdateCheck.latestVersion}
                          </p>
                        )}
                      </div>
                      {sourceUpdateCheck.updateAvailable ? (
                        <AlertCircle className="h-6 w-6 text-info" />
                      ) : (
                        <CheckCircle2 className="h-6 w-6 text-success" />
                      )}
                    </div>

                    {sourceUpdateCheck.error && (
                      <p className="text-sm text-destructive">{sourceUpdateCheck.error}</p>
                    )}

                    {!sourceUpdateCheck.updateAvailable && !sourceUpdateCheck.error && (
                      <p className="text-sm text-muted-foreground">
                        You&apos;re running the latest version of the Auto Claude framework.
                      </p>
                    )}

                    {sourceUpdateCheck.updateAvailable && (
                      <div className="space-y-4 pt-2">
                        {sourceUpdateCheck.releaseNotes && (
                          <div className="text-sm text-muted-foreground bg-background rounded-lg p-3 max-h-32 overflow-y-auto">
                            <pre className="whitespace-pre-wrap font-sans">
                              {sourceUpdateCheck.releaseNotes}
                            </pre>
                          </div>
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
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <AlertCircle className="h-5 w-5" />
                    Unable to check for updates
                  </div>
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
                    setSettings({ ...settings, autoUpdateAutoBuild: checked })
                  }
                />
              </div>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Notifications</h3>
              <p className="text-sm text-muted-foreground">Configure default notification preferences</p>
            </div>
            <Separator />
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
                      setSettings({
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
          </div>
        );
    }
  };

  return (
    <FullScreenDialog open={open} onOpenChange={onOpenChange}>
      <FullScreenDialogContent>
        <FullScreenDialogHeader>
          <FullScreenDialogTitle className="flex items-center gap-3">
            <Settings className="h-6 w-6" />
            Settings
          </FullScreenDialogTitle>
          <FullScreenDialogDescription>
            Configure application-wide settings and preferences
          </FullScreenDialogDescription>
        </FullScreenDialogHeader>

        <FullScreenDialogBody>
          <div className="flex h-full">
            {/* Navigation sidebar */}
            <nav className="w-64 border-r border-border bg-muted/30 p-4">
              <ScrollArea className="h-full">
                <div className="space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id)}
                        className={cn(
                          'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all',
                          activeSection === item.id
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Icon className="h-5 w-5 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{item.label}</div>
                          <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Version at bottom */}
                {version && (
                  <div className="mt-8 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground text-center">
                      Version {version}
                    </p>
                  </div>
                )}
              </ScrollArea>
            </nav>

            {/* Main content */}
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-8 max-w-2xl">
                  {renderSection()}
                </div>
              </ScrollArea>
            </div>
          </div>
        </FullScreenDialogBody>

        <FullScreenDialogFooter>
          {error && (
            <div className="flex-1 rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
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
        </FullScreenDialogFooter>
      </FullScreenDialogContent>
    </FullScreenDialog>
  );
}
