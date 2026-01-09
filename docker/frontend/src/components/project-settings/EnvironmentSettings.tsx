import { useState, useEffect } from 'react';
import {
  Key,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  Globe,
  Check,
  Star,
  Settings,
  Users
} from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';
import type { ProjectEnvConfig, ClaudeProfile } from '../../../shared/types';

interface EnvironmentSettingsProps {
  envConfig: ProjectEnvConfig | null;
  isLoadingEnv: boolean;
  envError: string | null;
  updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => void;

  // Claude auth state
  isCheckingClaudeAuth: boolean;
  claudeAuthStatus: 'checking' | 'authenticated' | 'not_authenticated' | 'error';
  handleClaudeSetup: () => Promise<void>;

  // Password visibility (kept for interface compatibility but not used)
  showClaudeToken: boolean;
  setShowClaudeToken: React.Dispatch<React.SetStateAction<boolean>>;

  // Collapsible section
  expanded: boolean;
  onToggle: () => void;
}

export function EnvironmentSettings({
  envConfig,
  isLoadingEnv,
  envError,
  isCheckingClaudeAuth,
  claudeAuthStatus,
  handleClaudeSetup,
  expanded,
  onToggle
}: EnvironmentSettingsProps) {
  // Load global Claude profiles to show active account
  const [claudeProfiles, setClaudeProfiles] = useState<ClaudeProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);

  useEffect(() => {
    const loadProfiles = async () => {
      setIsLoadingProfiles(true);
      try {
        const result = await window.electronAPI.getClaudeProfiles();
        if (result.success && result.data) {
          setClaudeProfiles(result.data.profiles);
          setActiveProfileId(result.data.activeProfileId);
        }
      } catch (err) {
        console.error('Failed to load Claude profiles:', err);
      } finally {
        setIsLoadingProfiles(false);
      }
    };
    loadProfiles();
  }, []);

  const activeProfile = claudeProfiles.find(p => p.id === activeProfileId);
  const hasAuthenticatedProfiles = claudeProfiles.some(p => p.oauthToken);

  return (
    <section className="space-y-3">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between text-sm font-semibold text-foreground hover:text-foreground/80"
      >
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4" />
          Claude Authentication
          {claudeAuthStatus === 'authenticated' && (
            <span className="px-2 py-0.5 text-xs bg-success/10 text-success rounded-full">
              Connected
            </span>
          )}
          {claudeAuthStatus === 'not_authenticated' && (
            <span className="px-2 py-0.5 text-xs bg-warning/10 text-warning rounded-full">
              Not Connected
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {expanded && (
        <div className="space-y-4 pl-6 pt-2">
          {isLoadingEnv || isLoadingProfiles ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading configuration...
            </div>
          ) : envConfig ? (
            <>
              {/* Inheritance Info */}
              <div className="rounded-lg border border-info/30 bg-info/5 p-3">
                <div className="flex items-start gap-3">
                  <Globe className="h-5 w-5 text-info mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      Using Global Authentication
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Claude authentication is managed in{' '}
                      <span className="font-medium text-info">Settings → Integrations</span>.
                      All projects share the same Claude accounts.
                    </p>
                  </div>
                </div>
              </div>

              {/* Active Account Display */}
              {hasAuthenticatedProfiles ? (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm font-medium text-foreground">Active Account</Label>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleClaudeSetup}
                      disabled={isCheckingClaudeAuth}
                    >
                      {isCheckingClaudeAuth ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Re-authenticate
                        </>
                      )}
                    </Button>
                  </div>
                  
                  {activeProfile ? (
                    <div className="mt-3 flex items-center gap-3">
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0",
                        "bg-primary text-primary-foreground"
                      )}>
                        {activeProfile.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{activeProfile.name}</span>
                          <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Star className="h-3 w-3" />
                            Active
                          </span>
                          {(activeProfile.oauthToken || (activeProfile.isDefault && activeProfile.configDir)) ? (
                            <span className="text-xs bg-success/20 text-success px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              Authenticated
                            </span>
                          ) : (
                            <span className="text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded">
                              Needs Auth
                            </span>
                          )}
                        </div>
                        {activeProfile.email && (
                          <span className="text-xs text-muted-foreground">{activeProfile.email}</span>
                        )}
                      </div>
                    </div>
                  ) : claudeProfiles.length > 0 ? (
                    <p className="text-xs text-warning mt-2">
                      No active account selected. Go to Settings → Integrations to select an account.
                    </p>
                  ) : null}

                  {/* Show other authenticated accounts */}
                  {claudeProfiles.filter(p => p.id !== activeProfileId && p.oauthToken).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <p className="text-xs text-muted-foreground mb-2">
                        Other authenticated accounts (used for rate limit fallback):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {claudeProfiles
                          .filter(p => p.id !== activeProfileId && p.oauthToken)
                          .map(profile => (
                            <div
                              key={profile.id}
                              className="flex items-center gap-1.5 text-xs bg-muted px-2 py-1 rounded"
                            >
                              <div className="h-4 w-4 rounded-full bg-muted-foreground/30 flex items-center justify-center text-[10px]">
                                {profile.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-muted-foreground">{profile.name}</span>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* No accounts configured */
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                  <div className="flex flex-col items-center text-center">
                    <Users className="h-8 w-8 text-warning mb-2" />
                    <p className="text-sm font-medium text-foreground">No Claude Accounts Configured</p>
                    <p className="text-xs text-muted-foreground mt-1 mb-3">
                      Add a Claude account in the global settings to use Auto-Build.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        // Emit event to open app settings at Integrations
                        window.dispatchEvent(new CustomEvent('open-app-settings', { detail: 'integrations' }));
                      }}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Open Integrations Settings
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : envError ? (
            <p className="text-sm text-destructive">{envError}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
