import { useState, useEffect, useCallback } from 'react';
import { createTask } from '../../../stores/task-store';
import type {
  AnalyzePreviewResult,
  AnalyzePreviewProgress,
  ProposedBatch,
} from '../../../../preload/api/modules/github-api';
import type { TaskMetadata } from '../../../../shared/types';

interface UseAnalyzePreviewProps {
  projectId: string;
}

interface UseAnalyzePreviewReturn {
  // State
  isWizardOpen: boolean;
  isAnalyzing: boolean;
  isApproving: boolean;
  analysisProgress: AnalyzePreviewProgress | null;
  analysisResult: AnalyzePreviewResult | null;
  analysisError: string | null;

  // Actions
  openWizard: () => void;
  closeWizard: () => void;
  startAnalysis: () => void;
  approveBatches: (batches: ProposedBatch[]) => Promise<void>;
}

export function useAnalyzePreview({ projectId }: UseAnalyzePreviewProps): UseAnalyzePreviewReturn {
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalyzePreviewProgress | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalyzePreviewResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Subscribe to analysis events
  useEffect(() => {
    if (!projectId) return;

    const cleanupProgress = window.electronAPI.github.onAnalyzePreviewProgress(
      (eventProjectId, progress) => {
        if (eventProjectId === projectId) {
          setAnalysisProgress(progress);
        }
      }
    );

    const cleanupComplete = window.electronAPI.github.onAnalyzePreviewComplete(
      (eventProjectId, result) => {
        if (eventProjectId === projectId) {
          setIsAnalyzing(false);
          setAnalysisResult(result);
          setAnalysisError(null);
        }
      }
    );

    const cleanupError = window.electronAPI.github.onAnalyzePreviewError(
      (eventProjectId, error) => {
        if (eventProjectId === projectId) {
          setIsAnalyzing(false);
          setAnalysisError(error.error);
        }
      }
    );

    return () => {
      cleanupProgress();
      cleanupComplete();
      cleanupError();
    };
  }, [projectId]);

  const openWizard = useCallback(() => {
    setIsWizardOpen(true);
    // Reset state when opening
    setAnalysisProgress(null);
    setAnalysisResult(null);
    setAnalysisError(null);
  }, []);

  const closeWizard = useCallback(() => {
    setIsWizardOpen(false);
    // Reset state when closing
    setIsAnalyzing(false);
    setIsApproving(false);
    setAnalysisProgress(null);
    setAnalysisResult(null);
    setAnalysisError(null);
  }, []);

  const startAnalysis = useCallback(() => {
    if (!projectId) return;

    setIsAnalyzing(true);
    setAnalysisProgress(null);
    setAnalysisResult(null);
    setAnalysisError(null);

    // Call the API to start analysis (max 200 issues)
    window.electronAPI.github.analyzeIssuesPreview(projectId, undefined, 200);
  }, [projectId]);

  const approveBatches = useCallback(async (batches: ProposedBatch[]) => {
    if (!projectId || batches.length === 0) return;

    setIsApproving(true);
    try {
      const result = await window.electronAPI.github.approveBatches(projectId, batches);
      if (!result.success) {
        throw new Error(result.error || 'Failed to approve batches');
      }

      // Create tasks for each approved batch
      for (const batch of batches) {
        const issueNumbers = batch.issues.map(i => i.issueNumber);
        const isSingleIssue = issueNumbers.length === 1;

        // Build task title
        const title = batch.theme ||
          (isSingleIssue
            ? `GitHub Issue #${issueNumbers[0]}: ${batch.issues[0].title}`
            : `GitHub Issues: ${batch.theme || issueNumbers.map(n => `#${n}`).join(', ')}`);

        // Build task description
        const issueList = batch.issues
          .map(i => `- #${i.issueNumber}: ${i.title}`)
          .join('\n');

        const description = isSingleIssue
          ? batch.issues[0].title
          : `**Issues in this batch:**\n${issueList}\n\n**Common themes:** ${batch.commonThemes.join(', ') || 'N/A'}\n\n**Reasoning:** ${batch.reasoning}`;

        // Build metadata
        const metadata: TaskMetadata = {
          sourceType: 'github',
          githubIssueNumbers: issueNumbers,
          githubIssueNumber: isSingleIssue ? issueNumbers[0] : undefined,
          githubBatchTheme: batch.theme,
        };

        // Create the task
        await createTask(projectId, title, description, metadata);
      }
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Failed to approve batches');
      throw error;
    } finally {
      setIsApproving(false);
    }
  }, [projectId]);

  return {
    isWizardOpen,
    isAnalyzing,
    isApproving,
    analysisProgress,
    analysisResult,
    analysisError,
    openWizard,
    closeWizard,
    startAnalysis,
    approveBatches,
  };
}
