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
 * - Save button triggers store action (create or update)
 * - Close button cancels without saving
 * - Edit mode: pre-populates form with existing profile data
 * - Edit mode: API key masked with "Change" button
 */
import { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
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
import { ModelSearchableSelect } from './ModelSearchableSelect';
import { useToast } from '../../hooks/use-toast';
import { isValidUrl, isValidApiKey } from '../../lib/profile-utils';
import type { APIProfile, ProfileFormData, TestConnectionResult } from '@shared/types/profile';
import { maskApiKey } from '../../lib/profile-utils';

interface ProfileEditDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Optional callback when profile is successfully saved */
  onSaved?: () => void;
  /** Optional profile for edit mode (undefined = create mode) */
  profile?: APIProfile;
}

export function ProfileEditDialog({ open, onOpenChange, onSaved, profile }: ProfileEditDialogProps) {
  const {
    saveProfile,
    updateProfile,
    profilesLoading,
    profilesError,
    testConnection,
    isTestingConnection,
    testConnectionResult
  } = useSettingsStore();
  const { toast } = useToast();

  // Edit mode detection: profile prop determines mode
  const isEditMode = !!profile;

  // Form state
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [haikuModel, setHaikuModel] = useState('');
  const [sonnetModel, setSonnetModel] = useState('');
  const [opusModel, setOpusModel] = useState('');

  // API key change state (for edit mode)
  const [isChangingApiKey, setIsChangingApiKey] = useState(false);

  // Validation errors
  const [nameError, setNameError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  // AbortController ref for test connection cleanup
  const abortControllerRef = useRef<AbortController | null>(null);

  // Local state for auto-hiding test result display
  const [showTestResult, setShowTestResult] = useState(false);

  // Auto-hide test result after 5 seconds
  useEffect(() => {
    if (testConnectionResult) {
      setShowTestResult(true);
      const timeoutId = setTimeout(() => {
        setShowTestResult(false);
      }, 5000);
      return () => clearTimeout(timeoutId);
    }
  }, [testConnectionResult]);

  // Cleanup AbortController when dialog closes or unmounts
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  // Reset form and pre-populate when dialog opens
  // Note: Only reset when dialog opens/closes, not when profile prop changes
  // This prevents race conditions if user rapidly clicks edit on different profiles
  useEffect(() => {
    if (open) {
      if (isEditMode && profile) {
        // Pre-populate form with existing profile data
        setName(profile.name);
        setBaseUrl(profile.baseUrl);
        setApiKey(''); // Start empty - masked display shown instead
        setDefaultModel(profile.models?.default || '');
        setHaikuModel(profile.models?.haiku || '');
        setSonnetModel(profile.models?.sonnet || '');
        setOpusModel(profile.models?.opus || '');
        setIsChangingApiKey(false);
      } else {
        // Reset to empty form for create mode
        setName('');
        setBaseUrl('');
        setApiKey('');
        setDefaultModel('');
        setHaikuModel('');
        setSonnetModel('');
        setOpusModel('');
        setIsChangingApiKey(false);
      }
      // Clear validation errors
      setNameError(null);
      setUrlError(null);
      setKeyError(null);
    } else {
      // Clear test result display when dialog closes
      setShowTestResult(false);
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

    // API Key validation (only in create mode or when changing key in edit mode)
    if (!isEditMode || isChangingApiKey) {
      if (!apiKey.trim()) {
        setKeyError('API Key is required');
        isValid = false;
      } else if (!isValidApiKey(apiKey)) {
        setKeyError('Invalid API Key format');
        isValid = false;
      } else {
        setKeyError(null);
      }
    } else {
      setKeyError(null);
    }

    return isValid;
  };

  // Handle test connection
  const handleTestConnection = async () => {
    // Determine API key to use for testing
    const apiKeyForTest = isEditMode && !isChangingApiKey && profile
      ? profile.apiKey
      : apiKey;

    // Basic validation before testing
    if (!baseUrl.trim()) {
      setUrlError('Base URL is required');
      return;
    }
    if (!apiKeyForTest.trim()) {
      setKeyError('API Key is required');
      return;
    }

    // Create AbortController for this test
    abortControllerRef.current = new AbortController();

    await testConnection(baseUrl.trim(), apiKeyForTest.trim(), abortControllerRef.current.signal);
  };

  // Check if form has minimum required fields for test connection
  const isFormValidForTest = () => {
    if (!name.trim() || !baseUrl.trim()) {
      return false;
    }
    // In create mode or when changing key, need apiKey
    if (!isEditMode || isChangingApiKey) {
      return apiKey.trim().length > 0;
    }
    // In edit mode without changing key, existing profile has apiKey
    return true;
  };

  // Handle save
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    if (isEditMode && profile) {
      // Update existing profile
      const updatedProfile: APIProfile = {
        ...profile,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        // Only update API key if user is changing it
        ...(isChangingApiKey && { apiKey: apiKey.trim() }),
        // Update models if provided
        ...(defaultModel || haikuModel || sonnetModel || opusModel ? {
          models: {
            ...(defaultModel && { default: defaultModel.trim() }),
            ...(haikuModel && { haiku: haikuModel.trim() }),
            ...(sonnetModel && { sonnet: sonnetModel.trim() }),
            ...(opusModel && { opus: opusModel.trim() })
          }
        } : { models: undefined })
      };
      const success = await updateProfile(updatedProfile);
      if (success) {
        toast({
          title: 'Profile updated',
          description: `"${name.trim()}" has been updated successfully.`,
        });
        onOpenChange(false);
        onSaved?.();
      }
    } else {
      // Create new profile
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
        toast({
          title: 'Profile created',
          description: `"${name.trim()}" has been added successfully.`,
        });
        onOpenChange(false);
        onSaved?.();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="profile-edit-dialog">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Profile' : 'Add API Profile'}</DialogTitle>
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

          {/* API Key field (required for create, masked in edit mode) */}
          <div className="space-y-2">
            <Label htmlFor="profile-key">
              API Key <span className="text-destructive">*</span>
            </Label>
            {isEditMode && !isChangingApiKey && profile ? (
              // Edit mode: show masked API key
              <div className="flex items-center gap-2">
                <Input
                  id="profile-key"
                  value={maskApiKey(profile.apiKey)}
                  disabled
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsChangingApiKey(true)}
                >
                  Change
                </Button>
              </div>
            ) : (
              // Create mode or changing key: show password input
              <>
                <Input
                  id="profile-key"
                  type="password"
                  placeholder="sk-ant-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className={keyError ? 'border-destructive' : ''}
                />
                {isEditMode && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsChangingApiKey(false);
                      setApiKey('');
                      setKeyError(null);
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </>
            )}
            {keyError && <p className="text-sm text-destructive">{keyError}</p>}
          </div>

          {/* Test Connection button */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleTestConnection}
            disabled={isTestingConnection || !isFormValidForTest()}
          >
            {isTestingConnection ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>

          {/* Inline connection test result */}
          {showTestResult && testConnectionResult && (
            <div className={`flex items-start gap-2 p-3 rounded-lg border ${
              testConnectionResult.success
                ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
            }`}>
              {testConnectionResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${
                  testConnectionResult.success
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-red-800 dark:text-red-200'
                }`}>
                  {testConnectionResult.success
                    ? 'Connection Successful'
                    : 'Connection Failed'}
                </p>
                <p className={`text-sm ${
                  testConnectionResult.success
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-red-700 dark:text-red-300'
                }`}>
                  {testConnectionResult.message}
                </p>
              </div>
            </div>
          )}

          {/* Optional model mappings */}
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-base">Optional: Model Name Mappings</Label>
            <p className="text-xs text-muted-foreground">
              Select models from your API provider. Leave blank to use defaults.
            </p>

            <div className="space-y-2">
              <Label htmlFor="model-default" className="text-sm text-muted-foreground">
                Default Model (Optional)
              </Label>
              <ModelSearchableSelect
                value={defaultModel}
                onChange={setDefaultModel}
                placeholder="e.g., claude-3-5-sonnet-20241022"
                baseUrl={baseUrl}
                apiKey={isEditMode && !isChangingApiKey && profile ? profile.apiKey : apiKey}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model-haiku" className="text-sm text-muted-foreground">
                Haiku Model (Optional)
              </Label>
              <ModelSearchableSelect
                value={haikuModel}
                onChange={setHaikuModel}
                placeholder="e.g., claude-3-5-haiku-20241022"
                baseUrl={baseUrl}
                apiKey={isEditMode && !isChangingApiKey && profile ? profile.apiKey : apiKey}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model-sonnet" className="text-sm text-muted-foreground">
                Sonnet Model (Optional)
              </Label>
              <ModelSearchableSelect
                value={sonnetModel}
                onChange={setSonnetModel}
                placeholder="e.g., claude-3-5-sonnet-20241022"
                baseUrl={baseUrl}
                apiKey={isEditMode && !isChangingApiKey && profile ? profile.apiKey : apiKey}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model-opus" className="text-sm text-muted-foreground">
                Opus Model (Optional)
              </Label>
              <ModelSearchableSelect
                value={opusModel}
                onChange={setOpusModel}
                placeholder="e.g., claude-3-5-opus-20241022"
                baseUrl={baseUrl}
                apiKey={isEditMode && !isChangingApiKey && profile ? profile.apiKey : apiKey}
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
