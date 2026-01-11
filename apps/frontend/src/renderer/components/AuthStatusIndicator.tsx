/**
 * AuthStatusIndicator - Display current authentication method in header
 *
 * Shows the active authentication method:
 * - API Profile name with Key icon when a profile is active
 * - "OAuth" with Lock icon when using OAuth authentication
 */

import { useMemo } from 'react';
import { Key, Lock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { useSettingsStore } from '../stores/settings-store';

export function AuthStatusIndicator() {
  // Subscribe to profile state from settings store
  const { profiles, activeProfileId } = useSettingsStore();

  // Compute auth status directly using useMemo to avoid unnecessary re-renders
  const authStatus = useMemo(() => {
    if (activeProfileId) {
      const activeProfile = profiles.find(p => p.id === activeProfileId);
      if (activeProfile) {
        return { type: 'profile' as const, name: activeProfile.name };
      }
      // Profile ID set but profile not found - fallback to OAuth
      return { type: 'oauth' as const, name: 'OAuth' };
    }
    return { type: 'oauth' as const, name: 'OAuth' };
  }, [activeProfileId, profiles]);

  const isOAuth = authStatus.type === 'oauth';
  const Icon = isOAuth ? Lock : Key;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-primary/10 text-primary border-primary/20 transition-all hover:opacity-80 hover:bg-primary/15"
            aria-label={`Authentication method: ${authStatus.name}`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">
              {authStatus.name}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-xs">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground font-medium">Authentication</span>
              <span className="font-semibold">{isOAuth ? 'OAuth' : 'API Profile'}</span>
            </div>
            {!isOAuth && authStatus.name && (
              <>
                <div className="h-px bg-border" />
                <div className="text-[10px] text-muted-foreground">
                  Using profile: <span className="text-foreground font-medium">{authStatus.name}</span>
                </div>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
