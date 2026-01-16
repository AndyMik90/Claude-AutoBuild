/**
 * @vitest-environment jsdom
 */
/**
 * OwnerSelector component tests
 *
 * Tests for reusable owner/namespace selector component.
 * Supports both GitHub (organizations) and GitLab (groups).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OwnerSelector } from '../OwnerSelector';
import type { Owner } from '../types';

// Mock i18n with readable translations
const translations: Record<string, string> = {
  'remoteSetup.repoConfig.owner': 'Owner',
  'remoteSetup.repoConfig.personal': 'Personal account',
  'remoteSetup.repoConfig.organizations': 'Organizations',
  'remoteSetup.repoConfig.groups': 'Groups',
  'remoteSetup.repoConfig.loading': 'Loading...',
  'remoteSetup.repoConfig.ownerSelectHelp': 'Select your personal account or an organization',
  'remoteSetup.repoConfig.ownerSelectHelpGitLab': 'Select your personal account or a group',
};

const mockT = vi.fn((key: string) => translations[key] || key);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}));

// Helper to create test owner
function createTestOwner(overrides: Partial<Owner> = {}): Owner {
  return {
    id: overrides.id || 'owner-1',
    name: overrides.name || 'Test Owner',
    path: overrides.path || 'test-owner',
    avatarUrl: overrides.avatarUrl,
  };
}

// Simple render wrapper (no longer needs i18n provider)
function renderWithI18n(ui: React.ReactElement) {
  return render(ui);
}

describe('OwnerSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render personal account option', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });

      renderWithI18n(
        <OwnerSelector
          type="github"
          personal={personal}
          organizations={[]}
          selected="testuser"
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByText('testuser')).toBeInTheDocument();
    });

    it('should render organizations when provided', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });
      const organizations = [
        createTestOwner({ id: 'org-1', name: 'Acme Inc', path: 'acme-inc' }),
        createTestOwner({ id: 'org-2', name: 'Tech Corp', path: 'tech-corp' }),
      ];

      renderWithI18n(
        <OwnerSelector
          type="github"
          personal={personal}
          organizations={organizations}
          selected="testuser"
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByText('Acme Inc')).toBeInTheDocument();
      expect(screen.getByText('Tech Corp')).toBeInTheDocument();
    });

    it('should render groups when type is gitlab', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });
      const groups = [
        createTestOwner({ id: 'group-1', name: 'Engineering', path: 'engineering' }),
      ];

      renderWithI18n(
        <OwnerSelector
          type="gitlab"
          personal={personal}
          organizations={groups}
          selected="testuser"
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });

    it('should show loading state when isLoading is true', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });

      renderWithI18n(
        <OwnerSelector
          type="github"
          personal={personal}
          organizations={[]}
          selected="testuser"
          onSelect={mockOnSelect}
          isLoading={true}
        />
      );

      // Should have disabled state on organizations section
      const orgsSection = screen.queryByText(/Organizations|Groups/);
      if (orgsSection) {
        expect(orgsSection.closest('.opacity-50') || orgsSection.closest('[disabled]')).toBeTruthy();
      }
    });
  });

  describe('Selection Behavior', () => {
    it('should call onSelect with personal account path when clicked', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });

      renderWithI18n(
        <OwnerSelector
          type="github"
          personal={personal}
          organizations={[]}
          selected=""
          onSelect={mockOnSelect}
        />
      );

      const personalOption = screen.getByText('testuser').closest('[role="radio"]');
      fireEvent.click(personalOption!);

      expect(mockOnSelect).toHaveBeenCalledWith('testuser');
    });

    it('should call onSelect with organization path when clicked', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });
      const organizations = [
        createTestOwner({ id: 'org-1', name: 'Acme Inc', path: 'acme-inc' }),
      ];

      renderWithI18n(
        <OwnerSelector
          type="github"
          personal={personal}
          organizations={organizations}
          selected="testuser"
          onSelect={mockOnSelect}
        />
      );

      const orgOption = screen.getByText('Acme Inc').closest('[role="radio"]');
      fireEvent.click(orgOption!);

      expect(mockOnSelect).toHaveBeenCalledWith('acme-inc');
    });

    it('should visually indicate selected owner', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });
      const organizations = [
        createTestOwner({ id: 'org-1', name: 'Acme Inc', path: 'acme-inc' }),
      ];

      const { container } = renderWithI18n(
        <OwnerSelector
          type="github"
          personal={personal}
          organizations={organizations}
          selected="acme-inc"
          onSelect={mockOnSelect}
        />
      );

      const selectedRadio = container.querySelector('[aria-checked="true"]');
      expect(selectedRadio).toBeInTheDocument();
      expect(selectedRadio?.textContent).toContain('Acme Inc');
    });

    it('should disable options when disabled prop is true', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });

      const { container } = renderWithI18n(
        <OwnerSelector
          type="github"
          personal={personal}
          organizations={[]}
          selected="testuser"
          onSelect={mockOnSelect}
          disabled={true}
        />
      );

      const radios = container.querySelectorAll('[role="radio"]');
      radios.forEach(radio => {
        expect(radio).toHaveAttribute('disabled');
        // Also check for visual disabled class
        expect(radio).toHaveClass('opacity-50');
      });
    });
  });

  describe('Type Differentiation', () => {
    it('should display "Organizations" label for GitHub', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });

      const { container } = renderWithI18n(
        <OwnerSelector
          type="github"
          personal={personal}
          organizations={[]}
          selected="testuser"
          onSelect={mockOnSelect}
        />
      );

      // GitHub uses "Organizations" in aria-label
      const radiogroup = container.querySelector('[role="radiogroup"]');
      expect(radiogroup).toHaveAttribute('aria-label', 'Organizations');
    });

    it('should display "Groups" label for GitLab', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });

      const { container } = renderWithI18n(
        <OwnerSelector
          type="gitlab"
          personal={personal}
          organizations={[]}
          selected="testuser"
          onSelect={mockOnSelect}
        />
      );

      // GitLab uses "Groups" in aria-label
      const radiogroup = container.querySelector('[role="radiogroup"]');
      expect(radiogroup).toHaveAttribute('aria-label', 'Groups');
    });
  });

  describe('Accessibility', () => {
    it('should use radiogroup role for the container', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });

      const { container } = renderWithI18n(
        <OwnerSelector
          type="github"
          personal={personal}
          organizations={[]}
          selected="testuser"
          onSelect={mockOnSelect}
        />
      );

      const radioGroup = container.querySelector('[role="radiogroup"]');
      expect(radioGroup).toBeInTheDocument();
    });

    it('should have radio role for each option', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });

      const { container } = renderWithI18n(
        <OwnerSelector
          type="github"
          personal={personal}
          organizations={[]}
          selected="testuser"
          onSelect={mockOnSelect}
        />
      );

      const radios = container.querySelectorAll('[role="radio"]');
      expect(radios.length).toBeGreaterThan(0);
    });

    it('should set aria-checked based on selection', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });

      const { container } = renderWithI18n(
        <OwnerSelector
          type="github"
          personal={personal}
          organizations={[]}
          selected="testuser"
          onSelect={mockOnSelect}
        />
      );

      const checkedRadio = container.querySelector('[aria-checked="true"]');
      expect(checkedRadio).toBeInTheDocument();
    });
  });

  describe('AC Coverage', () => {
    it('AC1: should display personal account as first option', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });

      const { container } = renderWithI18n(
        <OwnerSelector
          type="github"
          personal={personal}
          organizations={[]}
          selected="testuser"
          onSelect={mockOnSelect}
        />
      );

      const firstRadio = container.querySelector('[role="radio"]');
      expect(firstRadio?.textContent).toContain('testuser');
    });

    it('AC2: should list organizations/groups below personal account', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });
      const organizations = [
        createTestOwner({ id: 'org-1', name: 'Acme Inc', path: 'acme-inc' }),
      ];

      const { container } = renderWithI18n(
        <OwnerSelector
          type="github"
          personal={personal}
          organizations={organizations}
          selected="testuser"
          onSelect={mockOnSelect}
        />
      );

      const radios = container.querySelectorAll('[role="radio"]');
      expect(radios.length).toBe(2); // personal + 1 org
      expect(radios[0]?.textContent).toContain('testuser');
      expect(radios[1]?.textContent).toContain('Acme Inc');
    });

    it('AC3: should call onSelect with owner/group path when selected', () => {
      const mockOnSelect = vi.fn();
      const personal = createTestOwner({ id: 'user-1', name: 'testuser', path: 'testuser' });
      const organizations = [
        createTestOwner({ id: 'org-1', name: 'Acme Inc', path: 'acme-inc' }),
      ];

      renderWithI18n(
        <OwnerSelector
          type="github"
          personal={personal}
          organizations={organizations}
          selected=""
          onSelect={mockOnSelect}
        />
      );

      // Click organization
      const orgOption = screen.getByText('Acme Inc').closest('[role="radio"]');
      fireEvent.click(orgOption!);

      expect(mockOnSelect).toHaveBeenCalledWith('acme-inc');
    });
  });
});
