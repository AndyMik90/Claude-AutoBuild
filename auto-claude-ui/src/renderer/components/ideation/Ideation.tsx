import { TabsContent } from '../ui/tabs';
import { EnvConfigModal } from '../EnvConfigModal';
import { IDEATION_TYPE_DESCRIPTIONS } from '../../../shared/constants';
import { IdeationEmptyState } from './IdeationEmptyState';
import { IdeationHeader } from './IdeationHeader';
import { IdeationFilters } from './IdeationFilters';
import { IdeationDialogs } from './IdeationDialogs';
import { GenerationProgressScreen } from './GenerationProgressScreen';
import { IdeaCard } from './IdeaCard';
import { IdeaDetailPanel } from './IdeaDetailPanel';
import { useIdeation } from './hooks/useIdeation';
import { ALL_IDEATION_TYPES } from './constants';

interface IdeationProps {
  projectId: string;
  onGoToTask?: (taskId: string) => void;
}

export function Ideation({ projectId, onGoToTask }: IdeationProps) {
  const {
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
    getIdeasByType
  } = useIdeation(projectId, { onGoToTask });

  // Show generation progress with streaming ideas
  if (generationStatus.phase !== 'idle' && generationStatus.phase !== 'complete' && generationStatus.phase !== 'error') {
    return (
      <GenerationProgressScreen
        generationStatus={generationStatus}
        logs={logs}
        typeStates={typeStates}
        enabledTypes={config.enabledTypes}
        session={session}
        onSelectIdea={setSelectedIdea}
        selectedIdea={selectedIdea}
        onConvert={handleConvertToTask}
        onGoToTask={handleGoToTask}
        onDismiss={handleDismiss}
        onStop={handleStop}
      />
    );
  }

  // Show empty state
  if (!session) {
    return (
      <>
        <IdeationEmptyState
          config={config}
          hasToken={hasToken}
          isCheckingToken={isCheckingToken}
          onGenerate={handleGenerate}
          onOpenConfig={() => setShowConfigDialog(true)}
          onToggleIdeationType={toggleIdeationType}
        />

        <IdeationDialogs
          showConfigDialog={showConfigDialog}
          showAddMoreDialog={false}
          config={config}
          typesToAdd={[]}
          availableTypesToAdd={[]}
          onToggleIdeationType={toggleIdeationType}
          onToggleTypeToAdd={() => {}}
          onSetConfig={setConfig}
          onCloseConfigDialog={() => setShowConfigDialog(false)}
          onCloseAddMoreDialog={() => {}}
          onConfirmAddMore={() => {}}
        />

        <EnvConfigModal
          open={showEnvConfigModal}
          onOpenChange={setShowEnvConfigModal}
          onConfigured={handleEnvConfigured}
          title="Claude Authentication Required"
          description="A Claude Code OAuth token is required to generate AI-powered feature ideas."
        />
      </>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <IdeationHeader
        totalIdeas={summary.totalIdeas}
        ideaCountByType={summary.byType}
        showDismissed={showDismissed}
        onToggleShowDismissed={() => setShowDismissed(!showDismissed)}
        onOpenConfig={() => setShowConfigDialog(true)}
        onOpenAddMore={() => {
          setTypesToAdd([]);
          setShowAddMoreDialog(true);
        }}
        onDismissAll={handleDismissAll}
        onRefresh={handleRefresh}
        hasActiveIdeas={activeIdeas.length > 0}
        canAddMore={getAvailableTypesToAdd().length > 0}
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <IdeationFilters activeTab={activeTab} onTabChange={setActiveTab}>
          {/* All Ideas View */}
          <TabsContent value="all" className="flex-1 overflow-auto p-4">
            <div className="grid gap-3">
              {activeIdeas.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  onClick={() => setSelectedIdea(selectedIdea?.id === idea.id ? null : idea)}
                  onConvert={handleConvertToTask}
                  onGoToTask={handleGoToTask}
                  onDismiss={handleDismiss}
                />
              ))}
              {activeIdeas.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No ideas to display
                </div>
              )}
            </div>
          </TabsContent>

          {/* Type-specific Views */}
          {ALL_IDEATION_TYPES.map((type) => (
            <TabsContent key={type} value={type} className="flex-1 overflow-auto p-4">
              <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  {IDEATION_TYPE_DESCRIPTIONS[type]}
                </p>
              </div>
              <div className="grid gap-3">
                {getIdeasByType(type)
                  .filter((idea) => showDismissed || idea.status !== 'dismissed')
                  .map((idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      onClick={() => setSelectedIdea(selectedIdea?.id === idea.id ? null : idea)}
                      onConvert={handleConvertToTask}
                      onGoToTask={handleGoToTask}
                      onDismiss={handleDismiss}
                    />
                  ))}
              </div>
            </TabsContent>
          ))}
        </IdeationFilters>
      </div>

      {/* Idea Detail Panel */}
      {selectedIdea && (
        <IdeaDetailPanel
          idea={selectedIdea}
          onClose={() => setSelectedIdea(null)}
          onConvert={handleConvertToTask}
          onGoToTask={handleGoToTask}
          onDismiss={handleDismiss}
        />
      )}

      {/* Dialogs */}
      <IdeationDialogs
        showConfigDialog={showConfigDialog}
        showAddMoreDialog={showAddMoreDialog}
        config={config}
        typesToAdd={typesToAdd}
        availableTypesToAdd={getAvailableTypesToAdd()}
        onToggleIdeationType={toggleIdeationType}
        onToggleTypeToAdd={toggleTypeToAdd}
        onSetConfig={setConfig}
        onCloseConfigDialog={() => setShowConfigDialog(false)}
        onCloseAddMoreDialog={() => setShowAddMoreDialog(false)}
        onConfirmAddMore={handleAddMoreIdeas}
      />

      {/* Environment Configuration Modal */}
      <EnvConfigModal
        open={showEnvConfigModal}
        onOpenChange={setShowEnvConfigModal}
        onConfigured={handleEnvConfigured}
        title="Claude Authentication Required"
        description="A Claude Code OAuth token is required to generate AI-powered feature ideas."
      />
    </div>
  );
}
