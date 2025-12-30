/**
 * Action Scoring Algorithm for Intelligent Subtask Action Summarization
 *
 * Implements a weighted scoring algorithm based on cognitive science principles
 * to identify the most relevant actions from potentially 1000+ entries.
 *
 * Scoring Weights (research-backed):
 * - Error: 40 - Flow blockers demand immediate attention (Csikszentmihalyi)
 * - Decision: 25 - Mental model building (Justin Sung's conceptual frameworks)
 * - FileChange: 20 - Concrete anchors for active recall
 * - TimeAnomaly: 10 - Attention signals for complexity (Kahneman's System 1/2)
 * - Novelty: 5 - Learning moments, first exposures (Bjork's desirable difficulties)
 */

import type { TaskLogEntry, TaskLogEntryType } from '@shared/types/task';

/** Scoring weight constants based on cognitive science principles */
export const SCORING_WEIGHTS = {
  ERROR: 40,
  WARNING: 20,
  DECISION: 25,
  FILE_CHANGE: 20,
  TIME_ANOMALY: 10,
  NOVELTY: 5,
} as const;

/** Default number of top actions to return */
export const DEFAULT_TOP_N = 5;

/** Time anomaly threshold multiplier (2x average duration) */
export const TIME_ANOMALY_THRESHOLD = 2;

/**
 * Scored action with computed relevance score
 */
export interface ScoredAction {
  action: TaskLogEntry;
  score: number;
  index: number; // Original index for tiebreaking
  scoreBreakdown: ScoreBreakdown;
}

/**
 * Breakdown of how an action's score was calculated
 */
export interface ScoreBreakdown {
  error: number;
  decision: number;
  fileChange: number;
  timeAnomaly: number;
  novelty: number;
}

/**
 * Context for scoring actions (e.g., average duration, seen types)
 */
export interface ScoringContext {
  averageDuration?: number;
  seenToolTypes: Set<string>;
}

/**
 * Tool names that indicate decision-making actions
 * These represent key architectural or implementation choices
 */
const DECISION_TOOL_NAMES = [
  'edit',
  'write',
  'create',
  'bash', // Commands can represent decisions
  'delete',
  'rename',
  'move',
  'refactor',
];

/**
 * Tool names that indicate file changes
 */
const FILE_CHANGE_TOOL_NAMES = [
  'edit',
  'write',
  'create',
  'delete',
  'rename',
  'move',
  'notebookedit',
];

/**
 * Entry types that indicate errors or warnings
 */
const ERROR_TYPES: TaskLogEntryType[] = ['error'];

/**
 * Entry types that indicate success (lower priority than errors)
 */
const SUCCESS_TYPES: TaskLogEntryType[] = ['success'];

/**
 * Check if an action represents an error
 */
export function isErrorAction(action: TaskLogEntry): boolean {
  // Check entry type
  if (ERROR_TYPES.includes(action.type)) {
    return true;
  }

  // Check content for error keywords
  const content = action.content?.toLowerCase() ?? '';
  const hasErrorKeywords =
    content.includes('error') ||
    content.includes('failed') ||
    content.includes('failure') ||
    content.includes('exception') ||
    content.includes('crash');

  return hasErrorKeywords;
}

/**
 * Check if an action represents a warning
 */
export function isWarningAction(action: TaskLogEntry): boolean {
  const content = action.content?.toLowerCase() ?? '';
  return (
    content.includes('warning') ||
    content.includes('deprecated') ||
    content.includes('caution')
  );
}

/**
 * Check if an action represents a decision point
 * Decision points are key moments that affect the implementation direction
 */
