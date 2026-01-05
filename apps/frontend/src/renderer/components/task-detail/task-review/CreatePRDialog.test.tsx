/**
 * @vitest-environment jsdom
 */
/**
 * CreatePRDialog Tests
 *
 * Tests the Create PR dialog component functionality.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import '../../../../shared/i18n';
import { CreatePRDialog } from './CreatePRDialog';
import type { Task, WorktreeStatus } from '../../../../shared/types';

// Mock electronAPI
vi.mock('../../../../preload/api', () => ({}));

// Mock window.electronAPI
const mockOpenExternal = vi.fn();
Object.defineProperty(window, 'electronAPI', {
  value: {
    openExternal: mockOpenExternal
  },
  writable: true
});

describe('CreatePRDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnCreatePR = vi.fn();

  const mockTask: Task = {
    id: 'task-123',
    specId: 'spec-123',
    projectId: 'project-123',
    title: 'Implement user authentication',
    description: 'Add login and registration functionality',
    status: 'human_review',
    subtasks: [],
    logs: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockWorktreeStatus: WorktreeStatus = {
    exists: true,
    worktreePath: '/path/to/worktree',
    branch: 'auto-claude/implement-user-authentication',
    baseBranch: 'develop',
    commitCount: 5,
    filesChanged: 10,
    additions: 200,
    deletions: 50
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnCreatePR.mockResolvedValue({ success: true, prUrl: 'https://github.com/test/pr/1' });
  });

  it('should render dialog when open', async () => {
    render(
      <CreatePRDialog
        open={true}
        task={mockTask}
        worktreeStatus={mockWorktreeStatus}
        onOpenChange={mockOnOpenChange}
        onCreatePR={mockOnCreatePR}
      />
    );

    await waitFor(() => {
      // Check for the dialog title (h2 element)
      expect(screen.getByRole('heading', { name: /create pull request/i })).toBeInTheDocument();
    });
  });

  it('should default PR title to task title', async () => {
    render(
      <CreatePRDialog
        open={true}
        task={mockTask}
        worktreeStatus={mockWorktreeStatus}
        onOpenChange={mockOnOpenChange}
        onCreatePR={mockOnCreatePR}
      />
    );

    await waitFor(() => {
      const titleInput = screen.getByLabelText(/pr title/i);
      expect(titleInput).toHaveValue('Implement user authentication');
    });
  });

  it('should default target branch to worktree base branch', async () => {
    render(
      <CreatePRDialog
        open={true}
        task={mockTask}
        worktreeStatus={mockWorktreeStatus}
        onOpenChange={mockOnOpenChange}
        onCreatePR={mockOnCreatePR}
      />
    );

    await waitFor(() => {
      const branchInput = screen.getByLabelText(/target branch/i);
      expect(branchInput).toHaveValue('develop');
    });
  });

  it('should display source branch info', async () => {
    render(
      <CreatePRDialog
        open={true}
        task={mockTask}
        worktreeStatus={mockWorktreeStatus}
        onOpenChange={mockOnOpenChange}
        onCreatePR={mockOnCreatePR}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('auto-claude/implement-user-authentication')).toBeInTheDocument();
    });
  });

  it('should display commit count and changes', async () => {
    render(
      <CreatePRDialog
        open={true}
        task={mockTask}
        worktreeStatus={mockWorktreeStatus}
        onOpenChange={mockOnOpenChange}
        onCreatePR={mockOnCreatePR}
      />
    );

    await waitFor(() => {
      // Find the stats container by locating the "Commits:" label and getting its parent container
      const commitsLabel = screen.getByText(/commits:/i);
      const statsContainer = commitsLabel.closest('.bg-muted\\/50');
      expect(statsContainer).toBeInTheDocument();

      // Scope assertions to the stats container to avoid accidental matches elsewhere
      const stats = within(statsContainer as HTMLElement);
      expect(stats.getByText('5')).toBeInTheDocument(); // commit count
      expect(stats.getByText('+200')).toBeInTheDocument(); // additions
      expect(stats.getByText('-50')).toBeInTheDocument(); // deletions
    });
  });

  it('should call onCreatePR with form values when Create PR is clicked', async () => {
    render(
      <CreatePRDialog
        open={true}
        task={mockTask}
        worktreeStatus={mockWorktreeStatus}
        onOpenChange={mockOnOpenChange}
        onCreatePR={mockOnCreatePR}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/pr title/i)).toHaveValue('Implement user authentication');
    });

    // Find the submit button (not the heading) - it's the one with "Create Pull Request" text inside a button
    const createButton = screen.getByRole('button', { name: /create pull request/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockOnCreatePR).toHaveBeenCalledWith({
        targetBranch: 'develop',
        title: 'Implement user authentication',
        draft: false
      });
    });
  });

  it('should allow modifying PR title before creating', async () => {
    render(
      <CreatePRDialog
        open={true}
        task={mockTask}
        worktreeStatus={mockWorktreeStatus}
        onOpenChange={mockOnOpenChange}
        onCreatePR={mockOnCreatePR}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/pr title/i)).toHaveValue('Implement user authentication');
    });

    const titleInput = screen.getByLabelText(/pr title/i);
    fireEvent.change(titleInput, { target: { value: 'Custom PR Title' } });

    const createButton = screen.getByRole('button', { name: /create pull request/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockOnCreatePR).toHaveBeenCalledWith({
        targetBranch: 'develop',
        title: 'Custom PR Title',
        draft: false
      });
    });
  });

  it('should close dialog when Cancel is clicked', async () => {
    render(
      <CreatePRDialog
        open={true}
        task={mockTask}
        worktreeStatus={mockWorktreeStatus}
        onOpenChange={mockOnOpenChange}
        onCreatePR={mockOnCreatePR}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('should show success state after PR is created', async () => {
    mockOnCreatePR.mockResolvedValue({
      success: true,
      prUrl: 'https://github.com/test/repo/pull/123'
    });

    render(
      <CreatePRDialog
        open={true}
        task={mockTask}
        worktreeStatus={mockWorktreeStatus}
        onOpenChange={mockOnOpenChange}
        onCreatePR={mockOnCreatePR}
      />
    );

    const createButton = screen.getByRole('button', { name: /create pull request/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByText('https://github.com/test/repo/pull/123')).toBeInTheDocument();
    });
  });

  it('should show error state when PR creation fails', async () => {
    mockOnCreatePR.mockResolvedValue({
      success: false,
      error: 'Failed to push branch to remote'
    });

    render(
      <CreatePRDialog
        open={true}
        task={mockTask}
        worktreeStatus={mockWorktreeStatus}
        onOpenChange={mockOnOpenChange}
        onCreatePR={mockOnCreatePR}
      />
    );

    const createButton = screen.getByRole('button', { name: /create pull request/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to push branch to remote')).toBeInTheDocument();
    });
  });

  it('should reset form when dialog is reopened', async () => {
    const { rerender } = render(
      <CreatePRDialog
        open={true}
        task={mockTask}
        worktreeStatus={mockWorktreeStatus}
        onOpenChange={mockOnOpenChange}
        onCreatePR={mockOnCreatePR}
      />
    );

    // Modify the title
    await waitFor(() => {
      expect(screen.getByLabelText(/pr title/i)).toHaveValue('Implement user authentication');
    });

    const titleInput = screen.getByLabelText(/pr title/i);
    fireEvent.change(titleInput, { target: { value: 'Modified Title' } });
    expect(titleInput).toHaveValue('Modified Title');

    // Close dialog
    rerender(
      <CreatePRDialog
        open={false}
        task={mockTask}
        worktreeStatus={mockWorktreeStatus}
        onOpenChange={mockOnOpenChange}
        onCreatePR={mockOnCreatePR}
      />
    );

    // Reopen dialog
    rerender(
      <CreatePRDialog
        open={true}
        task={mockTask}
        worktreeStatus={mockWorktreeStatus}
        onOpenChange={mockOnOpenChange}
        onCreatePR={mockOnCreatePR}
      />
    );

    // Should reset to task title
    await waitFor(() => {
      expect(screen.getByLabelText(/pr title/i)).toHaveValue('Implement user authentication');
    });
  });
});
