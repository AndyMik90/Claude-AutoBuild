/**
 * Setup Page
 *
 * First-time setup page to create the initial admin account.
 * Shown when no users exist in the system.
 * Uses the app's design system (Oscura Midnight theme).
 */

import { useState } from 'react';
import { useAuthStore, setupAdmin } from '../stores/auth-store';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { AlertCircle, Loader2, Shield, Users, Lock } from 'lucide-react';

export function SetupPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (password !== confirmPassword) {
      useAuthStore.getState().setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      useAuthStore.getState().setError('Password must be at least 8 characters');
      return;
    }

    await setupAdmin(email, username, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-lg p-8 card-surface">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/20 border border-primary/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Welcome to Auto Claude</h1>
          <p className="text-muted-foreground">Let's set up your administrator account</p>
        </div>

        {/* Features highlight */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="p-4 bg-secondary/50 border border-border rounded-xl">
            <Users className="w-6 h-6 text-info mb-2" />
            <h3 className="text-sm font-medium text-foreground">Multi-User</h3>
            <p className="text-xs text-muted-foreground">Invite team members</p>
          </div>
          <div className="p-4 bg-secondary/50 border border-border rounded-xl">
            <Lock className="w-6 h-6 text-success mb-2" />
            <h3 className="text-sm font-medium text-foreground">Secure</h3>
            <p className="text-xs text-muted-foreground">Encrypted credentials</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-error-light border border-destructive/50 rounded-lg text-destructive">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground">
              Admin Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              disabled={isLoading}
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username" className="text-foreground">
              Username
            </Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
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
              placeholder="At least 8 characters"
              required
              disabled={isLoading}
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-foreground">
              Confirm Password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
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
                Creating admin account...
              </>
            ) : (
              'Create Admin Account'
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          This account will have full administrative privileges.
          <br />
          You can invite other users after setup.
        </p>
      </div>
    </div>
  );
}