export function isDecisionAction(action: TaskLogEntry): boolean {
  // Tool-based decision detection
  if (action.tool_name) {
    const toolLower = action.tool_name.toLowerCase();
    if (DECISION_TOOL_NAMES.some((name) => toolLower.includes(name))) {
      return true;
    }
  }

  // Content-based decision detection
  const content = action.content?.toLowerCase() ?? '';
  const hasDecisionKeywords =
    content.includes('decided') ||
    content.includes('choosing') ||
    content.includes('selected') ||
    content.includes('implementing') ||
    content.includes('creating') ||
    content.includes('adding') ||
    content.includes('modifying');

  return hasDecisionKeywords;
}

/**
 * Check if an action involves file changes
 */
export function isFileChangeAction(action: TaskLogEntry): boolean {
  // Tool-based file change detection
  if (action.tool_name) {
    const toolLower = action.tool_name.toLowerCase();
    if (FILE_CHANGE_TOOL_NAMES.some((name) => toolLower.includes(name))) {
      return true;
    }
  }

  // Content-based file change detection
  const content = action.content?.toLowerCase() ?? '';
  return (
    content.includes('wrote') ||
    content.includes('edited') ||
    content.includes('created') ||
    content.includes('modified') ||
    content.includes('deleted')
  );
}

/**
 * Count the number of files affected by an action
 * Returns a rough estimate based on content analysis
 */
export function countFilesChanged(action: TaskLogEntry): number {
  // Check tool input for file paths
  const input = action.tool_input ?? '';
  const detail = action.detail ?? '';
  const combined = input + detail;

  // Count file path patterns (simplified heuristic)
  const filePatterns = combined.match(/[\/\\][\w\-\.]+\.[a-z]{1,4}/gi) ?? [];

  // Cap at 3 for scoring purposes (to prevent outliers)
  return Math.min(filePatterns.length, 3);
}

/**
 * Parse duration from action timestamp or detail
 * Returns undefined if duration cannot be determined
 */
export function parseDuration(action: TaskLogEntry): number | undefined {
  // Duration is not directly available in TaskLogEntry
  // This could be enhanced if duration tracking is added to the type
  return undefined;
}

/**
 * Calculate average duration from a list of actions
 */
export function calculateAverageDuration(actions: TaskLogEntry[]): number | undefined {
  const durations = actions
    .map(parseDuration)
    .filter((d): d is number => d !== undefined);

  if (durations.length === 0) {
    return undefined;
  }

  return durations.reduce((sum, d) => sum + d, 0) / durations.length;
}

/**
 * Check if action duration is anomalous (significantly longer than average)
 */
export function isTimeAnomaly(action: TaskLogEntry, averageDuration?: number): boolean {
  if (averageDuration === undefined) {
    return false;
  }

  const duration = parseDuration(action);
  if (duration === undefined) {
    return false;
  }

  return duration > averageDuration * TIME_ANOMALY_THRESHOLD;
}

/**
 * Check if this is the first occurrence of a tool type
 */
export function isNovelty(action: TaskLogEntry, seenTypes: Set<string>): boolean {
  if (!action.tool_name) {
    return false;
  }

  const toolType = action.tool_name.toLowerCase();
  return !seenTypes.has(toolType);
}

/**
 * Score a single action based on cognitive science principles
 *
 * @param action - The action to score
 * @param index - Original index in the actions array (for tiebreaking)
 * @param context - Scoring context with average duration and seen types
 * @returns ScoredAction with computed score and breakdown
 */
