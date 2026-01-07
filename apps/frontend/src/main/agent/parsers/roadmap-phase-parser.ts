/**
 * Roadmap Phase Parser
 * =====================
 * Parses roadmap generation phases from log output.
 * Handles analyzing → discovering → generating → complete flow.
 */

import { BasePhaseParser, type PhaseParseResult, type PhaseParserContext } from './base-phase-parser';

/**
 * Roadmap phase values.
 */
export const ROADMAP_PHASES = ['idle', 'analyzing', 'discovering', 'generating', 'complete'] as const;

export type RoadmapPhase = (typeof ROADMAP_PHASES)[number];

/**
 * Terminal phases for roadmap flow.
 */
export const ROADMAP_TERMINAL_PHASES: ReadonlySet<RoadmapPhase> = new Set(['complete']);

/**
 * Result type for roadmap parsing, includes progress.
 */
export interface RoadmapParseResult extends PhaseParseResult<RoadmapPhase> {
  progress: number;
}

/**
 * Parser for roadmap generation phases.
 */
export class RoadmapPhaseParser extends BasePhaseParser<RoadmapPhase> {
  protected readonly phaseOrder = ROADMAP_PHASES;
  protected readonly terminalPhases = ROADMAP_TERMINAL_PHASES;

  /**
   * Parse roadmap phase from log line.
   *
   * @param log - The log line to parse
   * @param context - Roadmap parser context
   * @returns Phase result with progress, or null if no phase detected
   */
  parse(log: string, context: PhaseParserContext<RoadmapPhase>): RoadmapParseResult | null {
    // Terminal states can't be changed
    if (this.isTerminal(context.currentPhase)) {
      return null;
    }

    const result = this.parsePhaseFromLog(log);

    // Prevent backwards transitions
    if (result && this.wouldRegress(context.currentPhase, result.phase)) {
      return null;
    }

    return result;
  }

  /**
   * Parse phase transitions from log text.
   */
  private parsePhaseFromLog(log: string): RoadmapParseResult | null {
    if (log.includes('PROJECT ANALYSIS')) {
      return { phase: 'analyzing', progress: 20 };
    }

    if (log.includes('PROJECT DISCOVERY')) {
      return { phase: 'discovering', progress: 40 };
    }

    if (log.includes('FEATURE GENERATION')) {
      return { phase: 'generating', progress: 70 };
    }

    if (log.includes('ROADMAP GENERATED')) {
      return { phase: 'complete', progress: 100 };
    }

    return null;
  }
}
