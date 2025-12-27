import { ConfigurationPanel } from './ConfigurationPanel';
import { PreviewPanel } from './PreviewPanel';
import { Step3SuccessScreen } from './Step3SuccessScreen';
import { useImageUpload } from './hooks/useImageUpload';
import { getSummaryInfo } from './utils';
import { useProjectStore } from '../../stores/project-store';
import type {
  ChangelogFormat,
  ChangelogAudience,
  ChangelogEmojiLevel,
  ChangelogTask,
  ChangelogSourceMode,
  GitCommit as GitCommitType
} from '../../../shared/types';

interface Step2ConfigureGenerateProps {
  sourceMode: ChangelogSourceMode;
  selectedTaskIds: string[];
  doneTasks: ChangelogTask[];
  previewCommits: GitCommitType[];
  existingChangelog: { lastVersion?: string } | null;
  version: string;
  versionReason: string | null;
  date: string;
  format: ChangelogFormat;
  audience: ChangelogAudience;
  emojiLevel: ChangelogEmojiLevel;
  customInstructions: string;
  generationProgress: { stage: string; progress: number; message?: string; error?: string } | null;
  generatedChangelog: string;
  isGenerating: boolean;
  error: string | null;
  showAdvanced: boolean;
  saveSuccess: boolean;
  copySuccess: boolean;
  canGenerate: boolean;
  canSave: boolean;
  onBack: () => void;
  onVersionChange: (v: string) => void;
  onDateChange: (d: string) => void;
  onFormatChange: (f: ChangelogFormat) => void;
  onAudienceChange: (a: ChangelogAudience) => void;
  onEmojiLevelChange: (l: ChangelogEmojiLevel) => void;
  onCustomInstructionsChange: (i: string) => void;
  onShowAdvancedChange: (show: boolean) => void;
  onGenerate: () => void;
  onSave: () => void;
  onCopy: () => void;
  onChangelogEdit: (content: string) => void;
}

export function Step2ConfigureGenerate(props: Step2ConfigureGenerateProps) {
  const {
    sourceMode,
    selectedTaskIds,
    doneTasks,
    previewCommits,
    generatedChangelog,
    onChangelogEdit
  } = props;

  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const projects = useProjectStore((state) => state.projects);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedTasks = doneTasks.filter((t) => selectedTaskIds.includes(t.id));

  const summaryInfo = getSummaryInfo(
    sourceMode,
    selectedTaskIds,
    selectedTasks,
    previewCommits
  );

  const imageUpload = useImageUpload({
    projectId: selectedProjectId,
    content: generatedChangelog,
    onContentChange: onChangelogEdit
  });

  return (
    <div className="flex flex-1 overflow-hidden">
      <ConfigurationPanel
        sourceMode={sourceMode}
        summaryInfo={summaryInfo}
        existingChangelog={props.existingChangelog}
        version={props.version}
        versionReason={props.versionReason}
        date={props.date}
        format={props.format}
        audience={props.audience}
        emojiLevel={props.emojiLevel}
        customInstructions={props.customInstructions}
        generationProgress={props.generationProgress}
        isGenerating={props.isGenerating}
        error={props.error}
        showAdvanced={props.showAdvanced}
        canGenerate={props.canGenerate}
        onBack={props.onBack}
        onVersionChange={props.onVersionChange}
        onDateChange={props.onDateChange}
        onFormatChange={props.onFormatChange}
        onAudienceChange={props.onAudienceChange}
        onEmojiLevelChange={props.onEmojiLevelChange}
        onCustomInstructionsChange={props.onCustomInstructionsChange}
        onShowAdvancedChange={props.onShowAdvancedChange}
        onGenerate={props.onGenerate}
      />

      <PreviewPanel
        generatedChangelog={generatedChangelog}
        saveSuccess={props.saveSuccess}
        copySuccess={props.copySuccess}
        canSave={props.canSave}
        isDragOver={imageUpload.isDragOver}
        imageError={imageUpload.imageError}
        textareaRef={imageUpload.textareaRef}
        projectPath={selectedProject?.path}
        onSave={props.onSave}
        onCopy={props.onCopy}
        onChangelogEdit={onChangelogEdit}
        onPaste={imageUpload.handlePaste}
        onDragOver={imageUpload.handleDragOver}
        onDragLeave={imageUpload.handleDragLeave}
        onDrop={imageUpload.handleDrop}
      />
    </div>
  );
}

interface Step3ReleaseArchiveProps {
  projectId: string;
  version: string;
  selectedTaskIds: string[];
  doneTasks: ChangelogTask[];
  generatedChangelog: string;
  onDone: () => void;
}

export function Step3ReleaseArchive(props: Step3ReleaseArchiveProps) {
  return <Step3SuccessScreen {...props} />;
}
