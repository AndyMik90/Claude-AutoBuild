import { useEffect, useState, useCallback } from 'react';
import {
  useIdeationStore,
  loadIdeation,
  generateIdeation,
  refreshIdeation,
  stopIdeation,
  appendIdeation,
  dismissAllIdeasForProject,
  getIdeasByType,
  getActiveIdeas,
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
  const config = useIdeationStore((state) => state.config);
  const setConfig = useIdeationStore((state) => state.setConfig);
  const logs = useIdeationStore((state) => state.logs);
  const typeStates = useIdeationStore((state) => state.typeStates);

  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
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

  const summary = getIdeationSummary(session);
  const activeIdeas = showDismissed ? session?.ideas || [] : getActiveIdeas(session);

  return {
    // State
    session,
    generationStatus,
    config,
    logs,
    typeStates,
    selectedIdea,
    activeTab,
    showConfigDialog,
    showDismissed,
    showEnvConfigModal,
    showAddMoreDialog,
    typesToAdd,
    hasToken,
    isCheckingToken,
    summary,
    activeIdeas,

    // Actions
    setSelectedIdea,
    setActiveTab,
    setShowConfigDialog,
    setShowDismissed,
    setShowEnvConfigModal,
    setShowAddMoreDialog,
    setTypesToAdd,
    setConfig,
    handleGenerate,
    handleRefresh,
    handleStop,
    handleDismissAll,
    handleEnvConfigured,
    getAvailableTypesToAdd,
    handleAddMoreIdeas,
    toggleTypeToAdd,
    handleConvertToTask,
    handleGoToTask,
    handleDismiss,
    toggleIdeationType,

    // Helper functions
    getIdeasByType: (type: IdeationType) => getIdeasByType(session, type)
  };
}
