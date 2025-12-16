/**
 * Individual idea operations (update, dismiss, etc.)
 */

import path from 'path';
import type { IpcMainInvokeEvent } from 'electron';
import { AUTO_BUILD_PATHS } from '../../../shared/constants';
import type { IPCResult, IdeationStatus } from '../../../shared/types';
import { projectStore } from '../../project-store';
import { readIdeationFile, writeIdeationFile, updateIdeationTimestamp } from './file-utils';

/**
 * Update an idea's status
 */
export async function updateIdeaStatus(
  _event: IpcMainInvokeEvent,
  projectId: string,
  ideaId: string,
  status: IdeationStatus
): Promise<IPCResult> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  const ideationPath = path.join(
    project.path,
    AUTO_BUILD_PATHS.IDEATION_DIR,
    AUTO_BUILD_PATHS.IDEATION_FILE
  );

  const ideation = readIdeationFile(ideationPath);
  if (!ideation) {
    return { success: false, error: 'Ideation not found' };
  }

  try {
    // Find and update the idea
    const idea = ideation.ideas?.find((i) => i.id === ideaId);
    if (!idea) {
      return { success: false, error: 'Idea not found' };
    }

    idea.status = status;
    updateIdeationTimestamp(ideation);
    writeIdeationFile(ideationPath, ideation);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update idea'
    };
  }
}

/**
 * Dismiss a single idea
 */
export async function dismissIdea(
  _event: IpcMainInvokeEvent,
  projectId: string,
  ideaId: string
): Promise<IPCResult> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  const ideationPath = path.join(
    project.path,
    AUTO_BUILD_PATHS.IDEATION_DIR,
    AUTO_BUILD_PATHS.IDEATION_FILE
  );

  const ideation = readIdeationFile(ideationPath);
  if (!ideation) {
    return { success: false, error: 'Ideation not found' };
  }

  try {
    // Find and dismiss the idea
    const idea = ideation.ideas?.find((i) => i.id === ideaId);
    if (!idea) {
      return { success: false, error: 'Idea not found' };
    }

    idea.status = 'dismissed';
    updateIdeationTimestamp(ideation);
    writeIdeationFile(ideationPath, ideation);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to dismiss idea'
    };
  }
}

/**
 * Dismiss all ideas in a session
 */
export async function dismissAllIdeas(
  _event: IpcMainInvokeEvent,
  projectId: string
): Promise<IPCResult> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  const ideationPath = path.join(
    project.path,
    AUTO_BUILD_PATHS.IDEATION_DIR,
    AUTO_BUILD_PATHS.IDEATION_FILE
  );

  const ideation = readIdeationFile(ideationPath);
  if (!ideation) {
    return { success: false, error: 'Ideation not found' };
  }

  try {
    // Dismiss all ideas that are not already dismissed or converted
    let dismissedCount = 0;
    ideation.ideas?.forEach((idea) => {
      if (idea.status !== 'dismissed' && idea.status !== 'converted') {
        idea.status = 'dismissed';
        dismissedCount++;
      }
    });

    updateIdeationTimestamp(ideation);
    writeIdeationFile(ideationPath, ideation);

    return { success: true, data: { dismissedCount } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to dismiss all ideas'
    };
  }
}

/**
 * Archive a single idea (typically when converted to task)
 */
export async function archiveIdea(
  _event: IpcMainInvokeEvent,
  projectId: string,
  ideaId: string
): Promise<IPCResult> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  const ideationPath = path.join(
    project.path,
    AUTO_BUILD_PATHS.IDEATION_DIR,
    AUTO_BUILD_PATHS.IDEATION_FILE
  );

  const ideation = readIdeationFile(ideationPath);
  if (!ideation) {
    return { success: false, error: 'Ideation not found' };
  }

  try {
    const idea = ideation.ideas?.find((i) => i.id === ideaId);
    if (!idea) {
      return { success: false, error: 'Idea not found' };
    }

    idea.status = 'archived';
    updateIdeationTimestamp(ideation);
    writeIdeationFile(ideationPath, ideation);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to archive idea'
    };
  }
}

/**
 * Delete a single idea permanently
 */
export async function deleteIdea(
  _event: IpcMainInvokeEvent,
  projectId: string,
  ideaId: string
): Promise<IPCResult> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  const ideationPath = path.join(
    project.path,
    AUTO_BUILD_PATHS.IDEATION_DIR,
    AUTO_BUILD_PATHS.IDEATION_FILE
  );

  const ideation = readIdeationFile(ideationPath);
  if (!ideation) {
    return { success: false, error: 'Ideation not found' };
  }

  try {
    const ideaIndex = ideation.ideas?.findIndex((i) => i.id === ideaId);
    if (ideaIndex === undefined || ideaIndex === -1) {
      return { success: false, error: 'Idea not found' };
    }

    ideation.ideas?.splice(ideaIndex, 1);
    updateIdeationTimestamp(ideation);
    writeIdeationFile(ideationPath, ideation);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete idea'
    };
  }
}

/**
 * Delete multiple ideas permanently
 */
export async function deleteMultipleIdeas(
  _event: IpcMainInvokeEvent,
  projectId: string,
  ideaIds: string[]
): Promise<IPCResult> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  const ideationPath = path.join(
    project.path,
    AUTO_BUILD_PATHS.IDEATION_DIR,
    AUTO_BUILD_PATHS.IDEATION_FILE
  );

  const ideation = readIdeationFile(ideationPath);
  if (!ideation) {
    return { success: false, error: 'Ideation not found' };
  }

  try {
    const idsToDelete = new Set(ideaIds);
    const originalCount = ideation.ideas?.length || 0;

    ideation.ideas = ideation.ideas?.filter((idea) => !idsToDelete.has(idea.id)) || [];

    const deletedCount = originalCount - (ideation.ideas?.length || 0);
    updateIdeationTimestamp(ideation);
    writeIdeationFile(ideationPath, ideation);

    return { success: true, data: { deletedCount } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete ideas'
    };
  }
}
