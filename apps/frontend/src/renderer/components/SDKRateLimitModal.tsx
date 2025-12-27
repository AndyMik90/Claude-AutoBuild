import { useEffect, useState } from 'react';
import { AlertCircle, ExternalLink, Clock, RefreshCw, User, ChevronDown, Check, Star, Zap, FileText, ListTodo, Map, Lightbulb, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { useRateLimitStore } from '../stores/rate-limit-store';
import { useClaudeProfileStore, loadClaudeProfiles } from '../stores/claude-profile-store';
import type { SDKRateLimitInfo } from '../../shared/types';

const CLAUDE_UPGRADE_URL = 'https://claude.ai/upgrade';

/**
 * Get a human-readable name for the source
 */
function getSourceName(source: SDKRateLimitInfo['source']): string {
  switch (source) {
    case 'changelog': return 'Changelog Generation';
    case 'task': return 'Task Execution';
    case 'roadmap': return 'Roadmap Generation';
    case 'ideation': return 'Ideation';
    case 'title-generator': return 'Title Generation';
    default: return 'Claude Operation';
  }
}

/**
 * Get an icon for the source
 */
function getSourceIcon(source: SDKRateLimitInfo['source']) {
  switch (source) {
    case 'changelog': return FileText;
    case 'task': return ListTodo;
    case 'roadmap': return Map;
    case 'ideation': return Lightbulb;
    default: return AlertCircle;
  }
}

export function SDKRateLimitModal() {
  const { isSDKModalOpen, sdkRateLimitInfo, hideSDKRateLimitModal, clearPendingRateLimit } = useRateLimitStore();
  const { profiles, isSwitching, setSwitching } = useClaudeProfileStore();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isAddingProfile, setIsAddingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [swapInfo, setSwapInfo] = useState<{
    wasAutoSwapped: boolean;
    swapReason?: 'proactive' | 'reactive';
    swappedFrom?: string;
    swappedTo?: string;
  } | null>(null);

  // Load profiles and auto-switch settings when modal opens
  useEffect(() => {
    if (isSDKModalOpen) {
      loadClaudeProfiles();
      loadAutoSwitchSettings();

      // Pre-select the suggested profile if available
      if (sdkRateLimitInfo?.suggestedProfile?.id) {
        setSelectedProfileId(sdkRateLimitInfo.suggestedProfile.id);
      }

      // Set swap info if auto-swap occurred
      if (sdkRateLimitInfo) {
        setSwapInfo({
          wasAutoSwapped: sdkRateLimitInfo.wasAutoSwapped ?? false,
          swapReason: sdkRateLimitInfo.swapReason,
          swappedFrom: profiles.find(p => p.id === sdkRateLimitInfo.profileId)?.name,
          swappedTo: sdkRateLimitInfo.swappedToProfile?.name
        });
      }
    }
  }, [isSDKModalOpen, sdkRateLimitInfo, profiles]);

  // Reset selection when modal closes
  useEffect(() => {
    if (!isSDKModalOpen) {
      setSelectedProfileId(null);
      setIsRetrying(false);
      setIsAddingProfile(false);
      setNewProfileName('');
    }
  }, [isSDKModalOpen]);

  const loadAutoSwitchSettings = async () => {
    try {
      const result = await window.electronAPI.getAutoSwitchSettings();
      if (result.success && result.data) {
        setAutoSwitchEnabled(result.data.autoSwitchOnRateLimit);
      }
    } catch (err) {
      console.error('Failed to load auto-switch settings:', err);
    }
  };

  const handleAutoSwitchToggle = async (enabled: boolean) => {
    setIsLoadingSettings(true);
    try {
      await window.electronAPI.updateAutoSwitchSettings({
        enabled: enabled,
        autoSwitchOnRateLimit: enabled
      });
      setAutoSwitchEnabled(enabled);
    } catch (err) {
      console.error('Failed to update auto-switch settings:', err);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const handleUpgrade = () => {
    window.open(CLAUDE_UPGRADE_URL, '_blank');
  };

  const handleAddProfile = async () => {
    if (!newProfileName.trim()) return;

    setIsAddingProfile(true);
    try {
      // Create a new profile - the backend will set the proper configDir
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
          loadClaudeProfiles();
          setNewProfileName('');
          // Close the modal so user can see the terminal
          hideSDKRateLimitModal();

          // Alert the user about the terminal
          alert(
            `A terminal has been opened to authenticate "${profileName}".\n\n` +
            `Steps to complete:\n` +
            `1. Check the "Agent Terminals" section in the sidebar\n` +
            `2. Complete the OAuth login in your browser\n` +
            `3. The token will be saved automatically\n\n` +
            `Once done, return here and the account will be available.`
          );
        } else {
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

  const handleRetryWithProfile = async () => {
    if (!selectedProfileId || !sdkRateLimitInfo?.projectId) return;

    setIsRetrying(true);
    setSwitching(true);

    try {
      // First, set the active profile
      await window.electronAPI.setActiveClaudeProfile(selectedProfileId);

      // Then retry the operation
      const result = await window.electronAPI.retryWithProfile({
        source: sdkRateLimitInfo.source,
        projectId: sdkRateLimitInfo.projectId,
        taskId: sdkRateLimitInfo.taskId,
        profileId: selectedProfileId
      });

      if (result.success) {
        // Clear the pending rate limit since we successfully switched
        clearPendingRateLimit();
      }
    } catch (err) {
      console.error('Failed to retry with profile:', err);
    } finally {
      setIsRetrying(false);
      setSwitching(false);
    }
  };

  if (!sdkRateLimitInfo) return null;

  // Get profiles that are not the current rate-limited one
  const currentProfileId = sdkRateLimitInfo.profileId;
  const availableProfiles = profiles.filter(p => p.id !== currentProfileId);
  const hasMultipleProfiles = profiles.length > 1;

  const selectedProfile = selectedProfileId
    ? profiles.find(p => p.id === selectedProfileId)
    : null;

  const currentProfile = profiles.find(p => p.id === currentProfileId);
  const suggestedProfile = sdkRateLimitInfo.suggestedProfile
    ? profiles.find(p => p.id === sdkRateLimitInfo.suggestedProfile?.id)
    : null;

  const SourceIcon = getSourceIcon(sdkRateLimitInfo.source);
  const sourceName = getSourceName(sdkRateLimitInfo.source);

  return (
    <Dialog open={isSDKModalOpen} onOpenChange={(open) => !open && hideSDKRateLimitModal()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <AlertCircle className="h-5 w-5" />
            Claude Code Rate Limit
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <SourceIcon className="h-4 w-4" />
            {sourceName} was interrupted due to usage limits.
            {currentProfile && (
              <span className="text-muted-foreground"> (Profile: {currentProfile.name})</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Swap notification info */}
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
            {swapInfo?.wasAutoSwapped ? (
              <>
                <p className="font-medium mb-1">
                  {swapInfo.swapReason === 'proactive' ? '✓ Proactive Swap' : '⚡ Reactive Swap'}
                </p>
                <p>
                  {swapInfo.swapReason === 'proactive'
                    ? `Automatically switched from ${swapInfo.swappedFrom} to ${swapInfo.swappedTo} before hitting rate limit.`
                    : `Rate limit hit on ${swapInfo.swappedFrom}. Automatically switched to ${swapInfo.swappedTo} and restarted.`
                  }
                </p>
                <p className="mt-2 text-[10px]">
                  Your work continued without interruption.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium mb-1">Rate limit reached</p>
                <p>
                  The operation was stopped because {currentProfile?.name || 'your account'} reached its usage limit.
                  {hasMultipleProfiles
                    ? ' Switch to another account below to continue.'
                    : ' Add another Claude account to continue working.'}
                </p>
              </>
            )}
          </div>

          {/* Upgrade button */}
          <Button
            variant="default"
            size="sm"
            className="gap-2 w-full"
            onClick={() => window.open(CLAUDE_UPGRADE_URL, '_blank')}
          >
            <Zap className="h-4 w-4" />
            Upgrade to Pro for Higher Limits
          </Button>

          {/* Reset time info */}
          {sdkRateLimitInfo.resetTime && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-4">
              <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Resets {sdkRateLimitInfo.resetTime}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sdkRateLimitInfo.limitType === 'weekly'
                    ? 'Weekly limit - resets in about a week'
                    : 'Session limit - resets in a few hours'}
                </p>
              </div>
            </div>
          )}

          {/* Profile switching / Add account section */}
          <div className="rounded-lg border border-accent/50 bg-accent/10 p-4">
            <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <User className="h-4 w-4" />
              {hasMultipleProfiles ? 'Switch Account & Retry' : 'Use Another Account'}
            </h4>

            {hasMultipleProfiles ? (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  {suggestedProfile ? (
                    <>Recommended: <strong>{suggestedProfile.name}</strong> has more capacity available.</>
                  ) : (
                    'Switch to another Claude account and retry the operation:'
                  )}
                </p>

                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="flex-1 justify-between">
                        <span className="truncate flex items-center gap-2">
                          {selectedProfile?.name || 'Select account...'}
                          {selectedProfileId === sdkRateLimitInfo.suggestedProfile?.id && (
                            <Star className="h-3 w-3 text-yellow-500" />
                          )}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[220px] bg-popover border border-border shadow-lg">
                      {availableProfiles.map((profile) => (
                        <DropdownMenuItem
                          key={profile.id}
                          onClick={() => setSelectedProfileId(profile.id)}
                          className="flex items-center justify-between"
                        >
                          <span className="truncate flex items-center gap-2">
                            {profile.name}
                            {profile.id === sdkRateLimitInfo.suggestedProfile?.id && (
                              <Star className="h-3 w-3 text-yellow-500" aria-label="Recommended" />
                            )}
                          </span>
                          {selectedProfileId === profile.id && (
                            <Check className="h-4 w-4 shrink-0" />
                          )}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          // Focus the add account input
                          const input = document.querySelector('input[placeholder*="Account name"]') as HTMLInputElement;
                          if (input) input.focus();
                        }}
                        className="flex items-center gap-2 text-muted-foreground"
                      >
                        <Plus className="h-4 w-4" />
                        Add new account...
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleRetryWithProfile}
                    disabled={!selectedProfileId || isRetrying || isSwitching}
                    className="gap-2 shrink-0"
                  >
                    {isRetrying || isSwitching ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        Retry
                      </>
                    )}
                  </Button>
                </div>

                {selectedProfile?.description && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {selectedProfile.description}
                  </p>
                )}

                {/* Auto-switch toggle */}
                {availableProfiles.length > 0 && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
                    <Label htmlFor="sdk-auto-switch" className="text-xs text-muted-foreground cursor-pointer">
                      Auto-switch & retry on rate limit
                    </Label>
                    <Switch
                      id="sdk-auto-switch"
                      checked={autoSwitchEnabled}
                      onCheckedChange={handleAutoSwitchToggle}
                      disabled={isLoadingSettings}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground mb-3">
                Add another Claude subscription to automatically switch when you hit rate limits.
              </p>
            )}

            {/* Add new account section */}
            <div className={hasMultipleProfiles ? "mt-4 pt-3 border-t border-border/50" : ""}>
              <p className="text-xs text-muted-foreground mb-2">
                {hasMultipleProfiles ? 'Add another account:' : 'Connect a Claude account:'}
              </p>
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
                  variant="outline"
                  size="sm"
                  onClick={handleAddProfile}
                  disabled={!newProfileName.trim() || isAddingProfile}
                  className="gap-1 shrink-0"
                >
                  {isAddingProfile ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                This will open Claude login to authenticate the new account.
              </p>
            </div>
          </div>

          {/* Upgrade prompt */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <h4 className="text-sm font-medium text-foreground mb-2">
              Upgrade for more usage
            </h4>
            <p className="text-sm text-muted-foreground mb-3">
              Upgrade your Claude subscription for higher usage limits.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleUpgrade}
            >
              <ExternalLink className="h-4 w-4" />
              Upgrade Subscription
            </Button>
          </div>

          {/* Info about what was interrupted */}
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
            <p className="font-medium mb-1">What happened:</p>
            <p>
              The {sourceName.toLowerCase()} operation was stopped because your Claude account
              ({currentProfile?.name || 'Default'}) reached its usage limit.
              {hasMultipleProfiles
                ? ' You can switch to another account and retry, or add more accounts above.'
                : ' Add another Claude account above to continue working, or wait for the limit to reset.'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={hideSDKRateLimitModal}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
