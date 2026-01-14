import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Key,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
  Sparkles
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

interface ClaudeOAuthFlowProps {
  onSuccess: () => void;
  onCancel?: () => void;
}

/**
 * Claude OAuth flow component for setup wizard
 * Guides users through authenticating with Claude using claude setup-token
 */
export function ClaudeOAuthFlow({ onSuccess, onCancel }: ClaudeOAuthFlowProps) {
  const { t } = useTranslation('onboarding');
  const [status, setStatus] = useState<'ready' | 'authenticating' | 'success' | 'error'>('ready');
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | undefined>();

  // Track if we've already started auth to prevent double-execution
  const hasStartedRef = useRef(false);
  // Track the auto-advance timeout so we can cancel it on unmount/re-render
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for OAuth token detection
  useEffect(() => {
    // Clear any pending timeout from previous effect run
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }

    const unsubscribe = window.electronAPI.onTerminalOAuthToken((info) => {
      console.warn('[ClaudeOAuth] Token event received:', {
        success: info.success,
        hasEmail: !!info.email,
        profileId: info.profileId
      });

      if (info.success) {
        setEmail(info.email);
        setStatus('success');
        // Auto-advance after a short delay to show success message
        // Store the timeout ID so cleanup can cancel it if needed
        successTimeoutRef.current = setTimeout(() => {
          successTimeoutRef.current = null; // Clear ref since timeout fired
          onSuccess();
        }, 1500);
      } else {
        setError(info.message || 'Failed to save OAuth token');
        setStatus('error');
      }
    });

    return () => {
      unsubscribe?.();
      // Clear timeout on cleanup to prevent calling onSuccess after unmount
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
    };
  }, [onSuccess]);

  const handleStartAuth = async () => {
    if (hasStartedRef.current) {
      console.warn('[ClaudeOAuth] Auth already started, ignoring duplicate call');
      return;
    }
    hasStartedRef.current = true;

    console.warn('[ClaudeOAuth] Starting Claude authentication');
    setStatus('authenticating');
    setError(null);

    try {
      // Get the active profile ID
      const profilesResult = await window.electronAPI.getClaudeProfiles();

      if (!profilesResult.success || !profilesResult.data) {
        throw new Error('Failed to get Claude profiles');
      }

      const activeProfileId = profilesResult.data.activeProfileId;
      console.warn('[ClaudeOAuth] Initializing profile:', activeProfileId);

      // Initialize the profile - this opens a terminal and runs 'claude setup-token'
      const result = await window.electronAPI.initializeClaudeProfile(activeProfileId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to start authentication');
      }

      console.warn('[ClaudeOAuth] Authentication started, waiting for token...');
      // Status will be updated by the event listener when token is detected
    } catch (err) {
      console.error('[ClaudeOAuth] Authentication failed:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setStatus('error');
      hasStartedRef.current = false;
    }
  };

  const handleRetry = () => {
    hasStartedRef.current = false;
    setStatus('ready');
    setError(null);
  };

  return (
    <div className="space-y-4">
      {/* Ready to authenticate */}
      {status === 'ready' && (
        <div className="space-y-4">
          <Card className="border border-info/30 bg-info/10">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <Key className="h-6 w-6 text-info shrink-0 mt-0.5" />
                <div className="flex-1 space-y-3">
                  <h3 className="text-lg font-medium text-foreground">
                    {t('claudeOauth.title')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('claudeOauth.description')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('claudeOauth.browserFlow')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button onClick={handleStartAuth} size="lg" className="gap-2">
              <Key className="h-5 w-5" />
              {t('claudeOauth.button')}
            </Button>
          </div>
        </div>
      )}

      {/* Authenticating */}
      {status === 'authenticating' && (
        <Card className="border border-info/30 bg-info/10">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Loader2 className="h-6 w-6 animate-spin text-info shrink-0" />
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-foreground">
                    {t('claudeOauth.authenticating.title')}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('claudeOauth.authenticating.description')}
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-background/50 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-medium">{t('claudeOauth.whatsHappening.title')}</p>
                    <ol className="list-decimal list-inside space-y-1 ml-2">
                      <li>{t('claudeOauth.whatsHappening.step1')} <code className="px-1 bg-muted rounded">claude setup-token</code></li>
                      <li>{t('claudeOauth.whatsHappening.step2')}</li>
                      <li>{t('claudeOauth.whatsHappening.step3')}</li>
                      <li>{t('claudeOauth.whatsHappening.step4')}</li>
                      <li>{t('claudeOauth.whatsHappening.step5')}</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success */}
      {status === 'success' && (
        <Card className="border border-success/30 bg-success/10">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="h-6 w-6 text-success shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-medium text-success">
                  {t('claudeOauth.success.title')}
                </h3>
                <p className="text-sm text-success/80 mt-1">
                  {email ? t('claudeOauth.success.connectedAs', { email }) : t('claudeOauth.success.credentialsSaved')}
                </p>
                <div className="flex items-center gap-2 mt-3 text-xs text-success/70">
                  <Sparkles className="h-3 w-3" />
                  <span>{t('claudeOauth.success.readyToUse')}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {status === 'error' && error && (
        <div className="space-y-4">
          <Card className="border border-destructive/30 bg-destructive/10">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-destructive">
                    {t('claudeOauth.error.title')}
                  </h3>
                  <p className="text-sm text-destructive/80 mt-1">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center gap-3">
            <Button onClick={handleRetry} variant="outline">
              {t('claudeOauth.error.retry')}
            </Button>
            {onCancel && (
              <Button onClick={onCancel} variant="ghost">
                {t('claudeOauth.error.cancel')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Cancel button for ready/authenticating states */}
      {(status === 'ready' || status === 'authenticating') && onCancel && (
        <div className="flex justify-center pt-2">
          <Button onClick={onCancel} variant="ghost" size="sm">
            {t('claudeOauth.skipForNow')}
          </Button>
        </div>
      )}
    </div>
  );
}
