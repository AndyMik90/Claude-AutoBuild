/**
 * GitHub PR Review IPC handlers
 *
 * Handles AI-powered PR review:
 * 1. List and fetch PRs
 * 2. Run AI review with code analysis
 * 3. Post review comments
 * 4. Apply fixes
 */

import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { IPC_CHANNELS, MODEL_ID_MAP, DEFAULT_FEATURE_MODELS, DEFAULT_FEATURE_THINKING } from '../../../shared/constants';
import { getGitHubConfig, githubFetch } from './utils';
import { readSettingsFile } from '../../settings-utils';
import { getAugmentedEnv } from '../../env-utils';
import { getMemoryService, getDefaultDbPath } from '../../memory-service';
import type { Project, AppSettings } from '../../../shared/types';
import { createContextLogger } from './utils/logger';
import { withProjectOrNull } from './utils/project-middleware';
import { createIPCCommunicators } from './utils/ipc-communicator';
import { getRunnerEnv } from './utils/runner-env';
import {
  runPythonSubprocess,
  getPythonPath,
  getRunnerPath,
  validateGitHubModule,
  buildRunnerArgs,
} from './utils/subprocess-runner';

/**
 * Sanitize network data before writing to file
 * Removes potentially dangerous characters and limits length
 */
function sanitizeNetworkData(data: string, maxLength = 1000000): string {
  // Remove null bytes and other control characters except newlines/tabs/carriage returns
  // Using code points instead of escape sequences to avoid no-control-regex ESLint rule
  const controlCharsPattern = new RegExp(
    '[' +
    String.fromCharCode(0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08) + // \x00-\x08
    String.fromCharCode(0x0B, 0x0C) + // \x0B, \x0C (skip \x0A which is newline)
    String.fromCharCode(0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F) + // \x0E-\x1F
    String.fromCharCode(0x7F) + // \x7F (DEL)
    ']',
    'g'
  );
  let sanitized = data.replace(controlCharsPattern, '');

  // Limit length to prevent DoS
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

// Debug logging
const { debug: debugLog } = createContextLogger('GitHub PR');

/**
 * Registry of running PR review processes
 * Key format: `${projectId}:${prNumber}`
 */
const runningReviews = new Map<string, import('child_process').ChildProcess>();

/**
 * Get the registry key for a PR review
 */
function getReviewKey(projectId: string, prNumber: number): string {
  return `${projectId}:${prNumber}`;
}

/**
 * Returns env vars for Claude.md usage; enabled unless explicitly opted out.
 */
function getClaudeMdEnv(project: Project): Record<string, string> | undefined {
  return project.settings?.useClaudeMd !== false ? { USE_CLAUDE_MD: 'true' } : undefined;
}

/**
 * PR review finding from AI analysis
 */
export interface PRReviewFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'security' | 'quality' | 'style' | 'test' | 'docs' | 'pattern' | 'performance';
  title: string;
  description: string;
  file: string;
  line: number;
  endLine?: number;
  suggestedFix?: string;
  fixable: boolean;
}

/**
 * Complete PR review result
 */
export interface PRReviewResult {
  prNumber: number;
  repo: string;
  success: boolean;
  findings: PRReviewFinding[];
  summary: string;
  overallStatus: 'approve' | 'request_changes' | 'comment';
  reviewId?: number;
  reviewedAt: string;
  error?: string;
  // Follow-up review fields
  reviewedCommitSha?: string;
  reviewedFileBlobs?: Record<string, string>; // filename → blob SHA for rebase-resistant follow-ups
  isFollowupReview?: boolean;
  previousReviewId?: number;
  resolvedFindings?: string[];
  unresolvedFindings?: string[];
  newFindingsSinceLastReview?: string[];
  // Track if findings have been posted to GitHub (enables follow-up review)
  hasPostedFindings?: boolean;
  postedFindingIds?: string[];
  postedAt?: string;
}

/**
 * Result of checking for new commits since last review
 */
export interface NewCommitsCheck {
  hasNewCommits: boolean;
  newCommitCount: number;
  lastReviewedCommit?: string;
  currentHeadCommit?: string;
  /** Whether new commits happened AFTER findings were posted (for "Ready for Follow-up" status) */
  hasCommitsAfterPosting?: boolean;
}

/**
 * Lightweight merge readiness check result
 * Used for real-time validation of AI verdict freshness
 */
export interface MergeReadiness {
  /** PR is in draft mode */
  isDraft: boolean;
  /** GitHub's mergeable status */
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  /** Simplified CI status */
  ciStatus: 'passing' | 'failing' | 'pending' | 'none';
  /** List of blockers that contradict a "ready to merge" verdict */
  blockers: string[];
}

/**
 * PR review memory stored in the memory layer
 * Represents key insights and learnings from a PR review
 */
export interface PRReviewMemory {
  prNumber: number;
  repo: string;
  verdict: string;
  timestamp: string;
  summary: {
    verdict: string;
    verdict_reasoning?: string;
    finding_counts?: Record<string, number>;
    total_findings?: number;
    blockers?: string[];
    risk_assessment?: Record<string, string>;
  };
  keyFindings: Array<{
    severity: string;
    category: string;
    title: string;
    description: string;
    file: string;
    line: number;
  }>;
  patterns: string[];
  gotchas: string[];
  isFollowup: boolean;
}

/**
 * Save PR review insights to the Electron memory layer (LadybugDB)
 * 
 * Called after a PR review completes to persist learnings for cross-session context.
 * Extracts key findings, patterns, and gotchas from the review result.
 * 
 * @param result The completed PR review result
 * @param repo Repository name (owner/repo)
 * @param isFollowup Whether this is a follow-up review
 */
