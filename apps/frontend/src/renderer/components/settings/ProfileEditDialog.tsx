/**
 * ProfileEditDialog - Dialog for creating/editing API profiles
 *
 * Allows users to configure custom Anthropic-compatible API endpoints.
 * Supports all profile fields including optional model name mappings.
 *
 * Features:
 * - Required fields: Name, Base URL, API Key
 * - Optional model fields: Default, Haiku, Sonnet, Opus
 * - Form validation with error display
 * - Save button triggers store action
 * - Close button cancels without saving
 */
import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useSettingsStore } from '../../stores/settings-store';
import type { ProfileFormData } from '../../../shared/types/profile';
import { isValidUrl, isValidApiKey } from '../../lib/profile-utils';

interface ProfileEditDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Optional callback when profile is successfully saved */
  onSaved?: () => void;
}

export function ProfileEditDialog({ open, onOpenChange, onSaved }: ProfileEditDialogProps) {
  const { saveProfile, profilesLoading, profilesError } = useSettingsStore();

  // Form state
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [haikuModel, setHaikuModel] = useState('');
  const [sonnetModel, setSonnetModel] = useState('');
  const [opusModel, setOpusModel] = useState('');

  // Validation errors
  const [nameError, setNameError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName('');
      setBaseUrl('');
      setApiKey('');
      setDefaultModel('');
      setHaikuModel('');
      setSonnetModel('');
      setOpusModel('');
      setNameError(null);
      setUrlError(null);
      setKeyError(null);
    }
  }, [open]);

  // Validate form
  const validateForm = (): boolean => {
    let isValid = true;

    // Name validation
    if (!name.trim()) {
      setNameError('Name is required');
      isValid = false;
    } else {
      setNameError(null);
    }

    // Base URL validation
    if (!baseUrl.trim()) {
      setUrlError('Base URL is required');
      isValid = false;
    } else if (!isValidUrl(baseUrl)) {
      setUrlError('Invalid URL format (must be http:// or https://)');
      isValid = false;
    } else {
      setUrlError(null);
    }

    // API Key validation
    if (!apiKey.trim()) {
      setKeyError('API Key is required');
      isValid = false;
    } else if (!isValidApiKey(apiKey)) {
      setKeyError('Invalid API Key format');
      isValid = false;
    } else {
      setKeyError(null);
    }

    return isValid;
  };

  // Handle save
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    const profileData: ProfileFormData = {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim()
    };

    // Add optional models if provided
    if (defaultModel || haikuModel || sonnetModel || opusModel) {
      profileData.models = {};
      if (defaultModel) profileData.models.default = defaultModel.trim();
      if (haikuModel) profileData.models.haiku = haikuModel.trim();
      if (sonnetModel) profileData.models.sonnet = sonnetModel.trim();
      if (opusModel) profileData.models.opus = opusModel.trim();
    }

    const success = await saveProfile(profileData);
    if (success) {
      onOpenChange(false);
      onSaved?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add API Profile</DialogTitle>
          <DialogDescription>
            Configure a custom Anthropic-compatible API endpoint for your builds.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name field (required) */}
          <div className="space-y-2">
            <Label htmlFor="profile-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="profile-name"
              placeholder="My Custom API"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={nameError ? 'border-destructive' : ''}
            />
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
          </div>

          {/* Base URL field (required) */}
          <div className="space-y-2">
            <Label htmlFor="profile-url">
              Base URL <span className="text-destructive">*</span>
            </Label>
            <Input
              id="profile-url"
              placeholder="https://api.anthropic.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className={urlError ? 'border-destructive' : ''}
            />
            {urlError && <p className="text-sm text-destructive">{urlError}</p>}
            <p className="text-xs text-muted-foreground">
              Example: https://api.anthropic.com or http://localhost:8080
            </p>
          </div>

          {/* API Key field (required) */}
          <div className="space-y-2">
            <Label htmlFor="profile-key">
              API Key <span className="text-destructive">*</span>
            </Label>
            <Input
              id="profile-key"
              type="password"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={keyError ? 'border-destructive' : ''}
            />
            {keyError && <p className="text-sm text-destructive">{keyError}</p>}
          </div>

          {/* Optional model mappings */}
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-base">Optional: Model Name Mappings</Label>
            <p className="text-xs text-muted-foreground">
              Map Claude models to custom provider model names. Leave blank to use defaults.
            </p>

            <div className="space-y-2">
              <Label htmlFor="model-default" className="text-sm text-muted-foreground">
                Default Model
              </Label>
              <Input
                id="model-default"
                placeholder="claude-3-5-sonnet-20241022"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model-haiku" className="text-sm text-muted-foreground">
                Haiku Model
              </Label>
              <Input
                id="model-haiku"
                placeholder="claude-3-5-haiku-20241022"
                value={haikuModel}
                onChange={(e) => setHaikuModel(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model-sonnet" className="text-sm text-muted-foreground">
                Sonnet Model
              </Label>
              <Input
                id="model-sonnet"
                placeholder="claude-3-5-sonnet-20241022"
                value={sonnetModel}
                onChange={(e) => setSonnetModel(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model-opus" className="text-sm text-muted-foreground">
                Opus Model
              </Label>
              <Input
                id="model-opus"
                placeholder="claude-3-5-opus-20241022"
                value={opusModel}
                onChange={(e) => setOpusModel(e.target.value)}
              />
            </div>
          </div>

          {/* General error display */}
          {profilesError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{profilesError}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={profilesLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={profilesLoading}
          >
            {profilesLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Profile'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
