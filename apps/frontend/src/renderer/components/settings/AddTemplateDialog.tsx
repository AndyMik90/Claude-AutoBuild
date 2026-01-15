import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('settings');
  const [name, setName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [imagePath, setImagePath] = useState<string>('');
  const [buildCommand, setBuildCommand] = useState<string>('');
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
        setBuildCommand(template.buildCommand || '');
      } else {
        // Creating new template
        setName('');
        setFolderPath('');
        setImagePath('');
        setBuildCommand('');
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
      const path = await window.electronAPI.selectFile();
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
      setError(t('templates.errors.nameRequired'));
      return;
    }
    if (!folderPath.trim()) {
      setError(t('templates.errors.folderRequired'));
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      if (template) {
        // Update existing template with optimistic locking
        console.log('[AddTemplateDialog] Updating template:', { id: template.id, version: template.version });
        const result = await window.electronAPI.updateTemplate(
          template.id,
          {
            name: name.trim(),
            folderPath: folderPath.trim(),
            imagePath: imagePath.trim() || undefined,
            buildCommand: buildCommand.trim() || undefined
          },
          template.version // Optimistic locking: pass current version
        );
        console.log('[AddTemplateDialog] Update result:', result.success ? 'Success' : result.error);

        if (!result.success) {
          setError(result.error || t('templates.errors.updateFailed'));
          return;
        }
      } else {
        // Create new template
        const result = await window.electronAPI.saveTemplate({
          name: name.trim(),
          folderPath: folderPath.trim(),
          imagePath: imagePath.trim() || undefined,
          buildCommand: buildCommand.trim() || undefined
        });

        if (!result.success) {
          setError(result.error || t('templates.errors.createFailed'));
          return;
        }
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('templates.errors.generic'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{template ? t('templates.add.titleEdit') : t('templates.add.title')}</DialogTitle>
          <DialogDescription>
            {template
              ? t('templates.add.descriptionEdit')
              : t('templates.add.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Template Name */}
          <div className="space-y-2">
            <Label htmlFor="template-name">{t('templates.form.name.label')}</Label>
            <Input
              id="template-name"
              placeholder={t('templates.form.name.placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Folder Path */}
          <div className="space-y-2">
            <Label htmlFor="template-folder">{t('templates.form.folder.label')}</Label>
            <div className="flex gap-2">
              <Input
                id="template-folder"
                placeholder={t('templates.form.folder.placeholder')}
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSelectFolder}>
                <Folder className="h-4 w-4 mr-2" />
                {t('templates.form.folder.browse')}
              </Button>
            </div>
          </div>

          {/* Image (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="template-image">{t('templates.form.image.label')}</Label>
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
                {t('templates.form.image.chooseImage')}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              {t('templates.form.image.helper')}
            </p>
          </div>

          {/* Build Command (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="template-build-command">{t('templates.form.buildCommand.label')}</Label>
            <Input
              id="template-build-command"
              placeholder={t('templates.form.buildCommand.placeholder')}
              value={buildCommand}
              onChange={(e) => setBuildCommand(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t('templates.form.buildCommand.helper')}
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
            {t('templates.actions.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? t('templates.actions.saving') : template ? t('templates.actions.update') : t('templates.actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