export function scoreAction(
  action: TaskLogEntry,
  index: number,
  context: ScoringContext
): ScoredAction {
  const breakdown: ScoreBreakdown = {
    error: 0,
    decision: 0,
    fileChange: 0,
    timeAnomaly: 0,
    novelty: 0,
  };

  // Error/warning signals (cognitive priority)
  if (isErrorAction(action)) {
    breakdown.error = SCORING_WEIGHTS.ERROR;
  } else if (isWarningAction(action)) {
    breakdown.error = SCORING_WEIGHTS.WARNING;
  }

  // Decision points (mental model building)
  if (isDecisionAction(action)) {
    breakdown.decision = SCORING_WEIGHTS.DECISION;
  }

  // File changes (concrete anchors)
  if (isFileChangeAction(action)) {
    const filesChanged = countFilesChanged(action);
    // Scale by number of files changed, cap at 3x base weight
    breakdown.fileChange = SCORING_WEIGHTS.FILE_CHANGE * Math.max(1, filesChanged);
  }

  // Time anomalies (attention signals)
  if (isTimeAnomaly(action, context.averageDuration)) {
    breakdown.timeAnomaly = SCORING_WEIGHTS.TIME_ANOMALY;
  }

  // Novelty (learning moments)
  if (isNovelty(action, context.seenToolTypes)) {
    breakdown.novelty = SCORING_WEIGHTS.NOVELTY;
    // Track this type as seen
    if (action.tool_name) {
      context.seenToolTypes.add(action.tool_name.toLowerCase());
    }
  }

  const score =
    breakdown.error +
    breakdown.decision +
    breakdown.fileChange +
    breakdown.timeAnomaly +
    breakdown.novelty;

  return {
    action,
    score,
    index,
    scoreBreakdown: breakdown,
  };
}

/**
 * Compare function for sorting scored actions
 * Primary: descending by score
 * Secondary: ascending by index (earlier actions win ties)
 */
function compareScoredActions(a: ScoredAction, b: ScoredAction): number {
  // Higher score comes first
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  // For equal scores, earlier action wins (ascending index)
  return a.index - b.index;
}

/**
 * Filter and return the top N most relevant actions
 *
 * @param actions - Array of all actions to filter
 * @param n - Number of top actions to return (default: 5)
 * @param subtaskId - Optional subtask ID to filter by
 * @returns Array of scored actions, sorted by relevance
 */
export function filterTopActions(
  actions: TaskLogEntry[],
  n: number = DEFAULT_TOP_N,
  subtaskId?: string
): ScoredAction[] {
  // Handle empty or small arrays
  if (!actions || actions.length === 0) {
    return [];
  }

  // Filter by subtask if specified
  let filteredActions = subtaskId
    ? actions.filter((a) => a.subtask_id === subtaskId)
    : actions;

  // If fewer actions than requested, process all of them
  if (filteredActions.length <= n) {
    const context: ScoringContext = {
      averageDuration: calculateAverageDuration(filteredActions),
      seenToolTypes: new Set<string>(),
    };

    return filteredActions
      .map((action, index) => scoreAction(action, index, context))
      .sort(compareScoredActions);
  }

  // Create scoring context
  const context: ScoringContext = {
    averageDuration: calculateAverageDuration(filteredActions),
    seenToolTypes: new Set<string>(),
  };

  // Score all actions
  const scoredActions = filteredActions.map((action, index) =>
    scoreAction(action, index, context)
  );

  // Sort by score (descending) with tiebreaker
  scoredActions.sort(compareScoredActions);

  // Return top N
  return scoredActions.slice(0, n);
}

/**
 * Group actions by subphase for hierarchical display
 *
 * @param actions - Array of scored actions
 * @returns Map of subphase -> actions
 */
export function groupActionsBySubphase(
  actions: ScoredAction[]
): Map<string, ScoredAction[]> {
  const groups = new Map<string, ScoredAction[]>();

  for (const action of actions) {
    const subphase = action.action.subphase ?? 'Other';
    const existing = groups.get(subphase) ?? [];
    existing.push(action);
    groups.set(subphase, existing);
  }

  return groups;
}

/**
 * Get a human-readable description of why an action scored highly
 *
 * @param scoredAction - The scored action to describe
 * @returns String describing the scoring reasons
 */
