/**
 * @vitest-environment jsdom
 */
/**
 * CreateFormStep component tests
 *
 * Tests for the project creation form step.
 * Verifies project name input, location selection, and remote service selection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useState } from 'react';
import { CreateFormStep } from '../CreateFormStep';
import type { RemoteConfig } from '../../remote-setup/types';

// Mock i18n with readable translations
const translations: Record<string, string> = {
  'addProject.projectName': 'Project Name',
  'addProject.projectNamePlaceholder': 'my-awesome-project',
  'addProject.projectNameHelp': 'This will be the folder name. Use lowercase with hyphens.',
  'addProject.location': 'Location',
  'addProject.locationPlaceholder': 'Select a folder...',
  'addProject.browse': 'Browse',
  'addProject.willCreate': 'Will create:',
  'addProject.setupRemote': 'Remote Repository',
  'addProject.remoteSkip': 'Skip for now',
  'addProject.remoteSkipDescription': 'Initialize git without setting up a remote',
  'addProject.remoteGitHub': 'GitHub',
  'addProject.remoteGitHubDescription': 'Create or link a GitHub repository',
  'addProject.remoteGitLab': 'GitLab',
  'addProject.remoteGitLabDescription': 'Create or link a GitLab project',
};

const mockT = vi.fn((key: string) => translations[key] || key);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function renderWithI18n(ui: React.ReactElement) {
  return render(ui);
}

describe('CreateFormStep', () => {
  const defaultProps = {
    projectName: '',
    setProjectName: vi.fn(),
    projectLocation: '',
    setProjectLocation: vi.fn(),
    remoteConfig: { service: null, enabled: false },
    setRemoteConfig: vi.fn(),
    onNext: vi.fn(),
    onBrowse: vi.fn(),
    isCreating: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render project name input', () => {
      renderWithI18n(<CreateFormStep {...defaultProps} />);

      expect(screen.getByLabelText('Project Name')).toBeInTheDocument();
    });

    it('should render location input and browse button', () => {
      renderWithI18n(<CreateFormStep {...defaultProps} />);

      expect(screen.getByLabelText('Location')).toBeInTheDocument();
      expect(screen.getByText('Browse')).toBeInTheDocument();
    });

    it('should render three remote service options', () => {
      renderWithI18n(<CreateFormStep {...defaultProps} />);

      expect(screen.getByText('Skip for now')).toBeInTheDocument();
      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('GitLab')).toBeInTheDocument();
    });
  });

  describe('Project Name Input', () => {
    it('should call setProjectName when input changes', () => {
      const mockSetProjectName = vi.fn();
      renderWithI18n(
        <CreateFormStep {...defaultProps} setProjectName={mockSetProjectName} />
      );

      const input = screen.getByLabelText('Project Name');
      fireEvent.change(input, { target: { value: 'my-project' } });

      expect(mockSetProjectName).toHaveBeenCalledWith('my-project');
    });

    it('should display placeholder text', () => {
      renderWithI18n(<CreateFormStep {...defaultProps} />);

      const input = screen.getByLabelText('Project Name');
      expect(input).toHaveAttribute('placeholder', 'my-awesome-project');
    });
  });

  describe('Project Name Formatting', () => {
    // Test with controlled state wrapper to properly test blur behavior
    const TestWrapper = ({ initialName = '' }: { initialName?: string }) => {
      const [name, setName] = useState(initialName);
      return (
        <CreateFormStep
          {...defaultProps}
          projectName={name}
          setProjectName={setName}
        />
      );
    };

    it('should convert uppercase to lowercase on blur', async () => {
      renderWithI18n(<TestWrapper />);

      const input = screen.getByLabelText('Project Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'MY-PROJECT' } });
      // Manually update the input's value property for blur to read
      input.value = 'MY-PROJECT';
      fireEvent.blur(input);

      // After blur, the value should be formatted
      expect(input.value).toBe('my-project');
    });

    it('should convert spaces to hyphens on blur', async () => {
      renderWithI18n(<TestWrapper />);

      const input = screen.getByLabelText('Project Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'my awesome project' } });
      input.value = 'my awesome project';
      fireEvent.blur(input);

      expect(input.value).toBe('my-awesome-project');
    });

    it('should convert underscores to hyphens on blur', async () => {
      renderWithI18n(<TestWrapper />);

      const input = screen.getByLabelText('Project Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'my_awesome_project' } });
      input.value = 'my_awesome_project';
      fireEvent.blur(input);

      expect(input.value).toBe('my-awesome-project');
    });

    it('should convert mixed spaces and underscores to hyphens on blur', async () => {
      renderWithI18n(<TestWrapper />);

      const input = screen.getByLabelText('Project Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'my awesome_project' } });
      input.value = 'my awesome_project';
      fireEvent.blur(input);

      expect(input.value).toBe('my-awesome-project');
    });

    it('should remove special characters except hyphens and numbers on blur', async () => {
      renderWithI18n(<TestWrapper />);

      const input = screen.getByLabelText('Project Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'My@Project#123!' } });
      input.value = 'My@Project#123!';
      fireEvent.blur(input);

      expect(input.value).toBe('myproject123');
    });

    it('should collapse multiple hyphens into one on blur', async () => {
      renderWithI18n(<TestWrapper />);

      const input = screen.getByLabelText('Project Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'my---awesome---project' } });
      input.value = 'my---awesome---project';
      fireEvent.blur(input);

      expect(input.value).toBe('my-awesome-project');
    });

    it('should remove leading and trailing hyphens on blur', async () => {
      renderWithI18n(<TestWrapper />);

      const input = screen.getByLabelText('Project Name') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '-my-project-' } });
      input.value = '-my-project-';
      fireEvent.blur(input);

      expect(input.value).toBe('my-project');
    });

    it('should allow typing freely during input', () => {
      const mockSetProjectName = vi.fn();
      renderWithI18n(
        <CreateFormStep {...defaultProps} setProjectName={mockSetProjectName} />
      );

      const input = screen.getByLabelText('Project Name');
      fireEvent.change(input, { target: { value: 'My Awesome_Project' } });

      // During typing, the value should be passed as-is
      expect(mockSetProjectName).toHaveBeenCalledWith('My Awesome_Project');
    });
  });

  describe('Location Input', () => {
    it('should display project location value', () => {
      const testLocation = '/Users/test/projects';
      renderWithI18n(
        <CreateFormStep {...defaultProps} projectLocation={testLocation} />
      );

      const input = screen.getByLabelText('Location');
      expect(input).toHaveValue(testLocation);
    });

    it('should call setProjectLocation when input changes', () => {
      const mockSetProjectLocation = vi.fn();
      renderWithI18n(
        <CreateFormStep {...defaultProps} setProjectLocation={mockSetProjectLocation} />
      );

      const input = screen.getByLabelText('Location');
      fireEvent.change(input, { target: { value: '/new/path' } });

      expect(mockSetProjectLocation).toHaveBeenCalledWith('/new/path');
    });

    it('should call onBrowse when browse button is clicked', () => {
      const mockOnBrowse = vi.fn();
      renderWithI18n(
        <CreateFormStep {...defaultProps} onBrowse={mockOnBrowse} />
      );

      const browseButton = screen.getByText('Browse');
      fireEvent.click(browseButton);

      expect(mockOnBrowse).toHaveBeenCalledTimes(1);
    });
  });

  describe('Remote Service Selection', () => {
    it('should call setRemoteConfig with skip when "Skip for now" is selected', () => {
      const mockSetRemoteConfig = vi.fn();
      renderWithI18n(
        <CreateFormStep {...defaultProps} setRemoteConfig={mockSetRemoteConfig} />
      );

      const skipButton = screen.getByText('Skip for now').closest('button');
      fireEvent.click(skipButton!);

      expect(mockSetRemoteConfig).toHaveBeenCalledWith({
        service: null,
        enabled: false
      });
    });

    it('should call setRemoteConfig with github when GitHub is selected', () => {
      const mockSetRemoteConfig = vi.fn();
      renderWithI18n(
        <CreateFormStep {...defaultProps} setRemoteConfig={mockSetRemoteConfig} />
      );

      const githubButton = screen.getByText('GitHub').closest('button');
      fireEvent.click(githubButton!);

      expect(mockSetRemoteConfig).toHaveBeenCalledWith({
        service: 'github',
        enabled: true
      });
    });

    it('should call setRemoteConfig with gitlab when GitLab is selected', () => {
      const mockSetRemoteConfig = vi.fn();
      renderWithI18n(
        <CreateFormStep {...defaultProps} setRemoteConfig={mockSetRemoteConfig} />
      );

      const gitlabButton = screen.getByText('GitLab').closest('button');
      fireEvent.click(gitlabButton!);

      expect(mockSetRemoteConfig).toHaveBeenCalledWith({
        service: 'gitlab',
        enabled: true
      });
    });

    it('should show selected state for chosen service', () => {
      renderWithI18n(
        <CreateFormStep
          {...defaultProps}
          remoteConfig={{ service: 'github', enabled: true }}
        />
      );

      const githubButton = screen.getByText('GitHub').closest('button');
      expect(githubButton).toHaveClass('bg-accent');
    });
  });

  describe('Disabled State', () => {
    it('should disable inputs when isCreating is true', () => {
      renderWithI18n(<CreateFormStep {...defaultProps} isCreating={true} />);

      const nameInput = screen.getByLabelText('Project Name');
      const locationInput = screen.getByLabelText('Location');
      const browseButton = screen.getByText('Browse');

      expect(nameInput).toBeDisabled();
      expect(locationInput).toBeDisabled();
      expect(browseButton).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper labels for all inputs', () => {
      renderWithI18n(<CreateFormStep {...defaultProps} />);

      expect(screen.getByLabelText('Project Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Location')).toBeInTheDocument();
    });

    it('should have clickable buttons for remote options', () => {
      const { container } = renderWithI18n(<CreateFormStep {...defaultProps} />);

      const buttons = container.querySelectorAll('button');
      // Browse button + 3 remote option buttons
      expect(buttons.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('AC Coverage', () => {
    it('AC1: should allow entering project name and location', () => {
      const mockSetProjectName = vi.fn();
      const mockSetProjectLocation = vi.fn();
      renderWithI18n(
        <CreateFormStep
          {...defaultProps}
          setProjectName={mockSetProjectName}
          setProjectLocation={mockSetProjectLocation}
        />
      );

      const nameInput = screen.getByLabelText('Project Name');
      fireEvent.change(nameInput, { target: { value: 'test-project' } });

      const locationInput = screen.getByLabelText('Location');
      fireEvent.change(locationInput, { target: { value: '/test/path' } });

      expect(mockSetProjectName).toHaveBeenCalledWith('test-project');
      expect(mockSetProjectLocation).toHaveBeenCalledWith('/test/path');
    });

    it('AC2: should allow selecting remote service option', () => {
      const mockSetRemoteConfig = vi.fn();
      renderWithI18n(
        <CreateFormStep {...defaultProps} setRemoteConfig={mockSetRemoteConfig} />
      );

      const githubButton = screen.getByText('GitHub').closest('button');
      fireEvent.click(githubButton!);

      expect(mockSetRemoteConfig).toHaveBeenCalledWith({
        service: 'github',
        enabled: true
      });
    });
  });
});
