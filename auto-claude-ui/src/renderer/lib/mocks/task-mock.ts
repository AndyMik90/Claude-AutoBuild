/**
 * Mock implementation for task operations
 */

import type { TaskRecoveryOptions } from '../../../shared/types';
import { mockTasks } from './mock-data';

export const taskMock = {
  getTasks: async (projectId: string) => ({
    success: true,
    data: mockTasks.filter(t => t.projectId === projectId)
  }),

  createTask: async (projectId: string, title: string, description: string) => ({
    success: true,
    data: {
      id: `task-${Date.now()}`,
      projectId,
      specId: `00${mockTasks.length + 1}-new-task`,
      title,
      description,
      status: 'backlog' as const,
      subtasks: [],
      logs: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }),

  deleteTask: async () => ({ success: true }),

  updateTask: async (_taskId: string, updates: { title?: string; description?: string }) => ({
    success: true,
    data: {
      id: _taskId,
      projectId: 'mock-project-1',
      specId: '001-updated',
      title: updates.title || 'Updated Task',
      description: updates.description || 'Updated description',
      status: 'backlog' as const,
      subtasks: [],
      logs: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }),

  startTask: () => {
    console.warn('[Browser Mock] startTask called');
  },

  stopTask: () => {
    console.warn('[Browser Mock] stopTask called');
  },

  submitReview: async () => ({ success: true }),

  // Task archive operations
  archiveTasks: async () => ({ success: true, data: true }),
  unarchiveTasks: async () => ({ success: true, data: true }),

  // Task status operations
  updateTaskStatus: async () => ({ success: true }),

  recoverStuckTask: async (taskId: string, options?: TaskRecoveryOptions) => ({
    success: true,
    data: {
      taskId,
      recovered: true,
      newStatus: options?.targetStatus || 'backlog',
      message: '[Browser Mock] Task recovered successfully'
    }
  }),

  checkTaskRunning: async () => ({ success: true, data: false }),

  // Task logs operations
  getTaskLogs: async () => ({
    success: true,
    data: null
  }),

  watchTaskLogs: async () => ({ success: true }),

  unwatchTaskLogs: async () => ({ success: true }),

  // Event Listeners (no-op in browser)
  onTaskProgress: () => () => {},
  onTaskError: () => () => {},
  onTaskLog: () => () => {},
  onTaskStatusChange: () => () => {},
  onTaskExecutionProgress: () => () => {},
  onTaskLogsChanged: () => () => {},
  onTaskLogsStream: () => () => {},

  // Hierarchical task operations
  createTaskWithChildren: async (
    projectId: string,
    title: string,
    description: string,
    children: Array<{ title: string; description?: string; orderIndex: number }>,
    _metadata?: unknown
  ) => ({
    success: true,
    data: {
      parent: {
        id: `task-${Date.now()}`,
        projectId,
        specId: `00${mockTasks.length + 1}-parent-task`,
        title,
        description,
        status: 'backlog' as const,
        subtasks: [],
        logs: [],
        hasChildren: true,
        childTaskIds: children.map((_, i) => `task-${Date.now()}-child-${i}`),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      children: children.map((child) => ({
        id: `task-${Date.now()}-child-${child.orderIndex}`,
        projectId,
        specId: `00${mockTasks.length + 1}-child-${child.orderIndex}`,
        title: child.title,
        description: child.description || '',
        status: 'backlog' as const,
        subtasks: [],
        logs: [],
        parentTaskId: `task-${Date.now()}`,
        orderIndex: child.orderIndex,
        createdAt: new Date(),
        updatedAt: new Date()
      }))
    }
  }),

  // File content reading
  readFileContent: async (_filePath: string) => ({
    success: true,
    data: '[Browser Mock] File content not available in browser mode'
  })
};