async function savePRReviewToMemory(
  result: PRReviewResult,
  repo: string,
  isFollowup: boolean = false
): Promise<void> {
  const settings = readSettingsFile();
  if (!settings?.memoryEnabled) {
    debugLog('Memory not enabled, skipping PR review memory save');
    return;
  }

  try {
    const memoryService = getMemoryService({
      dbPath: getDefaultDbPath(),
      database: 'auto_claude_memory',
    });

    // Build the memory content with comprehensive insights
    // We want to capture ALL meaningful findings so the AI can learn from patterns
    
    // Prioritize findings: critical > high > medium > low
    // Include all critical/high, top 5 medium, top 3 low
    const criticalFindings = result.findings.filter(f => f.severity === 'critical');
    const highFindings = result.findings.filter(f => f.severity === 'high');
    const mediumFindings = result.findings.filter(f => f.severity === 'medium').slice(0, 5);
    const lowFindings = result.findings.filter(f => f.severity === 'low').slice(0, 3);
    
    const keyFindingsToSave = [
      ...criticalFindings,
      ...highFindings,
      ...mediumFindings,
      ...lowFindings,
    ].map(f => ({
      severity: f.severity,
      category: f.category,
      title: f.title,
      description: f.description.substring(0, 500), // Truncate for storage
      file: f.file,
      line: f.line,
    }));

    // Extract gotchas: security issues, critical bugs, and common mistakes
    const gotchaCategories = ['security', 'error_handling', 'data_validation', 'race_condition'];
    const gotchasToSave = result.findings
      .filter(f => 
        f.severity === 'critical' || 
        f.severity === 'high' ||
        gotchaCategories.includes(f.category?.toLowerCase() || '')
      )
      .map(f => `[${f.category}] ${f.title}: ${f.description.substring(0, 300)}`);

    // Extract patterns: group findings by category to identify recurring issues
    const categoryGroups = result.findings.reduce((acc, f) => {
      const cat = f.category || 'general';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Patterns are categories that appear multiple times (indicates a systematic issue)
    const patternsToSave = Object.entries(categoryGroups)
      .filter(([_, count]) => count >= 2)
      .map(([category, count]) => `${category}: ${count} occurrences`);

    const memoryContent: PRReviewMemory = {
      prNumber: result.prNumber,
      repo,
      verdict: result.overallStatus || 'unknown',
      timestamp: new Date().toISOString(),
      summary: {
        verdict: result.overallStatus || 'unknown',
        finding_counts: {
          critical: criticalFindings.length,
          high: highFindings.length,
          medium: result.findings.filter(f => f.severity === 'medium').length,
          low: result.findings.filter(f => f.severity === 'low').length,
        },
        total_findings: result.findings.length,
      },
      keyFindings: keyFindingsToSave,
      patterns: patternsToSave,
      gotchas: gotchasToSave,
      isFollowup,
    };

    // Add follow-up specific info if applicable
    if (isFollowup && result.resolvedFindings && result.unresolvedFindings) {
      memoryContent.summary.verdict_reasoning = 
        `Resolved: ${result.resolvedFindings.length}, Unresolved: ${result.unresolvedFindings.length}`;
    }

    // Save to memory as a pr_review episode
    const episodeName = `PR #${result.prNumber} ${isFollowup ? 'Follow-up ' : ''}Review - ${repo}`;
    const saveResult = await memoryService.addEpisode(
      episodeName,
      memoryContent,
      'pr_review',
      `pr_review_${repo.replace('/', '_')}`
    );

    if (saveResult.success) {
      debugLog('PR review saved to memory', { prNumber: result.prNumber, episodeId: saveResult.id });
    } else {
      debugLog('Failed to save PR review to memory', { error: saveResult.error });
    }

  } catch (error) {
    // Don't fail the review if memory save fails
    debugLog('Error saving PR review to memory', { 
      error: error instanceof Error ? error.message : error 
    });
  }
}

/**
 * PR data from GitHub API
 */
export interface PRData {
  number: number;
  title: string;
  body: string;
  state: string;
  author: { login: string };
  headRefName: string;
  baseRefName: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  assignees: Array<{ login: string }>;
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
    status: string;
  }>;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

/**
 * PR review progress status
 */
export interface PRReviewProgress {
  phase: 'fetching' | 'analyzing' | 'generating' | 'posting' | 'complete';
  prNumber: number;
  progress: number;
  message: string;
}

/**
 * Get the GitHub directory for a project
 */
function getGitHubDir(project: Project): string {
  return path.join(project.path, '.auto-claude', 'github');
}

/**
 * PR log phase type
 */
type PRLogPhase = 'context' | 'analysis' | 'synthesis';

/**
 * PR log entry type
 */
type PRLogEntryType = 'text' | 'tool_start' | 'tool_end' | 'phase_start' | 'phase_end' | 'error' | 'success' | 'info';

/**
 * Single PR log entry
 */
interface PRLogEntry {
  timestamp: string;
  type: PRLogEntryType;
  content: string;
  phase: PRLogPhase;
  source?: string;
  detail?: string;
  collapsed?: boolean;
}

/**
 * Phase log with entries
 */
interface PRPhaseLog {
  phase: PRLogPhase;
  status: 'pending' | 'active' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  entries: PRLogEntry[];
}

/**
 * Complete PR logs structure
 */
interface PRLogs {
  pr_number: number;
  repo: string;
  created_at: string;
  updated_at: string;
  is_followup: boolean;
  phases: {
    context: PRPhaseLog;
    analysis: PRPhaseLog;
    synthesis: PRPhaseLog;
  };
}

/**
 * Parse a log line and extract source and content
 * Returns null if line is not a log line
 */
function parseLogLine(line: string): { source: string; content: string; isError: boolean } | null {
  // Match patterns like [Context], [AI], [Orchestrator], [Followup], [DEBUG ...], [ParallelFollowup], [BotDetector], [ParallelOrchestrator]
  const patterns = [
    /^\[Context\]\s*(.*)$/,
    /^\[AI\]\s*(.*)$/,
    /^\[Orchestrator\]\s*(.*)$/,
    /^\[Followup\]\s*(.*)$/,
    /^\[ParallelFollowup\]\s*(.*)$/,
    /^\[ParallelOrchestrator\]\s*(.*)$/,
    /^\[BotDetector\]\s*(.*)$/,
    /^\[PR Review Engine\]\s*(.*)$/,
    /^\[DEBUG\s+(\w+)\]\s*(.*)$/,
    /^\[ERROR\s+(\w+)\]\s*(.*)$/,
  ];

  // Check for specialist agent logs first (Agent:agent-name format)
  const agentMatch = line.match(/^\[Agent:([\w-]+)\]\s*(.*)$/);
  if (agentMatch) {
    return {
      source: `Agent:${agentMatch[1]}`,
      content: agentMatch[2],
      isError: false,
    };
  }

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const isDebugOrError = pattern.source.includes('DEBUG') || pattern.source.includes('ERROR');
      if (isDebugOrError && match.length >= 3) {
        // Skip debug messages that only show message types (not useful)
        if (match[2].match(/^Message #\d+: \w+Message/)) {
          return null;
        }
        return {
          source: match[1],
          content: match[2],
          isError: pattern.source.includes('ERROR'),
        };
      }
      const source = line.match(/^\[(\w+(?:\s+\w+)*)\]/)?.[1] || 'Unknown';
      return {
        source,
        content: match[1] || line,
        isError: false,
      };
    }
  }

  // Check for PR progress messages [PR #XXX] [YY%] message
  const prProgressMatch = line.match(/^\[PR #\d+\]\s*\[\s*(\d+)%\]\s*(.*)$/);
  if (prProgressMatch) {
    return {
      source: 'Progress',
      content: `[${prProgressMatch[1]}%] ${prProgressMatch[2]}`,
      isError: false,
    };
  }

  // Check for progress messages [XX%]
  const progressMatch = line.match(/^\[(\d+)%\]\s*(.*)$/);
  if (progressMatch) {
    return {
      source: 'Progress',
      content: `[${progressMatch[1]}%] ${progressMatch[2]}`,
      isError: false,
    };
  }

  // Match final summary lines (Status:, Summary:, Findings:, etc.)
  const summaryPatterns = [
    /^(Status|Summary|Findings|Verdict|Is Follow-up|Resolved|Still Open|New Issues):\s*(.*)$/,
    /^PR #\d+ (Follow-up )?Review Complete$/,
    /^={10,}$/,
    /^-{10,}$/,
    // Markdown headers (## Summary, ### Resolution Status, etc.)
    /^#{1,4}\s+.+$/,
    // Bullet points with content (- ✅ **Resolved**, - **Blocking Issues**, etc.)
    /^[-*]\s+.+$/,
    // Indented bullet points for findings (  - [MEDIUM] ..., . [LOW] ...)
    /^\s+[-.*]\s+\[.+$/,
    // Lines with bold text at start (**Why NEEDS_REVISION:**, **Recommended Actions:**)
    /^\*\*.+\*\*:?\s*$/,
    // Numbered list items (1. Add DANGEROUS_FLAGS...)
    /^\d+\.\s+.+$/,
    // File references (File: apps/backend/...)
    /^\s+File:\s+.+$/,
  ];
  for (const pattern of summaryPatterns) {
    const match = line.match(pattern);
    if (match) {
      return {
        source: 'Summary',
        content: line,
        isError: false,
      };
    }
  }

  return null;
}

/**
 * Determine the phase from source
 */
function getPhaseFromSource(source: string): PRLogPhase {
  const contextSources = ['Context', 'BotDetector'];
  const analysisSources = ['AI', 'Orchestrator', 'ParallelOrchestrator', 'ParallelFollowup', 'Followup', 'orchestrator'];
  const synthesisSources = ['PR Review Engine', 'Summary', 'Progress'];

  if (contextSources.includes(source)) return 'context';
  if (analysisSources.includes(source)) return 'analysis';
  // Specialist agents (Agent:xxx) are part of analysis phase
  if (source.startsWith('Agent:')) return 'analysis';
  if (synthesisSources.includes(source)) return 'synthesis';
  return 'synthesis'; // Default to synthesis for unknown sources
}

/**
 * Create empty PR logs structure
 */
function createEmptyPRLogs(prNumber: number, repo: string, isFollowup: boolean): PRLogs {
  const now = new Date().toISOString();
  const createEmptyPhase = (phase: PRLogPhase): PRPhaseLog => ({
    phase,
    status: 'pending',
    started_at: null,
    completed_at: null,
    entries: [],
  });

  return {
    pr_number: prNumber,
    repo,
    created_at: now,
    updated_at: now,
    is_followup: isFollowup,
    phases: {
      context: createEmptyPhase('context'),
      analysis: createEmptyPhase('analysis'),
      synthesis: createEmptyPhase('synthesis'),
    },
  };
}

/**
 * Get PR logs file path
 */
function getPRLogsPath(project: Project, prNumber: number): string {
  return path.join(getGitHubDir(project), 'pr', `logs_${prNumber}.json`);
}

/**
 * Load PR logs from disk
 */
function loadPRLogs(project: Project, prNumber: number): PRLogs | null {
  const logsPath = getPRLogsPath(project, prNumber);

  try {
    const rawData = fs.readFileSync(logsPath, 'utf-8');
    const sanitizedData = sanitizeNetworkData(rawData);
    return JSON.parse(sanitizedData) as PRLogs;
  } catch {
    return null;
  }
}

/**
 * Save PR logs to disk
 */
function savePRLogs(project: Project, logs: PRLogs): void {
  const logsPath = getPRLogsPath(project, logs.pr_number);
  const prDir = path.dirname(logsPath);

  if (!fs.existsSync(prDir)) {
    fs.mkdirSync(prDir, { recursive: true });
  }

  logs.updated_at = new Date().toISOString();
  fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2), 'utf-8');
}

/**
 * Add a log entry to PR logs
 * Returns true if the phase status changed (for triggering immediate save)
 */
function addLogEntry(logs: PRLogs, entry: PRLogEntry): boolean {
  const phase = logs.phases[entry.phase];
  let statusChanged = false;

  // Start the phase if it was pending
  if (phase.status === 'pending') {
    phase.status = 'active';
    phase.started_at = entry.timestamp;
    statusChanged = true;
  }

  phase.entries.push(entry);
  return statusChanged;
}

/**
 * PR Log Collector - collects logs during review
 * Saves incrementally to disk so frontend can stream logs in real-time
 */
class PRLogCollector {
  private logs: PRLogs;
  private project: Project;
  private currentPhase: PRLogPhase = 'context';
  private entryCount: number = 0;
  private saveInterval: number = 3; // Save every N entries for real-time streaming

  constructor(project: Project, prNumber: number, repo: string, isFollowup: boolean) {
    this.project = project;
    this.logs = createEmptyPRLogs(prNumber, repo, isFollowup);
    // Save initial empty logs so frontend sees the structure immediately
    this.save();
  }

  processLine(line: string): void {
    const parsed = parseLogLine(line);
    if (!parsed) return;

    const phase = getPhaseFromSource(parsed.source);

    // Track phase transitions - mark previous phases as complete (only if they were active)
    if (phase !== this.currentPhase) {
      // When moving to a new phase, mark the previous phase as complete
      // Only mark complete if the phase was actually active (received log entries)
      // This prevents marking phases as "completed" if they were skipped
      if (this.currentPhase === 'context' && (phase === 'analysis' || phase === 'synthesis')) {
        if (this.logs.phases.context.status === 'active') {
          this.markPhaseComplete('context', true);
        }
      }
      if (this.currentPhase === 'analysis' && phase === 'synthesis') {
        if (this.logs.phases.analysis.status === 'active') {
          this.markPhaseComplete('analysis', true);
        }
      }
      this.currentPhase = phase;
    }

    const entry: PRLogEntry = {
      timestamp: new Date().toISOString(),
      type: parsed.isError ? 'error' : 'text',
      content: parsed.content,
      phase,
      source: parsed.source,
    };

    const phaseStatusChanged = addLogEntry(this.logs, entry);
    this.entryCount++;

    // Save immediately if phase status changed (so frontend sees phase activation)
    // OR save periodically for real-time streaming (every N entries)
    if (phaseStatusChanged || this.entryCount % this.saveInterval === 0) {
      this.save();
    }
  }

  markPhaseComplete(phase: PRLogPhase, success: boolean): void {
    const phaseLog = this.logs.phases[phase];
    phaseLog.status = success ? 'completed' : 'failed';
    phaseLog.completed_at = new Date().toISOString();
    // Save immediately so frontend sees the status change
    this.save();
  }

  save(): void {
    savePRLogs(this.project, this.logs);
  }

  finalize(success: boolean): void {
    // Mark active phases as completed based on success status
    // Pending phases with no entries should stay pending (they never ran)
    for (const phase of ['context', 'analysis', 'synthesis'] as PRLogPhase[]) {
      const phaseLog = this.logs.phases[phase];
      if (phaseLog.status === 'active') {
        this.markPhaseComplete(phase, success);
      }
      // Note: Pending phases stay pending - they never received any log entries
      // This is correct behavior for follow-up reviews where some phases may be skipped
    }
    this.save();
  }
}

/**
 * Get saved PR review result
 */
function getReviewResult(project: Project, prNumber: number): PRReviewResult | null {
  const reviewPath = path.join(getGitHubDir(project), 'pr', `review_${prNumber}.json`);

  try {
    const rawData = fs.readFileSync(reviewPath, 'utf-8');
    const sanitizedData = sanitizeNetworkData(rawData);
    const data = JSON.parse(sanitizedData);
    return {
      prNumber: data.pr_number,
      repo: data.repo,
      success: data.success,
      findings: data.findings?.map((f: Record<string, unknown>) => ({
        id: f.id,
        severity: f.severity,
        category: f.category,
        title: f.title,
        description: f.description,
        file: f.file,
        line: f.line,
        endLine: f.end_line,
        suggestedFix: f.suggested_fix,
        fixable: f.fixable ?? false,
      })) ?? [],
      summary: data.summary ?? '',
      overallStatus: data.overall_status ?? 'comment',
      reviewId: data.review_id,
      reviewedAt: data.reviewed_at ?? new Date().toISOString(),
      error: data.error,
      // Follow-up review fields (snake_case -> camelCase)
      reviewedCommitSha: data.reviewed_commit_sha,
      reviewedFileBlobs: data.reviewed_file_blobs,
      isFollowupReview: data.is_followup_review ?? false,
      previousReviewId: data.previous_review_id,
      resolvedFindings: data.resolved_findings ?? [],
      unresolvedFindings: data.unresolved_findings ?? [],
      newFindingsSinceLastReview: data.new_findings_since_last_review ?? [],
      // Track posted findings for follow-up review eligibility
      hasPostedFindings: data.has_posted_findings ?? false,
      postedFindingIds: data.posted_finding_ids ?? [],
      postedAt: data.posted_at,
    };
  } catch {
    // File doesn't exist or couldn't be read
    return null;
  }
}

// IPC communication helpers removed - using createIPCCommunicators instead

/**
 * Get GitHub PR model and thinking settings from app settings
 */
function getGitHubPRSettings(): { model: string; thinkingLevel: string } {
  const rawSettings = readSettingsFile() as Partial<AppSettings> | undefined;

  // Get feature models/thinking with defaults
  const featureModels = rawSettings?.featureModels ?? DEFAULT_FEATURE_MODELS;
  const featureThinking = rawSettings?.featureThinking ?? DEFAULT_FEATURE_THINKING;

  // Get PR-specific settings (with fallback to defaults)
  const modelShort = featureModels.githubPrs ?? DEFAULT_FEATURE_MODELS.githubPrs;
  const thinkingLevel = featureThinking.githubPrs ?? DEFAULT_FEATURE_THINKING.githubPrs;

  // Convert model short name to full model ID
  const model = MODEL_ID_MAP[modelShort] ?? MODEL_ID_MAP['opus'];

  debugLog('GitHub PR settings', { modelShort, model, thinkingLevel });

  return { model, thinkingLevel };
}

// getBackendPath function removed - using subprocess-runner utility instead

/**
 * Run the Python PR reviewer
 */
async function runPRReview(
  project: Project,
  prNumber: number,
  mainWindow: BrowserWindow
): Promise<PRReviewResult> {
  // Comprehensive validation of GitHub module
  const validation = await validateGitHubModule(project);

  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const backendPath = validation.backendPath!;

  const { sendProgress } = createIPCCommunicators<PRReviewProgress, PRReviewResult>(
    mainWindow,
    {
      progress: IPC_CHANNELS.GITHUB_PR_REVIEW_PROGRESS,
      error: IPC_CHANNELS.GITHUB_PR_REVIEW_ERROR,
      complete: IPC_CHANNELS.GITHUB_PR_REVIEW_COMPLETE,
    },
    project.id
  );

  const { model, thinkingLevel } = getGitHubPRSettings();
  const args = buildRunnerArgs(
    getRunnerPath(backendPath),
    project.path,
    'review-pr',
    [prNumber.toString()],
    { model, thinkingLevel }
  );

  debugLog('Spawning PR review process', { args, model, thinkingLevel });

  // Create log collector for this review
  const config = getGitHubConfig(project);
  const repo = config?.repo || project.name || 'unknown';
  const logCollector = new PRLogCollector(project, prNumber, repo, false);

  // Build environment with project settings
  const subprocessEnv = await getRunnerEnv(
    getClaudeMdEnv(project)
  );

  const { process: childProcess, promise } = runPythonSubprocess<PRReviewResult>({
    pythonPath: getPythonPath(backendPath),
    args,
    cwd: backendPath,
    env: subprocessEnv,
    onProgress: (percent, message) => {
      debugLog('Progress update', { percent, message });
      sendProgress({
        phase: 'analyzing',
        prNumber,
        progress: percent,
        message,
      });
    },
    onStdout: (line) => {
      debugLog('STDOUT:', line);
      // Collect log entries
      logCollector.processLine(line);
    },
    onStderr: (line) => debugLog('STDERR:', line),
    onComplete: () => {
      // Load the result from disk
      const reviewResult = getReviewResult(project, prNumber);
      if (!reviewResult) {
        throw new Error('Review completed but result not found');
      }
      debugLog('Review result loaded', { findingsCount: reviewResult.findings.length });
      return reviewResult;
    },
  });

  // Register the running process
  const reviewKey = getReviewKey(project.id, prNumber);
  runningReviews.set(reviewKey, childProcess);
  debugLog('Registered review process', { reviewKey, pid: childProcess.pid });

  try {
    // Wait for the process to complete
    const result = await promise;

    if (!result.success) {
      // Finalize logs with failure
      logCollector.finalize(false);
      throw new Error(result.error ?? 'Review failed');
    }

    // Finalize logs with success
    logCollector.finalize(true);

    // Save PR review insights to memory (async, non-blocking)
    savePRReviewToMemory(result.data!, repo, false).catch(err => {
      debugLog('Failed to save PR review to memory', { error: err.message });
    });

    return result.data!;
  } finally {
    // Clean up the registry when done (success or error)
    runningReviews.delete(reviewKey);
    debugLog('Unregistered review process', { reviewKey });
  }
}

/**
 * Register PR-related handlers
 */
export function registerPRHandlers(
  getMainWindow: () => BrowserWindow | null
): void {
  debugLog('Registering PR handlers');

  // List open PRs with pagination support
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_LIST,
    async (_, projectId: string, page: number = 1): Promise<PRData[]> => {
      debugLog('listPRs handler called', { projectId, page });
      const result = await withProjectOrNull(projectId, async (project) => {
        const config = getGitHubConfig(project);
        if (!config) {
          debugLog('No GitHub config found for project');
          return [];
        }

        try {
          // Use pagination: per_page=100 (GitHub max), page=1,2,3...
          const prs = await githubFetch(
            config.token,
            `/repos/${config.repo}/pulls?state=open&per_page=100&page=${page}`
          ) as Array<{
            number: number;
            title: string;
            body?: string;
            state: string;
            user: { login: string };
            head: { ref: string };
            base: { ref: string };
            additions: number;
            deletions: number;
            changed_files: number;
            assignees?: Array<{ login: string }>;
            created_at: string;
            updated_at: string;
            html_url: string;
          }>;

          debugLog('Fetched PRs', { count: prs.length, page });
          return prs.map(pr => ({
            number: pr.number,
            title: pr.title,
            body: pr.body ?? '',
            state: pr.state,
            author: { login: pr.user.login },
            headRefName: pr.head.ref,
            baseRefName: pr.base.ref,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changed_files,
            assignees: pr.assignees?.map((a: { login: string }) => ({ login: a.login })) ?? [],
            files: [],
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            htmlUrl: pr.html_url,
          }));
        } catch (error) {
          debugLog('Failed to fetch PRs', { error: error instanceof Error ? error.message : error });
          return [];
        }
      });
      return result ?? [];
    }
  );

  // Get single PR
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_GET,
    async (_, projectId: string, prNumber: number): Promise<PRData | null> => {
      debugLog('getPR handler called', { projectId, prNumber });
      return withProjectOrNull(projectId, async (project) => {
        const config = getGitHubConfig(project);
        if (!config) return null;

        try {
          const pr = await githubFetch(
            config.token,
            `/repos/${config.repo}/pulls/${prNumber}`
          ) as {
            number: number;
            title: string;
            body?: string;
            state: string;
            user: { login: string };
            head: { ref: string };
            base: { ref: string };
            additions: number;
            deletions: number;
            changed_files: number;
            assignees?: Array<{ login: string }>;
            created_at: string;
            updated_at: string;
            html_url: string;
          };

          const files = await githubFetch(
            config.token,
            `/repos/${config.repo}/pulls/${prNumber}/files`
          ) as Array<{
            filename: string;
            additions: number;
            deletions: number;
            status: string;
          }>;

          return {
            number: pr.number,
            title: pr.title,
            body: pr.body ?? '',
            state: pr.state,
            author: { login: pr.user.login },
            headRefName: pr.head.ref,
            baseRefName: pr.base.ref,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changed_files,
            assignees: pr.assignees?.map((a: { login: string }) => ({ login: a.login })) ?? [],
            files: files.map(f => ({
              path: f.filename,
              additions: f.additions,
              deletions: f.deletions,
              status: f.status,
            })),
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            htmlUrl: pr.html_url,
          };
        } catch {
          return null;
        }
      });
    }
  );

  // Get PR diff
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_GET_DIFF,
    async (_, projectId: string, prNumber: number): Promise<string | null> => {
      return withProjectOrNull(projectId, async (project) => {
        const config = getGitHubConfig(project);
        if (!config) return null;

        try {
          const { execFileSync } = await import('child_process');
          // Validate prNumber to prevent command injection
          if (!Number.isInteger(prNumber) || prNumber <= 0) {
            throw new Error('Invalid PR number');
          }
          // Use execFileSync with arguments array to prevent command injection
          const diff = execFileSync('gh', ['pr', 'diff', String(prNumber)], {
            cwd: project.path,
            encoding: 'utf-8',
            env: getAugmentedEnv(),
          });
          return diff;
        } catch {
          return null;
        }
      });
    }
  );

  // Get saved review
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_GET_REVIEW,
    async (_, projectId: string, prNumber: number): Promise<PRReviewResult | null> => {
      return withProjectOrNull(projectId, async (project) => {
        return getReviewResult(project, prNumber);
      });
    }
  );

  // Batch get saved reviews - more efficient than individual calls
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_GET_REVIEWS_BATCH,
    async (_, projectId: string, prNumbers: number[]): Promise<Record<number, PRReviewResult | null>> => {
      debugLog('getReviewsBatch handler called', { projectId, count: prNumbers.length });
      const result = await withProjectOrNull(projectId, async (project) => {
        const reviews: Record<number, PRReviewResult | null> = {};
        for (const prNumber of prNumbers) {
          reviews[prNumber] = getReviewResult(project, prNumber);
        }
        debugLog('Batch loaded reviews', { count: Object.values(reviews).filter(r => r !== null).length });
        return reviews;
      });
      return result ?? {};
    }
  );

  // Get PR review logs
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_GET_LOGS,
    async (_, projectId: string, prNumber: number): Promise<PRLogs | null> => {
      return withProjectOrNull(projectId, async (project) => {
        return loadPRLogs(project, prNumber);
      });
    }
  );

  // Run AI review
  ipcMain.on(
    IPC_CHANNELS.GITHUB_PR_REVIEW,
    async (_, projectId: string, prNumber: number) => {
      debugLog('runPRReview handler called', { projectId, prNumber });
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        debugLog('No main window available');
        return;
      }

      try {
        await withProjectOrNull(projectId, async (project) => {
          const { sendProgress, sendComplete } = createIPCCommunicators<PRReviewProgress, PRReviewResult>(
            mainWindow,
            {
              progress: IPC_CHANNELS.GITHUB_PR_REVIEW_PROGRESS,
              error: IPC_CHANNELS.GITHUB_PR_REVIEW_ERROR,
              complete: IPC_CHANNELS.GITHUB_PR_REVIEW_COMPLETE,
            },
            projectId
          );

          debugLog('Starting PR review', { prNumber });
          sendProgress({
            phase: 'fetching',
            prNumber,
            progress: 5,
            message: 'Assigning you to PR...',
          });

          // Auto-assign current user to PR
          const config = getGitHubConfig(project);
          if (config) {
            try {
              // Get current user
              const user = await githubFetch(config.token, '/user') as { login: string };
              debugLog('Auto-assigning user to PR', { prNumber, username: user.login });

              // Assign to PR
              await githubFetch(
                config.token,
                `/repos/${config.repo}/issues/${prNumber}/assignees`,
                {
                  method: 'POST',
                  body: JSON.stringify({ assignees: [user.login] }),
                }
              );
              debugLog('User assigned successfully', { prNumber, username: user.login });
            } catch (assignError) {
              // Don't fail the review if assignment fails, just log it
              debugLog('Failed to auto-assign user', { prNumber, error: assignError instanceof Error ? assignError.message : assignError });
            }
          }

          sendProgress({
            phase: 'fetching',
            prNumber,
            progress: 10,
            message: 'Fetching PR data...',
          });

          const result = await runPRReview(project, prNumber, mainWindow);

          debugLog('PR review completed', { prNumber, findingsCount: result.findings.length });
          sendProgress({
            phase: 'complete',
            prNumber,
            progress: 100,
            message: 'Review complete!',
          });

          sendComplete(result);
        });
      } catch (error) {
        debugLog('PR review failed', { prNumber, error: error instanceof Error ? error.message : error });
        const { sendError } = createIPCCommunicators<PRReviewProgress, PRReviewResult>(
          mainWindow,
          {
            progress: IPC_CHANNELS.GITHUB_PR_REVIEW_PROGRESS,
            error: IPC_CHANNELS.GITHUB_PR_REVIEW_ERROR,
            complete: IPC_CHANNELS.GITHUB_PR_REVIEW_COMPLETE,
          },
          projectId
        );
        sendError(error instanceof Error ? error.message : 'Failed to run PR review');
      }
    }
  );

  // Post review to GitHub
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_POST_REVIEW,
    async (_, projectId: string, prNumber: number, selectedFindingIds?: string[], options?: { forceApprove?: boolean }): Promise<boolean> => {
      debugLog('postPRReview handler called', { projectId, prNumber, selectedCount: selectedFindingIds?.length, forceApprove: options?.forceApprove });
      const postResult = await withProjectOrNull(projectId, async (project) => {
        const result = getReviewResult(project, prNumber);
        if (!result) {
          debugLog('No review result found', { prNumber });
          return false;
        }

        const config = getGitHubConfig(project);
        if (!config) {
          debugLog('No GitHub config found');
          return false;
        }

        try {
          // Filter findings if selection provided
          const selectedSet = selectedFindingIds ? new Set(selectedFindingIds) : null;
          const findings = selectedSet
            ? result.findings.filter(f => selectedSet.has(f.id))
            : result.findings;

          debugLog('Posting findings', { total: result.findings.length, selected: findings.length });

          // Build review body - different format for auto-approve with suggestions
          let body: string;

          if (options?.forceApprove) {
            // Auto-approve format: clean approval message with optional suggestions
            body = `## ✅ Auto Claude Review - APPROVED\n\n`;
            body += `**Status:** Ready to Merge\n\n`;
            body += `**Summary:** ${result.summary}\n\n`;

            if (findings.length > 0) {
              body += `---\n\n`;
              body += `### 💡 Suggestions (${findings.length})\n\n`;
              body += `*These are non-blocking suggestions for consideration:*\n\n`;

              for (const f of findings) {
                const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' }[f.severity] || '⚪';
                body += `#### ${emoji} [${f.id}] [${f.severity.toUpperCase()}] ${f.title}\n`;
                body += `📁 \`${f.file}:${f.line}\`\n\n`;
                body += `${f.description}\n\n`;
                const suggestedFix = f.suggestedFix?.trim();
                if (suggestedFix) {
                  body += `**Suggested fix:**\n\`\`\`\n${suggestedFix}\n\`\`\`\n\n`;
                }
              }
            }

            body += `---\n*This automated review found no blocking issues. The PR can be safely merged.*\n\n`;
            body += `*Generated by Auto Claude*`;
          } else {
            // Standard review format
            body = `## 🤖 Auto Claude PR Review\n\n${result.summary}\n\n`;

            if (findings.length > 0) {
              // Show selected count vs total if filtered
              const countText = selectedSet
                ? `${findings.length} selected of ${result.findings.length} total`
                : `${findings.length} total`;
              body += `### Findings (${countText})\n\n`;

              for (const f of findings) {
                const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' }[f.severity] || '⚪';
                body += `#### ${emoji} [${f.id}] [${f.severity.toUpperCase()}] ${f.title}\n`;
                body += `📁 \`${f.file}:${f.line}\`\n\n`;
                body += `${f.description}\n\n`;
                // Only show suggested fix if it has actual content
                const suggestedFix = f.suggestedFix?.trim();
                if (suggestedFix) {
                  body += `**Suggested fix:**\n\`\`\`\n${suggestedFix}\n\`\`\`\n\n`;
                }
              }
            } else {
              body += `*No findings selected for this review.*\n\n`;
            }

            body += `---\n*This review was generated by Auto Claude.*`;
          }

          // Determine review status based on selected findings (or force approve)
          let overallStatus = result.overallStatus;
          if (options?.forceApprove) {
            // Force approve regardless of findings
            overallStatus = 'approve';
          } else if (selectedSet) {
            const hasBlocker = findings.some(f => f.severity === 'critical' || f.severity === 'high');
            overallStatus = hasBlocker ? 'request_changes' : (findings.length > 0 ? 'comment' : 'approve');
          }

          // Map to GitHub API event type
          const event = overallStatus === 'approve' ? 'APPROVE' :
            overallStatus === 'request_changes' ? 'REQUEST_CHANGES' : 'COMMENT';

          debugLog('Posting review to GitHub', { prNumber, status: overallStatus, event, findingsCount: findings.length });

          // Post review via GitHub API to capture review ID
          let reviewId: number;
          try {
            const reviewResponse = await githubFetch(
              config.token,
              `/repos/${config.repo}/pulls/${prNumber}/reviews`,
              {
                method: 'POST',
                body: JSON.stringify({
                  body,
                  event,
                }),
              }
            ) as { id: number };
            reviewId = reviewResponse.id;
          } catch (error) {
            // GitHub doesn't allow REQUEST_CHANGES or APPROVE on your own PR
            // Fall back to COMMENT if that's the error
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('Can not request changes on your own pull request') ||
                errorMsg.includes('Can not approve your own pull request')) {
              debugLog('Cannot use REQUEST_CHANGES/APPROVE on own PR, falling back to COMMENT', { prNumber });
              const fallbackResponse = await githubFetch(
                config.token,
                `/repos/${config.repo}/pulls/${prNumber}/reviews`,
                {
                  method: 'POST',
                  body: JSON.stringify({
                    body,
                    event: 'COMMENT',
                  }),
                }
              ) as { id: number };
              reviewId = fallbackResponse.id;
            } else {
              throw error;
            }
          }
          debugLog('Review posted successfully', { prNumber, reviewId });

          // Update the stored review result with the review ID and posted findings
          const reviewPath = path.join(getGitHubDir(project), 'pr', `review_${prNumber}.json`);
          try {
            const rawData = fs.readFileSync(reviewPath, 'utf-8');
            // Sanitize network data before parsing (review may contain data from GitHub API)
            const sanitizedData = sanitizeNetworkData(rawData);
            const data = JSON.parse(sanitizedData);
            data.review_id = reviewId;
            // Track posted findings to enable follow-up review
            data.has_posted_findings = true;
            const newPostedIds = findings.map(f => f.id);
            const existingPostedIds = data.posted_finding_ids || [];
            data.posted_finding_ids = [...new Set([...existingPostedIds, ...newPostedIds])];
            data.posted_at = new Date().toISOString();
            fs.writeFileSync(reviewPath, JSON.stringify(data, null, 2), 'utf-8');
            debugLog('Updated review result with review ID and posted findings', { prNumber, reviewId, postedCount: newPostedIds.length });
          } catch {
            // File doesn't exist or couldn't be read - this is expected for new reviews
            debugLog('Review result file not found or unreadable, skipping update', { prNumber });
          }

          return true;
        } catch (error) {
          debugLog('Failed to post review', { prNumber, error: error instanceof Error ? error.message : error });
          return false;
        }
      });
      return postResult ?? false;
    }
  );

  // Post comment to PR
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_POST_COMMENT,
    async (_, projectId: string, prNumber: number, body: string): Promise<boolean> => {
      debugLog('postPRComment handler called', { projectId, prNumber });
      const postResult = await withProjectOrNull(projectId, async (project) => {
        try {
          const { execFileSync } = await import('child_process');
          const { writeFileSync, unlinkSync } = await import('fs');
          const { join } = await import('path');

          debugLog('Posting comment to PR', { prNumber });

          // Validate prNumber to prevent command injection
          if (!Number.isInteger(prNumber) || prNumber <= 0) {
            throw new Error('Invalid PR number');
          }

          // Use temp file to avoid shell escaping issues
          const tmpFile = join(project.path, '.auto-claude', 'tmp_comment_body.txt');
          try {
            writeFileSync(tmpFile, body, 'utf-8');
            // Use execFileSync with arguments array to prevent command injection
            execFileSync('gh', ['pr', 'comment', String(prNumber), '--body-file', tmpFile], {
              cwd: project.path,
              env: getAugmentedEnv(),
            });
            unlinkSync(tmpFile);
          } catch (error) {
            try { unlinkSync(tmpFile); } catch {
              // Ignore cleanup errors
            }
            throw error;
          }

          debugLog('Comment posted successfully', { prNumber });
          return true;
        } catch (error) {
          debugLog('Failed to post comment', { prNumber, error: error instanceof Error ? error.message : error });
          return false;
        }
      });
      return postResult ?? false;
    }
  );

  // Delete review from PR
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_DELETE_REVIEW,
    async (_, projectId: string, prNumber: number): Promise<boolean> => {
      debugLog('deletePRReview handler called', { projectId, prNumber });
      const deleteResult = await withProjectOrNull(projectId, async (project) => {
        const result = getReviewResult(project, prNumber);
        if (!result || !result.reviewId) {
          debugLog('No review ID found for deletion', { prNumber });
          return false;
        }

        const config = getGitHubConfig(project);
        if (!config) {
          debugLog('No GitHub config found');
          return false;
        }

        try {
          debugLog('Deleting review from GitHub', { prNumber, reviewId: result.reviewId });

          // Delete review via GitHub API
          await githubFetch(
            config.token,
            `/repos/${config.repo}/pulls/${prNumber}/reviews/${result.reviewId}`,
            {
              method: 'DELETE',
            }
          );

          debugLog('Review deleted successfully', { prNumber, reviewId: result.reviewId });

          // Clear the review ID from the stored result
          const reviewPath = path.join(getGitHubDir(project), 'pr', `review_${prNumber}.json`);
          try {
            const rawData = fs.readFileSync(reviewPath, 'utf-8');
            const sanitizedData = sanitizeNetworkData(rawData);
            const data = JSON.parse(sanitizedData);
            delete data.review_id;
            fs.writeFileSync(reviewPath, JSON.stringify(data, null, 2), 'utf-8');
            debugLog('Cleared review ID from result file', { prNumber });
          } catch {
            // File doesn't exist or couldn't be read - this is expected if review wasn't saved
            debugLog('Review result file not found or unreadable, skipping update', { prNumber });
          }

          return true;
        } catch (error) {
          debugLog('Failed to delete review', { prNumber, error: error instanceof Error ? error.message : error });
          return false;
        }
      });
      return deleteResult ?? false;
    }
  );

  // Merge PR
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_MERGE,
    async (_, projectId: string, prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash'): Promise<boolean> => {
      debugLog('mergePR handler called', { projectId, prNumber, mergeMethod });
      const mergeResult = await withProjectOrNull(projectId, async (project) => {
        try {
          const { execFileSync } = await import('child_process');
          debugLog('Merging PR', { prNumber, method: mergeMethod });

          // Validate prNumber to prevent command injection
          if (!Number.isInteger(prNumber) || prNumber <= 0) {
            throw new Error('Invalid PR number');
          }

          // Validate mergeMethod to prevent command injection
          const validMethods = ['merge', 'squash', 'rebase'];
          if (!validMethods.includes(mergeMethod)) {
            throw new Error('Invalid merge method');
          }

          // Use execFileSync with arguments array to prevent command injection
          execFileSync('gh', ['pr', 'merge', String(prNumber), `--${mergeMethod}`], {
            cwd: project.path,
            env: getAugmentedEnv(),
          });
          debugLog('PR merged successfully', { prNumber });
          return true;
        } catch (error) {
          debugLog('Failed to merge PR', { prNumber, error: error instanceof Error ? error.message : error });
          return false;
        }
      });
      return mergeResult ?? false;
    }
  );

  // Assign user to PR
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_ASSIGN,
    async (_, projectId: string, prNumber: number, username: string): Promise<boolean> => {
      debugLog('assignPR handler called', { projectId, prNumber, username });
      const assignResult = await withProjectOrNull(projectId, async (project) => {
        const config = getGitHubConfig(project);
        if (!config) return false;

        try {
          // Use GitHub API to add assignee
          await githubFetch(
            config.token,
            `/repos/${config.repo}/issues/${prNumber}/assignees`,
            {
              method: 'POST',
              body: JSON.stringify({ assignees: [username] }),
            }
          );
          debugLog('User assigned successfully', { prNumber, username });
          return true;
        } catch (error) {
          debugLog('Failed to assign user', { prNumber, username, error: error instanceof Error ? error.message : error });
          return false;
        }
      });
      return assignResult ?? false;
    }
  );

  // Cancel PR review
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_REVIEW_CANCEL,
    async (_, projectId: string, prNumber: number): Promise<boolean> => {
      debugLog('cancelPRReview handler called', { projectId, prNumber });
      const reviewKey = getReviewKey(projectId, prNumber);
      const childProcess = runningReviews.get(reviewKey);

      if (!childProcess) {
        debugLog('No running review found to cancel', { reviewKey });
        return false;
      }

      try {
        debugLog('Killing review process', { reviewKey, pid: childProcess.pid });
        childProcess.kill('SIGTERM');

        // Give it a moment to terminate gracefully, then force kill if needed
        setTimeout(() => {
          if (!childProcess.killed) {
            debugLog('Force killing review process', { reviewKey, pid: childProcess.pid });
            childProcess.kill('SIGKILL');
          }
        }, 1000);

        // Clean up the registry
        runningReviews.delete(reviewKey);
        debugLog('Review process cancelled', { reviewKey });
        return true;
      } catch (error) {
        debugLog('Failed to cancel review', { reviewKey, error: error instanceof Error ? error.message : error });
        return false;
      }
    }
  );

  // Check for new commits since last review
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_CHECK_NEW_COMMITS,
    async (_, projectId: string, prNumber: number): Promise<NewCommitsCheck> => {
      debugLog('checkNewCommits handler called', { projectId, prNumber });

      const result = await withProjectOrNull(projectId, async (project) => {
        // Check if review exists and has reviewed_commit_sha
        const githubDir = path.join(project.path, '.auto-claude', 'github');
        const reviewPath = path.join(githubDir, 'pr', `review_${prNumber}.json`);

        let review: PRReviewResult;
        try {
          const rawData = fs.readFileSync(reviewPath, 'utf-8');
          const sanitizedData = sanitizeNetworkData(rawData);
          review = JSON.parse(sanitizedData);
        } catch {
          // File doesn't exist or couldn't be read
          return { hasNewCommits: false, newCommitCount: 0 };
        }

        // Convert snake_case to camelCase for the field
        const reviewedCommitSha = review.reviewedCommitSha || (review as any).reviewed_commit_sha;
        if (!reviewedCommitSha) {
          debugLog('No reviewedCommitSha in review', { prNumber });
          return { hasNewCommits: false, newCommitCount: 0 };
        }

        // Get current PR HEAD
        const config = getGitHubConfig(project);
        if (!config) {
          return { hasNewCommits: false, newCommitCount: 0 };
        }

        // Fetch PR data to get current HEAD (before try block so it's accessible in catch)
        let currentHeadSha: string;
        try {
          const prData = (await githubFetch(
            config.token,
            `/repos/${config.repo}/pulls/${prNumber}`
          )) as { head: { sha: string }; commits: number };
          currentHeadSha = prData.head.sha;
        } catch (error) {
          debugLog('Error fetching PR data', { prNumber, error: error instanceof Error ? error.message : error });
          return { hasNewCommits: false, newCommitCount: 0 };
        }

        // Early return if SHAs match - no new commits
        if (reviewedCommitSha === currentHeadSha) {
          return {
            hasNewCommits: false,
            newCommitCount: 0,
            lastReviewedCommit: reviewedCommitSha,
            currentHeadCommit: currentHeadSha,
            hasCommitsAfterPosting: false,
          };
        }

        // Try to get detailed comparison
        try {
          // Get comparison to count new commits
          const comparison = (await githubFetch(
            config.token,
            `/repos/${config.repo}/compare/${reviewedCommitSha}...${currentHeadSha}`
          )) as { ahead_by?: number; total_commits?: number; commits?: Array<{ commit: { committer: { date: string } } }> };

          // Check if findings have been posted and if new commits are after the posting date
          const postedAt = review.postedAt || (review as any).posted_at;
          let hasCommitsAfterPosting = true; // Default to true if we can't determine

          if (postedAt && comparison.commits && comparison.commits.length > 0) {
            const postedAtDate = new Date(postedAt);
            // Check if any commit is newer than when findings were posted
            hasCommitsAfterPosting = comparison.commits.some(c => {
              const commitDate = new Date(c.commit.committer.date);
              return commitDate > postedAtDate;
            });
            debugLog('Comparing commit dates with posted_at', {
              prNumber,
              postedAt,
              latestCommitDate: comparison.commits[comparison.commits.length - 1]?.commit.committer.date,
              hasCommitsAfterPosting,
            });
          } else if (!postedAt) {
            // If findings haven't been posted yet, any new commits should trigger follow-up
            hasCommitsAfterPosting = true;
          }

          return {
            hasNewCommits: true,
            newCommitCount: comparison.ahead_by || comparison.total_commits || 1,
            lastReviewedCommit: reviewedCommitSha,
            currentHeadCommit: currentHeadSha,
            hasCommitsAfterPosting,
          };
        } catch (error) {
          // Comparison failed (e.g., force push made old commit unreachable)
          // Since we already verified SHAs differ, treat as having new commits
          debugLog('Comparison failed but SHAs differ - likely force push, treating as new commits', {
            prNumber,
            reviewedCommitSha,
            currentHeadSha,
            error: error instanceof Error ? error.message : error
          });
          return {
            hasNewCommits: true,
            newCommitCount: 1, // Unknown count due to force push
            lastReviewedCommit: reviewedCommitSha,
            currentHeadCommit: currentHeadSha,
            hasCommitsAfterPosting: true, // Assume yes for force push scenarios
          };
        }
      });

      return result ?? { hasNewCommits: false, newCommitCount: 0 };
    }
  );

  // Check merge readiness (lightweight freshness check for verdict validation)
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_CHECK_MERGE_READINESS,
    async (_, projectId: string, prNumber: number): Promise<MergeReadiness> => {
      debugLog('checkMergeReadiness handler called', { projectId, prNumber });

      const defaultResult: MergeReadiness = {
        isDraft: false,
        mergeable: 'UNKNOWN',
        ciStatus: 'none',
        blockers: [],
      };

      const result = await withProjectOrNull(projectId, async (project) => {
        const config = getGitHubConfig(project);
        if (!config) {
          debugLog('No GitHub config found for checkMergeReadiness');
          return defaultResult;
        }

        try {
          // Fetch PR data including mergeable status
          const pr = await githubFetch(
            config.token,
            `/repos/${config.repo}/pulls/${prNumber}`
          ) as {
            draft: boolean;
            mergeable: boolean | null;
            mergeable_state: string;
            head: { sha: string };
          };

          // Determine mergeable status
          let mergeable: MergeReadiness['mergeable'] = 'UNKNOWN';
          if (pr.mergeable === true) {
            mergeable = 'MERGEABLE';
          } else if (pr.mergeable === false || pr.mergeable_state === 'dirty') {
            mergeable = 'CONFLICTING';
          }

          // Fetch combined commit status for CI
          let ciStatus: MergeReadiness['ciStatus'] = 'none';
          try {
            const status = await githubFetch(
              config.token,
              `/repos/${config.repo}/commits/${pr.head.sha}/status`
            ) as {
              state: 'success' | 'pending' | 'failure' | 'error';
              total_count: number;
            };

            if (status.total_count === 0) {
              // No status checks, check for check runs (GitHub Actions)
              const checkRuns = await githubFetch(
                config.token,
                `/repos/${config.repo}/commits/${pr.head.sha}/check-runs`
              ) as {
                total_count: number;
                check_runs: Array<{ conclusion: string | null; status: string }>;
              };

              if (checkRuns.total_count > 0) {
                const hasFailing = checkRuns.check_runs.some(
                  cr => cr.conclusion === 'failure' || cr.conclusion === 'cancelled'
                );
                const hasPending = checkRuns.check_runs.some(
                  cr => cr.status !== 'completed'
                );
                
                if (hasFailing) {
                  ciStatus = 'failing';
                } else if (hasPending) {
                  ciStatus = 'pending';
                } else {
                  ciStatus = 'passing';
                }
              }
            } else {
              // Use combined status
              if (status.state === 'success') {
                ciStatus = 'passing';
              } else if (status.state === 'pending') {
                ciStatus = 'pending';
              } else {
                ciStatus = 'failing';
              }
            }
          } catch (err) {
            debugLog('Failed to fetch CI status', { prNumber, error: err instanceof Error ? err.message : err });
            // Continue without CI status
          }

          // Build blockers list
          const blockers: string[] = [];
          if (pr.draft) {
            blockers.push('PR is in draft mode');
          }
          if (mergeable === 'CONFLICTING') {
            blockers.push('Merge conflicts detected');
          }
          if (ciStatus === 'failing') {
            blockers.push('CI checks are failing');
          }

          debugLog('checkMergeReadiness result', {
            prNumber,
            isDraft: pr.draft,
            mergeable,
            ciStatus,
            blockers,
          });

          return {
            isDraft: pr.draft,
            mergeable,
            ciStatus,
            blockers,
          };
        } catch (error) {
          debugLog('Failed to check merge readiness', {
            prNumber,
            error: error instanceof Error ? error.message : error,
          });
          return defaultResult;
        }
      });

      return result ?? defaultResult;
    }
  );

  // Run follow-up review
  ipcMain.on(
    IPC_CHANNELS.GITHUB_PR_FOLLOWUP_REVIEW,
    async (_, projectId: string, prNumber: number) => {
      debugLog('followupReview handler called', { projectId, prNumber });
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        debugLog('No main window available');
        return;
      }

      try {
        await withProjectOrNull(projectId, async (project) => {
          const { sendProgress, sendError, sendComplete } = createIPCCommunicators<PRReviewProgress, PRReviewResult>(
            mainWindow,
            {
              progress: IPC_CHANNELS.GITHUB_PR_REVIEW_PROGRESS,
              error: IPC_CHANNELS.GITHUB_PR_REVIEW_ERROR,
              complete: IPC_CHANNELS.GITHUB_PR_REVIEW_COMPLETE,
            },
            projectId
          );

          // Comprehensive validation of GitHub module
          const validation = await validateGitHubModule(project);
          if (!validation.valid) {
            sendError({ prNumber, error: validation.error || 'GitHub module validation failed' });
            return;
          }

          const backendPath = validation.backendPath!;
          const reviewKey = getReviewKey(projectId, prNumber);

          // Check if already running
          if (runningReviews.has(reviewKey)) {
            debugLog('Follow-up review already running', { reviewKey });
            return;
          }

          debugLog('Starting follow-up review', { prNumber });
          sendProgress({
            phase: 'fetching',
            prNumber,
            progress: 5,
            message: 'Starting follow-up review...',
          });

          const { model, thinkingLevel } = getGitHubPRSettings();
          const args = buildRunnerArgs(
            getRunnerPath(backendPath),
            project.path,
            'followup-review-pr',
            [prNumber.toString()],
            { model, thinkingLevel }
          );

          debugLog('Spawning follow-up review process', { args, model, thinkingLevel });

          // Create log collector for this follow-up review
          const config = getGitHubConfig(project);
          const repo = config?.repo || project.name || 'unknown';
          const logCollector = new PRLogCollector(project, prNumber, repo, true);

          // Build environment with project settings
          const followupEnv = await getRunnerEnv(
            getClaudeMdEnv(project)
          );

          const { process: childProcess, promise } = runPythonSubprocess<PRReviewResult>({
            pythonPath: getPythonPath(backendPath),
            args,
            cwd: backendPath,
            env: followupEnv,
            onProgress: (percent, message) => {
              debugLog('Progress update', { percent, message });
              sendProgress({
                phase: 'analyzing',
                prNumber,
                progress: percent,
                message,
              });
            },
            onStdout: (line) => {
              debugLog('STDOUT:', line);
              // Collect log entries
              logCollector.processLine(line);
            },
            onStderr: (line) => debugLog('STDERR:', line),
            onComplete: () => {
              // Load the result from disk
              const reviewResult = getReviewResult(project, prNumber);
              if (!reviewResult) {
                throw new Error('Follow-up review completed but result not found');
              }
              debugLog('Follow-up review result loaded', { findingsCount: reviewResult.findings.length });
              return reviewResult;
            },
          });

          // Register the running process
          runningReviews.set(reviewKey, childProcess);
          debugLog('Registered follow-up review process', { reviewKey, pid: childProcess.pid });

          try {
            const result = await promise;

            if (!result.success) {
              // Finalize logs with failure
              logCollector.finalize(false);
              throw new Error(result.error ?? 'Follow-up review failed');
            }

            // Finalize logs with success
            logCollector.finalize(true);

            // Save follow-up PR review insights to memory (async, non-blocking)
            savePRReviewToMemory(result.data!, repo, true).catch(err => {
              debugLog('Failed to save follow-up PR review to memory', { error: err.message });
            });

            debugLog('Follow-up review completed', { prNumber, findingsCount: result.data?.findings.length });
            sendProgress({
              phase: 'complete',
              prNumber,
              progress: 100,
              message: 'Follow-up review complete!',
            });

            sendComplete(result.data!);
          } finally {
            runningReviews.delete(reviewKey);
            debugLog('Unregistered follow-up review process', { reviewKey });
          }
        });
      } catch (error) {
        debugLog('Follow-up review failed', { prNumber, error: error instanceof Error ? error.message : error });
        const { sendError } = createIPCCommunicators<PRReviewProgress, PRReviewResult>(
          mainWindow,
          {
            progress: IPC_CHANNELS.GITHUB_PR_REVIEW_PROGRESS,
            error: IPC_CHANNELS.GITHUB_PR_REVIEW_ERROR,
            complete: IPC_CHANNELS.GITHUB_PR_REVIEW_COMPLETE,
          },
          projectId
        );
        sendError({ prNumber, error: error instanceof Error ? error.message : 'Failed to run follow-up review' });
      }
    }
  );

  // Get workflows awaiting approval for a PR (fork PRs)
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_WORKFLOWS_AWAITING_APPROVAL,
    async (_, projectId: string, prNumber: number): Promise<{
      awaiting_approval: number;
      workflow_runs: Array<{ id: number; name: string; html_url: string; workflow_name: string }>;
      can_approve: boolean;
      error?: string;
    }> => {
      debugLog('getWorkflowsAwaitingApproval handler called', { projectId, prNumber });
      const result = await withProjectOrNull(projectId, async (project) => {
        const config = getGitHubConfig(project);
        if (!config) {
          return { awaiting_approval: 0, workflow_runs: [], can_approve: false, error: 'No GitHub config' };
        }

        try {
          // First get the PR's head SHA
          const prData = await githubFetch(
            config.token,
            `/repos/${config.repo}/pulls/${prNumber}`
          ) as { head?: { sha?: string } };

          const headSha = prData?.head?.sha;
          if (!headSha) {
            return { awaiting_approval: 0, workflow_runs: [], can_approve: false };
          }

          // Query workflow runs with action_required status
          const runsData = await githubFetch(
            config.token,
            `/repos/${config.repo}/actions/runs?status=action_required&per_page=100`
          ) as { workflow_runs?: Array<{ id: number; name: string; html_url: string; head_sha: string; workflow?: { name?: string } }> };

          const allRuns = runsData?.workflow_runs || [];

          // Filter to only runs for this PR's head SHA
          const prRuns = allRuns
            .filter(run => run.head_sha === headSha)
            .map(run => ({
              id: run.id,
              name: run.name,
              html_url: run.html_url,
              workflow_name: run.workflow?.name || 'Unknown',
            }));

          debugLog('Found workflows awaiting approval', { prNumber, count: prRuns.length });

          return {
            awaiting_approval: prRuns.length,
            workflow_runs: prRuns,
            can_approve: true, // Assume token has permission; will fail if not
          };
        } catch (error) {
          debugLog('Failed to get workflows awaiting approval', { prNumber, error: error instanceof Error ? error.message : error });
          return {
            awaiting_approval: 0,
            workflow_runs: [],
            can_approve: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      return result ?? { awaiting_approval: 0, workflow_runs: [], can_approve: false };
    }
  );

  // Approve a workflow run
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_WORKFLOW_APPROVE,
    async (_, projectId: string, runId: number): Promise<boolean> => {
      debugLog('approveWorkflow handler called', { projectId, runId });
      const result = await withProjectOrNull(projectId, async (project) => {
        const config = getGitHubConfig(project);
        if (!config) {
          debugLog('No GitHub config found');
          return false;
        }

        try {
          // Approve the workflow run
          await githubFetch(
            config.token,
            `/repos/${config.repo}/actions/runs/${runId}/approve`,
            { method: 'POST' }
          );

          debugLog('Workflow approved successfully', { runId });
          return true;
        } catch (error) {
          debugLog('Failed to approve workflow', { runId, error: error instanceof Error ? error.message : error });
          return false;
        }
      });

      return result ?? false;
    }
  );

  // Get PR review memories from the memory layer
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_MEMORY_GET,
    async (_, projectId: string, limit: number = 10): Promise<PRReviewMemory[]> => {
      debugLog('getPRReviewMemories handler called', { projectId, limit });
      const result = await withProjectOrNull(projectId, async (project) => {
        const memoryDir = path.join(getGitHubDir(project), 'memory', project.name || 'unknown');
        const memories: PRReviewMemory[] = [];

        // Try to load from file-based storage
        try {
          const indexPath = path.join(memoryDir, 'reviews_index.json');
          if (!fs.existsSync(indexPath)) {
            debugLog('No PR review memories found', { projectId });
            return [];
          }

          const indexContent = fs.readFileSync(indexPath, 'utf-8');
          const index = JSON.parse(sanitizeNetworkData(indexContent));
          const reviews = index.reviews || [];

          // Load individual review memories
          for (const entry of reviews.slice(0, limit)) {
            try {
              const reviewPath = path.join(memoryDir, `pr_${entry.pr_number}_review.json`);
              if (fs.existsSync(reviewPath)) {
                const reviewContent = fs.readFileSync(reviewPath, 'utf-8');
                const memory = JSON.parse(sanitizeNetworkData(reviewContent));
                memories.push({
                  prNumber: memory.pr_number,
                  repo: memory.repo,
                  verdict: memory.summary?.verdict || 'unknown',
                  timestamp: memory.timestamp,
                  summary: memory.summary,
                  keyFindings: memory.key_findings || [],
                  patterns: memory.patterns || [],
                  gotchas: memory.gotchas || [],
                  isFollowup: memory.is_followup || false,
                });
              }
            } catch (err) {
              debugLog('Failed to load PR review memory', { prNumber: entry.pr_number, error: err instanceof Error ? err.message : err });
            }
          }

          debugLog('Loaded PR review memories', { count: memories.length });
          return memories;
        } catch (error) {
          debugLog('Failed to load PR review memories', { error: error instanceof Error ? error.message : error });
          return [];
        }
      });
      return result ?? [];
    }
  );

  // Search PR review memories
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_MEMORY_SEARCH,
    async (_, projectId: string, query: string, limit: number = 10): Promise<PRReviewMemory[]> => {
      debugLog('searchPRReviewMemories handler called', { projectId, query, limit });
      const result = await withProjectOrNull(projectId, async (project) => {
        const memoryDir = path.join(getGitHubDir(project), 'memory', project.name || 'unknown');
        const memories: PRReviewMemory[] = [];
        const queryLower = query.toLowerCase();

        // Search through file-based storage
        try {
          const indexPath = path.join(memoryDir, 'reviews_index.json');
          if (!fs.existsSync(indexPath)) {
            return [];
          }

          const indexContent = fs.readFileSync(indexPath, 'utf-8');
          const index = JSON.parse(sanitizeNetworkData(indexContent));
          const reviews = index.reviews || [];

          // Search individual review memories
          for (const entry of reviews) {
            try {
              const reviewPath = path.join(memoryDir, `pr_${entry.pr_number}_review.json`);
              if (fs.existsSync(reviewPath)) {
                const reviewContent = fs.readFileSync(reviewPath, 'utf-8');
                
                // Check if content matches query
                if (reviewContent.toLowerCase().includes(queryLower)) {
                  const memory = JSON.parse(sanitizeNetworkData(reviewContent));
                  memories.push({
                    prNumber: memory.pr_number,
                    repo: memory.repo,
                    verdict: memory.summary?.verdict || 'unknown',
                    timestamp: memory.timestamp,
                    summary: memory.summary,
                    keyFindings: memory.key_findings || [],
                    patterns: memory.patterns || [],
                    gotchas: memory.gotchas || [],
                    isFollowup: memory.is_followup || false,
                  });
                }
              }

              // Stop if we have enough
              if (memories.length >= limit) {
                break;
              }
            } catch (err) {
              debugLog('Failed to search PR review memory', { prNumber: entry.pr_number, error: err instanceof Error ? err.message : err });
            }
          }

          debugLog('Found matching PR review memories', { count: memories.length, query });
          return memories;
        } catch (error) {
          debugLog('Failed to search PR review memories', { error: error instanceof Error ? error.message : error });
          return [];
        }
      });
      return result ?? [];
    }
  );

  debugLog('PR handlers registered');
}
