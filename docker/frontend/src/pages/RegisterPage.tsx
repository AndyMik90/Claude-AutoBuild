/**
 * Register Page
 *
 * Allows users to register with an invitation code.
 * Uses the app's design system (Oscura Midnight theme).
 */

import { useState } from 'react';
import { useAuthStore, register, validateInvitation } from '../stores/auth-store';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { AlertCircle, CheckCircle, Loader2, ArrowLeft } from 'lucide-react';

interface RegisterPageProps {
  onBackToLogin: () => void;
}

export function RegisterPage({ onBackToLogin }: RegisterPageProps) {
  const [step, setStep] = useState<'code' | 'details'>('code');
  const [invitationCode, setInvitationCode] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeValidating, setCodeValidating] = useState(false);
  const [codeValid, setCodeValid] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const handleValidateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError(null);
    setCodeValidating(true);

    const valid = await validateInvitation(invitationCode);

    if (valid) {
      setCodeValid(true);
      setStep('details');
    } else {
      setCodeError('Invalid or expired invitation code');
    }

    setCodeValidating(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
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

    await register(invitationCode, email, username, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 card-surface">
        <button
          onClick={onBackToLogin}
          className="flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to login
        </button>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Create Account</h1>
          <p className="text-muted-foreground">
            {step === 'code'
              ? 'Enter your invitation code'
              : 'Complete your registration'}
          </p>
        </div>

        {step === 'code' ? (
          <form onSubmit={handleValidateCode} className="space-y-6">
            {codeError && (
              <div className="flex items-center gap-2 p-3 bg-error-light border border-destructive/50 rounded-lg text-destructive">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{codeError}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="invitationCode" className="text-foreground">
                Invitation Code
              </Label>
              <Input
                id="invitationCode"
                type="text"
                value={invitationCode}
                onChange={(e) => setInvitationCode(e.target.value)}
                placeholder="Enter your invitation code"
                required
                disabled={codeValidating}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                You need an invitation code from an admin to register.
              </p>
            </div>

            <Button
              type="submit"
              disabled={codeValidating || !invitationCode}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {codeValidating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-6">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-error-light border border-destructive/50 rounded-lg text-destructive">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {codeValid && (
              <div className="flex items-center gap-2 p-3 bg-success-light border border-success/50 rounded-lg text-success">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">Invitation code verified</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">
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
                placeholder="Choose a username"
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
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
