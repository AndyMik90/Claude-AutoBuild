import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
  ExternalLink,
  Terminal,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { useTranslation } from 'react-i18next';

// GitLab logo component
function GitLabIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .41.29l2.46 7.56a6.87 6.87 0 0 1 5.4 0L15.56 2.3a.43.43 0 0 1 .41-.29.42.42 0 0 1 .41.25l2.44 7.52 1.22 3.78a.84.84 0 0 1-.3.94l.31.24z" />
    </svg>
  );
}

interface GitLabOAuthFlowProps {
  instanceUrl?: string;
  onSuccess: (token: string, username?: string) => void;
  onCancel?: () => void;
}

// Debug logging helper
const DEBUG = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';

function debugLog(message: string, data?: unknown) {
  if (DEBUG) {
    if (data !== undefined) {
      console.warn(`[GitLabOAuth] ${message}`, data);
    } else {
      console.warn(`[GitLabOAuth] ${message}`);
    }
  }
}

// Authentication timeout (5 minutes)
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * GitLab OAuth flow component using glab CLI
 * Guides users through authenticating with GitLab using the glab CLI
 */
export function GitLabOAuthFlow({ instanceUrl, onSuccess, onCancel }: GitLabOAuthFlowProps) {
  const { t } = useTranslation('dialogs');
  const [status, setStatus] = useState<'checking' | 'need-install' | 'need-auth' | 'authenticating' | 'success' | 'error'>('checking');
  const [error, setError] = useState<string | null>(null);
  const [_cliInstalled, setCliInstalled] = useState(false);
  const [cliVersion, setCliVersion] = useState<string | undefined>();
  const [username, setUsername] = useState<string | undefined>();

  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [browserOpened, setBrowserOpened] = useState<boolean>(false);
  const [urlCopied, setUrlCopied] = useState<boolean>(false);
  const [isTimeout, setIsTimeout] = useState<boolean>(false);

  const authTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasCheckedRef = useRef(false);

  const clearAuthTimeout = useCallback(() => {
    if (authTimeoutRef.current) {
      debugLog('Clearing auth timeout');
      clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (urlCopyTimeoutRef.current) {
        clearTimeout(urlCopyTimeoutRef.current);
      }
    };
  }, []);

  const handleAuthTimeout = useCallback(() => {
    debugLog('Authentication timeout triggered');
    setIsTimeout(true);
    setError('Authentication timed out. Please try again.');
    setStatus('error');
    authTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    if (hasCheckedRef.current) {
      return;
    }
    hasCheckedRef.current = true;
    checkGitLabStatus();

    return () => {
      clearAuthTimeout();
    };
  }, [clearAuthTimeout]);

  const checkGitLabStatus = async () => {
    debugLog('checkGitLabStatus() called');
    setStatus('checking');
    setError(null);

    try {
      // Check if glab CLI is installed
      const cliResult = await window.electronAPI.checkGitLabCli();
      debugLog('checkGitLabCli result:', cliResult);

      if (!cliResult.success) {
        setError(cliResult.error || 'Failed to check GitLab CLI');
        setStatus('error');
        return;
      }

      if (!cliResult.data?.installed) {
        setStatus('need-install');
        setCliInstalled(false);
        return;
      }

      setCliInstalled(true);
      setCliVersion(cliResult.data.version);
      debugLog('GitLab CLI installed, version:', cliResult.data.version);

      // Check if already authenticated
      const authResult = await window.electronAPI.checkGitLabAuth(instanceUrl);
      debugLog('checkGitLabAuth result:', authResult);

      if (authResult.success && authResult.data?.authenticated) {
        debugLog('Already authenticated as:', authResult.data.username);
        setUsername(authResult.data.username);
        await fetchAndNotifyToken();
      } else {
        setStatus('need-auth');
      }
    } catch (err) {
      debugLog('Error in checkGitLabStatus:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  const fetchAndNotifyToken = async () => {
    debugLog('fetchAndNotifyToken() called');
    try {
      const tokenResult = await window.electronAPI.getGitLabToken(instanceUrl);
      debugLog('getGitLabToken result:', {
        success: tokenResult.success,
        hasToken: !!tokenResult.data?.token,
      });

      if (tokenResult.success && tokenResult.data?.token) {
        setStatus('success');
        onSuccess(tokenResult.data.token, username);
      } else {
        setError(tokenResult.error || 'Failed to get token');
        setStatus('error');
      }
    } catch (err) {
      debugLog('Error in fetchAndNotifyToken:', err);
      setError(err instanceof Error ? err.message : 'Failed to get token');
      setStatus('error');
    }
  };

  const handleStartAuth = async () => {
    debugLog('handleStartAuth() called');
    setStatus('authenticating');
    setError(null);

    setAuthUrl(null);
    setBrowserOpened(false);
    setUrlCopied(false);
    setIsTimeout(false);

    clearAuthTimeout();
    authTimeoutRef.current = setTimeout(handleAuthTimeout, AUTH_TIMEOUT_MS);

    try {
      const result = await window.electronAPI.startGitLabAuth(instanceUrl);
      debugLog('startGitLabAuth result:', result);

      clearAuthTimeout();

      if (result.success) {
        // Type assertion needed due to type mismatch in preload API
        const data = result.data as { deviceCode?: string; verificationUrl?: string; userCode?: string } | undefined;
        setAuthUrl(data?.verificationUrl || null);
        setBrowserOpened(true);

        // Poll for auth completion
        pollForAuth();
      } else {
        setError(result.error || 'Authentication failed');
        setStatus('error');
      }
    } catch (err) {
      clearAuthTimeout();
      debugLog('Error in handleStartAuth:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setStatus('error');
    }
  };

  const pollForAuth = async () => {
    debugLog('pollForAuth() called');
    const maxAttempts = 60; // 5 minutes (60 * 5 seconds)
    let attempts = 0;

    const poll = async () => {
      attempts++;

      if (attempts > maxAttempts) {
        debugLog('Polling timeout after max attempts');
        handleAuthTimeout();
        return;
      }

      try {
        const authResult = await window.electronAPI.checkGitLabAuth(instanceUrl);
        if (authResult.success && authResult.data?.authenticated) {
          debugLog('Authentication successful!');
          setUsername(authResult.data.username);
          await fetchAndNotifyToken();
          return;
        }
      } catch (err) {
        debugLog('Error polling auth status:', err);
      }

      // Poll again after 5 seconds
      setTimeout(poll, 5000);
    };

    poll();
  };

  const handleRetry = () => {
    setError(null);
    setIsTimeout(false);
    checkGitLabStatus();
  };

  const handleOpenGlabInstall = () => {
    window.open('https://gitlab.com/gitlab-org/cli', '_blank');
  };

  const handleCopyAuthUrl = async () => {
    if (authUrl) {
      try {
        await navigator.clipboard.writeText(authUrl);
        setUrlCopied(true);
        if (urlCopyTimeoutRef.current) {
          clearTimeout(urlCopyTimeoutRef.current);
        }
        urlCopyTimeoutRef.current = setTimeout(() => setUrlCopied(false), 2000);
      } catch (err) {
        debugLog('Failed to copy auth URL:', err);
      }
    }
  };

  const handleOpenAuthUrl = () => {
    if (authUrl) {
      window.open(authUrl, '_blank');
    }
  };

  return (
    <div className="space-y-4">
      {/* Checking status */}
      {status === 'checking' && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Need to install glab CLI */}
      {status === 'need-install' && (
        <div className="space-y-4">
          <Card className="border border-warning/30 bg-warning/10">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <Terminal className="h-6 w-6 text-warning shrink-0 mt-0.5" />
                <div className="flex-1 space-y-3">
                  <h3 className="text-lg font-medium text-foreground">
                    {t('remoteSetup.auth.gitlab.cliRequired')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('remoteSetup.auth.gitlab.cliRequiredDescription')}
                  </p>
                  <div className="flex gap-3">
                    <Button onClick={handleOpenGlabInstall} className="gap-2">
                      <ExternalLink className="h-4 w-4" />
                      {t('remoteSetup.auth.gitlab.installButton')}
                    </Button>
                    <Button variant="outline" onClick={handleRetry}>
                      {t('remoteSetup.auth.gitlab.installedButton')}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-info/30 bg-info/10">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-info shrink-0 mt-0.5" />
                <div className="flex-1 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-2">{t('remoteSetup.auth.gitlab.installInstructions')}:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>macOS: <code className="px-1.5 py-0.5 bg-muted rounded font-mono text-xs">brew install glab</code></li>
                    <li>Linux: Visit <a href="https://gitlab.com/gitlab-org/cli" target="_blank" rel="noopener noreferrer" className="text-info hover:underline">gitlab.com/gitlab-org/cli</a></li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Need authentication */}
      {status === 'need-auth' && (
        <div className="space-y-4">
          <Card className="border border-info/30 bg-info/10">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <GitLabIcon className="h-6 w-6 text-info shrink-0 mt-0.5" />
                <div className="flex-1 space-y-3">
                  <h3 className="text-lg font-medium text-foreground">
                    {t('remoteSetup.auth.gitlab.title')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('remoteSetup.auth.gitlab.description')}
                  </p>
                  {cliVersion && (
                    <p className="text-xs text-muted-foreground">
                      {t('remoteSetup.auth.gitlab.cliVersion', { version: cliVersion })}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button onClick={handleStartAuth} size="lg" className="gap-2">
              <GitLabIcon className="h-5 w-5" />
              {t('remoteSetup.auth.gitlab.authenticateButton')}
            </Button>
          </div>
        </div>
      )}

      {/* Authenticating */}
      {status === 'authenticating' && (
        <div className="space-y-4">
          <Card className="border border-info/30 bg-info/10">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <Loader2 className="h-6 w-6 animate-spin text-info shrink-0" />
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-foreground">
                    {t('remoteSetup.auth.gitlab.authenticating')}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {browserOpened
                      ? t('remoteSetup.auth.gitlab.authenticatingBrowser')
                      : t('remoteSetup.auth.gitlab.authenticatingWaiting')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Auth URL Display */}
          {authUrl && (
            <Card className="border border-primary/30 bg-primary/5">
              <CardContent className="p-6">
                <div className="text-center space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      {t('remoteSetup.auth.gitlab.deviceCodeHelp')}
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <code className="text-sm font-mono text-foreground px-3 py-2 bg-primary/10 rounded-lg break-all">
                        {authUrl}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyAuthUrl}
                        className="shrink-0"
                      >
                        {urlCopied ? (
                          <>
                            <Check className="h-4 w-4 mr-1 text-success" />
                            {t('remoteSetup.auth.gitlab.copied')}
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-1" />
                            {t('remoteSetup.auth.gitlab.copy')}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground space-y-2">
                    <p>
                      {t('remoteSetup.auth.gitlab.deviceCodeHelp')}
                    </p>
                    <Button
                      variant="link"
                      onClick={handleOpenAuthUrl}
                      className="text-info hover:text-info/80 p-0 h-auto gap-1"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t('remoteSetup.auth.gitlab.openAuthUrl')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Success */}
      {status === 'success' && (
        <Card className="border border-success/30 bg-success/10">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="h-6 w-6 text-success shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-medium text-foreground">
                  {username
                    ? t('remoteSetup.auth.gitlab.success', { username })
                    : t('remoteSetup.auth.gitlab.connectedDefault')}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {username
                    ? t('remoteSetup.auth.gitlab.connectedAs', { username })
                    : t('remoteSetup.auth.gitlab.connectedDefault')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {status === 'error' && (
        <Card className="border border-destructive/30 bg-destructive/10">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <AlertCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-foreground">
                    {t('remoteSetup.auth.gitlab.failed')}
                  </h3>
                  {error && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {error}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                {isTimeout ? (
                  <Button onClick={handleStartAuth}>
                    {t('remoteSetup.auth.gitlab.retry')}
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleRetry}>
                      {t('remoteSetup.auth.gitlab.retry')}
                    </Button>
                    {onCancel && (
                      <Button variant="outline" onClick={onCancel}>
                        {t('remoteSetup.auth.gitlab.cancel')}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
