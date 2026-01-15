import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Lock, Key, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Button } from '../../ui/button';
import { useAuthClient } from '../../../../shared/lib/convex/auth-client';
import { authStore } from '../../../stores/auth-store';

/**
 * Account Security component for managing password and security settings.
 * Allows users to change their password and view security information.
 */
export function AccountSecurity() {
  const { t } = useTranslation('settings');
  const authClient = useAuthClient();
  const user = authStore.getUser();

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Validation state
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    return null;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setPasswordError(null);

    // Validate passwords
    const currentValidationError = validatePassword(currentPassword);
    if (currentValidationError) {
      setPasswordError(currentValidationError);
      return;
    }

    const newValidationError = validatePassword(newPassword);
    if (newValidationError) {
      setPasswordError(newValidationError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError('New password must be different from current password');
      return;
    }

    setIsLoading(true);

    try {
      // Change password using Better Auth
      const result = await authClient?.changePassword?.({
        currentPassword,
        newPassword,
      });

      if (result?.error) {
        setError(result.error.message || 'Failed to change password');
      } else {
        setSuccess(true);
        setIsChangingPassword(false);

        // Clear form
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setIsChangingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setPasswordError(null);
    setSuccess(false);
  };

  if (!user) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          Please sign in to manage your security settings
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Security</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage your password and authentication settings
        </p>
      </div>

      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          <p className="text-sm text-green-600 dark:text-green-400">
            Password changed successfully
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Password Section */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Key className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">Password</h3>
                <p className="text-sm text-muted-foreground">
                  Change your password to keep your account secure
                </p>
              </div>
            </div>
            {!isChangingPassword && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsChangingPassword(true)}
              >
                Change Password
              </Button>
            )}
          </div>

          {/* Password requirements info */}
          {!isChangingPassword && (
            <div className="ml-11 space-y-1 text-sm text-muted-foreground">
              <p>Password requirements:</p>
              <ul className="list-disc list-inside ml-2 space-y-0.5">
                <li>At least 8 characters long</li>
                <li>Different from your current password</li>
              </ul>
            </div>
          )}

          {/* Change Password Form */}
          {isChangingPassword && (
            <form onSubmit={handleChangePassword} className="ml-11 space-y-4">
              {passwordError && (
                <div className="p-2 rounded bg-destructive/10 border border-destructive/30">
                  <p className="text-sm text-destructive">{passwordError}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="current-password" className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Current Password
                </Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  required
                  disabled={isLoading}
                  autoComplete="current-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password" className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  New Password
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter your new password"
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Confirm New Password
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your new password"
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Changing Password...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Change Password
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Account Information */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-muted">
              <Shield className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">Account Information</h3>
              <p className="text-sm text-muted-foreground">
                Your account details and security status
              </p>
            </div>
          </div>

          <div className="ml-11 space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium">{user.email}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Account Created</span>
              <span className="text-sm font-medium">
                {user.createdAt
                  ? new Date(user.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'Unknown'}
              </span>
            </div>

            {user.emailVerified && (
              <div className="flex items-center gap-2 py-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>Email verified</span>
              </div>
            )}
          </div>
        </div>

        {/* Security Tips */}
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Security Tips</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Use a unique password that you don't use elsewhere</li>
                <li>• Consider using a password manager</li>
                <li>• Never share your password with anyone</li>
                <li>• Change your password regularly</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
