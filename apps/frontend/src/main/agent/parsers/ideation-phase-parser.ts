/**
 * Ideation Phase Parser
 * ======================
 * Parses ideation flow phases from log output.
 * Handles analyzing → discovering → generating → finalizing → complete flow.
 */

import { BasePhaseParser, type PhaseParseResult, type PhaseParserContext } from './base-phase-parser';

/**
 * Ideation phase values.
 */
export const IDEATION_PHASES = [
  'idle',
  'analyzing',
  'discovering',
  'generating',
  'finalizing',
  'complete'
] as const;

export type IdeationPhase = (typeof IDEATION_PHASES)[number];

/**
 * Terminal phases for ideation flow.
 */
export const IDEATION_TERMINAL_PHASES: ReadonlySet<IdeationPhase> = new Set(['complete']);

/**
 * Context for ideation phase parsing.
 */
export interface IdeationParserContext extends PhaseParserContext<IdeationPhase> {
  completedTypes: Set<string>;
  totalTypes: number;
}

/**
 * Result type for ideation parsing, includes progress.
 */
export interface IdeationParseResult extends PhaseParseResult<IdeationPhase> {
  progress: number;
}

/**
 * Parser for ideation flow phases.
 */
export class IdeationPhaseParser extends BasePhaseParser<IdeationPhase> {
  protected readonly phaseOrder = IDEATION_PHASES;
  protected readonly terminalPhases = IDEATION_TERMINAL_PHASES;

  /**
   * Parse ideation phase from log line.
   *
   * @param log - The log line to parse
   * @param context - Ideation parser context
   * @returns Phase result with progress, or null if no phase detected
   */
  parse(log: string, context: IdeationParserContext): IdeationParseResult | null {
    // Terminal states cannot be changed
    if (context.isTerminal) {
      return null;
    }

    const result = this.parsePhaseFromLog(log);

    if (!result) {
      // No phase change, but calculate progress if in generating phase
      if (context.currentPhase === 'generating' && context.completedTypes.size > 0) {
        const progress = this.calculateGeneratingProgress(context.completedTypes.size, context.totalTypes);
        return {
          phase: 'generating',
          progress
        };
      }
      return null;
    }

    // Calculate progress for the detected phase
    let progress = result.progress;
    if (result.phase === 'generating' && context.completedTypes.size > 0) {
      progress = this.calculateGeneratingProgress(context.completedTypes.size, context.totalTypes);
    }

    return {
      ...result,
      progress
    };
  }

  /**
   * Calculate progress during generating phase with division-by-zero protection.
   * Progress ranges from 30% to 90% based on completed types.
   */
  private calculateGeneratingProgress(completedCount: number, totalTypes: number): number {
    if (totalTypes <= 0) {
      return 90; // Max generating progress fallback
    }
    return 30 + Math.floor((completedCount / totalTypes) * 60);
  }

  /**
   * Parse phase transitions from log text.
   */
  private parsePhaseFromLog(log: string): IdeationParseResult | null {
    if (log.includes('PROJECT INDEX') || log.includes('PROJECT ANALYSIS')) {
      return { phase: 'analyzing', progress: 10 };
    }

    if (log.includes('CONTEXT GATHERING')) {
      return { phase: 'discovering', progress: 20 };
    }

    if (
      log.includes('GENERATING IDEAS (PARALLEL)') ||
      (log.includes('Starting') && log.includes('ideation agents in parallel'))
    ) {
      return { phase: 'generating', progress: 30 };
    }

    if (log.includes('MERGE') || log.includes('FINALIZE')) {
      return { phase: 'finalizing', progress: 90 };
    }

    if (log.includes('IDEATION COMPLETE')) {
      return { phase: 'complete', progress: 100 };
    }

    return null;
  }
}
