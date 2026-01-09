/**
 * @vitest-environment jsdom
 */
/**
 * ServiceSelectStep component tests
 *
 * Tests for service selection step in remote setup modal.
 * Verifies GitHub, GitLab, and None options with proper callbacks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ServiceSelectStep } from '../ServiceSelectStep';
import type { RemoteServiceOption } from '../types';

// Mock i18n with readable translations
const translations: Record<string, string> = {
  'remoteSetup.serviceSelect.github': 'GitHub',
  'remoteSetup.serviceSelect.gitlab': 'GitLab',
  'remoteSetup.serviceSelect.none': 'Skip for now',
  'remoteSetup.serviceSelect.githubDescription': 'Create or link a GitHub repository',
  'remoteSetup.serviceSelect.gitlabDescription': 'Create or link a GitLab project',
  'remoteSetup.serviceSelect.noneDescription': 'Initialize git without a remote',
};

const mockT = vi.fn((key: string) => translations[key] || key);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function renderWithI18n(ui: React.ReactElement) {
  return render(ui);
}

describe('ServiceSelectStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render three service selection cards', () => {
      const mockOnSelect = vi.fn();
      renderWithI18n(<ServiceSelectStep onSelect={mockOnSelect} />);

      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('GitLab')).toBeInTheDocument();
      expect(screen.getByText('Skip for now')).toBeInTheDocument();
    });

    it('should display descriptions for each service option', () => {
      const mockOnSelect = vi.fn();
      renderWithI18n(<ServiceSelectStep onSelect={mockOnSelect} />);

      expect(screen.getByText('Create or link a GitHub repository')).toBeInTheDocument();
      expect(screen.getByText('Create or link a GitLab project')).toBeInTheDocument();
      expect(screen.getByText('Initialize git without a remote')).toBeInTheDocument();
    });

    it('should use card layout with proper styling', () => {
      const mockOnSelect = vi.fn();
      const { container } = renderWithI18n(<ServiceSelectStep onSelect={mockOnSelect} />);

      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBe(3);
    });
  });

  describe('Service Selection Callbacks', () => {
    it('should call onSelect with "github" when GitHub card is clicked', () => {
      const mockOnSelect = vi.fn();
      renderWithI18n(<ServiceSelectStep onSelect={mockOnSelect} />);

      const githubButton = screen.getByText('GitHub').closest('button');
      fireEvent.click(githubButton!);

      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith('github');
    });

    it('should call onSelect with "gitlab" when GitLab card is clicked', () => {
      const mockOnSelect = vi.fn();
      renderWithI18n(<ServiceSelectStep onSelect={mockOnSelect} />);

      const gitlabButton = screen.getByText('GitLab').closest('button');
      fireEvent.click(gitlabButton!);

      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith('gitlab');
    });

    it('should call onSelect with null when "Skip for now" card is clicked', () => {
      const mockOnSelect = vi.fn();
      renderWithI18n(<ServiceSelectStep onSelect={mockOnSelect} />);

      const noneButton = screen.getByText('Skip for now').closest('button');
      fireEvent.click(noneButton!);

      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith(null);
    });
  });

  describe('Type Safety', () => {
    it('should accept RemoteServiceOption type for onSelect callback', () => {
      const mockOnSelect = vi.fn((service: RemoteServiceOption) => {
        // Verify type compatibility
        expect(typeof service === 'string' || service === null).toBe(true);
      });

      renderWithI18n(<ServiceSelectStep onSelect={mockOnSelect} />);

      // Test GitHub selection
      const githubButton = screen.getByText('GitHub').closest('button');
      fireEvent.click(githubButton!);
      expect(mockOnSelect).toHaveBeenCalledWith('github');

      // Reset and test null selection
      mockOnSelect.mockClear();
      const noneButton = screen.getByText('Skip for now').closest('button');
      fireEvent.click(noneButton!);
      expect(mockOnSelect).toHaveBeenCalledWith(null);
    });
  });

  describe('Accessibility', () => {
    it('should have clickable buttons with proper styling', () => {
      const mockOnSelect = vi.fn();
      const { container } = renderWithI18n(<ServiceSelectStep onSelect={mockOnSelect} />);

      const buttons = container.querySelectorAll('button');
      buttons.forEach(button => {
        expect(button).toBeVisible();
      });
    });

    it('should display service options with consistent visual weight', () => {
      const mockOnSelect = vi.fn();
      const { container } = renderWithI18n(<ServiceSelectStep onSelect={mockOnSelect} />);

      const grid = container.querySelector('.grid');
      expect(grid).toBeInTheDocument();
      expect(grid?.className).toContain('gap-3');
    });
  });

  describe('AC Coverage', () => {
    it('AC1: should display three service options (GitHub, GitLab, None)', () => {
      const mockOnSelect = vi.fn();
      renderWithI18n(<ServiceSelectStep onSelect={mockOnSelect} />);

      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('GitLab')).toBeInTheDocument();
      expect(screen.getByText('Skip for now')).toBeInTheDocument();
    });

    it('AC2: should call onSelect with correct service when option is selected', () => {
      const mockOnSelect = vi.fn();
      renderWithI18n(<ServiceSelectStep onSelect={mockOnSelect} />);

      // Test GitHub
      const githubButton = screen.getByText('GitHub').closest('button');
      fireEvent.click(githubButton!);
      expect(mockOnSelect).toHaveBeenLastCalledWith('github');

      // Test GitLab
      const gitlabButton = screen.getByText('GitLab').closest('button');
      fireEvent.click(gitlabButton!);
      expect(mockOnSelect).toHaveBeenLastCalledWith('gitlab');

      // Test None
      const noneButton = screen.getByText('Skip for now').closest('button');
      fireEvent.click(noneButton!);
      expect(mockOnSelect).toHaveBeenLastCalledWith(null);
    });

    it('AC3: should allow skipping remote setup with "None" option', () => {
      const mockOnSelect = vi.fn();
      renderWithI18n(<ServiceSelectStep onSelect={mockOnSelect} />);

      const noneButton = screen.getByText('Skip for now').closest('button');
      fireEvent.click(noneButton!);

      expect(mockOnSelect).toHaveBeenCalledWith(null);
    });
  });
});
