/**
 * @vitest-environment jsdom
 */
/**
 * CompletionStep component tests
 *
 * Tests for the final step of the project creation wizard.
 * Verifies success message display with project details.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CompletionStep } from '../CompletionStep';

// Mock i18n with readable translations
const translations: Record<string, string> = {
  'wizard.steps.complete.title': 'Project Created!',
  'wizard.steps.complete.description': 'Your project is ready to use',
};

const mockT = vi.fn((key: string) => translations[key] || key);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function renderWithI18n(ui: React.ReactElement) {
  return render(ui);
}

describe('CompletionStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render success icon', () => {
      renderWithI18n(
        <CompletionStep
          projectName="test-project"
          projectPath="/Users/test/projects/test-project"
        />
      );

      const successIcon = document.querySelector('svg');
      expect(successIcon).toBeInTheDocument();
    });

    it('should render success title and description', () => {
      renderWithI18n(
        <CompletionStep
          projectName="test-project"
          projectPath="/Users/test/projects/test-project"
        />
      );

      expect(screen.getByText('Project Created!')).toBeInTheDocument();
      expect(screen.getByText('Your project is ready to use')).toBeInTheDocument();
    });

    it('should render project name', () => {
      renderWithI18n(
        <CompletionStep
          projectName="my-awesome-project"
          projectPath="/Users/test/projects/my-awesome-project"
        />
      );

      expect(screen.getByText('my-awesome-project')).toBeInTheDocument();
    });

    it('should render project path', () => {
      const testPath = '/Users/test/projects/test-project';
      renderWithI18n(
        <CompletionStep
          projectName="test-project"
          projectPath={testPath}
        />
      );

      expect(screen.getByText(testPath)).toBeInTheDocument();
    });
  });

  describe('Remote URL Display', () => {
    it('should not render remote URL when not provided', () => {
      renderWithI18n(
        <CompletionStep
          projectName="test-project"
          projectPath="/Users/test/projects/test-project"
        />
      );

      // Check that there's no external link
      const links = screen.queryAllByRole('link');
      expect(links.length).toBe(0);
    });

    it('should render remote URL when provided', () => {
      const remoteUrl = 'https://github.com/user/test-project';
      renderWithI18n(
        <CompletionStep
          projectName="test-project"
          projectPath="/Users/test/projects/test-project"
          remoteUrl={remoteUrl}
        />
      );

      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', remoteUrl);
    });

    it('should render "Remote" label when remote URL is provided', () => {
      renderWithI18n(
        <CompletionStep
          projectName="test-project"
          projectPath="/Users/test/projects/test-project"
          remoteUrl="https://github.com/user/test-project"
        />
      );

      expect(screen.getByText('Remote')).toBeInTheDocument();
    });
  });

  describe('Layout and Styling', () => {
    it('should center content vertically and horizontally', () => {
      const { container } = renderWithI18n(
        <CompletionStep
          projectName="test-project"
          projectPath="/Users/test/projects/test-project"
        />
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer).toHaveClass('flex');
      expect(mainContainer).toHaveClass('flex-col');
      expect(mainContainer).toHaveClass('items-center');
      expect(mainContainer).toHaveClass('justify-center');
    });

    it('should display project details in cards', () => {
      const { container } = renderWithI18n(
        <CompletionStep
          projectName="test-project"
          projectPath="/Users/test/projects/test-project"
        />
      );

      // Project name and path should be in styled containers
      expect(screen.getByText('test-project')).toBeInTheDocument();
      expect(screen.getByText('/Users/test/projects/test-project')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      renderWithI18n(
        <CompletionStep
          projectName="test-project"
          projectPath="/Users/test/projects/test-project"
        />
      );

      const title = screen.getByText('Project Created!');
      expect(title.tagName).toBe('H2');
    });

    it('should render remote link with proper attributes when provided', () => {
      const remoteUrl = 'https://github.com/user/test-project';
      renderWithI18n(
        <CompletionStep
          projectName="test-project"
          projectPath="/Users/test/projects/test-project"
          remoteUrl={remoteUrl}
        />
      );

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty project path', () => {
      renderWithI18n(
        <CompletionStep
          projectName="test-project"
          projectPath=""
        />
      );

      // Should still render successfully
      expect(screen.getByText('Project Created!')).toBeInTheDocument();
      expect(screen.getByText('test-project')).toBeInTheDocument();
    });

    it('should handle very long project paths', () => {
      const longPath = '/Users/very/long/path/that/goes/on/and/on/test-project';
      renderWithI18n(
        <CompletionStep
          projectName="test-project"
          projectPath={longPath}
        />
      );

      expect(screen.getByText(longPath)).toBeInTheDocument();
    });
  });

  describe('AC Coverage', () => {
    it('AC1: should display success message with checkmark icon', () => {
      renderWithI18n(
        <CompletionStep
          projectName="test-project"
          projectPath="/Users/test/projects/test-project"
        />
      );

      expect(screen.getByText('Project Created!')).toBeInTheDocument();
      const icon = document.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('AC2: should display project name and path', () => {
      const testName = 'my-project';
      const testPath = '/path/to/my-project';
      renderWithI18n(
        <CompletionStep
          projectName={testName}
          projectPath={testPath}
        />
      );

      expect(screen.getByText(testName)).toBeInTheDocument();
      expect(screen.getByText(testPath)).toBeInTheDocument();
    });

    it('AC3: should display remote URL link when provided', () => {
      const remoteUrl = 'https://github.com/user/my-project';
      renderWithI18n(
        <CompletionStep
          projectName="my-project"
          projectPath="/path/to/my-project"
          remoteUrl={remoteUrl}
        />
      );

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', remoteUrl);
    });
  });
});
