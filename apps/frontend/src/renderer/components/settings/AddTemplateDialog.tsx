import { useState, useEffect } from 'react';
import { Folder, Image as ImageIcon, X } from 'lucide-react';
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
import type { Template } from '../../../shared/types';

interface AddTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: Template | null;
  onSaved: () => void;
}

export function AddTemplateDialog({ open, onOpenChange, template, onSaved }: AddTemplateDialogProps) {
  const [name, setName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [imagePath, setImagePath] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');

  // Reset form when dialog opens/closes or template changes
  useEffect(() => {
    if (open) {
      if (template) {
        // Editing existing template
        setName(template.name);
        setFolderPath(template.folderPath);
        setImagePath(template.imagePath || '');
      } else {
        // Creating new template
        setName('');
        setFolderPath('');
        setImagePath('');
      }
      setError('');
    }
  }, [open, template]);

  const handleSelectFolder = async () => {
    try {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        setFolderPath(path);
        // Auto-populate name from folder if name is empty
        if (!name) {
          const folderName = path.split(/[/\\]/).pop() || '';
          setName(folderName);
        }
      }
    } catch (err) {
      console.error('Failed to select folder:', err);
    }
  };

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

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      setError('Please enter a template name');
      return;
    }
    if (!folderPath.trim()) {
      setError('Please select a folder');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      if (template) {
        // Update existing template
        const result = await window.electronAPI.updateTemplate(template.id, {
          name: name.trim(),
          folderPath: folderPath.trim(),
          imagePath: imagePath.trim() || undefined
        });

        if (!result.success) {
          setError(result.error || 'Failed to update template');
          return;
        }
      } else {
        // Create new template
        const result = await window.electronAPI.saveTemplate({
          name: name.trim(),
          folderPath: folderPath.trim(),
          imagePath: imagePath.trim() || undefined
        });

        if (!result.success) {
          setError(result.error || 'Failed to create template');
          return;
        }
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit Template' : 'Add Template'}</DialogTitle>
          <DialogDescription>
            {template
              ? 'Update your template details'
              : 'Create a new project template by selecting a folder and giving it a name'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Template Name */}
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              placeholder="My Awesome Template"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Folder Path */}
          <div className="space-y-2">
            <Label htmlFor="template-folder">Template Folder</Label>
            <div className="flex gap-2">
              <Input
                id="template-folder"
                placeholder="Select a folder..."
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSelectFolder}>
                <Folder className="h-4 w-4 mr-2" />
                Browse
              </Button>
            </div>
          </div>

          {/* Image (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="template-image">Icon/Image (Optional)</Label>
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
            <p className="text-xs text-muted-foreground">
              Select an image file to use as the template icon
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : template ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
