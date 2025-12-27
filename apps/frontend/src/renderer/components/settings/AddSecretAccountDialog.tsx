import { useState, useEffect } from 'react';
import { UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import type { SecretGroup } from '../../../shared/types';

interface AddSecretAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: SecretGroup | null;
  onSaved: () => void;
}

export function AddSecretAccountDialog({ open, onOpenChange, group, onSaved }: AddSecretAccountDialogProps) {
  const [accountTitle, setAccountTitle] = useState('');
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');

  // Reset form when dialog opens/closes or group changes
  useEffect(() => {
    if (open && group) {
      setAccountTitle('');
      // Initialize empty values for each key ID
      const initialValues: Record<string, string> = {};
      group.keyIds.forEach(keyId => {
        initialValues[keyId] = '';
      });
      setKeyValues(initialValues);
      setError('');
    }
  }, [open, group]);

  const handleKeyValueChange = (keyId: string, value: string) => {
    setKeyValues(prev => ({ ...prev, [keyId]: value }));
  };

  const handleSave = async () => {
    if (!group) return;

    // Validation
    if (!accountTitle.trim()) {
      setError('Please enter an account title');
      return;
    }

    // Validate all keys have values
    for (const keyId of group.keyIds) {
      if (!keyValues[keyId]?.trim()) {
        setError(`Please enter a value for ${keyId}`);
        return;
      }
    }

    setIsSaving(true);
    setError('');

    try {
      const result = await window.electronAPI.addSecretAccount(group.id, {
        title: accountTitle.trim(),
        keys: keyValues
      });

      if (!result.success) {
        setError(result.error || 'Failed to add account');
        return;
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Account to {group.title}
          </DialogTitle>
          <DialogDescription>
            Add a new account instance with encrypted credentials for this group
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Account Title */}
          <div className="space-y-2">
            <Label htmlFor="account-title">Account Title *</Label>
            <Input
              id="account-title"
              placeholder="e.g., Production, Staging, Personal"
              value={accountTitle}
              onChange={(e) => setAccountTitle(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A name to identify this specific account
            </p>
          </div>

          {/* Dynamic Key Fields */}
          <div className="space-y-3">
            <Label>Credentials *</Label>
            <p className="text-xs text-muted-foreground">
              Enter the values for each key. These will be encrypted and stored securely.
            </p>

            {group.keyIds.map((keyId) => (
              <div key={keyId} className="space-y-1">
                <Label htmlFor={`key-${keyId}`} className="text-sm font-mono">
                  {keyId}
                </Label>
                <Input
                  id={`key-${keyId}`}
                  type="password"
                  placeholder={`Enter ${keyId}`}
                  value={keyValues[keyId] || ''}
                  onChange={(e) => handleKeyValueChange(keyId, e.target.value)}
                  className="font-mono"
                />
              </div>
            ))}
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Security Notice */}
          <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
            <strong>Security:</strong> All values are encrypted using OS-level secure storage and never stored in plain text.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Add Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
