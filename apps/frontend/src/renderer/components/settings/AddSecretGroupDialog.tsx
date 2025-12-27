import { useState, useEffect } from 'react';
import { Plus, X, Key, Image as ImageIcon } from 'lucide-react';
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
import { Textarea } from '../ui/textarea';
import type { SecretGroup } from '../../../shared/types';

interface AddSecretGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: SecretGroup | null;
  onSaved: () => void;
}

export function AddSecretGroupDialog({ open, onOpenChange, group, onSaved }: AddSecretGroupDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [keyIds, setKeyIds] = useState<string[]>(['']);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');

  // Reset form when dialog opens/closes or group changes
  useEffect(() => {
    if (open) {
      if (group) {
        // Editing existing group
        setTitle(group.title);
        setDescription(group.description || '');
        setImagePath(group.imagePath || '');
        setKeyIds(group.keyIds.length > 0 ? group.keyIds : ['']);
      } else {
        // Creating new group
        setTitle('');
        setDescription('');
        setImagePath('');
        setKeyIds(['']);
      }
      setError('');
    }
  }, [open, group]);

  const handleSelectImage = async () => {
    try {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        setImagePath(path);
      }
    } catch (err) {
      console.error('Failed to select image:', err);
    }
  };

  const handleRemoveImage = () => {
    setImagePath('');
  };

  const handleAddKeyId = () => {
    setKeyIds([...keyIds, '']);
  };

  const handleRemoveKeyId = (index: number) => {
    setKeyIds(keyIds.filter((_, i) => i !== index));
  };

  const handleKeyIdChange = (index: number, value: string) => {
    const newKeyIds = [...keyIds];
    newKeyIds[index] = value;
    setKeyIds(newKeyIds);
  };

  const handleSave = async () => {
    // Validation
    if (!title.trim()) {
      setError('Please enter a group title');
      return;
    }

    // Filter out empty key IDs and validate
    const filteredKeyIds = keyIds.map(k => k.trim()).filter(k => k.length > 0);
    if (filteredKeyIds.length === 0) {
      setError('Please add at least one key ID');
      return;
    }

    // Check for duplicate key IDs
    const uniqueKeyIds = new Set(filteredKeyIds);
    if (uniqueKeyIds.size !== filteredKeyIds.length) {
      setError('Key IDs must be unique');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      if (group) {
        // Update existing group
        const result = await window.electronAPI.updateSecretGroup(group.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          imagePath: imagePath.trim() || undefined,
          keyIds: filteredKeyIds
        });

        if (!result.success) {
          setError(result.error || 'Failed to update group');
          return;
        }
      } else {
        // Create new group
        const result = await window.electronAPI.createSecretGroup({
          title: title.trim(),
          description: description.trim() || undefined,
          imagePath: imagePath.trim() || undefined,
          keyIds: filteredKeyIds
        });

        if (!result.success) {
          setError(result.error || 'Failed to create group');
          return;
        }
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {group ? 'Edit Secret Group' : 'Add Secret Group'}
          </DialogTitle>
          <DialogDescription>
            {group
              ? 'Update the group template schema'
              : 'Create a template for a type of credential (e.g., "AWS Credentials", "OpenAI Keys")'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Group Title */}
          <div className="space-y-2">
            <Label htmlFor="group-title">Group Title *</Label>
            <Input
              id="group-title"
              placeholder="e.g., AWS Credentials, OpenAI Keys"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A name for this type of credential
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="group-description">Description (Optional)</Label>
            <Textarea
              id="group-description"
              placeholder="What are these credentials for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Image (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="group-image">Icon/Image (Optional)</Label>
            {imagePath ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md bg-muted px-3 py-2 text-sm truncate">
                  {imagePath}
                </div>
                <Button variant="ghost" size="sm" onClick={handleRemoveImage}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={handleSelectImage} className="w-full">
                <ImageIcon className="h-4 w-4 mr-2" />
                Choose Image
              </Button>
            )}
          </div>

          {/* Key IDs (Schema) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Key IDs (Schema) *</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddKeyId} className="gap-1">
                <Plus className="h-3 w-3" />
                Add Key ID
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Define the key names this group requires (e.g., ACCESS_KEY, SECRET_KEY, REGION)
            </p>

            <div className="space-y-2">
              {keyIds.map((keyId, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="e.g., ACCESS_KEY, SECRET_KEY"
                    value={keyId}
                    onChange={(e) => handleKeyIdChange(index, e.target.value)}
                    className="flex-1 font-mono text-sm"
                  />
                  {keyIds.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveKeyId(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Info Notice */}
          <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
            <strong>Note:</strong> This defines the template/schema. You'll add actual account credentials after creating the group.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : group ? 'Update Group' : 'Create Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
