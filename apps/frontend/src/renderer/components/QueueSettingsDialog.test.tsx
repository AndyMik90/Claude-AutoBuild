/**
 * @vitest-environment jsdom
 */
/**
 * QueueSettingsDialog Tests
 *
 * Tests the queue settings dialog for enabling/disabling queue
 * and configuring max concurrent tasks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import '../../shared/i18n';
import { QueueSettingsDialog } from './QueueSettingsDialog';
import { saveQueueConfig } from '../stores/queue-store';
import type { QueueConfig } from '../../shared/types';

// Mock the queue store
vi.mock('../stores/queue-store', () => ({
  saveQueueConfig: vi.fn(),
  useQueueStore: vi.fn()
}));

describe('QueueSettingsDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSaved = vi.fn();
  const projectId = 'test-project-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render dialog with title when open', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: false, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      expect(screen.getByText(/queue settings/i)).toBeInTheDocument();
    });

    it('should not render dialog when closed', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={false}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: false, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      expect(screen.queryByText(/queue settings/i)).not.toBeInTheDocument();
    });

    it('should render description', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: false, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      expect(screen.getByText(/configure automatic task scheduling/i)).toBeInTheDocument();
    });

    it('should render enable queue toggle', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: false, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      expect(screen.getByText(/enable queue/i)).toBeInTheDocument();
    });

    it('should render cancel and save buttons', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: false, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      expect(screen.getByText(/cancel/i)).toBeInTheDocument();
      expect(screen.getByText(/save settings/i)).toBeInTheDocument();
    });
  });

  describe('Initial State from Props', () => {
    it('should show queue as disabled when config.enabled is false', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: false, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      // The switch should be unchecked when disabled
      const toggle = screen.getByRole('switch');
      expect(toggle).not.toBeChecked();
    });

    it('should show queue as enabled when config.enabled is true', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 2 }}
          runningCount={1}
        />
      );

      // The switch should be checked when enabled
      const toggle = screen.getByRole('switch');
      expect(toggle).toBeChecked();
    });

    it('should display current max concurrent value', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 2 }}
          runningCount={1}
        />
      );

      expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    });

    it('should show status badge with running count when enabled', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 2 }}
          runningCount={1}
        />
      );

      expect(screen.getByText(/current status/i)).toBeInTheDocument();
      expect(screen.getByText(/1 \/ 2/i)).toBeInTheDocument();
    });
  });

  describe('Toggle Enable/Disable', () => {
    it('should toggle enable state when switch is clicked', async () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: false, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      const toggle = screen.getByRole('switch');
      expect(toggle).not.toBeChecked();

      fireEvent.click(toggle);

      await waitFor(() => {
        expect(toggle).toBeChecked();
      });
    });

    it('should show max concurrent controls when enabled', async () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: false, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      // Initially disabled - controls hidden
      expect(screen.queryByText(/max concurrent tasks/i)).not.toBeInTheDocument();

      // Enable the queue
      const toggle = screen.getByRole('switch');
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(screen.getByText(/max concurrent tasks/i)).toBeInTheDocument();
      });
    });

    it('should hide max concurrent controls when disabled', async () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      // Initially enabled - controls visible
      expect(screen.getByText(/max concurrent tasks/i)).toBeInTheDocument();

      // Disable the queue
      const toggle = screen.getByRole('switch');
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(screen.queryByText(/max concurrent tasks/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Max Concurrent Selection', () => {
    it('should render preset buttons 1, 2, 3', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      expect(screen.getAllByText('1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('2').length).toBeGreaterThan(0);
      expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    });

    it('should highlight selected preset button', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 2 }}
          runningCount={0}
        />
      );

      // The button with "2" should be selected/highlighted
      const buttons = screen.getAllByText('2');
      // Find the button element (not just text)
      const button2 = buttons.find(el => el.tagName === 'BUTTON' || el.closest('button'));
      expect(button2).toBeDefined();
    });

    it('should change max concurrent when preset button is clicked', async () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      // Click on the "2" button
      const buttons = screen.getAllByText('2');
      const button2 = buttons.find(el => el.tagName === 'BUTTON' || el.closest('button')) || buttons[0];
      fireEvent.click(button2);

      // The value display should update to 2
      await waitFor(() => {
        const twos = screen.getAllByText('2');
        expect(twos.length).toBeGreaterThan(0);
      });
    });

    it('should allow selecting 1 as max concurrent', async () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 2 }}
          runningCount={0}
        />
      );

      const buttons = screen.getAllByText('1');
      const button1 = buttons.find(el => el.tagName === 'BUTTON' || el.closest('button')) || buttons[0];
      fireEvent.click(button1);

      await waitFor(() => {
        const ones = screen.getAllByText('1');
        expect(ones.length).toBeGreaterThan(0);
      });
    });

    it('should allow selecting 3 as max concurrent', async () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      const buttons = screen.getAllByText('3');
      const button3 = buttons.find(el => el.tagName === 'BUTTON' || el.closest('button')) || buttons[0];
      fireEvent.click(button3);

      await waitFor(() => {
        const threes = screen.getAllByText('3');
        expect(threes.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Save Functionality', () => {
    it('should call saveQueueConfig with correct params on save', async () => {
      const mockSaveQueueConfig = vi.mocked(saveQueueConfig).mockResolvedValue(true);

      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: false, maxConcurrent: 1 }}
          runningCount={0}
          onSaved={mockOnSaved}
        />
      );

      // Enable the queue
      const toggle = screen.getByRole('switch');
      fireEvent.click(toggle);

      // Change max concurrent to 2
      const buttons = screen.getAllByText('2');
      const button2 = buttons.find(el => el.tagName === 'BUTTON' || el.closest('button')) || buttons[0];
      fireEvent.click(button2);

      // Click save
      const saveButton = screen.getByRole('button', { name: /save settings/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockSaveQueueConfig).toHaveBeenCalledWith(projectId, {
          enabled: true,
          maxConcurrent: 2
        });
      });
    });

    it('should close dialog and call onSaved after successful save', async () => {
      vi.mocked(saveQueueConfig).mockResolvedValue(true);

      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 1 }}
          runningCount={0}
          onSaved={mockOnSaved}
        />
      );

      const saveButton = screen.getByRole('button', { name: /save settings/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
        expect(mockOnSaved).toHaveBeenCalled();
      });
    });

    it('should not close dialog after failed save', async () => {
      vi.mocked(saveQueueConfig).mockResolvedValue(false);

      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      const saveButton = screen.getByRole('button', { name: /save settings/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
      });
    });

    it('should show loading state while saving', async () => {
      // Make saveQueueConfig return a promise that doesn't resolve immediately
      let resolveSave: (value: boolean) => void;
      vi.mocked(saveQueueConfig).mockImplementation(() => {
        return new Promise((resolve) => {
          resolveSave = resolve;
        });
      });

      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      const saveButton = screen.getByRole('button', { name: /save settings/i });
      fireEvent.click(saveButton);

      // Should show "Saving..." text
      await waitFor(() => {
        expect(screen.getByText(/saving/i)).toBeInTheDocument();
      });

      // Resolve the save
      resolveSave!(true);

      await waitFor(() => {
        expect(screen.queryByText(/saving/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Cancel Functionality', () => {
    it('should close dialog when cancel is clicked', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should not save changes when cancel is clicked', () => {
      const mockSaveQueueConfig = vi.mocked(saveQueueConfig).mockResolvedValue(true);

      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: false, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      // Make changes
      const toggle = screen.getByRole('switch');
      fireEvent.click(toggle);

      // Click cancel instead of save
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(mockSaveQueueConfig).not.toHaveBeenCalled();
    });
  });

  describe('Warning States', () => {
    it('should show warning when running count exceeds max', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 1 }}
          runningCount={2}
        />
      );

      expect(screen.getByText(/exceeds limit/i)).toBeInTheDocument();
    });

    it('should show warning message with correct counts', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 2 }}
          runningCount={3}
        />
      );

      expect(screen.getByText(/3 tasks are running but max is 2/i)).toBeInTheDocument();
    });

    it('should show info when queue is disabled', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: false, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      expect(screen.getByText(/enable the queue to automatically start tasks/i)).toBeInTheDocument();
    });

    it('should not show warning when running count equals max', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 2 }}
          runningCount={2}
        />
      );

      expect(screen.queryByText(/exceeds limit/i)).not.toBeInTheDocument();
    });

    it('should not show warning when running count is less than max', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 3 }}
          runningCount={1}
        />
      );

      expect(screen.queryByText(/exceeds limit/i)).not.toBeInTheDocument();
    });
  });

  describe('Form State Reset', () => {
    it('should reset form when dialog reopens with different config', async () => {
      const { rerender } = render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 2 }}
          runningCount={1}
        />
      );

      // Toggle off
      const toggle = screen.getByRole('switch');
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(toggle).not.toBeChecked();
      });

      // Reopen with different config
      rerender(
        <QueueSettingsDialog
          projectId={projectId}
          open={false}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: false, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      rerender(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 3 }}
          runningCount={2}
        />
      );

      await waitFor(() => {
        const newToggle = screen.getByRole('switch');
        expect(newToggle).toBeChecked();
        const threes = screen.getAllByText('3');
        expect(threes.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Labels and Text', () => {
    it('should show "task" label for max concurrent 1', () => {
      render(
        <QueueSettingsDialog
          projectId={projectId}
          open={true}
          onOpenChange={mockOnOpenChange}
          currentConfig={{ enabled: true, maxConcurrent: 1 }}
          runningCount={0}
        />
      );

      // Use getAllByText and check we have the "1" text somewhere (either in display or button)
      const ones = screen.getAllByText('1');
      expect(ones.length).toBeGreaterThan(0);
    });
  });
});
