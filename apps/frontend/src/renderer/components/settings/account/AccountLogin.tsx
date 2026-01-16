import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Key, Mail, Lock, User, Loader2, CheckCircle2 } from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Button } from '../../ui/button';
import { useAuthClient } from '../../../../shared/lib/convex/auth-client';
import { authStore } from '../../../stores/auth-store';

/**
 * Account Login component for signing in or registering with Better Auth.
 * Displays sign-in/sign-up form when user is not authenticated.
 */
export function AccountLogin() {
  const { t } = useTranslation('settings');
  const authClient = useAuthClient();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsLoading(true);

    try {
      if (isSignUp) {
        // Sign up with email, password, and name
        const result = await authClient?.signUp?.email?.({
          email,
          password,
          name,
        });
        if (result?.error) {
          setError(result.error.message || 'Sign up failed');
        } else if (result?.data) {
          setSuccess(true);
          // Store the session locally
          authStore.setSession(result.data);
          // Clear form
          setEmail('');
          setPassword('');
          setName('');
          // Switch to sign in mode after successful registration
          setIsSignUp(false);
        }
      } else {
        // Sign in with email and password
        const result = await authClient?.signIn?.email?.({
          email,
          password,
        });
        if (result?.error) {
          setError(result.error.message || 'Sign in failed');
        } else if (result?.data) {
          setSuccess(true);
          // Store the session locally
          authStore.setSession(result.data);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError(null);
    setSuccess(false);
  };

  // Get auth state from store
  const isAuthenticated = authStore.isAuthenticated();
  const user = authStore.getUser();

  // If user is authenticated, show success state
  if (isAuthenticated && user) {
    return (
      <div className="p-6 max-w-md">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <h2 className="text-lg font-semibold">Signed in</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            You are signed in as <span className="font-medium">{user.email}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-md">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Key className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {isSignUp ? t('accountSections.login.title') : t('accountSections.login.title')}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {isSignUp
            ? 'Create a new account to get started'
            : 'Sign in to access your account'}
        </p>
      </div>

      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          <p className="text-sm text-green-600 dark:text-green-400">
            {isSignUp
              ? 'Account created successfully! Please sign in.'
              : 'Signed in successfully!'}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {isSignUp && (
          <div className="space-y-2">
            <Label htmlFor="name" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Name
            </Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required={isSignUp}
              disabled={isLoading}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            disabled={isLoading}
            autoComplete={isSignUp ? 'email' : 'username'}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Password
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            disabled={isLoading}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">
            Must be at least 8 characters
          </p>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isSignUp ? 'Creating account...' : 'Signing in...'}
            </>
          ) : (
            <>
              {isSignUp ? (
                <>
                  <User className="mr-2 h-4 w-4" />
                  Create account
                </>
              ) : (
                <>
                  <Key className="mr-2 h-4 w-4" />
                  Sign in
                </>
              )}
            </>
          )}
        </Button>
      </form>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={toggleMode}
          className="text-sm text-primary hover:underline disabled:opacity-50"
          disabled={isLoading}
        >
          {isSignUp
            ? 'Already have an account? Sign in'
            : "Don't have an account? Sign up"}
        </button>
      </div>
    </div>
  );
}
