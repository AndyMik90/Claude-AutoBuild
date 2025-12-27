/**
 * Login Page
 *
 * Allows users to log in with email/username and password.
 * Supports SSO/OIDC authentication when configured.
 * Uses the app's design system (Oscura Midnight theme).
 */

import { useEffect, useState } from 'react';
import { useAuthStore, login, setTokens } from '../stores/auth-store';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { AlertCircle, Loader2, Shield } from 'lucide-react';

interface LoginPageProps {
  onRegisterClick: () => void;
}

interface OIDCStatus {
  enabled: boolean;
  provider_name: string;
  password_auth_enabled: boolean;
}

export function LoginPage({ onRegisterClick }: LoginPageProps) {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [oidcStatus, setOidcStatus] = useState<OIDCStatus | null>(null);
  const [oidcLoading, setOidcLoading] = useState(true);
  const [ssoLoading, setSsoLoading] = useState(false);

  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const setError = useAuthStore((state) => state.setError);

  // Check for tokens in URL fragment (from OIDC callback redirect)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        // Clear the hash from URL
        window.history.replaceState(null, '', window.location.pathname);
        // Set the tokens in the auth store
        setTokens(accessToken, refreshToken);
      }
    }

    // Check for error in query params
    const searchParams = new URLSearchParams(window.location.search);
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(decodeURIComponent(errorParam.replace(/\+/g, ' ')));
      // Clear the error from URL
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [setError]);

  // Fetch OIDC status
  useEffect(() => {
    const fetchOidcStatus = async () => {
      try {
        const response = await fetch('/api/auth/oidc/status');
        if (response.ok) {
          const data = await response.json();
          setOidcStatus(data);
        }
      } catch (error) {
        console.error('Failed to fetch OIDC status:', error);
      } finally {
        setOidcLoading(false);
      }
    };

    fetchOidcStatus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await login(emailOrUsername, password);
  };

  const handleSsoLogin = () => {
    setSsoLoading(true);
    // Redirect to OIDC authorize endpoint
    window.location.href = '/api/auth/oidc/authorize';
  };

  const showPasswordForm = oidcStatus?.password_auth_enabled !== false;
  const showSsoButton = oidcStatus?.enabled === true;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 card-surface">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Auto Claude</h1>
          <p className="text-muted-foreground">Sign in to your account</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-6 bg-error-light border border-destructive/50 rounded-lg text-destructive">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* SSO Button */}
        {showSsoButton && (
          <>
            <Button
              type="button"
              onClick={handleSsoLogin}
              disabled={ssoLoading || oidcLoading}
              variant="outline"
              className="w-full mb-4 border-border hover:bg-accent"
            >
              {ssoLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Sign in with {oidcStatus?.provider_name || 'SSO'}
                </>
              )}
            </Button>

            {showPasswordForm && (
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Password Form */}
        {showPasswordForm ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="emailOrUsername" className="text-foreground">
                Email or Username
              </Label>
              <Input
                id="emailOrUsername"
                type="text"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={isLoading}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={isLoading}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>
        ) : (
          !showSsoButton && (
            <div className="text-center py-8 text-muted-foreground">
              <p>Authentication is not configured.</p>
              <p className="text-sm mt-2">Please contact your administrator.</p>
            </div>
          )
        )}

        {showPasswordForm && (
          <div className="mt-6 text-center">
            <p className="text-muted-foreground text-sm">
              Have an invitation code?{' '}
              <button
                onClick={onRegisterClick}
                className="text-primary hover:text-primary/80 underline"
              >
                Register here
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