export function getScoreReason(scoredAction: ScoredAction): string {
  const reasons: string[] = [];
  const { scoreBreakdown } = scoredAction;

  if (scoreBreakdown.error > 0) {
    if (scoreBreakdown.error >= SCORING_WEIGHTS.ERROR) {
      reasons.push('Error detected');
    } else {
      reasons.push('Warning detected');
    }
  }

  if (scoreBreakdown.decision > 0) {
    reasons.push('Key decision');
  }

  if (scoreBreakdown.fileChange > 0) {
    reasons.push('File modification');
  }

  if (scoreBreakdown.timeAnomaly > 0) {
    reasons.push('Long duration');
  }

  if (scoreBreakdown.novelty > 0) {
    reasons.push('New action type');
  }

  return reasons.length > 0 ? reasons.join(', ') : 'Standard action';
}

/**
 * Subtask relevance score with aggregate data
 */
export interface SubtaskRelevanceScore {
  subtaskId: string;
  totalScore: number;
  actionCount: number;
  averageScore: number;
  hasErrors: boolean;
  hasDecisions: boolean;
  topScore: number; // Highest single action score
}

/**
 * Calculate the relevance score for a subtask based on its actions
 *
 * The relevance score is a combination of:
 * - Total aggregate score of all actions
 * - Top action score (to prioritize subtasks with critical actions)
 * - Presence of errors (higher priority)
 *
 * @param actions - All actions from phase logs
 * @param subtaskId - The subtask ID to calculate relevance for
 * @returns SubtaskRelevanceScore with aggregated scoring data
 */
export function calculateSubtaskRelevance(
  actions: TaskLogEntry[],
  subtaskId: string
): SubtaskRelevanceScore {
  const subtaskActions = actions.filter((a) => a.subtask_id === subtaskId);

  if (subtaskActions.length === 0) {
    return {
      subtaskId,
      totalScore: 0,
      actionCount: 0,
      averageScore: 0,
      hasErrors: false,
      hasDecisions: false,
      topScore: 0,
    };
  }

  // Score all subtask actions
  const context: ScoringContext = {
    averageDuration: calculateAverageDuration(subtaskActions),
    seenToolTypes: new Set<string>(),
  };

  const scoredActions = subtaskActions.map((action, index) =>
    scoreAction(action, index, context)
  );

  // Aggregate scores
  const totalScore = scoredActions.reduce((sum, sa) => sum + sa.score, 0);
  const topScore = Math.max(...scoredActions.map((sa) => sa.score));
  const hasErrors = scoredActions.some((sa) => sa.scoreBreakdown.error >= SCORING_WEIGHTS.ERROR);
  const hasDecisions = scoredActions.some((sa) => sa.scoreBreakdown.decision > 0);

  return {
    subtaskId,
    totalScore,
    actionCount: subtaskActions.length,
    averageScore: totalScore / subtaskActions.length,
    hasErrors,
    hasDecisions,
    topScore,
  };
}

/**
 * Calculate relevance scores for multiple subtasks
 *
 * @param actions - All actions from phase logs
 * @param subtaskIds - Array of subtask IDs to calculate relevance for
 * @returns Map of subtask ID to relevance score
 */
export function calculateSubtaskRelevanceScores(
  actions: TaskLogEntry[],
  subtaskIds: string[]
): Map<string, SubtaskRelevanceScore> {
  const scores = new Map<string, SubtaskRelevanceScore>();

  for (const subtaskId of subtaskIds) {
    scores.set(subtaskId, calculateSubtaskRelevance(actions, subtaskId));
  }

  return scores;
}

/**
 * Sort subtasks by relevance score
 *
 * Primary sort: By composite relevance score (errors weighted heavily)
 * Secondary sort: By action count (more actions = more activity)
 * Tertiary sort: By original order (for stable sorting)
 *
 * @param subtaskIds - Array of subtask IDs
 * @param relevanceScores - Map of subtask ID to relevance score
 * @returns Sorted array of subtask IDs (most relevant first)
 */
