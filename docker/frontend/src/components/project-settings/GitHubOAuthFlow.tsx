import { useState, useEffect, useRef } from 'react';
import {
  Github,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
  ExternalLink,
  Terminal
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

interface GitHubOAuthFlowProps {
  onSuccess: (token: string, username?: string) => void;
  onCancel?: () => void;
}

// Debug logging helper - logs when DEBUG env var is set or in development
const DEBUG = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';

function debugLog(message: string, data?: unknown) {
  if (DEBUG) {
    if (data !== undefined) {
      console.warn(`[GitHubOAuth] ${message}`, data);
    } else {
      console.warn(`[GitHubOAuth] ${message}`);
    }
  }
}

/**
 * GitHub OAuth flow component using gh CLI
 * Guides users through authenticating with GitHub using the gh CLI
 */
export function GitHubOAuthFlow({ onSuccess, onCancel }: GitHubOAuthFlowProps) {
  const [status, setStatus] = useState<'checking' | 'need-install' | 'need-auth' | 'authenticating' | 'success' | 'error'>('checking');
  const [error, setError] = useState<string | null>(null);
  const [_cliInstalled, setCliInstalled] = useState(false);
  const [cliVersion, setCliVersion] = useState<string | undefined>();
  const [username, setUsername] = useState<string | undefined>();

  // Check gh CLI installation and authentication status on mount
  // Use a ref to prevent double-execution in React Strict Mode
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (hasCheckedRef.current) {
      debugLog('Skipping duplicate check (Strict Mode)');
      return;
    }
    hasCheckedRef.current = true;
    debugLog('Component mounted, checking GitHub status...');
    checkGitHubStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only run once on mount, checkGitHubStatus is intentionally excluded
  }, []);

  const checkGitHubStatus = async () => {
    debugLog('checkGitHubStatus() called');
    setStatus('checking');
    setError(null);

    try {
      // Check if gh CLI is installed
      debugLog('Calling checkGitHubCli...');
      const cliResult = await window.electronAPI.checkGitHubCli();
      debugLog('checkGitHubCli result:', cliResult);

      if (!cliResult.success) {
        debugLog('checkGitHubCli failed:', cliResult.error);
        setError(cliResult.error || 'Failed to check GitHub CLI');
        setStatus('error');
        return;
      }

      if (!cliResult.data?.installed) {
        debugLog('GitHub CLI not installed');
        setStatus('need-install');
        setCliInstalled(false);
        return;
      }

      setCliInstalled(true);
      setCliVersion(cliResult.data.version);
      debugLog('GitHub CLI installed, version:', cliResult.data.version);

      // Check if already authenticated
      debugLog('Calling checkGitHubAuth...');
      const authResult = await window.electronAPI.checkGitHubAuth();
      debugLog('checkGitHubAuth result:', authResult);

      if (authResult.success && authResult.data?.authenticated) {
        debugLog('Already authenticated as:', authResult.data.username);
        setUsername(authResult.data.username);
        // Get the token and notify parent
        await fetchAndNotifyToken();
      } else {
        debugLog('Not authenticated, showing auth prompt');
        setStatus('need-auth');
      }
    } catch (err) {
      debugLog('Error in checkGitHubStatus:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  const fetchAndNotifyToken = async () => {
    debugLog('fetchAndNotifyToken() called');
    try {
      debugLog('Calling getGitHubToken...');
      const tokenResult = await window.electronAPI.getGitHubToken();
      debugLog('getGitHubToken result:', {
        success: tokenResult.success,
        hasToken: !!tokenResult.data?.token,
        tokenLength: tokenResult.data?.token?.length,
        error: tokenResult.error
      });

      if (tokenResult.success && tokenResult.data?.token) {
        debugLog('Token retrieved successfully, calling onSuccess with username:', username);
        setStatus('success');
        onSuccess(tokenResult.data.token, username);
      } else {
        debugLog('Failed to get token:', tokenResult.error);
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

    try {
      debugLog('Calling startGitHubAuth...');
      const result = await window.electronAPI.startGitHubAuth();
      debugLog('startGitHubAuth result:', result);

      if (result.success && result.data?.success) {
        debugLog('Auth successful, fetching token...');
        // Fetch the token and notify parent
        await fetchAndNotifyToken();
      } else {
        debugLog('Auth failed:', result.error);
        setError(result.error || 'Authentication failed');
        setStatus('error');
      }
    } catch (err) {
      debugLog('Error in handleStartAuth:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setStatus('error');
    }
  };

  const handleOpenGhInstall = () => {
    debugLog('Opening gh CLI install page');
    window.open('https://cli.github.com/', '_blank');
  };

  const handleRetry = () => {
    debugLog('Retry clicked');
    checkGitHubStatus();
  };

  debugLog('Rendering with status:', status);

  return (
    <div className="space-y-4">
      {/* Checking status */}
      {status === 'checking' && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Need to install gh CLI */}
      {status === 'need-install' && (
        <div className="space-y-4">
          <Card className="border border-warning/30 bg-warning/10">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <Terminal className="h-6 w-6 text-warning shrink-0 mt-0.5" />
                <div className="flex-1 space-y-3">
                  <h3 className="text-lg font-medium text-foreground">
                    GitHub CLI Required
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    The GitHub CLI (gh) is required for OAuth authentication. This provides a secure
                    way to authenticate without manually creating tokens.
                  </p>
                  <div className="flex gap-3">
                    <Button onClick={handleOpenGhInstall} className="gap-2">
                      <ExternalLink className="h-4 w-4" />
                      Install GitHub CLI
                    </Button>
                    <Button variant="outline" onClick={handleRetry}>
                      I've Installed It
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
                  <p className="font-medium text-foreground mb-2">Installation instructions:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>macOS: <code className="px-1.5 py-0.5 bg-muted rounded font-mono text-xs">brew install gh</code></li>
                    <li>Windows: <code className="px-1.5 py-0.5 bg-muted rounded font-mono text-xs">winget install GitHub.cli</code></li>
                    <li>Linux: Visit <a href="https://cli.github.com/" target="_blank" rel="noopener noreferrer" className="text-info hover:underline">cli.github.com</a></li>
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
                <Github className="h-6 w-6 text-info shrink-0 mt-0.5" />
                <div className="flex-1 space-y-3">
                  <h3 className="text-lg font-medium text-foreground">
                    Connect to GitHub
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Click the button below to authenticate with GitHub. This will open your browser
                    where you can authorize the application.
                  </p>
                  {cliVersion && (
                    <p className="text-xs text-muted-foreground">
                      Using GitHub CLI {cliVersion}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button onClick={handleStartAuth} size="lg" className="gap-2">
              <Github className="h-5 w-5" />
              Authenticate with GitHub
            </Button>
          </div>
        </div>
      )}

      {/* Authenticating */}
      {status === 'authenticating' && (
        <Card className="border border-info/30 bg-info/10">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Loader2 className="h-6 w-6 animate-spin text-info shrink-0" />
              <div className="flex-1">
                <h3 className="text-lg font-medium text-foreground">
                  Authenticating...
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Please complete the authentication in your browser. This window will update automatically.
                </p>
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
                  Successfully Connected
                </h3>
                <p className="text-sm text-success/80 mt-1">
                  {username ? `Connected as ${username}` : 'Your GitHub account is now connected'}
                </p>
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
                    Authentication Failed
                  </h3>
                  <p className="text-sm text-destructive/80 mt-1">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center gap-3">
            <Button onClick={handleRetry} variant="outline">
              Retry
            </Button>
            {onCancel && (
              <Button onClick={onCancel} variant="ghost">
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Cancel button for non-error states */}
      {status !== 'error' && status !== 'success' && onCancel && (
        <div className="flex justify-center pt-2">
          <Button onClick={onCancel} variant="ghost">
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
