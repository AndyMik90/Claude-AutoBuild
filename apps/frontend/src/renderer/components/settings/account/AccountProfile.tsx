import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Mail, Camera, Loader2, CheckCircle2, Save } from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Button } from '../../ui/button';
import { authStore } from '../../../stores/auth-store';
import { useConvexAuth } from '../../../providers/convex/ConvexAuthProvider';
import { useAuthClient } from '../../../../shared/lib/convex/auth-client';

/**
 * Account Profile component for viewing and editing user profile.
 * Displays user information and allows editing name, email, and avatar.
 */
export function AccountProfile() {
  const { t } = useTranslation('settings');
  const { refetch } = useConvexAuth();
  const authClient = useAuthClient();
  const user = authStore.getUser();

  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState(user?.name || '');
  const [image, setImage] = useState(user?.image || '');

  // Update form when user changes
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setImage(user.image || '');
    }
  }, [user]);

  const handleSave = async () => {
    setIsLoading(true);
    setSaveSuccess(false);
    setError(null);

    try {
      // Get the current session from our authStore
      const session = authStore.getSession();

      if (!session) {
        console.error('[AccountProfile] No session found, cannot update profile');
        setError('You must be signed in to update your profile');
        setIsLoading(false);
        return;
      }

      // Update user profile using Better Auth
      const result = await authClient?.updateUser({
        name,
        image: image || undefined,
      });

      if (result?.error) {
        console.error('[AccountProfile] updateUser error:', result.error);
        setError(result.error.message || 'Failed to update profile');
      } else {
        setSaveSuccess(true);
        setIsEditing(false);

        // Update local user data with the new values from the result
        // The result.data should contain the updated user
        if (result?.data) {
          // Update the user in our authStore with the new values
          const currentSession = authStore.getSession();
          if (currentSession && currentSession.user) {
            const updatedSession = {
              ...currentSession,
              user: {
                ...currentSession.user,
                name,
                image: image || null,
              },
            };
            authStore.setSession(updatedSession);
          }
        }
      }
    } catch (err) {
      console.error('[AccountProfile] Exception during updateUser:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset form to original values
    if (user) {
      setName(user.name || '');
      setImage(user.image || '');
    }
    setIsEditing(false);
    setSaveSuccess(false);
    setError(null);
  };

  if (!user) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          Please sign in to view your profile
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Profile</h2>
          </div>
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Edit Profile
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Manage your account information and preferences
        </p>
      </div>

      {saveSuccess && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          <p className="text-sm text-green-600 dark:text-green-400">
            Profile updated successfully
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Profile Picture */}
      <div className="mb-6 flex items-center gap-4">
        <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center overflow-hidden">
          {image ? (
            <img src={image} alt={name} className="h-full w-full object-cover" />
          ) : (
            <User className="h-10 w-10 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {/* Form */}
      {isEditing ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="image">Avatar URL</Label>
            <Input
              id="image"
              type="url"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://example.com/avatar.png"
              disabled={isLoading}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label className="text-muted-foreground">Name</Label>
            <p className="font-medium">{name || 'Not set'}</p>
          </div>

          <div>
            <Label className="text-muted-foreground">Email</Label>
            <p className="font-medium">{user.email}</p>
          </div>

          <div>
            <Label className="text-muted-foreground">Member Since</Label>
            <p className="font-medium">
              {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
            </p>
          </div>

          {user.emailVerified && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>Email verified</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
