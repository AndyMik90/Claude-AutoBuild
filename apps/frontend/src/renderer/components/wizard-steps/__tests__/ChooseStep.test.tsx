/**
 * @vitest-environment jsdom
 */
/**
 * ChooseStep component tests
 *
 * Tests for the initial step of the project creation wizard.
 * Verifies "Open Existing" and "Create New" options with proper callbacks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChooseStep } from '../ChooseStep';

// Mock i18n with readable translations
const translations: Record<string, string> = {
  'wizard.steps.choose.openExisting': 'Open Existing Folder',
  'wizard.steps.choose.openExistingDescription': 'Browse to an existing project on your computer',
  'wizard.steps.choose.createNew': 'Create New Project',
  'wizard.steps.choose.createNewDescription': 'Start fresh with a new project folder',
  'wizard.steps.choose.openExistingAriaLabel': 'Open existing project folder',
  'wizard.steps.choose.createNewAriaLabel': 'Create new project',
};

const mockT = vi.fn((key: string) => translations[key] || key);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function renderWithI18n(ui: React.ReactElement) {
  return render(ui);
}

describe('ChooseStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render two action cards', () => {
      const mockOnOpenExisting = vi.fn();
      const mockOnCreateNew = vi.fn();
      renderWithI18n(
        <ChooseStep onOpenExisting={mockOnOpenExisting} onCreateNew={mockOnCreateNew} />
      );

      expect(screen.getByText('Open Existing Folder')).toBeInTheDocument();
      expect(screen.getByText('Create New Project')).toBeInTheDocument();
    });

    it('should display descriptions for each option', () => {
      const mockOnOpenExisting = vi.fn();
      const mockOnCreateNew = vi.fn();
      renderWithI18n(
        <ChooseStep onOpenExisting={mockOnOpenExisting} onCreateNew={mockOnCreateNew} />
      );

      expect(screen.getByText('Browse to an existing project on your computer')).toBeInTheDocument();
      expect(screen.getByText('Start fresh with a new project folder')).toBeInTheDocument();
    });

    it('should use card layout with proper styling', () => {
      const mockOnOpenExisting = vi.fn();
      const mockOnCreateNew = vi.fn();
      const { container } = renderWithI18n(
        <ChooseStep onOpenExisting={mockOnOpenExisting} onCreateNew={mockOnCreateNew} />
      );

      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBe(2);
    });
  });

  describe('Action Callbacks', () => {
    it('should call onOpenExisting when "Open Existing Folder" card is clicked', () => {
      const mockOnOpenExisting = vi.fn();
      const mockOnCreateNew = vi.fn();
      renderWithI18n(
        <ChooseStep onOpenExisting={mockOnOpenExisting} onCreateNew={mockOnCreateNew} />
      );

      const openButton = screen.getByText('Open Existing Folder').closest('button');
      fireEvent.click(openButton!);

      expect(mockOnOpenExisting).toHaveBeenCalledTimes(1);
      expect(mockOnCreateNew).not.toHaveBeenCalled();
    });

    it('should call onCreateNew when "Create New Project" card is clicked', () => {
      const mockOnOpenExisting = vi.fn();
      const mockOnCreateNew = vi.fn();
      renderWithI18n(
        <ChooseStep onOpenExisting={mockOnOpenExisting} onCreateNew={mockOnCreateNew} />
      );

      const createButton = screen.getByText('Create New Project').closest('button');
      fireEvent.click(createButton!);

      expect(mockOnCreateNew).toHaveBeenCalledTimes(1);
      expect(mockOnOpenExisting).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have ARIA labels on both cards', () => {
      const mockOnOpenExisting = vi.fn();
      const mockOnCreateNew = vi.fn();
      renderWithI18n(
        <ChooseStep onOpenExisting={mockOnOpenExisting} onCreateNew={mockOnCreateNew} />
      );

      const openButton = screen.getByText('Open Existing Folder').closest('button');
      const createButton = screen.getByText('Create New Project').closest('button');

      expect(openButton).toHaveAttribute('aria-label', 'Open existing project folder');
      expect(createButton).toHaveAttribute('aria-label', 'Create new project');
    });

    it('should have clickable buttons with proper styling', () => {
      const mockOnOpenExisting = vi.fn();
      const mockOnCreateNew = vi.fn();
      const { container } = renderWithI18n(
        <ChooseStep onOpenExisting={mockOnOpenExisting} onCreateNew={mockOnCreateNew} />
      );

      const buttons = container.querySelectorAll('button');
      buttons.forEach(button => {
        expect(button).toBeVisible();
      });
    });
  });

  describe('AC Coverage', () => {
    it('AC1: should display two options (Open Existing, Create New)', () => {
      const mockOnOpenExisting = vi.fn();
      const mockOnCreateNew = vi.fn();
      renderWithI18n(
        <ChooseStep onOpenExisting={mockOnOpenExisting} onCreateNew={mockOnCreateNew} />
      );

      expect(screen.getByText('Open Existing Folder')).toBeInTheDocument();
      expect(screen.getByText('Create New Project')).toBeInTheDocument();
    });

    it('AC2: should call appropriate callback when option is selected', () => {
      const mockOnOpenExisting = vi.fn();
      const mockOnCreateNew = vi.fn();
      renderWithI18n(
        <ChooseStep onOpenExisting={mockOnOpenExisting} onCreateNew={mockOnCreateNew} />
      );

      // Test Open Existing
      const openButton = screen.getByText('Open Existing Folder').closest('button');
      fireEvent.click(openButton!);
      expect(mockOnOpenExisting).toHaveBeenCalledTimes(1);

      // Test Create New
      mockOnOpenExisting.mockClear();
      const createButton = screen.getByText('Create New Project').closest('button');
      fireEvent.click(createButton!);
      expect(mockOnCreateNew).toHaveBeenCalledTimes(1);
    });
  });
});
