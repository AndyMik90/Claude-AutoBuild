import { useEffect, useRef } from 'react';
import { LinearTaskImportModal } from '../LinearTaskImportModal';
import { SettingsSection } from './SettingsSection';
import { useProjectSettings, UseProjectSettingsReturn } from '../project-settings/hooks/useProjectSettings';
import { EmptyProjectState } from './common/EmptyProjectState';
import { ErrorDisplay } from './common/ErrorDisplay';
import { SectionRouter } from './sections/SectionRouter';
import { createHookProxy } from './utils/hookProxyFactory';
import type { Project } from '../../../shared/types';

export type ProjectSettingsSection = 'general' | 'claude' | 'linear' | 'github' | 'memory';

interface ProjectSettingsContentProps {
  project: Project | undefined;
  activeSection: ProjectSettingsSection;
  isOpen: boolean;
  onHookReady: (hook: UseProjectSettingsReturn | null) => void;
}

/**
 * Renders project settings content based on the active section.
 * Exposes hook state to parent for save coordination.
 */
export function ProjectSettingsContent({
  project,
  activeSection,
  isOpen,
  onHookReady
}: ProjectSettingsContentProps) {
  // Show empty state if no project selected
  if (!project) {
    return (
      <SettingsSection
        title="No Project Selected"
        description="Select a project from the dropdown above to configure its settings"
      >
        <EmptyProjectState />
      </SettingsSection>
    );
  }

  return (
    <ProjectSettingsContentInner
      project={project}
      activeSection={activeSection}
      isOpen={isOpen}
      onHookReady={onHookReady}
    />
  );
}

/**
 * Inner component that uses the project settings hook.
 * Separated to ensure the hook is only called when a project is selected.
 */
function ProjectSettingsContentInner({
  project,
  activeSection,
  isOpen,
  onHookReady
}: {
  project: Project;
  activeSection: ProjectSettingsSection;
  isOpen: boolean;
  onHookReady: (hook: UseProjectSettingsReturn | null) => void;
}) {
  const hook = useProjectSettings(project, isOpen);

  // Keep a stable ref to the hook for the parent
  const hookRef = useRef(hook);
  hookRef.current = hook;

  const {
    settings,
    setSettings,
    versionInfo,
    isCheckingVersion,
    isUpdating,
    envConfig,
    isLoadingEnv,
    envError,
    updateEnvConfig,
    showClaudeToken,
    setShowClaudeToken,
    showLinearKey,
    setShowLinearKey,
    showOpenAIKey,
    setShowOpenAIKey,
    showFalkorPassword,
    setShowFalkorPassword,
    showGitHubToken,
    setShowGitHubToken,
    expandedSections: _expandedSections,
    toggleSection: _toggleSection,
    gitHubConnectionStatus,
    isCheckingGitHub,
    isCheckingClaudeAuth,
    claudeAuthStatus,
    showLinearImportModal,
    setShowLinearImportModal,
    linearConnectionStatus,
    isCheckingLinear,
    handleInitialize,
    handleUpdate,
    handleClaudeSetup,
    error
  } = hook;

  // Expose hook to parent for save coordination - only once when dialog opens
  // We use hookRef to avoid infinite loops (hook object is recreated each render)
  useEffect(() => {
    if (isOpen) {
      const hookProxy = createHookProxy(hookRef);
      onHookReady(hookProxy);
    }
    return () => {
      onHookReady(null);
    };
  }, [isOpen, onHookReady]);

  return (
    <>
      <SectionRouter
        activeSection={activeSection}
        project={project}
        settings={settings}
        setSettings={setSettings}
        versionInfo={versionInfo}
        isCheckingVersion={isCheckingVersion}
        isUpdating={isUpdating}
        envConfig={envConfig}
        isLoadingEnv={isLoadingEnv}
        envError={envError}
        updateEnvConfig={updateEnvConfig}
        showClaudeToken={showClaudeToken}
        setShowClaudeToken={setShowClaudeToken}
        showLinearKey={showLinearKey}
        setShowLinearKey={setShowLinearKey}
        showOpenAIKey={showOpenAIKey}
        setShowOpenAIKey={setShowOpenAIKey}
        showFalkorPassword={showFalkorPassword}
        setShowFalkorPassword={setShowFalkorPassword}
        showGitHubToken={showGitHubToken}
        setShowGitHubToken={setShowGitHubToken}
        gitHubConnectionStatus={gitHubConnectionStatus}
        isCheckingGitHub={isCheckingGitHub}
        isCheckingClaudeAuth={isCheckingClaudeAuth}
        claudeAuthStatus={claudeAuthStatus}
        linearConnectionStatus={linearConnectionStatus}
        isCheckingLinear={isCheckingLinear}
        handleInitialize={handleInitialize}
        handleUpdate={handleUpdate}
        handleClaudeSetup={handleClaudeSetup}
        onOpenLinearImport={() => setShowLinearImportModal(true)}
      />

      <ErrorDisplay error={error} envError={envError} />

      {/* Linear Task Import Modal */}
      <LinearTaskImportModal
        projectId={project.id}
        open={showLinearImportModal}
        onOpenChange={setShowLinearImportModal}
        onImportComplete={(result) => {
          console.warn('Import complete:', result);
        }}
      />
    </>
  );
}
