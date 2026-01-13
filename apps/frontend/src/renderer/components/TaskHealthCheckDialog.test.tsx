/**
 * @vitest-environment jsdom
 */
/**
 * Tests for TaskHealthCheckDialog component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TaskHealthCheckDialog } from './TaskHealthCheckDialog';
import type { TaskHealthCheckResult } from '../../shared/types';
import { recoverStuckTask } from '../stores/task-store';

// Mock react-i18next to avoid initialization issues
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      // Handle interpolation for {{count}}
      if (key === 'tasks:kanban.healthCheckDialogDescription' && options?.count) {
        return `Issues found in ${options.count} task(s)`;
      }

      // Return the key itself for testing or provide specific translations
      const translations: Record<string, string> = {
        'tasks:kanban.healthCheckDialogTitle': 'Task Health Check Results',
        'tasks:kanban.checkingHealth': 'Checking task health...',
        'tasks:kanban.noHealthIssues': 'No health issues found - all tasks are healthy!',
        'tasks:kanban.healthCheckDialogDescription': 'Issues found in {{count}} task(s)',
        'common:buttons.close': 'Close',
        'common:buttons.refresh': 'Refresh',
        'common:buttons.processing': 'Processing...',
        'tasks:issues.stuck': 'Task is stuck (no process running)',
        'tasks:issues.failed': 'Task execution failed',
        'tasks:issues.failedSubtasks': '{{count}} subtask(s) failed',
        'tasks:issues.qaRejected': 'QA review rejected',
        'tasks:recovery.recoverStuck': 'Recover',
        'tasks:recovery.viewLogs': 'View Logs',
        'tasks:recovery.viewQARequest': 'View QA Report',
        'tasks:recovery.discardTask': 'Discard Task'
      };
      return translations[key] || key;
    },
    i18n: {
      language: 'en'
    }
  }),
  initReactI18next: vi.fn()
}));

// Mock the task store
vi.mock('../stores/task-store', () => ({
  recoverStuckTask: vi.fn()
}));

// Mock window.electronAPI
const mockCheckTaskHealth = vi.fn();

Object.defineProperty(window, 'electronAPI', {
  value: {
    checkTaskHealth: mockCheckTaskHealth
  },
  writable: true,
  configurable: true
});

/**
 * Creates a mock health check result
 */
function createMockHealthResult(overrides?: Partial<TaskHealthCheckResult>): TaskHealthCheckResult {
  return {
    taskId: 'task-1',
    title: 'Test Task with Issues',
    status: 'in_progress' as const,
    isHealthy: false,
    issues: [
      {
        type: 'stuck',
        severity: 'error',
        message: 'Task is marked as in_progress but no process is running',
        details: 'The task may have crashed or the process was killed externally'
      }
    ],
    recoveryActions: [
      {
        label: 'Recover',
        actionType: 'recover_stuck',
        variant: 'warning'
      }
    ],
    ...overrides
  };
}

