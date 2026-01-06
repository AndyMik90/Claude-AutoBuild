/**
 * @vitest-environment jsdom
 */
/**
 * InitializationStep component tests
 *
 * Tests for the initialization step that handles Git and Auto Claude setup.
 * Verifies auto-initialization of Git and optional Auto Claude initialization.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InitializationStep } from '../InitializationStep';

// Mock i18n with readable translations
const translations: Record<string, string> = {
  'wizard.steps.initialize.title': 'Initialize Project',
  'wizard.steps.initialize.description': 'Set up your project for development',
  'wizard.steps.initialize.git.title': 'Git Repository',
  'wizard.steps.initialize.git.description': 'Initialize Git for version control',
  'wizard.steps.initialize.git.loading': 'Initializing Git repository...',
  'wizard.steps.initialize.git.success': 'Git repository initialized',
  'wizard.steps.initialize.autoClaude.title': 'Auto Claude Setup',
  'wizard.steps.initialize.autoClaude.description': 'Enable AI-powered development features',
  'wizard.steps.initialize.autoClaude.initialize': 'Initialize',
  'wizard.steps.initialize.autoClaude.loading': 'Setting up Auto Claude...',
  'wizard.steps.initialize.autoClaude.success': 'Auto Claude ready',
  'wizard.steps.initialize.required': 'Required',
  'wizard.steps.initialize.retry': 'Retry',
  'wizard.steps.initialize.errorTitle': 'Some actions failed',
  'wizard.steps.initialize.errorDescription': 'You can retry the failed actions above, or continue anyway.',
  'wizard.steps.initialize.proceeding': 'Proceeding...',
  'wizard.steps.initialize.continue': 'Continue',
  'wizard.steps.initialize.error': 'Failed to initialize',
};

const mockT = vi.fn((key: string, defaultValue: string) => translations[key] || defaultValue);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock window.electronAPI
const mockInitializeGit = vi.fn();
const mockInitializeProjectByPath = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  // Mock window.electronAPI
  Object.defineProperty(window, 'electronAPI', {
    value: {
      initializeGit: mockInitializeGit,
      initializeProjectByPath: mockInitializeProjectByPath,
    },
    writable: true,
    configurable: true,
  });
});

function renderWithI18n(ui: React.ReactElement) {
  return render(ui);
}

describe('InitializationStep', () => {
  const defaultProps = {
    projectPath: '/test/project',
    onNext: vi.fn(),
    isCreating: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render title and description', () => {
      renderWithI18n(<InitializationStep {...defaultProps} />);

      expect(screen.getByText('Initialize Project')).toBeInTheDocument();
      expect(screen.getByText('Set up your project for development')).toBeInTheDocument();
    });

    it('should render both initialization cards', () => {
      renderWithI18n(<InitializationStep {...defaultProps} />);

      expect(screen.getByText('Git Repository')).toBeInTheDocument();
      expect(screen.getByText('Initialize Git for version control')).toBeInTheDocument();
      expect(screen.getByText('Auto Claude Setup')).toBeInTheDocument();
      expect(screen.getByText('Enable AI-powered development features')).toBeInTheDocument();
    });

    it('should show "Required" badge on Git card only', () => {
      renderWithI18n(<InitializationStep {...defaultProps} />);

      const requiredBadges = screen.getAllByText('Required');
      expect(requiredBadges.length).toBe(1);
    });

    it('should show Initialize button on Auto Claude card when idle', () => {
      renderWithI18n(<InitializationStep {...defaultProps} />);

      expect(screen.getByText('Initialize')).toBeInTheDocument();
    });

    it('should disable Continue button when Git is not complete', () => {
      renderWithI18n(<InitializationStep {...defaultProps} />);

      const continueButton = screen.getByText('Continue');
      expect(continueButton).toBeDisabled();
    });
  });

  describe('Git Initialization', () => {
    it('should auto-run Git initialization on mount', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      await waitFor(() => {
        expect(mockInitializeGit).toHaveBeenCalledWith('/test/project');
      });
    });

    it('should show loading state during Git initialization', async () => {
      mockInitializeGit.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderWithI18n(<InitializationStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Initializing Git repository...')).toBeInTheDocument();
      });
    });

    it('should show success state after Git initialization completes', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Git repository initialized')).toBeInTheDocument();
      });
    });

    it('should show error state when Git initialization fails', async () => {
      mockInitializeGit.mockResolvedValue({
        success: false,
        error: 'Git not found',
      });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Git not found')).toBeInTheDocument();
      });
    });

    it('should show Retry button on Git card when initialization fails', async () => {
      mockInitializeGit.mockResolvedValue({
        success: false,
        error: 'Git not found',
      });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('should retry Git initialization when Retry button is clicked', async () => {
      mockInitializeGit
        .mockResolvedValueOnce({
          success: false,
          error: 'First failure',
        })
        .mockResolvedValueOnce({
          success: true,
          data: { success: true },
        });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      // Wait for first attempt to fail
      await waitFor(() => {
        expect(screen.getByText('First failure')).toBeInTheDocument();
      });

      // Click retry
      const retryButton = screen.getAllByText('Retry')[0];
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(mockInitializeGit).toHaveBeenCalledTimes(2);
      });
    });

    it('should enable Continue button when Git succeeds', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      await waitFor(() => {
        const continueButton = screen.getByText('Continue');
        expect(continueButton).toBeEnabled();
      });
    });
  });

  describe('Auto Claude Initialization', () => {
    it('should show Initialize button when Auto Claude is idle', () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      expect(screen.getByText('Initialize')).toBeInTheDocument();
    });

    it('should start Auto Claude initialization when Initialize button is clicked', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });
      mockInitializeProjectByPath.mockResolvedValue({ success: true, data: { success: true } });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      const initializeButton = screen.getByText('Initialize');
      fireEvent.click(initializeButton);

      await waitFor(() => {
        expect(mockInitializeProjectByPath).toHaveBeenCalledWith('/test/project');
      });
    });

    it('should show loading state during Auto Claude initialization', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });
      mockInitializeProjectByPath.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderWithI18n(<InitializationStep {...defaultProps} />);

      const initializeButton = screen.getByText('Initialize');
      fireEvent.click(initializeButton);

      await waitFor(() => {
        expect(screen.getByText('Setting up Auto Claude...')).toBeInTheDocument();
      });
    });

    it('should show success state after Auto Claude initialization completes', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });
      mockInitializeProjectByPath.mockResolvedValue({ success: true, data: { success: true } });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      const initializeButton = screen.getByText('Initialize');
      fireEvent.click(initializeButton);

      await waitFor(() => {
        expect(screen.getByText('Auto Claude ready')).toBeInTheDocument();
      });
    });

    it('should show error state when Auto Claude initialization fails', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });
      mockInitializeProjectByPath.mockResolvedValue({
        success: false,
        error: 'Auto Claude setup failed',
      });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      const initializeButton = screen.getByText('Initialize');
      fireEvent.click(initializeButton);

      await waitFor(() => {
        expect(screen.getByText('Auto Claude setup failed')).toBeInTheDocument();
      });
    });

    it('should show Retry button on Auto Claude card when initialization fails', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });
      mockInitializeProjectByPath.mockResolvedValue({
        success: false,
        error: 'Setup failed',
      });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      const initializeButton = screen.getByText('Initialize');
      fireEvent.click(initializeButton);

      await waitFor(() => {
        const retryButtons = screen.getAllByText('Retry');
        expect(retryButtons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Notice', () => {
    it('should show error notice when Git fails', async () => {
      mockInitializeGit.mockResolvedValue({
        success: false,
        error: 'Git error',
      });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Some actions failed')).toBeInTheDocument();
        expect(screen.getByText('You can retry the failed actions above, or continue anyway.')).toBeInTheDocument();
      });
    });

    it('should show error notice when Auto Claude fails', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });
      mockInitializeProjectByPath.mockResolvedValue({
        success: false,
        error: 'Auto Claude error',
      });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      const initializeButton = screen.getByText('Initialize');
      fireEvent.click(initializeButton);

      await waitFor(() => {
        expect(screen.getByText('Some actions failed')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should call onNext when Continue button is clicked after Git succeeds', async () => {
      const mockOnNext = vi.fn();
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });

      renderWithI18n(<InitializationStep {...defaultProps} onNext={mockOnNext} />);

      await waitFor(() => {
        const continueButton = screen.getByText('Continue');
        expect(continueButton).toBeEnabled();
      });

      const continueButton = screen.getByText('Continue');
      fireEvent.click(continueButton);

      expect(mockOnNext).toHaveBeenCalledTimes(1);
    });

    it('should show Proceeding state when isCreating is true', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });

      renderWithI18n(<InitializationStep {...defaultProps} isCreating={true} />);

      await waitFor(() => {
        expect(screen.getByText('Proceeding...')).toBeInTheDocument();
      });
    });

    it('should disable Continue button when isCreating is true', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });

      renderWithI18n(<InitializationStep {...defaultProps} isCreating={true} />);

      await waitFor(() => {
        const continueButton = screen.getByText('Proceeding...');
        expect(continueButton).toBeDisabled();
      });
    });
  });

  describe('AC Coverage', () => {
    it('AC1: should auto-initialize Git on mount', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      await waitFor(() => {
        expect(mockInitializeGit).toHaveBeenCalledWith('/test/project');
      });
    });

    it('AC2: should allow user to initialize Auto Claude via button', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });
      mockInitializeProjectByPath.mockResolvedValue({ success: true, data: { success: true } });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      const initializeButton = screen.getByText('Initialize');
      fireEvent.click(initializeButton);

      await waitFor(() => {
        expect(mockInitializeProjectByPath).toHaveBeenCalledWith('/test/project');
      });
    });

    it('AC3: should allow proceeding when Git is complete (Auto Claude optional)', async () => {
      const mockOnNext = vi.fn();
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });

      renderWithI18n(<InitializationStep {...defaultProps} onNext={mockOnNext} />);

      await waitFor(() => {
        const continueButton = screen.getByText('Continue');
        expect(continueButton).toBeEnabled();
      });

      const continueButton = screen.getByText('Continue');
      fireEvent.click(continueButton);

      expect(mockOnNext).toHaveBeenCalledTimes(1);
    });

    it('AC4: should show visual confirmation for Git initialization', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Git repository initialized')).toBeInTheDocument();
      });
    });

    it('AC5: should show visual confirmation for Auto Claude initialization', async () => {
      mockInitializeGit.mockResolvedValue({ success: true, data: { success: true } });
      mockInitializeProjectByPath.mockResolvedValue({ success: true, data: { success: true } });

      renderWithI18n(<InitializationStep {...defaultProps} />);

      const initializeButton = screen.getByText('Initialize');
      fireEvent.click(initializeButton);

      await waitFor(() => {
        expect(screen.getByText('Auto Claude ready')).toBeInTheDocument();
      });
    });
  });
});
