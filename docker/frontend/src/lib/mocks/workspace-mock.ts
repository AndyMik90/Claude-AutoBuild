/**
 * Mock implementation for workspace management operations
 */

export const workspaceMock = {
  getWorktreeStatus: async () => ({
    success: true,
    data: {
      exists: false
    }
  }),

  getWorktreeDiff: async () => ({
    success: true,
    data: {
      files: [],
      summary: 'No changes'
    }
  }),

  mergeWorktree: async () => ({
    success: true,
    data: {
      success: true,
      message: 'Merge completed successfully'
    }
  }),

  mergeWorktreePreview: async () => ({
    success: true,
    data: {
      success: true,
      message: 'Preview generated',
      preview: {
        files: ['src/index.ts', 'src/utils.ts'],
        conflicts: [
          {
            file: 'src/utils.ts',
            location: 'lines 10-15',
            tasks: ['task-001'],
            severity: 'low' as const,
            canAutoMerge: true,
            strategy: 'append',
            reason: 'Non-overlapping additions'
          }
        ],
        summary: {
          totalFiles: 2,
          conflictFiles: 1,
          totalConflicts: 1,
          autoMergeable: 1
        }
      }
    }
  }),

  discardWorktree: async () => ({
    success: true,
    data: {
      success: true,
      message: 'Worktree discarded successfully'
    }
  }),

  listWorktrees: async () => ({
    success: true,
    data: {
      worktrees: []
    }
  })
};