export function sortSubtasksByRelevance(
  subtaskIds: string[],
  relevanceScores: Map<string, SubtaskRelevanceScore>
): string[] {
  return [...subtaskIds].sort((a, b) => {
    const scoreA = relevanceScores.get(a);
    const scoreB = relevanceScores.get(b);

    // Handle missing scores (put at end)
    if (!scoreA && !scoreB) return 0;
    if (!scoreA) return 1;
    if (!scoreB) return -1;

    // Composite score: prioritize errors, then top score, then total
    const compositeA =
      (scoreA.hasErrors ? 1000 : 0) + scoreA.topScore * 10 + scoreA.totalScore;
    const compositeB =
      (scoreB.hasErrors ? 1000 : 0) + scoreB.topScore * 10 + scoreB.totalScore;

    if (compositeB !== compositeA) {
      return compositeB - compositeA; // Descending
    }

    // Secondary: action count (more activity = more relevant)
    if (scoreB.actionCount !== scoreA.actionCount) {
      return scoreB.actionCount - scoreA.actionCount;
    }

    // Tertiary: stable sort by original index
    return subtaskIds.indexOf(a) - subtaskIds.indexOf(b);
  });
}

/**
 * File operation type for categorizing file interactions
 */
export type FileOperationType = 'read' | 'edit' | 'write' | 'delete' | 'search' | 'bash';

/**
 * Extracted file information from log actions
 */
export interface ExtractedFile {
  path: string;
  filename: string;
  operation: FileOperationType;
  timestamp: string;
  toolName?: string;
}

/**
 * Summary of files touched during a subtask
 */
export interface FilesSummary {
  files: ExtractedFile[];
  uniqueFiles: string[];
  byOperation: Map<FileOperationType, ExtractedFile[]>;
  modifiedFiles: string[]; // Files that were edited/written (most important)
  readFiles: string[]; // Files that were only read
}

/**
 * Extract file path from tool_input string
 * Handles various formats: direct paths, JSON inputs, etc.
 */
