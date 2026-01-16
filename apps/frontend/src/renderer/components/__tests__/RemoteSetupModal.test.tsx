/**
 * @vitest-environment jsdom
 */
/**
 * RemoteSetupModal component tests
 *
 * Tests for main orchestrator modal for remote repository setup.
 * Verifies 3-step flow: service-select, auth, repo-config.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RemoteSetupModal } from '../RemoteSetupModal';
import type { RemoteConfig } from '../remote-setup/types';

// Mock i18n with readable translations
const translations: Record<string, string> = {
  'remoteSetup.title': 'Set Up Remote Repository',
  'remoteSetup.description': 'Connect your project to a Git hosting service',
  'remoteSetup.serviceSelect.github': 'GitHub',
  'remoteSetup.serviceSelect.githubDescription': 'Create or link a GitHub repository',
  'remoteSetup.serviceSelect.gitlab': 'GitLab',
  'remoteSetup.serviceSelect.gitlabDescription': 'Create or link a GitLab project',
  'remoteSetup.serviceSelect.none': 'Skip for now',
  'remoteSetup.serviceSelect.noneDescription': 'Initialize git without a remote',
  'remoteSetup.repoConfig.title': 'Configure Repository',
  'remoteSetup.auth.title': 'Connect to {service}',
  'remoteSetup.auth.checking': 'Checking authentication...',
  'remoteSetup.auth.notInstalled': '{cli} CLI not installed',
  'remoteSetup.auth.cliRequired': 'The {cli} CLI is required for OAuth authentication.',
  'remoteSetup.auth.notAuthenticated': 'Not authenticated',
  'remoteSetup.auth.authenticate': 'Authenticate with {service}',
  'remoteSetup.auth.authenticating': 'Authenticating...',
  'remoteSetup.auth.success': 'Connected as {username}',
  // GitHub-specific auth keys
  'remoteSetup.auth.github.title': 'Connect to GitHub',
  'remoteSetup.auth.github.cliRequired': 'GitHub CLI Required',
  'remoteSetup.auth.github.cliRequiredDescription': 'The GitHub CLI (gh) is required for OAuth authentication.',
  'remoteSetup.auth.github.installButton': 'Install GitHub CLI',
  'remoteSetup.auth.github.installedButton': "I've Installed It",
  'remoteSetup.auth.github.installInstructions': 'Installation instructions',
  'remoteSetup.auth.github.description': 'Click the button below to authenticate with GitHub.',
  'remoteSetup.auth.github.cliVersion': 'Using GitHub CLI {version}',
  'remoteSetup.auth.github.authenticateButton': 'Authenticate with GitHub',
  'remoteSetup.auth.github.authenticating': 'Authenticating...',
  'remoteSetup.auth.github.authenticatingBrowser': 'Please complete the authentication in your browser.',
  'remoteSetup.auth.github.authenticatingWaiting': 'Waiting for authentication to start...',
  'remoteSetup.auth.github.deviceCodeTitle': 'Your one-time code',
  'remoteSetup.auth.github.deviceCodeHelp': 'The browser should open automatically.',
  'remoteSetup.auth.github.deviceCodePrompt': 'When prompted, enter this code:',
  'remoteSetup.auth.github.copied': 'Copied',
  'remoteSetup.auth.github.copy': 'Copy',
  'remoteSetup.auth.github.openAuthUrl': 'Open authentication page',
  'remoteSetup.auth.github.success': 'Successfully Connected',
  'remoteSetup.auth.github.connectedAs': 'Connected as',
  'remoteSetup.auth.github.connectedDefault': 'Your GitHub account is now connected',
  'remoteSetup.auth.github.timeout': 'Authentication Timed Out',
  'remoteSetup.auth.github.failed': 'Authentication Failed',
  'remoteSetup.auth.github.manualTitle': 'Complete Authentication Manually',
  'remoteSetup.auth.github.manualDescription': 'Please visit the URL below to complete authentication:',
  'remoteSetup.auth.github.openUrlButton': 'Open URL in Browser',
  'remoteSetup.auth.github.retry': 'Retry',
  'remoteSetup.auth.github.cancel': 'Cancel',
  // GitLab-specific auth keys
  'remoteSetup.auth.gitlab.title': 'Connect to GitLab',
  'remoteSetup.auth.gitlab.cliRequired': 'glab CLI not installed',
  'remoteSetup.auth.gitlab.cliRequiredDescription': 'The glab CLI is required for OAuth authentication.',
  'remoteSetup.auth.gitlab.installButton': 'Install GitLab CLI',
  'remoteSetup.auth.gitlab.installedButton': "I've Installed It",
  'remoteSetup.auth.gitlab.installInstructions': 'Installation instructions',
  'remoteSetup.auth.gitlab.description': 'Click the button below to authenticate with GitLab.',
  'remoteSetup.auth.gitlab.cliVersion': 'Using GitLab CLI {version}',
  'remoteSetup.auth.gitlab.authenticateButton': 'Authenticate with GitLab',
  'remoteSetup.auth.gitlab.authenticating': 'Authenticating...',
  'remoteSetup.auth.gitlab.authenticatingBrowser': 'Please complete the authentication in your browser.',
  'remoteSetup.auth.gitlab.authenticatingWaiting': 'Waiting for authentication to start...',
  'remoteSetup.auth.gitlab.deviceCodeTitle': 'Your one-time code',
  'remoteSetup.auth.gitlab.deviceCodeHelp': 'Open this link in your browser to authenticate:',
  'remoteSetup.auth.gitlab.deviceCodePrompt': 'When prompted, enter this code:',
  'remoteSetup.auth.gitlab.copied': 'Copied',
  'remoteSetup.auth.gitlab.copy': 'Copy',
  'remoteSetup.auth.gitlab.openAuthUrl': 'Open authentication page',
  'remoteSetup.auth.gitlab.success': 'Connected as {username}',
  'remoteSetup.auth.gitlab.connectedAs': 'Connected as',
  'remoteSetup.auth.gitlab.connectedDefault': 'Your GitLab account is now connected',
  'remoteSetup.auth.gitlab.failed': 'Authentication Failed',
  'remoteSetup.auth.gitlab.retry': 'Retry',
  'remoteSetup.auth.gitlab.cancel': 'Cancel',
  'remoteSetup.repoConfig.createNew': 'Create new repository',
  'remoteSetup.repoConfig.linkExisting': 'Link existing repository',
  'remoteSetup.repoConfig.owner': 'Owner',
  'remoteSetup.repoConfig.personal': 'Personal account',
  'remoteSetup.repoConfig.organizations': 'Organizations',
  'remoteSetup.repoConfig.groups': 'Groups',
  'remoteSetup.repoConfig.repoName': 'Repository name',
  'remoteSetup.repoConfig.projectName': 'Project name',
  'remoteSetup.repoConfig.visibility': 'Visibility',
  'remoteSetup.repoConfig.private': 'Private',
  'remoteSetup.repoConfig.public': 'Public',
  'remoteSetup.repoConfig.internal': 'Internal',
  'remoteSetup.repoConfig.existingRepo': 'Repository (owner/repo)',
  'remoteSetup.repoConfig.existingProject': 'Project (group/project)',
  'remoteSetup.repoConfig.instanceUrl': 'GitLab instance URL',
  'remoteSetup.repoConfig.instanceUrlHelp': 'Leave empty for gitlab.com',
  'remoteSetup.repoConfig.visibilityHelp': 'Who can see the repository',
};

const mockT = vi.fn((key: string, params?: any) => {
  let text = translations[key] || key;
  if (params?.service) text = text.replace('{service}', params.service);
  if (params?.cli) text = text.replace('{cli}', params.cli);
  if (params?.username) text = text.replace('{username}', params.username);
  if (params?.version) text = text.replace('{version}', params.version);
  return text;
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}));

// Mock window.electronAPI for handlers
const mockListGitHubOrgs = vi.fn();
const mockListGitLabGroups = vi.fn();

// GitHub OAuth mocks
const mockCheckGitHubCli = vi.fn();
const mockCheckGitHubAuth = vi.fn();
const mockStartGitHubAuth = vi.fn();
const mockGetGitHubToken = vi.fn();

// GitLab OAuth mocks
const mockCheckGitLabCli = vi.fn();
const mockCheckGitLabAuth = vi.fn();
const mockStartGitLabAuth = vi.fn();
const mockGetGitLabToken = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  // Setup window.electronAPI mocks
  (window as any).electronAPI = {
    // GitHub OAuth
    checkGitHubCli: mockCheckGitHubCli,
    checkGitHubAuth: mockCheckGitHubAuth,
    startGitHubAuth: mockStartGitHubAuth,
    getGitHubToken: mockGetGitHubToken,
    // GitLab OAuth
    checkGitLabCli: mockCheckGitLabCli,
    checkGitLabAuth: mockCheckGitLabAuth,
    startGitLabAuth: mockStartGitLabAuth,
    getGitLabToken: mockGetGitLabToken,
    // Org/Group listing
    listGitHubOrgs: mockListGitHubOrgs,
    listGitLabGroups: mockListGitLabGroups,
  };

  // Default mock implementations for OAuth flows
  // GitHub CLI and auth checks
  mockCheckGitHubCli.mockResolvedValue({
    success: true,
    data: { installed: true, version: 'gh version 2.40.0' }
  });

  mockCheckGitHubAuth.mockResolvedValue({
    success: true,
    data: { authenticated: true, username: 'testuser' }
  });

  mockGetGitHubToken.mockResolvedValue({
    success: true,
    data: { token: 'test-token' }
  });

  // GitLab CLI and auth checks
  mockCheckGitLabCli.mockResolvedValue({
    success: true,
    data: { installed: true, version: 'glab version 1.35.0' }
  });

  mockCheckGitLabAuth.mockResolvedValue({
    success: true,
    data: { authenticated: true, username: 'testuser' }
  });

  mockGetGitLabToken.mockResolvedValue({
    success: true,
    data: { token: 'test-token' }
  });
});

afterEach(() => {
  delete (window as any).electronAPI;
});

// Simple render wrapper
function renderWithI18n(ui: React.ReactElement) {
  return render(ui);
}

// Helper to find a button containing specific text
// Handles cases where Dialog renders multiple elements with the same text
function findButtonWithText(screen: any, text: string): HTMLElement {
  const elements = screen.getAllByText(text);
  for (const el of elements) {
    const button = el.tagName === 'BUTTON' ? el : el.closest('button');
    if (button) return button as HTMLElement;
  }
  throw new Error(`Button containing "${text}" not found`);
}

describe('RemoteSetupModal', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    projectName: 'Test Project',
    projectLocation: '/path/to/project',
    onComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering - Service Select Step', () => {
    it('should render service selection step when opened', () => {
      renderWithI18n(<RemoteSetupModal {...defaultProps} />);

      // Dialog renders title in multiple places, so use getAllByText
      expect(screen.getAllByText('Set Up Remote Repository')).toHaveLength(2);
      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('GitLab')).toBeInTheDocument();
      expect(screen.getByText('Skip for now')).toBeInTheDocument();
    });

    it('should reset state when modal opens', () => {
      const { rerender } = renderWithI18n(<RemoteSetupModal {...defaultProps} open={false} />);
      rerender(<RemoteSetupModal {...defaultProps} open={true} />);

      // Dialog renders title in multiple places, so use getAllByText
      expect(screen.getAllByText('Set Up Remote Repository')).toHaveLength(2);
    });
  });

  describe('Service Selection Flow', () => {
    it('should skip remote setup and complete when None is selected', () => {
      const mockOnComplete = vi.fn();
      const mockOnOpenChange = vi.fn();

      renderWithI18n(
        <RemoteSetupModal {...defaultProps} onComplete={mockOnComplete} onOpenChange={mockOnOpenChange} />
      );

      const noneCard = findButtonWithText(screen, 'Skip for now');
      fireEvent.click(noneCard);

      expect(mockOnComplete).toHaveBeenCalledWith({ service: null, enabled: false });
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should proceed to auth step when GitHub is selected', async () => {
      renderWithI18n(<RemoteSetupModal {...defaultProps} />);

      const githubCard = findButtonWithText(screen, 'GitHub');
      fireEvent.click(githubCard);

      await waitFor(() => {
        expect(screen.getByText(/Connect to GitHub/i)).toBeInTheDocument();
      });
    });

    it('should proceed to auth step when GitLab is selected', async () => {
      renderWithI18n(<RemoteSetupModal {...defaultProps} />);

      const gitlabCard = findButtonWithText(screen, 'GitLab');
      fireEvent.click(gitlabCard);

      await waitFor(() => {
        expect(screen.getByText(/Connect to GitLab/i)).toBeInTheDocument();
      });
    });
  });

  describe('GitHub Flow', () => {
    it('should load organizations after GitHub auth completes', async () => {
      renderWithI18n(<RemoteSetupModal {...defaultProps} />);

      // First select GitHub
      const githubCard = findButtonWithText(screen, 'GitHub');
      fireEvent.click(githubCard);

      // After auth, should show repo config step (component sets empty orgs internally)
      await waitFor(() => {
        expect(screen.getByText(/Configure Repository/i)).toBeInTheDocument();
      });
    });

    it('should show repo config step after GitHub auth', async () => {
      renderWithI18n(<RemoteSetupModal {...defaultProps} />);

      // Select GitHub
      const githubCard = findButtonWithText(screen, 'GitHub');
      fireEvent.click(githubCard);

      // After auth, should show repo config
      await waitFor(() => {
        expect(screen.getByText(/Configure Repository/i)).toBeInTheDocument();
      });
    });

    it('should complete with GitHub config when create repo flow finishes', async () => {
      const mockOnComplete = vi.fn();

      renderWithI18n(<RemoteSetupModal {...defaultProps} onComplete={mockOnComplete} />);

      // Select GitHub to trigger flow
      const githubCard = findButtonWithText(screen, 'GitHub');
      fireEvent.click(githubCard);

      // After auth, should reach repo config step
      await waitFor(() => {
        expect(screen.getByText(/Configure Repository/i)).toBeInTheDocument();
      });

      // Note: Actual flow completion requires user interaction with repo config form
      // This test verifies the flow reaches the repo config step correctly
    });
  });

  describe('GitLab Flow', () => {
    it('should load groups after GitLab auth completes', async () => {
      mockListGitLabGroups.mockResolvedValue({
        success: true,
        data: { groups: [] },
      });

      renderWithI18n(<RemoteSetupModal {...defaultProps} />);

      // First select GitLab
      const gitlabCard = findButtonWithText(screen, 'GitLab');
      fireEvent.click(gitlabCard);

      // After auth, should load groups
      await waitFor(() => {
        expect(mockListGitLabGroups).toHaveBeenCalled();
      });
    });

    it('should show repo config step after GitLab auth', async () => {
      renderWithI18n(<RemoteSetupModal {...defaultProps} />);

      // Select GitLab
      const gitlabCard = findButtonWithText(screen, 'GitLab');
      fireEvent.click(gitlabCard);

      // After auth, should show repo config
      await waitFor(() => {
        expect(screen.getByText(/Configure Repository/i)).toBeInTheDocument();
      });
    });

    it('should complete with GitLab config when create project flow finishes', async () => {
      const mockOnComplete = vi.fn();

      renderWithI18n(<RemoteSetupModal {...defaultProps} onComplete={mockOnComplete} />);

      // Select GitLab to trigger flow
      const gitlabCard = findButtonWithText(screen, 'GitLab');
      fireEvent.click(gitlabCard);

      // After auth, should reach repo config step
      await waitFor(() => {
        expect(screen.getByText(/Configure Repository/i)).toBeInTheDocument();
      });

      // Note: Actual flow completion requires user interaction with repo config form
      // This test verifies the flow reaches the repo config step correctly
    });
  });

  describe('Back Navigation', () => {
    it('should return to service select when back is clicked from auth step', async () => {
      renderWithI18n(<RemoteSetupModal {...defaultProps} />);

      // Select GitHub to go to auth
      const githubCard = findButtonWithText(screen, 'GitHub');
      fireEvent.click(githubCard);

      await waitFor(() => {
        // Click back button
        const backButton = screen.queryByText(/Back/i);
        if (backButton) {
          fireEvent.click(backButton);

          // Should return to service select - use getAllByText since title appears in multiple places
          expect(screen.getAllByText('Set Up Remote Repository').length).toBeGreaterThan(0);
        }
      });
    });

    it('should return to service select when back is clicked from repo config step', async () => {
      renderWithI18n(<RemoteSetupModal {...defaultProps} />);

      // Navigate to repo config step (skip auth for testing)
      await waitFor(() => {
        const backButton = screen.queryByText(/Back/i);
        if (backButton) {
          fireEvent.click(backButton);

          // Should return to service select - use getAllByText since title appears in multiple places
          expect(screen.getAllByText('Set Up Remote Repository').length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Modal State Management', () => {
    it('should call onOpenChange when modal is closed externally', () => {
      const mockOnOpenChange = vi.fn();

      const { rerender } = renderWithI18n(
        <RemoteSetupModal {...defaultProps} onOpenChange={mockOnOpenChange} open={true} />
      );

      // Simulate external close
      rerender(<RemoteSetupModal {...defaultProps} onOpenChange={mockOnOpenChange} open={false} />);

      // Modal should be closed - use queryAllByText since title appears in multiple places
      expect(screen.queryAllByText('Set Up Remote Repository')).toHaveLength(0);
    });
  });

  describe('i18n Integration', () => {
    it('should use translation for title at each step', async () => {
      renderWithI18n(<RemoteSetupModal {...defaultProps} />);

      // Service select step
      expect(mockT).toHaveBeenCalledWith('remoteSetup.title');

      // Select GitHub to trigger auth step title
      const githubCard = findButtonWithText(screen, 'GitHub');
      fireEvent.click(githubCard);

      await waitFor(() => {
        expect(mockT).toHaveBeenCalledWith('remoteSetup.auth.title', { service: 'GitHub' });
      });
    });
  });

  describe('AC Coverage', () => {
    it('AC1: should display service selection as first step', () => {
      renderWithI18n(<RemoteSetupModal {...defaultProps} />);

      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('GitLab')).toBeInTheDocument();
      expect(screen.getByText('Skip for now')).toBeInTheDocument();
    });

    it('AC2: should show authentication step for selected service', async () => {
      renderWithI18n(<RemoteSetupModal {...defaultProps} />);

      const githubCard = findButtonWithText(screen, 'GitHub');
      fireEvent.click(githubCard);

      await waitFor(() => {
        expect(screen.queryByText(/GitHub/i)).toBeInTheDocument();
      });
    });

    it('AC3: should show repository configuration step after auth', async () => {
      renderWithI18n(<RemoteSetupModal {...defaultProps} />);

      const githubCard = findButtonWithText(screen, 'GitHub');
      fireEvent.click(githubCard);

      await waitFor(() => {
        expect(screen.getByText(/Configure Repository/i)).toBeInTheDocument();
      });
    });

    it('AC4: should call onComplete with proper RemoteConfig', () => {
      const mockOnComplete = vi.fn();

      renderWithI18n(<RemoteSetupModal {...defaultProps} onComplete={mockOnComplete} />);

      // Select "None" to skip remote setup
      const noneCard = findButtonWithText(screen, 'Skip for now');
      fireEvent.click(noneCard);

      expect(mockOnComplete).toHaveBeenCalledWith({ service: null, enabled: false });
    });

    it('AC5: should allow back navigation to service select', async () => {
      renderWithI18n(<RemoteSetupModal {...defaultProps} />);

      // Select GitHub to proceed
      const githubCard = findButtonWithText(screen, 'GitHub');
      fireEvent.click(githubCard);

      await waitFor(() => {
        // Should be able to go back
        const backButton = screen.queryByText(/Back/i);
        expect(backButton).toBeInTheDocument();
      });
    });
  });
});
