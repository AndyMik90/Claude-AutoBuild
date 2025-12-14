import { useEffect, useState } from 'react';
import { AlertCircle, ExternalLink, Clock, RefreshCw, User, ChevronDown, Check, Zap, Star, Plus } from 'lucide-react';
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
import { useClaudeProfileStore, loadClaudeProfiles, switchTerminalToProfile } from '../stores/claude-profile-store';

const CLAUDE_UPGRADE_URL = 'https://claude.ai/upgrade';

export function RateLimitModal() {
  const { isModalOpen, rateLimitInfo, hideRateLimitModal, clearPendingRateLimit } = useRateLimitStore();
  const { profiles, activeProfileId, isSwitching } = useClaudeProfileStore();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isAddingProfile, setIsAddingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  // Load profiles and auto-switch settings when modal opens
  useEffect(() => {
    if (isModalOpen) {
      loadClaudeProfiles();
      loadAutoSwitchSettings();

      // Pre-select the suggested profile if available
      if (rateLimitInfo?.suggestedProfileId) {
        setSelectedProfileId(rateLimitInfo.suggestedProfileId);
      }
    }
  }, [isModalOpen, rateLimitInfo?.suggestedProfileId]);

  // Reset selection when modal closes
  useEffect(() => {
    if (!isModalOpen) {
      setSelectedProfileId(null);
      setIsAddingProfile(false);
      setNewProfileName('');
    }
  }, [isModalOpen]);

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
          hideRateLimitModal();
          
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

  const handleSwitchProfile = async () => {
    if (!selectedProfileId || !rateLimitInfo?.terminalId) return;

    const success = await switchTerminalToProfile(rateLimitInfo.terminalId, selectedProfileId);
    if (success) {
      // Clear the pending rate limit since we successfully switched
      clearPendingRateLimit();
    }
  };

  // Get profiles that are not the current rate-limited one
  const currentProfileId = rateLimitInfo?.profileId || activeProfileId;
  const availableProfiles = profiles.filter(p => p.id !== currentProfileId);
  const hasMultipleProfiles = profiles.length > 1;

  const selectedProfile = selectedProfileId
    ? profiles.find(p => p.id === selectedProfileId)
    : null;

  const currentProfile = profiles.find(p => p.id === currentProfileId);
  const suggestedProfile = rateLimitInfo?.suggestedProfileId
    ? profiles.find(p => p.id === rateLimitInfo.suggestedProfileId)
    : null;

  // Check if auto-switch already happened
  const autoSwitchHappened = rateLimitInfo?.autoSwitchEnabled && suggestedProfile;

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && hideRateLimitModal()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <AlertCircle className="h-5 w-5" />
            Claude Code Usage Limit Reached
          </DialogTitle>
          <DialogDescription>
            You've reached your Claude Code usage limit for this period.
            {currentProfile && !currentProfile.isDefault && (
              <span className="text-muted-foreground"> (Profile: {currentProfile.name})</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Auto-switch notification */}
          {autoSwitchHappened && (
            <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
              <Zap className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Auto-switching to {suggestedProfile?.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Claude will restart with your other account automatically
                </p>
              </div>
            </div>
          )}

          {/* Reset time info */}
          {rateLimitInfo?.resetTime && !autoSwitchHappened && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-4">
              <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Resets {rateLimitInfo.resetTime}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your usage will be restored at this time
                </p>
              </div>
            </div>
          )}

          {/* Profile switching / Add account section - show unless auto-switch happened */}
          {!autoSwitchHappened && (
            <div className="rounded-lg border border-accent/50 bg-accent/10 p-4">
              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <User className="h-4 w-4" />
                {hasMultipleProfiles ? 'Switch Claude Account' : 'Use Another Account'}
              </h4>
              
              {hasMultipleProfiles ? (
                <>
                  <p className="text-sm text-muted-foreground mb-3">
                    {suggestedProfile ? (
                      <>Recommended: <strong>{suggestedProfile.name}</strong> has more capacity available.</>
                    ) : (
                      'You have other Claude subscriptions configured. Switch to continue working:'
                    )}
                  </p>

                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="flex-1 justify-between">
                          <span className="truncate flex items-center gap-2">
                            {selectedProfile?.name || 'Select account...'}
                            {selectedProfileId === rateLimitInfo?.suggestedProfileId && (
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
                              {profile.id === rateLimitInfo?.suggestedProfileId && (
                                <Star className="h-3 w-3 text-yellow-500" title="Recommended" />
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
                      onClick={handleSwitchProfile}
                      disabled={!selectedProfileId || isSwitching}
                      className="gap-2 shrink-0"
                    >
                      {isSwitching ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Switching...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          Switch
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
                      <Label htmlFor="auto-switch" className="text-xs text-muted-foreground cursor-pointer">
                        Auto-switch on rate limit
                      </Label>
                      <Switch
                        id="auto-switch"
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
          )}

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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={hideRateLimitModal}>
            {autoSwitchHappened ? 'Continue' : hasMultipleProfiles ? 'Close' : 'Got it'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