function extractFilePathFromInput(input: string): string | null {
  if (!input) return null;

  // Trim whitespace
  const trimmed = input.trim();

  // Direct file path (starts with / or ./ or contains typical file extensions)
  if (trimmed.startsWith('/') || trimmed.startsWith('./')) {
    // Extract just the path part (before any space or newline)
    const pathMatch = trimmed.match(/^([^\s\n]+)/);
    if (pathMatch) {
      return pathMatch[1];
    }
  }

  // Try to parse as JSON and extract file_path or path
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.file_path) return parsed.file_path;
    if (parsed.path) return parsed.path;
    if (parsed.filename) return parsed.filename;
  } catch {
    // Not JSON, try regex patterns
  }

  // Look for file path patterns in the string
  const pathPatterns = [
    // Absolute paths
    /\/[\w\-./]+\.[a-z]{1,6}/gi,
    // Relative paths with extension
    /\.\/[\w\-./]+\.[a-z]{1,6}/gi,
    // Paths in quotes
    /"([^"]+\.[a-z]{1,6})"/gi,
    /'([^']+\.[a-z]{1,6})'/gi,
  ];

  for (const pattern of pathPatterns) {
    const match = trimmed.match(pattern);
    if (match && match.length > 0) {
      // Clean up the match (remove quotes if present)
      const cleanPath = match[0].replace(/^["']|["']$/g, '');
      return cleanPath;
    }
  }

  return null;
}

/**
 * Get filename from a path
 */
function getFilename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/**
 * Map tool name to operation type
 */
function getOperationType(toolName: string | undefined): FileOperationType {
  if (!toolName) return 'bash';

  const tool = toolName.toLowerCase();

  if (tool === 'read') return 'read';
  if (tool === 'edit' || tool === 'notebookedit') return 'edit';
  if (tool === 'write') return 'write';
  if (tool === 'delete') return 'delete';
  if (tool === 'grep' || tool === 'glob') return 'search';
  if (tool === 'bash') return 'bash';

  // Default for unknown tools
  return 'bash';
}

/**
 * Extract files from a single action
 */
export function extractFilesFromAction(action: TaskLogEntry): ExtractedFile[] {
  const files: ExtractedFile[] = [];

  // Only process tool actions
  if (action.type !== 'tool_start' && action.type !== 'tool_end') {
    return files;
  }

  // Skip tool_end to avoid duplicates
  if (action.type === 'tool_end') {
    return files;
  }

  const operation = getOperationType(action.tool_name);

  // Skip search operations for now (they don't represent specific files)
  if (operation === 'search') {
    return files;
  }

  // Try to extract file path from tool_input
  if (action.tool_input) {
    const filePath = extractFilePathFromInput(action.tool_input);
    if (filePath) {
      files.push({
        path: filePath,
        filename: getFilename(filePath),
        operation,
        timestamp: action.timestamp,
        toolName: action.tool_name,
      });
    }
  }

  // Also check detail field for additional file references
  if (action.detail && files.length === 0) {
    const filePath = extractFilePathFromInput(action.detail);
    if (filePath) {
      files.push({
        path: filePath,
        filename: getFilename(filePath),
        operation,
        timestamp: action.timestamp,
        toolName: action.tool_name,
      });
    }
  }

  return files;
}

/**
 * Extract all files from a list of actions
 */
export function extractFilesFromActions(actions: TaskLogEntry[]): ExtractedFile[] {
  const files: ExtractedFile[] = [];

  for (const action of actions) {
    const extracted = extractFilesFromAction(action);
    files.push(...extracted);
  }

  return files;
}

/**
 * Get a summary of files touched during a subtask
 */
export function getFilesSummary(actions: TaskLogEntry[], subtaskId?: string): FilesSummary {
  // Filter by subtask if specified
  const filteredActions = subtaskId
    ? actions.filter(a => a.subtask_id === subtaskId)
    : actions;

  // Extract all files
  const files = extractFilesFromActions(filteredActions);

  // Group by operation type
  const byOperation = new Map<FileOperationType, ExtractedFile[]>();
  for (const file of files) {
    const existing = byOperation.get(file.operation) ?? [];
    existing.push(file);
    byOperation.set(file.operation, existing);
  }

  // Get unique file paths
  const uniqueFilesSet = new Set<string>();
  for (const file of files) {
    uniqueFilesSet.add(file.path);
  }
  const uniqueFiles = Array.from(uniqueFilesSet);

  // Determine modified vs read-only files
  const modifiedFilesSet = new Set<string>();
  const allFilesSet = new Set<string>();

  for (const file of files) {
    allFilesSet.add(file.path);
    if (file.operation === 'edit' || file.operation === 'write' || file.operation === 'delete') {
      modifiedFilesSet.add(file.path);
    }
  }

  // Read-only files are those that were read but never modified
  const readFilesSet = new Set<string>();
  for (const file of files) {
    if (file.operation === 'read' && !modifiedFilesSet.has(file.path)) {
      readFilesSet.add(file.path);
    }
  }

  return {
    files,
    uniqueFiles,
    byOperation,
    modifiedFiles: Array.from(modifiedFilesSet),
    readFiles: Array.from(readFilesSet),
  };
}

/**
 * Get the most important files for a subtask (modified files first, then read files)
 * Limited to a maximum number for display purposes
 */
export function getImportantFiles(
  actions: TaskLogEntry[],
  subtaskId: string,
  maxFiles: number = 5
): { modified: string[]; read: string[] } {
  const summary = getFilesSummary(actions, subtaskId);

  // Prioritize modified files
  const modified = summary.modifiedFiles.slice(0, maxFiles);

  // Fill remaining slots with read-only files
  const remainingSlots = Math.max(0, maxFiles - modified.length);
  const read = summary.readFiles.slice(0, remainingSlots);

  return { modified, read };
}
