import { ExecutionProgressData } from './types';

/**
 * Event handling and progress parsing logic
 */
export class AgentEvents {
  /**
   * Parse log output to detect execution phase transitions
   */
  parseExecutionPhase(
    log: string,
    currentPhase: ExecutionProgressData['phase'],
    isSpecRunner: boolean
  ): { phase: ExecutionProgressData['phase']; message?: string; currentSubtask?: string } | null {
    const lowerLog = log.toLowerCase();

    // Spec runner phase detection (all part of "planning")
    if (isSpecRunner) {
      if (lowerLog.includes('discovering') || lowerLog.includes('discovery')) {
        return { phase: 'planning', message: 'Discovering project context...' };
      }
      if (lowerLog.includes('requirements') || lowerLog.includes('gathering')) {
        return { phase: 'planning', message: 'Gathering requirements...' };
      }
      if (lowerLog.includes('writing spec') || lowerLog.includes('spec writer')) {
        return { phase: 'planning', message: 'Writing specification...' };
      }
      if (lowerLog.includes('validating') || lowerLog.includes('validation')) {
        return { phase: 'planning', message: 'Validating specification...' };
      }
      if (lowerLog.includes('spec complete') || lowerLog.includes('specification complete')) {
        return { phase: 'planning', message: 'Specification complete' };
      }
    }

    // Run.py phase detection
    // Planner agent running
    if (lowerLog.includes('planner agent') || lowerLog.includes('creating implementation plan')) {
      return { phase: 'planning', message: 'Creating implementation plan...' };
    }

    // Coder agent running
    if (lowerLog.includes('coder agent') || lowerLog.includes('starting coder')) {
      return { phase: 'coding', message: 'Implementing code changes...' };
    }

    // Subtask progress detection
    const subtaskMatch = log.match(/subtask[:\s]+(\d+(?:\/\d+)?|\w+[-_]\w+)/i);
    if (subtaskMatch && currentPhase === 'coding') {
      return { phase: 'coding', currentSubtask: subtaskMatch[1], message: `Working on subtask ${subtaskMatch[1]}...` };
    }

    // Subtask completion detection
    if (lowerLog.includes('subtask completed') || lowerLog.includes('subtask done')) {
      const completedSubtask = log.match(/subtask[:\s]+"?([^"]+)"?\s+completed/i);
      return {
        phase: 'coding',
        currentSubtask: completedSubtask?.[1],
        message: `Subtask ${completedSubtask?.[1] || ''} completed`
      };
    }

    // QA Review phase
    if (lowerLog.includes('qa reviewer') || lowerLog.includes('qa_reviewer') || lowerLog.includes('starting qa')) {
      return { phase: 'qa_review', message: 'Running QA review...' };
    }

    // QA Fixer phase
    if (lowerLog.includes('qa fixer') || lowerLog.includes('qa_fixer') || lowerLog.includes('fixing issues')) {
      return { phase: 'qa_fixing', message: 'Fixing QA issues...' };
    }

    // Completion detection - be conservative, require explicit success markers
    // The AI agent prints "=== BUILD COMPLETE ===" when truly done (from coder.md)
    // Only trust this pattern, not generic "all subtasks completed" which could be false positive
    if (lowerLog.includes('=== build complete ===') || lowerLog.includes('qa passed')) {
      return { phase: 'complete', message: 'Build completed successfully' };
    }

    // "All subtasks completed" is informational - don't change phase based on this alone
    // The coordinator may print this even when subtasks are blocked, so we stay in coding phase
    // and let the actual implementation_plan.json status drive the UI
    if (lowerLog.includes('all subtasks completed')) {
      return { phase: 'coding', message: 'Subtasks marked complete' };
    }

    // Incomplete build detection - when coordinator exits with pending subtasks
    if (lowerLog.includes('build incomplete') || lowerLog.includes('subtasks still pending')) {
      return { phase: 'coding', message: 'Build paused - subtasks still pending' };
    }

    // Error/failure detection
    if (lowerLog.includes('build failed') || lowerLog.includes('error:') || lowerLog.includes('fatal')) {
      return { phase: 'failed', message: log.trim().substring(0, 200) };
    }

    return null;
  }

  /**
   * Calculate overall progress based on phase and phase progress
   */
  calculateOverallProgress(phase: ExecutionProgressData['phase'], phaseProgress: number): number {
    // Phase weight ranges (same as in constants.ts)
    const weights: Record<string, { start: number; end: number }> = {
      idle: { start: 0, end: 0 },
      planning: { start: 0, end: 20 },
      coding: { start: 20, end: 80 },
      qa_review: { start: 80, end: 95 },
      qa_fixing: { start: 80, end: 95 },
      complete: { start: 100, end: 100 },
      failed: { start: 0, end: 0 }
    };

    const phaseWeight = weights[phase] || { start: 0, end: 0 };
    const phaseRange = phaseWeight.end - phaseWeight.start;
    return Math.round(phaseWeight.start + (phaseRange * phaseProgress / 100));
  }

  /**
   * Parse ideation progress from log output
   */
  parseIdeationProgress(
    log: string,
    currentPhase: string,
    currentProgress: number,
    completedTypes: Set<string>,
    totalTypes: number
  ): { phase: string; progress: number } {
    let phase = currentPhase;
    let progress = currentProgress;

    if (log.includes('PROJECT INDEX') || log.includes('PROJECT ANALYSIS')) {
      phase = 'analyzing';
      progress = 10;
    } else if (log.includes('CONTEXT GATHERING')) {
      phase = 'discovering';
      progress = 20;
    } else if (log.includes('GENERATING IDEAS (PARALLEL)') || (log.includes('Starting') && log.includes('ideation agents in parallel'))) {
      phase = 'generating';
      progress = 30;
    } else if (log.includes('MERGE') || log.includes('FINALIZE')) {
      phase = 'finalizing';
      progress = 90;
    } else if (log.includes('IDEATION COMPLETE')) {
      phase = 'complete';
      progress = 100;
    }

    // Update progress based on completed types during generation phase
    if (phase === 'generating' && completedTypes.size > 0) {
      // Progress from 30% to 90% based on completed types
      progress = 30 + Math.floor((completedTypes.size / totalTypes) * 60);
    }

    return { phase, progress };
  }

  /**
   * Parse roadmap progress from log output
   */
  parseRoadmapProgress(log: string, currentPhase: string, currentProgress: number): { phase: string; progress: number } {
    let phase = currentPhase;
    let progress = currentProgress;

    if (log.includes('PROJECT ANALYSIS')) {
      phase = 'analyzing';
      progress = 20;
    } else if (log.includes('PROJECT DISCOVERY')) {
      phase = 'discovering';
      progress = 40;
    } else if (log.includes('FEATURE GENERATION')) {
      phase = 'generating';
      progress = 70;
    } else if (log.includes('ROADMAP GENERATED')) {
      phase = 'complete';
      progress = 100;
    }

    return { phase, progress };
  }
}
