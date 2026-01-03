import { Key, ExternalLink, Loader2, Globe } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import { StatusBadge } from './StatusBadge';
import { PasswordInput } from './PasswordInput';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import type { ProjectEnvConfig } from '../../../shared/types';

interface ClaudeAuthSectionProps {
  isExpanded: boolean;
  onToggle: () => void;
  envConfig: ProjectEnvConfig | null;
  isLoadingEnv: boolean;
  envError: string | null;
  isCheckingAuth: boolean;
  authStatus: 'checking' | 'authenticated' | 'not_authenticated' | 'error';
  onClaudeSetup: () => void;
  onUpdateConfig: (updates: Partial<ProjectEnvConfig>) => void;
}

export function ClaudeAuthSection({
  isExpanded,
  onToggle,
  envConfig,
  isLoadingEnv,
  envError,
  isCheckingAuth,
  authStatus,
  onClaudeSetup,
  onUpdateConfig,
}: ClaudeAuthSectionProps) {
  const badge = authStatus === 'authenticated' ? (
    <StatusBadge status="success" label="Connected" />
  ) : authStatus === 'not_authenticated' ? (
    <StatusBadge status="warning" label="Not Connected" />
  ) : null;

  return (
    <CollapsibleSection
      title="Claude Authentication"
      icon={<Key className="h-4 w-4" />}
      isExpanded={isExpanded}
      onToggle={onToggle}
      badge={badge}
    >
      {isLoadingEnv ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading configuration...
        </div>
      ) : envConfig ? (
        <>
          {/* Claude CLI Status */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Claude CLI</p>
                <p className="text-xs text-muted-foreground">
                  {isCheckingAuth ? 'Checking...' :
                    authStatus === 'authenticated' ? 'Authenticated via OAuth' :
                    authStatus === 'not_authenticated' ? 'Not authenticated' :
                    'Status unknown'}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={onClaudeSetup}
                disabled={isCheckingAuth}
              >
                {isCheckingAuth ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {authStatus === 'authenticated' ? 'Re-authenticate' : 'Setup OAuth'}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Manual OAuth Token */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-foreground">
                OAuth Token {envConfig.claudeTokenIsGlobal ? '(Override)' : ''}
              </Label>
              {envConfig.claudeTokenIsGlobal && (
                <span className="flex items-center gap-1 text-xs text-info">
                  <Globe className="h-3 w-3" />
                  Using global token
                </span>
              )}
            </div>
            {envConfig.claudeTokenIsGlobal ? (
              <p className="text-xs text-muted-foreground">
                Using token from App Settings. Enter a project-specific token below to override.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Paste a token from <code className="px-1 bg-muted rounded">claude setup-token</code>
              </p>
            )}
            <PasswordInput
              value={envConfig.claudeTokenIsGlobal ? '' : (envConfig.claudeOAuthToken || '')}
              onChange={(value) => onUpdateConfig({
                claudeOAuthToken: value || undefined,
              })}
              placeholder={envConfig.claudeTokenIsGlobal ? 'Enter to override global token...' : 'your-oauth-token-here'}
            />
          </div>
        </>
      ) : envError ? (
        <p className="text-sm text-destructive">{envError}</p>
      ) : null}
    </CollapsibleSection>
  );
}