describe('TaskHealthCheckDialog', () => {
  const mockProjectId = 'project-1';
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when dialog is closed', () => {
    it('should not render anything', () => {
      render(
        <TaskHealthCheckDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          projectId={mockProjectId}
        />
      );

      // Dialog should not be visible
      expect(screen.queryByText('Task Health Check Results')).not.toBeInTheDocument();
    });
  });

  describe('when loading health check', () => {
    beforeEach(() => {
      mockCheckTaskHealth.mockImplementation(() => new Promise(() => {})); // Never resolves
    });

    it('should show loading state', () => {
      render(
        <TaskHealthCheckDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId={mockProjectId}
        />
      );

      expect(screen.getByText('Checking task health...')).toBeInTheDocument();
    });
  });

  describe('when health check completes with no issues', () => {
    beforeEach(() => {
      mockCheckTaskHealth.mockResolvedValue({
        success: true,
        data: []
      });
    });

    it('should show success message in empty state', async () => {
      render(
        <TaskHealthCheckDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId={mockProjectId}
        />
      );

      await waitFor(() => {
        const elements = screen.getAllByText('No health issues found - all tasks are healthy!');
        expect(elements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('when health check finds unhealthy tasks', () => {
    beforeEach(() => {
      mockCheckTaskHealth.mockResolvedValue({
        success: true,
        data: [
          createMockHealthResult({
            taskId: 'task-1',
            title: 'Stuck Task',
            issues: [
              {
                type: 'stuck',
                severity: 'error',
                message: 'Task is stuck (no process running)'
              }
            ],
            recoveryActions: [
              {
                label: 'Recover',
                actionType: 'recover_stuck',
                variant: 'warning'
              }
            ]
          }),
          createMockHealthResult({
            taskId: 'task-2',
            title: 'QA Rejected Task',
            status: 'human_review' as const,
            issues: [
              {
                type: 'qa_rejected',
                severity: 'warning',
                message: 'QA review rejected the task',
                details: 'See QA_FIX_REQUEST.md for required fixes'
              }
            ],
            recoveryActions: [
              {
                label: 'View QA Report',
                actionType: 'view_qa_report',
                variant: 'outline'
              }
            ]
          })
        ]
      });

      vi.mocked(recoverStuckTask).mockResolvedValue({
        success: true,
        message: 'Task recovered successfully'
      });
    });

    it('should display unhealthy tasks grouped by severity', async () => {
      render(
        <TaskHealthCheckDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId={mockProjectId}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Issues found in 2 task\(s\)/)).toBeInTheDocument();
        expect(screen.getByText('Stuck Task')).toBeInTheDocument();
        expect(screen.getByText('QA Rejected Task')).toBeInTheDocument();
      });
    });

    it('should show recovery action buttons', async () => {
      render(
        <TaskHealthCheckDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId={mockProjectId}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Recover')).toBeInTheDocument();
        expect(screen.getByText('View QA Report')).toBeInTheDocument();
      });
    });

    it('should handle recover action click', async () => {
      render(
        <TaskHealthCheckDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId={mockProjectId}
        />
      );

      await waitFor(() => {
        const recoverButton = screen.getByText('Recover');
        expect(recoverButton).toBeInTheDocument();
      });

      const recoverButton = screen.getByText('Recover');
      recoverButton.click();

      expect(recoverStuckTask).toHaveBeenCalledWith('task-1', { autoRestart: false });
    });

    it('should group error issues separately from warning issues', async () => {
      render(
        <TaskHealthCheckDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId={mockProjectId}
        />
      );

      await waitFor(() => {
        // Should show critical issues count
        expect(screen.getByText(/task.*with critical issues/i)).toBeInTheDocument();
        // Should show warning issues count
        expect(screen.getByText(/task.*with warnings/i)).toBeInTheDocument();
      });
    });
  });

  describe('when health check fails', () => {
    beforeEach(() => {
      mockCheckTaskHealth.mockResolvedValue({
        success: false,
        error: 'Failed to connect to agent manager'
      });
    });

    it('should display error message', async () => {
      render(
        <TaskHealthCheckDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId={mockProjectId}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to connect to agent manager')).toBeInTheDocument();
      });
    });
  });

  describe('refresh functionality', () => {
    beforeEach(() => {
      mockCheckTaskHealth.mockResolvedValue({
        success: true,
        data: []
      });
    });

    it('should re-run health check when refresh is clicked', async () => {
      render(
        <TaskHealthCheckDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId={mockProjectId}
        />
      );

      // Wait for initial load
      await waitFor(() => {
        const elements = screen.getAllByText('No health issues found - all tasks are healthy!');
        expect(elements.length).toBeGreaterThan(0);
      });

      // Clear previous calls
      mockCheckTaskHealth.mockClear();

      // Click refresh button - use getAllByText since there are multiple "Refresh" elements
      const refreshButtons = screen.getAllByText('Refresh');
      const dialogRefreshButton = refreshButtons.find(btn =>
        btn.toString().includes('Button') ||
        btn instanceof HTMLButtonElement ||
        btn instanceof HTMLSpanElement && btn.parentElement?.tagName === 'BUTTON'
      );

      if (dialogRefreshButton) {
        (dialogRefreshButton as HTMLElement).click();
      }

      // Should call health check again
      expect(mockCheckTaskHealth).toHaveBeenCalledTimes(1);
    });
  });

  describe('close functionality', () => {
    beforeEach(() => {
      mockCheckTaskHealth.mockResolvedValue({
        success: true,
        data: []
      });
    });

    it('should call onOpenChange when close button is clicked', async () => {
      render(
        <TaskHealthCheckDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId={mockProjectId}
        />
      );

      // Wait for dialog to load
      await waitFor(() => {
        const elements = screen.getAllByText('No health issues found - all tasks are healthy!');
        expect(elements.length).toBeGreaterThan(0);
      });

      // Click the first button with "Close" text
      const closeButton = screen.getAllByText('Close').find(el => el.tagName === 'BUTTON');
      closeButton?.click();

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty project ID gracefully', async () => {
      mockCheckTaskHealth.mockResolvedValue({
        success: true,
        data: []
      });

      render(
        <TaskHealthCheckDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId={''}
        />
      );

      // Should still complete without error
      await waitFor(() => {
        expect(mockCheckTaskHealth).toHaveBeenCalledWith('');
      });
    });

    it('should handle network error gracefully', async () => {
      mockCheckTaskHealth.mockRejectedValue(new Error('Network error'));

      render(
        <TaskHealthCheckDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId={mockProjectId}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should handle task with multiple issues', async () => {
      mockCheckTaskHealth.mockResolvedValue({
        success: true,
        data: [
          createMockHealthResult({
            taskId: 'task-multi',
            title: 'Task with Multiple Issues',
            issues: [
              {
                type: 'stuck',
                severity: 'error',
                message: 'Task is stuck'
              },
              {
                type: 'failed_subtasks',
                severity: 'error',
                message: '2 subtask(s) failed',
                details: 'Subtask A, Subtask B'
              },
              {
                type: 'missing_artifact',
                severity: 'error',
                message: 'spec.md file is missing'
              }
            ],
            recoveryActions: [
              { label: 'Recover', actionType: 'recover_stuck', variant: 'warning' },
              { label: 'Recreate Spec', actionType: 'recreate_spec', variant: 'default' }
            ]
          })
        ]
      });

      render(
        <TaskHealthCheckDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          projectId={mockProjectId}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Task is stuck')).toBeInTheDocument();
        expect(screen.getByText('2 subtask(s) failed')).toBeInTheDocument();
        expect(screen.getByText('spec.md file is missing')).toBeInTheDocument();
        expect(screen.getByText('Subtask A, Subtask B')).toBeInTheDocument();
      });
    });
  });
});
