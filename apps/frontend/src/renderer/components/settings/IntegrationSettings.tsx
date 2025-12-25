import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Key,
  Eye,
  EyeOff,
  Info,
  Users,
  Plus,
  Trash2,
  Star,
  Check,
  Pencil,
  X,
  Loader2,
  LogIn,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Activity,
  AlertCircle
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { cn } from '../../lib/utils';
import { SettingsSection } from './SettingsSection';
import { loadClaudeProfiles as loadGlobalClaudeProfiles } from '../../stores/claude-profile-store';
import type { AppSettings, ClaudeProfile, ClaudeAutoSwitchSettings } from '../../../shared/types';

interface IntegrationSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  isOpen: boolean;
}

/**
 * Integration settings for Claude accounts and API keys
 */
export function IntegrationSettings({ settings, onSettingsChange, isOpen }: IntegrationSettingsProps) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  // Password visibility toggle for global API keys
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
  const [authenticatingProfileId, setAuthenticatingProfileId] = useState<string | null>(null);
  const [expandedTokenProfileId, setExpandedTokenProfileId] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [manualTokenEmail, setManualTokenEmail] = useState('');
  const [showManualToken, setShowManualToken] = useState(false);
  const [savingTokenProfileId, setSavingTokenProfileId] = useState<string | null>(null);

  // Auto-swap settings state
  const [autoSwitchSettings, setAutoSwitchSettings] = useState<ClaudeAutoSwitchSettings | null>(null);
  const [isLoadingAutoSwitch, setIsLoadingAutoSwitch] = useState(false);

  // Load Claude profiles and auto-swap settings when section is shown
  useEffect(() => {
    if (isOpen) {
      loadClaudeProfiles();
      loadAutoSwitchSettings();
    }
  }, [isOpen]);

  // Listen for OAuth authentication completion
  useEffect(() => {
    const unsubscribe = window.electronAPI.onTerminalOAuthToken(async (info) => {
      if (info.success && info.profileId) {
        // Reload profiles to show updated state
        await loadClaudeProfiles();
        // Show simple success notification
        alert(`✅ Profile authenticated successfully!\n\n${info.email ? `Account: ${info.email}` : 'Authentication complete.'}\n\nYou can now use this profile.`);
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
        // Also update the global store
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
        configDir: `~/.claude-profiles/${profileSlug}`,
        isDefault: false,
        createdAt: new Date()
      });

      if (result.success && result.data) {
        // Initialize the profile
        const initResult = await window.electronAPI.initializeClaudeProfile(result.data.id);

        if (initResult.success) {
          await loadClaudeProfiles();
          setNewProfileName('');

          alert(
            `Authenticating "${profileName}"...\n\n` +
            `A browser window will open for you to log in with your Claude account.\n\n` +
            `The authentication will be saved automatically once complete.`
          );
        } else {
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
        await loadGlobalClaudeProfiles();
      }
    } catch (err) {
      console.error('Failed to set active profile:', err);
    }
  };

  const handleAuthenticateProfile = async (profileId: string) => {
    setAuthenticatingProfileId(profileId);
    try {
      const initResult = await window.electronAPI.initializeClaudeProfile(profileId);
      if (initResult.success) {
        alert(
          `Authenticating profile...\n\n` +
          `A browser window will open for you to log in with your Claude account.\n\n` +
          `The authentication will be saved automatically once complete.`
        );
      } else {
        alert(`Failed to start authentication: ${initResult.error || 'Please try again.'}`);
      }
    } catch (err) {
      console.error('Failed to authenticate profile:', err);
      alert('Failed to start authentication. Please try again.');
    } finally {
      setAuthenticatingProfileId(null);
    }
  };

  const toggleTokenEntry = (profileId: string) => {
    if (expandedTokenProfileId === profileId) {
      setExpandedTokenProfileId(null);
      setManualToken('');
      setManualTokenEmail('');
      setShowManualToken(false);
    } else {
      setExpandedTokenProfileId(profileId);
      setManualToken('');
      setManualTokenEmail('');
      setShowManualToken(false);
    }
  };

  const handleSaveManualToken = async (profileId: string) => {
    if (!manualToken.trim()) return;

    setSavingTokenProfileId(profileId);
    try {
      const result = await window.electronAPI.setClaudeProfileToken(
        profileId,
        manualToken.trim(),
        manualTokenEmail.trim() || undefined
      );
      if (result.success) {
        await loadClaudeProfiles();
        setExpandedTokenProfileId(null);
        setManualToken('');
        setManualTokenEmail('');
        setShowManualToken(false);
      } else {
        alert(`Failed to save token: ${result.error || 'Please try again.'}`);
      }
    } catch (err) {
      console.error('Failed to save token:', err);
      alert('Failed to save token. Please try again.');
    } finally {
      setSavingTokenProfileId(null);
    }
  };

  // Load auto-swap settings
  const loadAutoSwitchSettings = async () => {
    setIsLoadingAutoSwitch(true);
    try {
      const result = await window.electronAPI.getAutoSwitchSettings();
      if (result.success && result.data) {
        setAutoSwitchSettings(result.data);
      }
    } catch (err) {
      console.error('Failed to load auto-switch settings:', err);
    } finally {
      setIsLoadingAutoSwitch(false);
    }
  };

  // Update auto-swap settings
  const handleUpdateAutoSwitch = async (updates: Partial<ClaudeAutoSwitchSettings>) => {
    setIsLoadingAutoSwitch(true);
    try {
      const result = await window.electronAPI.updateAutoSwitchSettings(updates);
      if (result.success) {
        await loadAutoSwitchSettings();
      } else {
        alert(`Failed to update settings: ${result.error || 'Please try again.'}`);
      }
    } catch (err) {
      console.error('Failed to update auto-switch settings:', err);
      alert('Failed to update settings. Please try again.');
    } finally {
      setIsLoadingAutoSwitch(false);
    }
  };

  return (
    <SettingsSection
      title={t('integrations.title')}
      description={t('integrations.description')}
    >
      <div className="space-y-6">
        {/* Claude Accounts Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-foreground">{t('integrations.claudeAccounts')}</h4>
          </div>

          <div className="rounded-lg bg-muted/30 border border-border p-4">
            <p className="text-sm text-muted-foreground mb-4">
              {t('integrations.claudeAccountsDescription')}
            </p>

            {/* Accounts list */}
            {isLoadingProfiles ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : claudeProfiles.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center mb-4">
                <p className="text-sm text-muted-foreground">{t('integrations.noAccountsYet')}</p>
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {claudeProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className={cn(
                      "rounded-lg border transition-colors",
                      profile.id === activeProfileId
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-between p-3",
                      expandedTokenProfileId !== profile.id && "hover:bg-muted/50"
                    )}>
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
                                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{t('integrations.default')}</span>
                                )}
                                {profile.id === activeProfileId && (
                                  <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <Star className="h-3 w-3" />
                                    {t('integrations.active')}
                                  </span>
                                )}
                                {(profile.oauthToken || (profile.isDefault && profile.configDir)) ? (
                                  <span className="text-xs bg-success/20 text-success px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <Check className="h-3 w-3" />
                                    {t('integrations.authenticated')}
                                  </span>
                                ) : (
                                  <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded">
                                    {t('integrations.needsAuth')}
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
                          {/* Authenticate button - show only if NOT authenticated */}
                          {/* A profile is authenticated if: has OAuth token OR (is default AND has configDir) */}
                          {!(profile.oauthToken || (profile.isDefault && profile.configDir)) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAuthenticateProfile(profile.id)}
                              disabled={authenticatingProfileId === profile.id}
                              className="gap-1 h-7 text-xs"
                            >
                              {authenticatingProfileId === profile.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <LogIn className="h-3 w-3" />
                              )}
                              {t('integrations.authenticate')}
                            </Button>
                          ) : (
                            /* Re-authenticate button for already authenticated profiles */
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleAuthenticateProfile(profile.id)}
                              disabled={authenticatingProfileId === profile.id}
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              title="Re-authenticate profile"
                            >
                              {authenticatingProfileId === profile.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                          {profile.id !== activeProfileId && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSetActiveProfile(profile.id)}
                              className="gap-1 h-7 text-xs"
                            >
                              <Check className="h-3 w-3" />
                              {t('integrations.setActive')}
                            </Button>
                          )}
                          {/* Toggle token entry button */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleTokenEntry(profile.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title={expandedTokenProfileId === profile.id ? "Hide token entry" : "Enter token manually"}
                          >
                            {expandedTokenProfileId === profile.id ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditingProfile(profile)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Rename profile"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
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

                    {/* Expanded token entry section */}
                    {expandedTokenProfileId === profile.id && (
                      <div className="px-3 pb-3 pt-0 border-t border-border/50 mt-0">
                        <div className="bg-muted/30 rounded-lg p-3 mt-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium text-muted-foreground">
                              {t('integrations.manualTokenEntry')}
                            </Label>
                            <span className="text-xs text-muted-foreground">
                              {t('integrations.runSetupToken')}
                            </span>
                          </div>

                          <div className="space-y-2">
                            <div className="relative">
                              <Input
                                type={showManualToken ? 'text' : 'password'}
                                placeholder={t('integrations.tokenPlaceholder')}
                                value={manualToken}
                                onChange={(e) => setManualToken(e.target.value)}
                                className="pr-10 font-mono text-xs h-8"
                              />
                              <button
                                type="button"
                                onClick={() => setShowManualToken(!showManualToken)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showManualToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </button>
                            </div>

                            <Input
                              type="email"
                              placeholder={t('integrations.emailPlaceholder')}
                              value={manualTokenEmail}
                              onChange={(e) => setManualTokenEmail(e.target.value)}
                              className="text-xs h-8"
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleTokenEntry(profile.id)}
                              className="h-7 text-xs"
                            >
                              {tCommon('buttons.cancel')}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveManualToken(profile.id)}
                              disabled={!manualToken.trim() || savingTokenProfileId === profile.id}
                              className="h-7 text-xs gap-1"
                            >
                              {savingTokenProfileId === profile.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )}
                              {t('integrations.saveToken')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add new account */}
            <div className="flex items-center gap-2">
              <Input
                placeholder={t('integrations.accountNamePlaceholder')}
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
                {tCommon('buttons.add')}
              </Button>
            </div>
          </div>
        </div>

        {/* Auto-Switch Settings Section */}
        {claudeProfiles.length > 1 && (
          <div className="space-y-4 pt-6 border-t border-border">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold text-foreground">{t('integrations.autoSwitching')}</h4>
            </div>

            <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('integrations.autoSwitchingDescription')}
              </p>

              {/* Master toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">{t('integrations.enableAutoSwitching')}</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('integrations.masterSwitch')}
                  </p>
                </div>
                <Switch
                  checked={autoSwitchSettings?.enabled ?? false}
                  onCheckedChange={(enabled) => handleUpdateAutoSwitch({ enabled })}
                  disabled={isLoadingAutoSwitch}
                />
              </div>

              {autoSwitchSettings?.enabled && (
                <>
                  {/* Proactive Monitoring Section */}
                  <div className="pl-6 space-y-4 pt-2 border-l-2 border-primary/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <Activity className="h-3.5 w-3.5" />
                          {t('integrations.proactiveMonitoring')}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('integrations.proactiveDescription')}
                        </p>
                      </div>
                      <Switch
                        checked={autoSwitchSettings?.proactiveSwapEnabled ?? true}
                        onCheckedChange={(value) => handleUpdateAutoSwitch({ proactiveSwapEnabled: value })}
                        disabled={isLoadingAutoSwitch}
                      />
                    </div>

                    {autoSwitchSettings?.proactiveSwapEnabled && (
                      <>
                        {/* Check interval */}
                        <div className="space-y-2">
                          <Label className="text-sm">{t('integrations.checkUsageEvery')}</Label>
                          <select
                            className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                            value={autoSwitchSettings?.usageCheckInterval ?? 30000}
                            onChange={(e) => handleUpdateAutoSwitch({ usageCheckInterval: parseInt(e.target.value) })}
                            disabled={isLoadingAutoSwitch}
                          >
                            <option value={15000}>{t('integrations.seconds15')}</option>
                            <option value={30000}>{t('integrations.seconds30')}</option>
                            <option value={60000}>{t('integrations.minute1')}</option>
                            <option value={0}>{t('integrations.disabled')}</option>
                          </select>
                        </div>

                        {/* Session threshold */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">{t('integrations.sessionThreshold')}</Label>
                            <span className="text-sm font-mono">{autoSwitchSettings?.sessionThreshold ?? 95}%</span>
                          </div>
                          <input
                            type="range"
                            min="70"
                            max="99"
                            step="1"
                            value={autoSwitchSettings?.sessionThreshold ?? 95}
                            onChange={(e) => handleUpdateAutoSwitch({ sessionThreshold: parseInt(e.target.value) })}
                            disabled={isLoadingAutoSwitch}
                            className="w-full"
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('integrations.sessionThresholdDescription')}
                          </p>
                        </div>

                        {/* Weekly threshold */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">{t('integrations.weeklyThreshold')}</Label>
                            <span className="text-sm font-mono">{autoSwitchSettings?.weeklyThreshold ?? 99}%</span>
                          </div>
                          <input
                            type="range"
                            min="70"
                            max="99"
                            step="1"
                            value={autoSwitchSettings?.weeklyThreshold ?? 99}
                            onChange={(e) => handleUpdateAutoSwitch({ weeklyThreshold: parseInt(e.target.value) })}
                            disabled={isLoadingAutoSwitch}
                            className="w-full"
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('integrations.weeklyThresholdDescription')}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Reactive Recovery Section */}
                  <div className="pl-6 space-y-4 pt-2 border-l-2 border-orange-500/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {t('integrations.reactiveRecovery')}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('integrations.reactiveDescription')}
                        </p>
                      </div>
                      <Switch
                        checked={autoSwitchSettings?.autoSwitchOnRateLimit ?? false}
                        onCheckedChange={(value) => handleUpdateAutoSwitch({ autoSwitchOnRateLimit: value })}
                        disabled={isLoadingAutoSwitch}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* API Keys Section */}
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-foreground">{t('integrations.apiKeys')}</h4>
          </div>

          <div className="rounded-lg bg-info/10 border border-info/30 p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-info shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                {t('integrations.apiKeysInfo')}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="globalOpenAIKey" className="text-sm font-medium text-foreground">
                {t('integrations.openaiKey')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('integrations.openaiKeyDescription')}
              </p>
              <div className="relative max-w-lg">
                <Input
                  id="globalOpenAIKey"
                  type={showGlobalOpenAIKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={settings.globalOpenAIApiKey || ''}
                  onChange={(e) =>
                    onSettingsChange({ ...settings, globalOpenAIApiKey: e.target.value || undefined })
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
    </SettingsSection>
  );
}
