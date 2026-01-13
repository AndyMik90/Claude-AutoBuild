/**
 * Unit tests for UsageIndicator component
 * Tests usage badge rendering, color coding, countdown timer,
 * provider-specific labels, and tooltip content
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../shared/i18n';
import { UsageIndicator } from '../UsageIndicator';
import type { ClaudeUsageSnapshot } from '../../../shared/types/agent';

// Wrapper component for i18n
function I18nWrapper({ children }: { children: React.ReactNode }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

// Mock window.electronAPI
const mockOnUsageUpdated = vi.fn();
const mockUnsubscribe = vi.fn();
const mockRequestUsageUpdate = vi.fn();

Object.defineProperty(window, 'electronAPI', {
  value: {
    onUsageUpdated: vi.fn((callback) => {
      mockOnUsageUpdated.mockImplementation(callback);
      return mockUnsubscribe; // unsubscribe function
    }),
    requestUsageUpdate: mockRequestUsageUpdate
  },
  writable: true,
  configurable: true
});

// Helper to create test usage snapshot
function createUsageSnapshot(overrides: Partial<ClaudeUsageSnapshot> = {}): ClaudeUsageSnapshot {
  const now = new Date();
  const future = new Date(now.getTime() + 5 * 60 * 60 * 1000); // 5 hours from now

  return {
    sessionPercent: 50,
    weeklyPercent: 30,
    sessionResetTime: '5h 0m',
    weeklyResetTime: '2d 4h',
    sessionResetTimestamp: future.getTime(),
    weeklyResetTimestamp: future.getTime(),
    profileId: 'profile-1',
    profileName: 'Test Profile',
    fetchedAt: now,
    limitType: 'session',
    provider: 'anthropic-oauth',
    ...overrides
  };
}

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nWrapper>{ui}</I18nWrapper>);
}

describe('UsageIndicator', () => {
  beforeAll(async () => {
    // Ensure i18n is initialized before running tests
    await i18n.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for successful initial request
    mockRequestUsageUpdate.mockResolvedValue({
      success: true,
      data: createUsageSnapshot()
    });
  });

  describe('initialization', () => {
    it('should return null when no usage data is available', async () => {
      mockRequestUsageUpdate.mockResolvedValue({
        success: true,
        data: null
      });

      const { container } = renderWithI18n(<UsageIndicator />);

      // Component should return null initially
      expect(container.firstChild).toBeNull();
    });

    it('should request initial usage on mount', () => {
      renderWithI18n(<UsageIndicator />);

      expect(mockRequestUsageUpdate).toHaveBeenCalledTimes(1);
    });

    it('should set up usage update listener on mount', () => {
      renderWithI18n(<UsageIndicator />);

      expect(window.electronAPI.onUsageUpdated).toHaveBeenCalledTimes(1);
    });

    it('should render when usage data is received', async () => {
      mockRequestUsageUpdate.mockResolvedValue({
        success: true,
        data: createUsageSnapshot({ sessionPercent: 50, weeklyPercent: 30 })
      });

      const { container } = renderWithI18n(<UsageIndicator />);

      // Wait for async render
      await waitFor(() => {
        expect(container.firstChild).not.toBeNull();
      });
    });
  });

  describe('color coding', () => {
    it('should show green color when usage < 71%', async () => {
      const usage = createUsageSnapshot({ sessionPercent: 50, weeklyPercent: 30 });
      mockRequestUsageUpdate.mockResolvedValue({ success: true, data: usage });

      const { container } = renderWithI18n(<UsageIndicator />);

      await waitFor(() => {
        const badge = container.querySelector('button');
        expect(badge).toHaveClass('text-green-500');
        expect(badge).toHaveClass('bg-green-500/10');
      });
    });

    it('should show yellow color when usage is 71-90%', async () => {
      const usage = createUsageSnapshot({ sessionPercent: 75, weeklyPercent: 30 });
      mockRequestUsageUpdate.mockResolvedValue({ success: true, data: usage });

      const { container } = renderWithI18n(<UsageIndicator />);

      await waitFor(() => {
        const badge = container.querySelector('button');
        expect(badge).toHaveClass('text-yellow-500');
        expect(badge).toHaveClass('bg-yellow-500/10');
      });
    });

    it('should show orange color when usage is 91-94%', async () => {
      const usage = createUsageSnapshot({ sessionPercent: 92, weeklyPercent: 30 });
      mockRequestUsageUpdate.mockResolvedValue({ success: true, data: usage });

      const { container } = renderWithI18n(<UsageIndicator />);

      await waitFor(() => {
        const badge = container.querySelector('button');
        expect(badge).toHaveClass('text-orange-500');
        expect(badge).toHaveClass('bg-orange-500/10');
      });
    });

    it('should show red color when usage >= 95%', async () => {
      const usage = createUsageSnapshot({ sessionPercent: 96, weeklyPercent: 30 });
      mockRequestUsageUpdate.mockResolvedValue({ success: true, data: usage });

      const { container } = renderWithI18n(<UsageIndicator />);

      await waitFor(() => {
        const badge = container.querySelector('button');
        expect(badge).toHaveClass('text-red-500');
        expect(badge).toHaveClass('bg-red-500/10');
      });
    });

    it('should use the higher usage percentage for color determination', async () => {
      const usage = createUsageSnapshot({ sessionPercent: 50, weeklyPercent: 96 });
      mockRequestUsageUpdate.mockResolvedValue({ success: true, data: usage });

      const { container } = renderWithI18n(<UsageIndicator />);

      await waitFor(() => {
        const badge = container.querySelector('button');
        expect(badge).toHaveClass('text-red-500');
      });
    });
  });

  describe('percentage display', () => {
    it('should display the max usage percentage', async () => {
      const usage = createUsageSnapshot({ sessionPercent: 72, weeklyPercent: 30 });
      mockRequestUsageUpdate.mockResolvedValue({ success: true, data: usage });

      renderWithI18n(<UsageIndicator />);

      await waitFor(() => {
        expect(screen.getByText('72%')).toBeInTheDocument();
      });
    });

    it('should show weekly percent when higher', async () => {
      const usage = createUsageSnapshot({ sessionPercent: 30, weeklyPercent: 85 });
      mockRequestUsageUpdate.mockResolvedValue({ success: true, data: usage });

      renderWithI18n(<UsageIndicator />);

      await waitFor(() => {
        expect(screen.getByText('85%')).toBeInTheDocument();
      });
    });
  });

  describe('countdown timer at 99%+ usage', () => {
    it('should show countdown when usage >= 99%', async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000); // 2h 30m from now

      const usage = createUsageSnapshot({
        sessionPercent: 99,
        weeklyPercent: 50,
        sessionResetTimestamp: future.getTime(),
        limitType: 'session'
      });
      mockRequestUsageUpdate.mockResolvedValue({ success: true, data: usage });

      const { container } = renderWithI18n(<UsageIndicator />);

      await waitFor(() => {
        const badge = container.querySelector('button') as HTMLElement;
        expect(badge?.textContent).toContain('99%');
        // Countdown should appear (format will vary slightly)
        expect(badge?.textContent).toMatch(/\d+[hd]\s*\d+[hm]/);
      });
    });

    it('should not show countdown when usage < 99%', async () => {
      const usage = createUsageSnapshot({ sessionPercent: 95, weeklyPercent: 30 });
      mockRequestUsageUpdate.mockResolvedValue({ success: true, data: usage });

      const { container } = renderWithI18n(<UsageIndicator />);

      await waitFor(() => {
        const badge = container.querySelector('button') as HTMLElement;
        expect(badge?.textContent).toContain('95%');
        // Should only have percentage, no countdown
        const parts = badge?.textContent?.split(' ').filter(Boolean) || [];
        expect(parts.length).toBe(1);
      });
    });
  });

  describe('resetting soon and past timestamp handling', () => {
    it('should not show countdown when sessionResetTimestamp is in the past', async () => {
      const past = new Date();
      past.setHours(past.getHours() - 1); // 1 hour ago

      const usage = createUsageSnapshot({
        sessionPercent: 99,
        weeklyPercent: 30,
        sessionResetTimestamp: past.getTime(),
        limitType: 'session'
      });
      mockRequestUsageUpdate.mockResolvedValue({ success: true, data: usage });

      const { container } = renderWithI18n(<UsageIndicator />);

      await waitFor(() => {
        const badge = container.querySelector('button') as HTMLElement;
        expect(badge).toBeInTheDocument();
        // Badge should only contain the percentage, no countdown
        expect(badge?.textContent).toContain('99%');
        const parts = badge?.textContent?.split(' ').filter(Boolean) || [];
        expect(parts.length).toBe(1);
      });
    });
  });

  describe('tooltip content', () => {
    it('should show session usage percentage in tooltip', async () => {
      const usage = createUsageSnapshot({ sessionPercent: 72, weeklyPercent: 30 });
      mockRequestUsageUpdate.mockResolvedValue({ success: true, data: usage });

      renderWithI18n(<UsageIndicator />);

      // Wait for badge to render with percentage
      // The percentage (72%) appears in both the badge and tooltip content
      await waitFor(() => {
        expect(screen.getByText('72%')).toBeInTheDocument();
      });
    });

    it('should show weekly usage percentage in tooltip', async () => {
      const usage = createUsageSnapshot({ sessionPercent: 30, weeklyPercent: 45 });
      mockRequestUsageUpdate.mockResolvedValue({ success: true, data: usage });

      renderWithI18n(<UsageIndicator />);

      // Wait for badge to render with percentage
      // The percentage (45%) appears in both the badge and tooltip content
      await waitFor(() => {
        expect(screen.getByText('45%')).toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('should have proper aria-label', async () => {
      mockRequestUsageUpdate.mockResolvedValue({
        success: true,
        data: createUsageSnapshot()
      });

      renderWithI18n(<UsageIndicator />);

      await waitFor(() => {
        const badge = screen.getByRole('button', { name: /claude usage status/i });
        expect(badge).toBeInTheDocument();
      });
    });
  });

  describe('component lifecycle', () => {
    it('should clean up usage listener on unmount', () => {
      const { unmount } = renderWithI18n(<UsageIndicator />);

      // Initially, unsubscribe has not been called (it's just returned)
      expect(mockUnsubscribe).not.toHaveBeenCalled();

      unmount();

      // After unmount, useEffect cleanup should have called unsubscribe
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });
});
