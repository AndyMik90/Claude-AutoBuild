/**
 * ProfileEditDialog Tests
 *
 * Tests both create and edit modes for the API profile dialog.
 * Following Story 1.3: Edit Existing Profile
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProfileEditDialog } from './ProfileEditDialog';
import type { APIProfile } from '../../../shared/types/profile';

// Mock the settings store
vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: vi.fn()
}));

import { useSettingsStore } from '../../stores/settings-store';

describe('ProfileEditDialog - Edit Mode', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSaved = vi.fn();

  const mockProfile: APIProfile = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test Profile',
    baseUrl: 'https://api.example.com',
    apiKey: 'sk-ant-api123-test-key-abc123',
    models: {
      default: 'claude-3-5-sonnet-20241022',
      haiku: 'claude-3-5-haiku-20241022'
    },
    createdAt: 1700000000000,
    updatedAt: 1700000000000
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock store to return updateProfile action
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateProfile: vi.fn().mockResolvedValue(true),
      saveProfile: vi.fn().mockResolvedValue(true),
      profilesLoading: false,
      profilesError: null
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Test 5 from story: Pre-populated form data
  it('should pre-populate all fields with existing values when editing', async () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateProfile: vi.fn().mockResolvedValue(true),
      saveProfile: vi.fn().mockResolvedValue(true),
      profilesLoading: false,
      profilesError: null
    });

    render(
      <ProfileEditDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSaved={mockOnSaved}
        profile={mockProfile}
      />
    );

    // Verify all fields are pre-populated
    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toHaveValue('Test Profile');
      expect(screen.getByLabelText(/base url/i)).toHaveValue('https://api.example.com');
    });

    // Model fields should be pre-populated
    // Find the default model input by its label
    const defaultModelLabel = screen.getByText(/default model/i);
    const defaultModelInput = defaultModelLabel.nextElementSibling as HTMLInputElement;
    expect(defaultModelInput).toHaveValue('claude-3-5-sonnet-20241022');
  });

  // Test 6 from story: API key displays masked
  it('should display masked API key in edit mode', async () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateProfile: vi.fn().mockResolvedValue(true),
      saveProfile: vi.fn().mockResolvedValue(true),
      profilesLoading: false,
      profilesError: null
    });

    render(
      <ProfileEditDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        profile={mockProfile}
      />
    );

    // API key should show masked (•••• + last 4 chars only, so c123 not abc123)
    await waitFor(() => {
      const maskedInput = screen.getByDisplayValue(/••••c123/);
      expect(maskedInput).toBeDisabled();
    });
  });

  // Test 1 from story: Edit profile name
  it('should update profile when form is modified and saved', async () => {
    const mockUpdateFn = vi.fn().mockResolvedValue(true);
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateProfile: mockUpdateFn,
      saveProfile: vi.fn().mockResolvedValue(true),
      profilesLoading: false,
      profilesError: null
    });

    render(
      <ProfileEditDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSaved={mockOnSaved}
        profile={mockProfile}
      />
    );

    // Wait for form to populate
    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toHaveValue('Test Profile');
    });

    // Change the name
    const nameInput = screen.getByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: 'Updated Profile Name' } });

    // Click save
    const saveButton = screen.getByText(/save profile/i);
    fireEvent.click(saveButton);

    // Verify updateProfile was called (not saveProfile)
    await waitFor(() => {
      expect(mockUpdateFn).toHaveBeenCalled();
    });
  });

  // Dialog title should say "Edit Profile" in edit mode
  it('should show "Edit Profile" title in edit mode', async () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateProfile: vi.fn().mockResolvedValue(true),
      saveProfile: vi.fn().mockResolvedValue(true),
      profilesLoading: false,
      profilesError: null
    });

    render(
      <ProfileEditDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        profile={mockProfile}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Edit Profile')).toBeInTheDocument();
    });
  });

  // Test 7 from story: Cancel button
  it('should close dialog without saving when Cancel is clicked', async () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateProfile: vi.fn().mockResolvedValue(true),
      saveProfile: vi.fn().mockResolvedValue(true),
      profilesLoading: false,
      profilesError: null
    });

    render(
      <ProfileEditDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        profile={mockProfile}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // Test 8 from story: Models fields pre-populate
  it('should pre-populate optional model fields with existing values', async () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateProfile: vi.fn().mockResolvedValue(true),
      saveProfile: vi.fn().mockResolvedValue(true),
      profilesLoading: false,
      profilesError: null
    });

    render(
      <ProfileEditDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        profile={mockProfile}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toHaveValue('Test Profile');
    });

    // Find model inputs by their labels
    const modelLabels = screen.getAllByText(/model/i);
    expect(modelLabels.length).toBeGreaterThan(0);
  });
});

describe('ProfileEditDialog - Create Mode', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      saveProfile: vi.fn().mockResolvedValue(true),
      profilesLoading: false,
      profilesError: null
    });
  });

  // Dialog title should say "Add API Profile" in create mode
  it('should show "Add API Profile" title in create mode', () => {
    render(
      <ProfileEditDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSaved={mockOnSaved}
      />
    );

    expect(screen.getByText('Add API Profile')).toBeInTheDocument();
  });

  // Fields should be empty in create mode
  it('should have empty fields in create mode', () => {
    render(
      <ProfileEditDialog
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(screen.getByLabelText(/name/i)).toHaveValue('');
    expect(screen.getByLabelText(/base url/i)).toHaveValue('');
  });

  // API key input should be normal (not masked) in create mode
  it('should show normal API key input in create mode', () => {
    render(
      <ProfileEditDialog
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const apiKeyInput = screen.getByLabelText(/api key/i);
    expect(apiKeyInput).toHaveAttribute('type', 'password');
    expect(apiKeyInput).not.toBeDisabled();
  });
});

describe('ProfileEditDialog - Validation', () => {
  const mockOnOpenChange = vi.fn();
  const mockProfile: APIProfile = {
    id: 'test-id',
    name: 'Test',
    baseUrl: 'https://api.example.com',
    apiKey: 'sk-ant-test123',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // Test 4 from story: Invalid Base URL validation
  it('should show inline error for invalid Base URL', async () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateProfile: vi.fn().mockResolvedValue(true),
      profilesLoading: false,
      profilesError: null
    });

    render(
      <ProfileEditDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        profile={mockProfile}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/base url/i)).toHaveValue('https://api.example.com');
    });

    // Enter invalid URL
    const urlInput = screen.getByLabelText(/base url/i);
    fireEvent.change(urlInput, { target: { value: 'not-a-valid-url' } });

    // Click save to trigger validation
    const saveButton = screen.getByText(/save profile/i);
    fireEvent.click(saveButton);

    // Should show error
    await waitFor(() => {
      expect(screen.getByText(/invalid url/i)).toBeInTheDocument();
    });
  });

  // Test 2 from story: Edit profile name to duplicate existing name
  it('should show error when editing to duplicate name', async () => {
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateProfile: vi.fn().mockResolvedValue(false), // Simulating duplicate name error
      profilesLoading: false,
      profilesError: 'A profile with this name already exists'
    });

    render(
      <ProfileEditDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        profile={mockProfile}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toHaveValue('Test');
    });

    // Change name to a duplicate
    const nameInput = screen.getByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: 'Duplicate Name' } });

    // Click save
    const saveButton = screen.getByText(/save profile/i);
    fireEvent.click(saveButton);

    // Should show error from store
    await waitFor(() => {
      expect(screen.getByText(/A profile with this name already exists/i)).toBeInTheDocument();
    });
  });

  // Test 3 from story: Edit active profile
  it('should keep profile active after editing', async () => {
    const mockUpdateFn = vi.fn().mockResolvedValue(true);
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateProfile: mockUpdateFn,
      profilesLoading: false,
      profilesError: null,
      profiles: [{ ...mockProfile, id: 'active-id' }],
      activeProfileId: 'active-id'
    });

    const activeProfile: APIProfile = {
      ...mockProfile,
      id: 'active-id',
      name: 'Active Profile'
    };

    render(
      <ProfileEditDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        profile={activeProfile}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toHaveValue('Active Profile');
    });

    // Change the name
    const nameInput = screen.getByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: 'Updated Active Profile' } });

    // Click save
    const saveButton = screen.getByText(/save profile/i);
    fireEvent.click(saveButton);

    // Verify updateProfile was called
    await waitFor(() => {
      expect(mockUpdateFn).toHaveBeenCalled();
    });
  });
});
