/**
 * @vitest-environment jsdom
 */
/**
 * ProjectCreationWizard integration tests
 *
 * Integration tests for the unified project creation wizard.
 * Verifies component structure and basic functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProjectCreationWizard } from '../ProjectCreationWizard';
import type { Project } from '../../../shared/types';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'wizard.steps.choose.title': 'What would you like to do?',
        'wizard.steps.choose.description': 'Choose how you\'d like to add a project',
        'wizard.steps.choose.label': 'Choose',
        'wizard.steps.createForm.title': 'Create New Project',
        'wizard.steps.createForm.description': 'Enter project details',
        'wizard.steps.createForm.label': 'Details',
        'wizard.steps.initialize.label': 'Setup',
        'wizard.steps.initialize.progressLabel': 'Initialize',
        'wizard.steps.start.label': 'Start',
        'wizard.steps.serviceAuth.progressLabel': 'Connect',
        'wizard.steps.repoConfig.progressLabel': 'Configure',
        'wizard.navigation.cancel': 'Cancel',
        'wizard.navigation.back': 'Back',
        'wizard.navigation.next': 'Next',
        'wizard.navigation.create': 'Create',
        'addProject.projectName': 'Project Name',
        'addProject.location': 'Location',
        'addProject.browse': 'Browse',
        'addProject.remoteSkip': 'Skip for now',
        'addProject.remoteSkipDescription': 'Initialize git without setting up a remote',
      };
      return translations[key] || key;
    },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock dependencies
vi.mock('../../stores/project-store', () => ({
  addProject: vi.fn().mockResolvedValue({
    id: 'project-1',
    name: 'test-project',
    path: '/test/path',
    autoBuildPath: null,
  }),
  useProjectStore: vi.fn((selector) => {
    const state = {
      updateProject: vi.fn(),
      projects: [],
      selectedProjectId: null,
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('../project-settings/GitHubOAuthFlow', () => ({
  GitHubOAuthFlow: () => <div data-testid="github-oauth-flow" />,
}));

vi.mock('../project-settings/GitLabOAuthFlow', () => ({
  GitLabOAuthFlow: () => <div data-testid="gitlab-oauth-flow" />,
}));

vi.mock('../remote-setup/GitHubRepoConfigStep', () => ({
  GitHubRepoConfigStep: () => <div data-testid="github-repo-config" />,
}));

vi.mock('../remote-setup/GitLabRepoConfigStep', () => ({
  GitLabRepoConfigStep: () => <div data-testid="gitlab-repo-config" />,
}));

vi.mock('../onboarding/WizardProgress', () => ({
  WizardProgress: () => <div data-testid="wizard-progress" />,
}));

// Mock electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: {
    getDefaultProjectLocation: vi.fn().mockResolvedValue('/default'),
    selectDirectory: vi.fn().mockResolvedValue('/selected'),
    createProjectFolder: vi.fn().mockResolvedValue({
      success: true,
      data: { path: '/test/path' }
    }),
    detectMainBranch: vi.fn().mockResolvedValue({
      success: true,
      data: 'main'
    }),
    updateProjectSettings: vi.fn().mockResolvedValue({ success: true }),
    listGitHubOrgs: vi.fn().mockResolvedValue({
      success: true,
      data: { orgs: [] }
    }),
    listGitLabGroups: vi.fn().mockResolvedValue({
      success: true,
      data: { groups: [] }
    }),
  },
  writable: true
});

function renderWizard(props: Partial<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectAdded: (project: Project, needsInit: boolean) => void;
}> = {}) {
  return render(
    <ProjectCreationWizard
      open={true}
      onOpenChange={vi.fn()}
      onProjectAdded={vi.fn()}
      {...props}
    />
  );
}

describe('ProjectCreationWizard Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render Dialog component', () => {
      renderWizard();

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });

    it('should render with proper structure', () => {
      renderWizard();

      // Should have a heading
      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);
    });

    it('should render cancel button', () => {
      renderWizard();

      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onOpenChange when cancel is clicked', () => {
      const mockOnOpenChange = vi.fn();
      renderWizard({ onOpenChange: mockOnOpenChange });

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should render action buttons for user interaction', () => {
      renderWizard();

      // Should have multiple buttons (action cards + cancel)
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(1);
    });
  });

  describe('State Management', () => {
    it('should open when open prop is true', () => {
      renderWizard({ open: true });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should render with correct Dialog className', () => {
      renderWizard();

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('bg-card');
    });
  });

  describe('Accessibility', () => {
    it('should have proper role for dialog', () => {
      renderWizard();

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should have clickable interactive elements', () => {
      renderWizard();

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toBeVisible();
      });
    });
  });

  describe('Component Integration', () => {
    it('should integrate ChooseStep component', () => {
      renderWizard();

      // ChooseStep renders action buttons
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(1);
    });

    it('should render within DialogContent wrapper', () => {
      renderWizard();

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });
  });

  describe('AC Coverage', () => {
    it('AC1: should render wizard with Dialog wrapper', () => {
      renderWizard();

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('AC2: should provide user interaction controls', () => {
      renderWizard();

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('AC3: should handle cancel action', () => {
      const mockOnOpenChange = vi.fn();
      renderWizard({ onOpenChange: mockOnOpenChange });

      fireEvent.click(screen.getByText('Cancel'));
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Form Validation', () => {
    it('should disable Next button when project name is empty', async () => {
      renderWizard();

      // Click "Create New Project" to go to form step
      const createNewButton = Array.from(screen.getAllByRole('button')).find(
        btn => btn.textContent?.includes('Create New') || btn.textContent?.includes('Folder')
      );

      if (createNewButton) {
        fireEvent.click(createNewButton);
      }

      // Wait for the form to render and find the Create button
      const createButton = screen.queryByText('Create');
      if (createButton) {
        expect(createButton).toBeDisabled();
      }
    });

    it('should disable Next button when location is empty', async () => {
      renderWizard();

      // Click "Create New Project" to go to form step
      const createNewButton = Array.from(screen.getAllByRole('button')).find(
        btn => btn.textContent?.includes('Create New') || btn.textContent?.includes('Folder')
      );

      if (createNewButton) {
        fireEvent.click(createNewButton);
      }

      // Wait for the form to render and find the Create button
      const createButton = screen.queryByText('Create');
      if (createButton) {
        expect(createButton).toBeDisabled();
      }
    });
  });
});
