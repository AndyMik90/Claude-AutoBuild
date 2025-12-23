import { useEffect, useState, useCallback } from 'react';
import {
  useIdeationStore,
  loadIdeation,
  generateIdeation,
  refreshIdeation,
  stopIdeation,
  appendIdeation,
  dismissAllIdeasForProject,
  deleteMultipleIdeasForProject,
  getIdeasByType,
  getActiveIdeas,
  getArchivedIdeas,
  getIdeationSummary,
  setupIdeationListeners
} from '../../../stores/ideation-store';
import { loadTasks } from '../../../stores/task-store';
import { useClaudeTokenCheck } from '../../EnvConfigModal';
import type { Idea, IdeationType } from '../../../../shared/types';
import { ALL_IDEATION_TYPES } from '../constants';

interface UseIdeationOptions {
  onGoToTask?: (taskId: string) => void;
}

export function useIdeation(projectId: string, options: UseIdeationOptions = {}) {
  const { onGoToTask } = options;
  const session = useIdeationStore((state) => state.session);
  const generationStatus = useIdeationStore((state) => state.generationStatus);
  const isGenerating = useIdeationStore((state) => state.isGenerating);
  const config = useIdeationStore((state) => state.config);
  const setConfig = useIdeationStore((state) => state.setConfig);
  const logs = useIdeationStore((state) => state.logs);
  const typeStates = useIdeationStore((state) => state.typeStates);
  const selectedIds = useIdeationStore((state) => state.selectedIds);
  const toggleSelectIdea = useIdeationStore((state) => state.toggleSelectIdea);
  const selectAllIdeas = useIdeationStore((state) => state.selectAllIdeas);
  const clearSelection = useIdeationStore((state) => state.clearSelection);

  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showEnvConfigModal, setShowEnvConfigModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'generate' | 'refresh' | 'append' | null>(null);
  const [showAddMoreDialog, setShowAddMoreDialog] = useState(false);
  const [typesToAdd, setTypesToAdd] = useState<IdeationType[]>([]);

  const { hasToken, isLoading: isCheckingToken, checkToken } = useClaudeTokenCheck();

  // Set up IPC listeners and load ideation on mount
  useEffect(() => {
    const cleanup = setupIdeationListeners();
    loadIdeation(projectId);
    return cleanup;
  }, [projectId]);

  const handleGenerate = async () => {
    if (hasToken === false) {
      setPendingAction('generate');
      setShowEnvConfigModal(true);
      return;
    }
    generateIdeation(projectId);
  };

  const handleRefresh = async () => {
    if (hasToken === false) {
      setPendingAction('refresh');
      setShowEnvConfigModal(true);
      return;
    }
    refreshIdeation(projectId);
  };

  const handleStop = async () => {
    await stopIdeation(projectId);
  };

  const handleDismissAll = async () => {
    await dismissAllIdeasForProject(projectId);
  };

  const handleEnvConfigured = () => {
    checkToken();
    if (pendingAction === 'generate') {
      generateIdeation(projectId);
    } else if (pendingAction === 'refresh') {
      refreshIdeation(projectId);
    } else if (pendingAction === 'append' && typesToAdd.length > 0) {
      appendIdeation(projectId, typesToAdd);
      setTypesToAdd([]);
    }
    setPendingAction(null);
  };

  const getAvailableTypesToAdd = (): IdeationType[] => {
    if (!session) return ALL_IDEATION_TYPES;
    const existingTypes = new Set(session.ideas.map((idea) => idea.type));
    return ALL_IDEATION_TYPES.filter((type) => !existingTypes.has(type));
  };

  const handleAddMoreIdeas = () => {
    if (typesToAdd.length === 0) return;

    if (hasToken === false) {
      setPendingAction('append');
      setShowEnvConfigModal(true);
      return;
    }

    appendIdeation(projectId, typesToAdd);
    setTypesToAdd([]);
    setShowAddMoreDialog(false);
  };

  const toggleTypeToAdd = (type: IdeationType) => {
    setTypesToAdd((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleConvertToTask = async (idea: Idea) => {
    const result = await window.electronAPI.convertIdeaToTask(projectId, idea.id);
    if (result.success && result.data) {
      // Store the taskId on the idea so we can navigate to it later
      useIdeationStore.getState().setIdeaTaskId(idea.id, result.data.id);
      loadTasks(projectId);
    }
  };

  const handleGoToTask = useCallback(
    (taskId: string) => {
      if (onGoToTask) {
        onGoToTask(taskId);
      }
    },
    [onGoToTask]
  );

  const handleDismiss = async (idea: Idea) => {
    const result = await window.electronAPI.dismissIdea(projectId, idea.id);
    if (result.success) {
      useIdeationStore.getState().dismissIdea(idea.id);
    }
  };

  const toggleIdeationType = (type: IdeationType) => {
    const currentTypes = config.enabledTypes;
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type];

    if (newTypes.length > 0) {
      setConfig({ enabledTypes: newTypes });
    }
  };

  const handleDeleteSelected = useCallback(async () => {
    // Get fresh selectedIds from store to avoid stale closure
    const currentSelectedIds = useIdeationStore.getState().selectedIds;
    if (currentSelectedIds.size === 0) return;
    await deleteMultipleIdeasForProject(projectId, Array.from(currentSelectedIds));
  }, [projectId]);

  const handleSelectAll = useCallback((ideas: Idea[]) => {
    selectAllIdeas(ideas.map(idea => idea.id));
  }, [selectAllIdeas]);

  const summary = getIdeationSummary(session);
  const archivedIdeas = getArchivedIdeas(session);

  // Filter ideas based on visibility settings
  const getFilteredIdeas = useCallback(() => {
    if (!session) return [];
    let ideas = session.ideas;

    // Start with base filtering (exclude dismissed and archived by default)
    if (!showDismissed && !showArchived) {
      ideas = getActiveIdeas(session);
    } else if (showDismissed && !showArchived) {
      // Show dismissed but not archived
      ideas = ideas.filter(idea => idea.status !== 'archived');
    } else if (!showDismissed && showArchived) {
      // Show archived but not dismissed
      ideas = ideas.filter(idea => idea.status !== 'dismissed');
    }
    // If both are true, show all

    return ideas;
  }, [session, showDismissed, showArchived]);

  const activeIdeas = getFilteredIdeas();

  return {
    // State
    session,
    generationStatus,
    isGenerating,
    config,
    logs,
    typeStates,
    selectedIdea,
    activeTab,
    showConfigDialog,
    showDismissed,
    showArchived,
    showEnvConfigModal,
    showAddMoreDialog,
    typesToAdd,
    hasToken,
    isCheckingToken,
    summary,
    activeIdeas,
    archivedIdeas,
    selectedIds,

    // Actions
    setSelectedIdea,
    setActiveTab,
    setShowConfigDialog,
    setShowDismissed,
    setShowArchived,
    setShowEnvConfigModal,
    setShowAddMoreDialog,
    setTypesToAdd,
    setConfig,
    handleGenerate,
    handleRefresh,
    handleStop,
    handleDismissAll,
    handleDeleteSelected,
    handleSelectAll,
    handleEnvConfigured,
    getAvailableTypesToAdd,
    handleAddMoreIdeas,
    toggleTypeToAdd,
    handleConvertToTask,
    handleGoToTask,
    handleDismiss,
    toggleIdeationType,
    toggleSelectIdea,
    clearSelection,

    // Helper functions
    getIdeasByType: (type: IdeationType) => getIdeasByType(session, type)
  };
}
