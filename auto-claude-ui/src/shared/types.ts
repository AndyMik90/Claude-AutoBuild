/**
 * Shared TypeScript interfaces for Auto Claude UI
 */

// Project Types
export interface Project {
  id: string;
  name: string;
  path: string;
  autoBuildPath: string;
  settings: ProjectSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectSettings {
  parallelEnabled: boolean;
  maxWorkers: number;
  model: string;
  memoryBackend: 'graphiti' | 'file';
  linearSync: boolean;
  linearTeamId?: string;
  notifications: NotificationSettings;
  /** Dev mode: use dev/auto-claude/specs/ for framework development */
  devMode: boolean;
}

export interface NotificationSettings {
  onTaskComplete: boolean;
  onTaskFailed: boolean;
  onReviewNeeded: boolean;
  sound: boolean;
}

// Task Types
export type TaskStatus = 'backlog' | 'in_progress' | 'ai_review' | 'human_review' | 'done';

// Reason why a task is in human_review status
export type ReviewReason = 'completed' | 'errors' | 'qa_rejected';

export type ChunkStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

// Execution phases for visual progress tracking
export type ExecutionPhase = 'idle' | 'planning' | 'coding' | 'qa_review' | 'qa_fixing' | 'complete' | 'failed';

export interface ExecutionProgress {
  phase: ExecutionPhase;
  phaseProgress: number;  // 0-100 within current phase
  overallProgress: number;  // 0-100 overall
  currentChunk?: string;  // Current chunk being processed
  message?: string;  // Current status message
  startedAt?: Date;
}

export interface Chunk {
  id: string;
  title: string;
  description: string;
  status: ChunkStatus;
  files: string[];
  verification?: {
    type: 'command' | 'browser';
    run?: string;
    scenario?: string;
  };
}

export interface QAReport {
  status: 'passed' | 'failed' | 'pending';
  issues: QAIssue[];
  timestamp: Date;
}

export interface QAIssue {
  id: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  file?: string;
  line?: number;
}

// Task Log Types - for persistent, phase-based logging
export type TaskLogPhase = 'planning' | 'coding' | 'validation';
export type TaskLogPhaseStatus = 'pending' | 'active' | 'completed' | 'failed';
export type TaskLogEntryType = 'text' | 'tool_start' | 'tool_end' | 'phase_start' | 'phase_end' | 'error' | 'success' | 'info';

export interface TaskLogEntry {
  timestamp: string;
  type: TaskLogEntryType;
  content: string;
  phase: TaskLogPhase;
  tool_name?: string;
  tool_input?: string;
  chunk_id?: string;
  session?: number;
}

export interface TaskPhaseLog {
  phase: TaskLogPhase;
  status: TaskLogPhaseStatus;
  started_at: string | null;
  completed_at: string | null;
  entries: TaskLogEntry[];
}

export interface TaskLogs {
  spec_id: string;
  created_at: string;
  updated_at: string;
  phases: {
    planning: TaskPhaseLog;
    coding: TaskPhaseLog;
    validation: TaskPhaseLog;
  };
}

// Streaming markers from Python (similar to InsightsStreamChunk)
export interface TaskLogStreamChunk {
  type: 'text' | 'tool_start' | 'tool_end' | 'phase_start' | 'phase_end' | 'error';
  content?: string;
  phase?: TaskLogPhase;
  timestamp?: string;
  tool?: {
    name: string;
    input?: string;
    success?: boolean;
  };
  chunk_id?: string;
}

// Image attachment types for task creation
export interface ImageAttachment {
  id: string;           // Unique identifier (UUID)
  filename: string;     // Original filename
  mimeType: string;     // e.g., 'image/png'
  size: number;         // Size in bytes
  data?: string;        // Base64 data (for transport)
  path?: string;        // Relative path after storage
  thumbnail?: string;   // Base64 thumbnail for preview
}

// Draft state for task creation (auto-saved when dialog closes)
export interface TaskDraft {
  projectId: string;
  title: string;
  description: string;
  category: TaskCategory | '';
  priority: TaskPriority | '';
  complexity: TaskComplexity | '';
  impact: TaskImpact | '';
  images: ImageAttachment[];
  requireReviewBeforeCoding?: boolean;
  savedAt: Date;
}

// Task metadata from ideation or manual entry
export type TaskComplexity = 'trivial' | 'small' | 'medium' | 'large' | 'complex';
export type TaskImpact = 'low' | 'medium' | 'high' | 'critical';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskCategory =
  | 'feature'
  | 'bug_fix'
  | 'refactoring'
  | 'documentation'
  | 'security'
  | 'performance'
  | 'ui_ux'
  | 'infrastructure'
  | 'testing';

export interface TaskMetadata {
  // Origin tracking
  sourceType?: 'ideation' | 'manual' | 'imported' | 'insights';
  ideationType?: string;  // e.g., 'high_value_features', 'security_hardening'
  ideaId?: string;  // Reference to original idea if converted

  // Classification
  category?: TaskCategory;
  complexity?: TaskComplexity;
  impact?: TaskImpact;
  priority?: TaskPriority;

  // Context
  rationale?: string;  // Why this task matters
  problemSolved?: string;  // What problem this addresses
  targetAudience?: string;  // Who benefits

  // Technical details
  affectedFiles?: string[];  // Files likely to be modified
  dependencies?: string[];  // Other features/tasks this depends on
  acceptanceCriteria?: string[];  // What defines "done"

  // Effort estimation
  estimatedEffort?: TaskComplexity;

  // Type-specific metadata (from different idea types)
  securitySeverity?: 'low' | 'medium' | 'high' | 'critical';
  performanceCategory?: string;
  uiuxCategory?: string;
  codeQualitySeverity?: 'suggestion' | 'minor' | 'major' | 'critical';

  // Image attachments (screenshots, mockups, diagrams)
  attachedImages?: ImageAttachment[];

  // Review settings
  requireReviewBeforeCoding?: boolean;  // Require human review of spec/plan before coding starts
}

export interface Task {
  id: string;
  specId: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  reviewReason?: ReviewReason;  // Why task needs human review (only set when status is 'human_review')
  chunks: Chunk[];
  qaReport?: QAReport;
  logs: string[];
  metadata?: TaskMetadata;  // Rich metadata from ideation or manual entry
  executionProgress?: ExecutionProgress;  // Real-time execution progress
  createdAt: Date;
  updatedAt: Date;
}

// Implementation Plan (from auto-claude)
export interface ImplementationPlan {
  feature: string;
  workflow_type: string;
  services_involved: string[];
  phases: Phase[];
  final_acceptance: string[];
  created_at: string;
  updated_at: string;
  spec_file: string;
  // Added for UI status persistence
  status?: TaskStatus;
  planStatus?: string;
  recoveryNote?: string;
  description?: string;
}

export interface Phase {
  phase: number;
  name: string;
  type: string;
  chunks: PlanChunk[];
  depends_on?: number[];
}

export interface PlanChunk {
  id: string;
  description: string;
  status: ChunkStatus;
  verification?: {
    type: string;
    run?: string;
    scenario?: string;
  };
}

// IPC Types
export interface IPCResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TaskStartOptions {
  parallel?: boolean;
  workers?: number;
  model?: string;
}

// Workspace management types (for human review)
export interface WorktreeStatus {
  exists: boolean;
  worktreePath?: string;
  branch?: string;
  baseBranch?: string;
  commitCount?: number;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
}

export interface WorktreeDiff {
  files: WorktreeDiffFile[];
  summary: string;
}

export interface WorktreeDiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

export interface WorktreeMergeResult {
  success: boolean;
  message: string;
  conflictFiles?: string[];
}

export interface WorktreeDiscardResult {
  success: boolean;
  message: string;
}

/**
 * Information about a single spec worktree
 * Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
 */
export interface WorktreeListItem {
  specName: string;
  path: string;
  branch: string;
  baseBranch: string;
  commitCount: number;
  filesChanged: number;
  additions: number;
  deletions: number;
}

/**
 * Result of listing all spec worktrees
 */
export interface WorktreeListResult {
  worktrees: WorktreeListItem[];
}

// Stuck task recovery types
export interface StuckTaskInfo {
  taskId: string;
  specId: string;
  title: string;
  status: TaskStatus;
  isActuallyRunning: boolean;
  lastUpdated: Date;
}

export interface TaskRecoveryResult {
  taskId: string;
  recovered: boolean;
  newStatus: TaskStatus;
  message: string;
  autoRestarted?: boolean;
}

export interface TaskRecoveryOptions {
  targetStatus?: TaskStatus;
  autoRestart?: boolean;
}

export interface TaskProgressUpdate {
  taskId: string;
  plan: ImplementationPlan;
  currentChunk?: string;
}

// App Settings
export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  defaultModel: string;
  defaultParallelism: number;
  pythonPath?: string;
  autoBuildPath?: string;
  autoUpdateAutoBuild: boolean;
  notifications: NotificationSettings;
  // Global API keys (used as defaults for all projects)
  globalClaudeOAuthToken?: string;
  globalOpenAIApiKey?: string;
}

// Auto Claude Initialization Types
export interface AutoBuildVersionInfo {
  isInitialized: boolean;
  currentVersion?: string;
  sourceVersion?: string;
  updateAvailable: boolean;
  sourcePath?: string;
  hasCustomEnv?: boolean;
}

export interface InitializationResult {
  success: boolean;
  error?: string;
  version?: string;
  wasUpdate?: boolean;
}

// Terminal Types
export interface TerminalCreateOptions {
  id: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

export interface TerminalResizeOptions {
  id: string;
  cols: number;
  rows: number;
}

// ============================================
// Roadmap Types
// ============================================

export type RoadmapFeaturePriority = 'must' | 'should' | 'could' | 'wont';
export type RoadmapFeatureStatus = 'idea' | 'planned' | 'in_progress' | 'done';
export type RoadmapPhaseStatus = 'planned' | 'in_progress' | 'completed';
export type RoadmapStatus = 'draft' | 'active' | 'archived';

export interface TargetAudience {
  primary: string;
  secondary: string[];
  painPoints?: string[];
  goals?: string[];
  usageContext?: string;
}

export interface RoadmapMilestone {
  id: string;
  title: string;
  description: string;
  features: string[];
  status: 'planned' | 'achieved';
  targetDate?: Date;
}

export interface RoadmapPhase {
  id: string;
  name: string;
  description: string;
  order: number;
  status: RoadmapPhaseStatus;
  features: string[];
  milestones: RoadmapMilestone[];
}

export interface RoadmapFeature {
  id: string;
  title: string;
  description: string;
  rationale: string;
  priority: RoadmapFeaturePriority;
  complexity: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  phaseId: string;
  dependencies: string[];
  status: RoadmapFeatureStatus;
  acceptanceCriteria: string[];
  userStories: string[];
  linkedSpecId?: string;
}

export interface Roadmap {
  id: string;
  projectId: string;
  projectName: string;
  version: string;
  vision: string;
  targetAudience: TargetAudience;
  phases: RoadmapPhase[];
  features: RoadmapFeature[];
  status: RoadmapStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoadmapDiscovery {
  projectName: string;
  projectType: string;
  techStack: {
    primaryLanguage: string;
    frameworks: string[];
    keyDependencies: string[];
  };
  targetAudience: {
    primaryPersona: string;
    secondaryPersonas: string[];
    painPoints: string[];
    goals: string[];
    usageContext: string;
  };
  productVision: {
    oneLiner: string;
    problemStatement: string;
    valueProposition: string;
    successMetrics: string[];
  };
  currentState: {
    maturity: 'idea' | 'prototype' | 'mvp' | 'growth' | 'mature';
    existingFeatures: string[];
    knownGaps: string[];
    technicalDebt: string[];
  };
  createdAt: Date;
}

export interface RoadmapGenerationStatus {
  phase: 'idle' | 'analyzing' | 'discovering' | 'generating' | 'complete' | 'error';
  progress: number;
  message: string;
  error?: string;
}

// ============================================
// Context Types (Project Index & Memories)
// ============================================

export interface ProjectIndex {
  project_root: string;
  project_type: 'single' | 'monorepo';
  services: Record<string, ServiceInfo>;
  infrastructure: InfrastructureInfo;
  conventions: ConventionsInfo;
}

export interface ServiceInfo {
  name: string;
  path: string;
  language?: string;
  framework?: string;
  type?: 'backend' | 'frontend' | 'worker' | 'scraper' | 'library' | 'proxy' | 'unknown';
  package_manager?: string;
  default_port?: number;
  entry_point?: string;
  key_directories?: Record<string, { path: string; purpose: string }>;
  dependencies?: string[];
  dev_dependencies?: string[];
  testing?: string;
  e2e_testing?: string;
  test_directory?: string;
  orm?: string;
  task_queue?: string;
  styling?: string;
  state_management?: string;
  build_tool?: string;
  dockerfile?: string;
  consumes?: string[];
}

export interface InfrastructureInfo {
  docker_compose?: string;
  docker_services?: string[];
  dockerfile?: string;
  docker_directory?: string;
  dockerfiles?: string[];
  ci?: string;
  ci_workflows?: string[];
  deployment?: string;
}

export interface ConventionsInfo {
  python_linting?: string;
  python_formatting?: string;
  js_linting?: string;
  formatting?: string;
  typescript?: boolean;
  git_hooks?: string;
}

export interface GraphitiMemoryStatus {
  enabled: boolean;
  available: boolean;
  host?: string;
  port?: number;
  database?: string;
  reason?: string;
}

// Graphiti Provider Types (Memory System V2)
export type GraphitiProviderType = 'openai' | 'anthropic' | 'google' | 'groq';
export type GraphitiEmbeddingProvider = 'openai' | 'voyage' | 'google' | 'huggingface';

export interface GraphitiProviderConfig {
  // LLM Provider
  llmProvider: GraphitiProviderType;
  llmModel?: string;  // Model name, uses provider default if not specified

  // Embedding Provider
  embeddingProvider: GraphitiEmbeddingProvider;
  embeddingModel?: string;  // Embedding model, uses provider default if not specified

  // Provider-specific API keys (stored securely)
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  groqApiKey?: string;
  voyageApiKey?: string;

  // FalkorDB connection (required for all providers)
  falkorDbHost?: string;
  falkorDbPort?: number;
  falkorDbPassword?: string;
}

export interface GraphitiProviderInfo {
  id: GraphitiProviderType;
  name: string;
  description: string;
  requiresApiKey: boolean;
  defaultModel: string;
  supportedModels: string[];
}

export interface GraphitiMemoryState {
  initialized: boolean;
  database?: string;
  indices_built: boolean;
  created_at?: string;
  last_session?: number;
  episode_count: number;
  error_log: Array<{ timestamp: string; error: string }>;
}

export interface MemoryEpisode {
  id: string;
  type: 'session_insight' | 'codebase_discovery' | 'pattern' | 'gotcha';
  timestamp: string;
  content: string;
  session_number?: number;
  score?: number;
}

export interface ContextSearchResult {
  content: string;
  score: number;
  type: string;
}

export interface ProjectContextData {
  projectIndex: ProjectIndex | null;
  memoryStatus: GraphitiMemoryStatus | null;
  memoryState: GraphitiMemoryState | null;
  recentMemories: MemoryEpisode[];
  isLoading: boolean;
  error?: string;
}

// ============================================
// Ideation Types
// ============================================

export type IdeationType =
  | 'low_hanging_fruit'
  | 'ui_ux_improvements'
  | 'high_value_features'
  | 'documentation_gaps'
  | 'security_hardening'
  | 'performance_optimizations'
  | 'code_quality';
export type IdeationStatus = 'draft' | 'selected' | 'converted' | 'dismissed';
export type IdeationGenerationPhase = 'idle' | 'analyzing' | 'discovering' | 'generating' | 'complete' | 'error';

export interface IdeationConfig {
  enabledTypes: IdeationType[];
  includeRoadmapContext: boolean;
  includeKanbanContext: boolean;
  maxIdeasPerType: number;
  append?: boolean; // If true, append to existing ideas instead of replacing
}

export interface IdeaBase {
  id: string;
  title: string;
  description: string;
  rationale: string;
  status: IdeationStatus;
  createdAt: Date;
}

export interface LowHangingFruitIdea extends IdeaBase {
  type: 'low_hanging_fruit';
  buildsUpon: string[];  // Features/patterns it extends
  estimatedEffort: 'trivial' | 'small' | 'medium';
  affectedFiles: string[];
  existingPatterns: string[];  // Patterns to follow
}

export interface UIUXImprovementIdea extends IdeaBase {
  type: 'ui_ux_improvements';
  category: 'usability' | 'accessibility' | 'performance' | 'visual' | 'interaction';
  affectedComponents: string[];
  screenshots?: string[];  // Paths to screenshots taken by Puppeteer
  currentState: string;
  proposedChange: string;
  userBenefit: string;
}

export interface HighValueFeatureIdea extends IdeaBase {
  type: 'high_value_features';
  targetAudience: string;
  problemSolved: string;
  valueProposition: string;
  competitiveAdvantage?: string;
  estimatedImpact: 'medium' | 'high' | 'critical';
  complexity: 'medium' | 'high' | 'complex';
  dependencies: string[];
  acceptanceCriteria: string[];
}

export interface DocumentationGapIdea extends IdeaBase {
  type: 'documentation_gaps';
  category: 'readme' | 'api_docs' | 'inline_comments' | 'examples' | 'architecture' | 'troubleshooting';
  targetAudience: 'developers' | 'users' | 'contributors' | 'maintainers';
  affectedAreas: string[];  // Files, modules, or features needing docs
  currentDocumentation?: string;  // What exists now (if any)
  proposedContent: string;  // What should be documented
  priority: 'low' | 'medium' | 'high';
  estimatedEffort: 'trivial' | 'small' | 'medium';
}

export interface SecurityHardeningIdea extends IdeaBase {
  type: 'security_hardening';
  category: 'authentication' | 'authorization' | 'input_validation' | 'data_protection' | 'dependencies' | 'configuration' | 'secrets_management';
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedFiles: string[];
  vulnerability?: string;  // CVE or known vulnerability type
  currentRisk: string;  // Description of current exposure
  remediation: string;  // How to fix
  references?: string[];  // OWASP, CWE, or other security references
  compliance?: string[];  // SOC2, GDPR, etc. if applicable
}

export interface PerformanceOptimizationIdea extends IdeaBase {
  type: 'performance_optimizations';
  category: 'bundle_size' | 'runtime' | 'memory' | 'database' | 'network' | 'rendering' | 'caching';
  impact: 'low' | 'medium' | 'high';
  affectedAreas: string[];  // Files, components, or endpoints
  currentMetric?: string;  // Current performance measurement if known
  expectedImprovement: string;  // Expected gain
  implementation: string;  // How to implement the optimization
  tradeoffs?: string;  // Any downsides or considerations
  estimatedEffort: 'trivial' | 'small' | 'medium' | 'large';
}

export interface CodeQualityIdea extends IdeaBase {
  type: 'code_quality';
  category: 'large_files' | 'code_smells' | 'complexity' | 'duplication' | 'naming' | 'structure' | 'linting' | 'testing' | 'types' | 'dependencies' | 'dead_code' | 'git_hygiene';
  severity: 'suggestion' | 'minor' | 'major' | 'critical';
  affectedFiles: string[];  // Files that need refactoring
  currentState: string;  // Description of the current problematic state
  proposedChange: string;  // What should be done
  codeExample?: string;  // Example of problematic code (if applicable)
  bestPractice?: string;  // Reference to best practice being violated
  metrics?: {
    lineCount?: number;  // For large files
    complexity?: number;  // Cyclomatic complexity if applicable
    duplicateLines?: number;  // For duplication issues
    testCoverage?: number;  // Current test coverage percentage
  };
  estimatedEffort: 'trivial' | 'small' | 'medium' | 'large';
  breakingChange: boolean;  // Whether this refactoring could break existing code
  prerequisites?: string[];  // Things that should be done first
}

export type Idea =
  | LowHangingFruitIdea
  | UIUXImprovementIdea
  | HighValueFeatureIdea
  | DocumentationGapIdea
  | SecurityHardeningIdea
  | PerformanceOptimizationIdea
  | CodeQualityIdea;

export interface IdeationSession {
  id: string;
  projectId: string;
  config: IdeationConfig;
  ideas: Idea[];
  projectContext: {
    existingFeatures: string[];
    techStack: string[];
    targetAudience?: string;
    plannedFeatures: string[];  // From roadmap/kanban
  };
  generatedAt: Date;
  updatedAt: Date;
}

export interface IdeationGenerationStatus {
  phase: IdeationGenerationPhase;
  currentType?: IdeationType;
  progress: number;
  message: string;
  error?: string;
}

export interface IdeationSummary {
  totalIdeas: number;
  byType: Record<IdeationType, number>;
  byStatus: Record<IdeationStatus, number>;
  lastGenerated?: Date;
}

// Environment Configuration for project .env files
export interface ProjectEnvConfig {
  // Claude Authentication
  claudeOAuthToken?: string;
  claudeAuthStatus: 'authenticated' | 'token_set' | 'not_configured';
  // Indicates if the Claude token is from global settings (not project-specific)
  claudeTokenIsGlobal?: boolean;

  // Model Override
  autoBuildModel?: string;

  // Linear Integration
  linearEnabled: boolean;
  linearApiKey?: string;
  linearTeamId?: string;
  linearProjectId?: string;
  linearRealtimeSync?: boolean; // Enable real-time sync of new Linear tasks

  // GitHub Integration
  githubEnabled: boolean;
  githubToken?: string;
  githubRepo?: string; // Format: owner/repo
  githubAutoSync?: boolean; // Auto-sync issues on project load

  // Graphiti Memory Integration (V2 - Multi-provider support)
  graphitiEnabled: boolean;
  graphitiProviderConfig?: GraphitiProviderConfig;  // New V2 provider configuration
  // Legacy fields (still supported for backward compatibility)
  openaiApiKey?: string;
  // Indicates if the OpenAI key is from global settings (not project-specific)
  openaiKeyIsGlobal?: boolean;
  graphitiFalkorDbHost?: string;
  graphitiFalkorDbPort?: number;
  graphitiFalkorDbPassword?: string;
  graphitiDatabase?: string;

  // UI Settings
  enableFancyUi: boolean;
}

// Auto-Claude Source Environment Configuration (for auto-claude repo .env)
export interface SourceEnvConfig {
  // Claude Authentication (required for ideation, roadmap generation, etc.)
  hasClaudeToken: boolean;
  claudeOAuthToken?: string;

  // Source path info
  sourcePath?: string;
  envExists: boolean;
}

export interface SourceEnvCheckResult {
  hasToken: boolean;
  sourcePath?: string;
  error?: string;
}

// ============================================
// Linear Integration Types
// ============================================

export interface LinearIssue {
  id: string;
  identifier: string; // e.g., "ABC-123"
  title: string;
  description?: string;
  state: {
    id: string;
    name: string;
    type: string; // 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled'
  };
  priority: number; // 0-4, where 1 is urgent
  priorityLabel: string;
  labels: Array<{ id: string; name: string; color: string }>;
  assignee?: {
    id: string;
    name: string;
    email: string;
  };
  project?: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

export interface LinearProject {
  id: string;
  name: string;
  state: string;
}

export interface LinearImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors?: string[];
}

export interface LinearSyncStatus {
  connected: boolean;
  teamName?: string;
  projectName?: string;
  issueCount?: number;
  lastSyncedAt?: string;
  error?: string;
}

export interface ClaudeAuthResult {
  success: boolean;
  authenticated: boolean;
  error?: string;
}

// ============================================
// GitHub Integration Types
// ============================================

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string; // owner/repo
  description?: string;
  url: string;
  defaultBranch: string;
  private: boolean;
  owner: {
    login: string;
    avatarUrl?: string;
  };
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  labels: Array<{ id: number; name: string; color: string; description?: string }>;
  assignees: Array<{ login: string; avatarUrl?: string }>;
  author: {
    login: string;
    avatarUrl?: string;
  };
  milestone?: {
    id: number;
    title: string;
    state: 'open' | 'closed';
  };
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  commentsCount: number;
  url: string;
  htmlUrl: string;
  repoFullName: string;
}

export interface GitHubSyncStatus {
  connected: boolean;
  repoFullName?: string;
  repoDescription?: string;
  issueCount?: number;
  lastSyncedAt?: string;
  error?: string;
}

export interface GitHubImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors?: string[];
  tasks?: Task[];
}

export interface GitHubInvestigationResult {
  success: boolean;
  issueNumber: number;
  analysis: {
    summary: string;
    proposedSolution: string;
    affectedFiles: string[];
    estimatedComplexity: 'simple' | 'standard' | 'complex';
    acceptanceCriteria: string[];
  };
  taskId?: string;
  error?: string;
}

export interface GitHubInvestigationStatus {
  phase: 'idle' | 'fetching' | 'analyzing' | 'creating_task' | 'complete' | 'error';
  issueNumber?: number;
  progress: number;
  message: string;
  error?: string;
}

// ============================================
// Changelog Types
// ============================================

export type ChangelogFormat = 'keep-a-changelog' | 'simple-list' | 'github-release';
export type ChangelogAudience = 'technical' | 'user-facing' | 'marketing';

export interface ChangelogTask {
  id: string;
  specId: string;
  title: string;
  description: string;
  completedAt: Date;
  hasSpecs: boolean;
}

export interface TaskSpecContent {
  taskId: string;
  specId: string;
  spec?: string; // Content of spec.md
  requirements?: Record<string, unknown>; // Parsed requirements.json
  qaReport?: string; // Content of qa_report.md
  implementationPlan?: ImplementationPlan; // Parsed implementation_plan.json
  error?: string; // Error message if loading failed
}

export interface ChangelogGenerationRequest {
  projectId: string;
  taskIds: string[];
  version: string;
  date: string; // ISO format
  format: ChangelogFormat;
  audience: ChangelogAudience;
  customInstructions?: string;
}

export interface ChangelogGenerationResult {
  success: boolean;
  changelog: string;
  version: string;
  tasksIncluded: number;
  error?: string;
}

export interface ChangelogSaveRequest {
  projectId: string;
  content: string;
  filePath?: string; // Optional custom path, defaults to CHANGELOG.md
  mode: 'prepend' | 'overwrite' | 'append';
}

export interface ChangelogSaveResult {
  filePath: string;
  bytesWritten: number;
}

export interface ChangelogGenerationProgress {
  stage: 'loading_specs' | 'generating' | 'formatting' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  error?: string;
}

export interface ExistingChangelog {
  exists: boolean;
  content?: string;
  lastVersion?: string;
  error?: string;
}

// ============================================
// Insights Chat Types
// ============================================

export type InsightsChatRole = 'user' | 'assistant';

// Tool usage record for showing what tools the AI used
export interface InsightsToolUsage {
  name: string;
  input?: string;
  timestamp: Date;
}

export interface InsightsChatMessage {
  id: string;
  role: InsightsChatRole;
  content: string;
  timestamp: Date;
  // For assistant messages that suggest task creation
  suggestedTask?: {
    title: string;
    description: string;
    metadata?: TaskMetadata;
  };
  // Tools used during this response (assistant messages only)
  toolsUsed?: InsightsToolUsage[];
}

export interface InsightsSession {
  id: string;
  projectId: string;
  messages: InsightsChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface InsightsChatStatus {
  phase: 'idle' | 'thinking' | 'streaming' | 'complete' | 'error';
  message?: string;
  error?: string;
}

export interface InsightsStreamChunk {
  type: 'text' | 'task_suggestion' | 'tool_start' | 'tool_end' | 'done' | 'error';
  content?: string;
  suggestedTask?: {
    title: string;
    description: string;
    metadata?: TaskMetadata;
  };
  tool?: {
    name: string;
    input?: string;  // Brief description of what's being searched/read
  };
  error?: string;
}

// ============================================
// Auto Claude Source Update Types
// ============================================

export interface AutoBuildSourceUpdateCheck {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  error?: string;
}

export interface AutoBuildSourceUpdateResult {
  success: boolean;
  version?: string;
  error?: string;
}

export interface AutoBuildSourceUpdateProgress {
  stage: 'checking' | 'downloading' | 'extracting' | 'complete' | 'error';
  percent?: number;
  message: string;
}

// Electron API exposed via contextBridge
export interface ElectronAPI {
  // Project operations
  addProject: (projectPath: string) => Promise<IPCResult<Project>>;
  removeProject: (projectId: string) => Promise<IPCResult>;
  getProjects: () => Promise<IPCResult<Project[]>>;
  updateProjectSettings: (projectId: string, settings: Partial<ProjectSettings>) => Promise<IPCResult>;
  initializeProject: (projectId: string) => Promise<IPCResult<InitializationResult>>;
  updateProjectAutoBuild: (projectId: string) => Promise<IPCResult<InitializationResult>>;
  checkProjectVersion: (projectId: string) => Promise<IPCResult<AutoBuildVersionInfo>>;

  // Task operations
  getTasks: (projectId: string) => Promise<IPCResult<Task[]>>;
  createTask: (projectId: string, title: string, description: string, metadata?: TaskMetadata) => Promise<IPCResult<Task>>;
  deleteTask: (taskId: string) => Promise<IPCResult>;
  updateTask: (taskId: string, updates: { title?: string; description?: string }) => Promise<IPCResult<Task>>;
  startTask: (taskId: string, options?: TaskStartOptions) => void;
  stopTask: (taskId: string) => void;
  submitReview: (taskId: string, approved: boolean, feedback?: string) => Promise<IPCResult>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<IPCResult>;
  recoverStuckTask: (taskId: string, options?: TaskRecoveryOptions) => Promise<IPCResult<TaskRecoveryResult>>;
  checkTaskRunning: (taskId: string) => Promise<IPCResult<boolean>>;

  // Workspace management (for human review)
  // Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
  getWorktreeStatus: (taskId: string) => Promise<IPCResult<WorktreeStatus>>;
  getWorktreeDiff: (taskId: string) => Promise<IPCResult<WorktreeDiff>>;
  mergeWorktree: (taskId: string, options?: { noCommit?: boolean }) => Promise<IPCResult<WorktreeMergeResult>>;
  discardWorktree: (taskId: string) => Promise<IPCResult<WorktreeDiscardResult>>;
  listWorktrees: (projectId: string) => Promise<IPCResult<WorktreeListResult>>;

  // Event listeners
  onTaskProgress: (callback: (taskId: string, plan: ImplementationPlan) => void) => () => void;
  onTaskError: (callback: (taskId: string, error: string) => void) => () => void;
  onTaskLog: (callback: (taskId: string, log: string) => void) => () => void;
  onTaskStatusChange: (callback: (taskId: string, status: TaskStatus) => void) => () => void;
  onTaskExecutionProgress: (callback: (taskId: string, progress: ExecutionProgress) => void) => () => void;

  // Terminal operations
  createTerminal: (options: TerminalCreateOptions) => Promise<IPCResult>;
  destroyTerminal: (id: string) => Promise<IPCResult>;
  sendTerminalInput: (id: string, data: string) => void;
  resizeTerminal: (id: string, cols: number, rows: number) => void;
  invokeClaudeInTerminal: (id: string, cwd?: string) => void;

  // Terminal event listeners
  onTerminalOutput: (callback: (id: string, data: string) => void) => () => void;
  onTerminalExit: (callback: (id: string, exitCode: number) => void) => () => void;
  onTerminalTitleChange: (callback: (id: string, title: string) => void) => () => void;

  // App settings
  getSettings: () => Promise<IPCResult<AppSettings>>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<IPCResult>;

  // Dialog operations
  selectDirectory: () => Promise<string | null>;

  // App info
  getAppVersion: () => Promise<string>;

  // Roadmap operations
  getRoadmap: (projectId: string) => Promise<IPCResult<Roadmap | null>>;
  generateRoadmap: (projectId: string) => void;
  refreshRoadmap: (projectId: string) => void;
  updateFeatureStatus: (
    projectId: string,
    featureId: string,
    status: RoadmapFeatureStatus
  ) => Promise<IPCResult>;
  convertFeatureToSpec: (
    projectId: string,
    featureId: string
  ) => Promise<IPCResult<Task>>;

  // Roadmap event listeners
  onRoadmapProgress: (
    callback: (projectId: string, status: RoadmapGenerationStatus) => void
  ) => () => void;
  onRoadmapComplete: (
    callback: (projectId: string, roadmap: Roadmap) => void
  ) => () => void;
  onRoadmapError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;

  // Context operations
  getProjectContext: (projectId: string) => Promise<IPCResult<ProjectContextData>>;
  refreshProjectIndex: (projectId: string) => Promise<IPCResult<ProjectIndex>>;
  getMemoryStatus: (projectId: string) => Promise<IPCResult<GraphitiMemoryStatus>>;
  searchMemories: (projectId: string, query: string) => Promise<IPCResult<ContextSearchResult[]>>;
  getRecentMemories: (projectId: string, limit?: number) => Promise<IPCResult<MemoryEpisode[]>>;

  // Environment configuration operations
  getProjectEnv: (projectId: string) => Promise<IPCResult<ProjectEnvConfig>>;
  updateProjectEnv: (projectId: string, config: Partial<ProjectEnvConfig>) => Promise<IPCResult>;
  checkClaudeAuth: (projectId: string) => Promise<IPCResult<ClaudeAuthResult>>;
  invokeClaudeSetup: (projectId: string) => Promise<IPCResult<ClaudeAuthResult>>;

  // Linear integration operations
  getLinearTeams: (projectId: string) => Promise<IPCResult<LinearTeam[]>>;
  getLinearProjects: (projectId: string, teamId: string) => Promise<IPCResult<LinearProject[]>>;
  getLinearIssues: (projectId: string, teamId?: string, projectId_?: string) => Promise<IPCResult<LinearIssue[]>>;
  importLinearIssues: (projectId: string, issueIds: string[]) => Promise<IPCResult<LinearImportResult>>;
  checkLinearConnection: (projectId: string) => Promise<IPCResult<LinearSyncStatus>>;

  // GitHub integration operations
  getGitHubRepositories: (projectId: string) => Promise<IPCResult<GitHubRepository[]>>;
  getGitHubIssues: (projectId: string, state?: 'open' | 'closed' | 'all') => Promise<IPCResult<GitHubIssue[]>>;
  getGitHubIssue: (projectId: string, issueNumber: number) => Promise<IPCResult<GitHubIssue>>;
  checkGitHubConnection: (projectId: string) => Promise<IPCResult<GitHubSyncStatus>>;
  investigateGitHubIssue: (projectId: string, issueNumber: number) => void;
  importGitHubIssues: (projectId: string, issueNumbers: number[]) => Promise<IPCResult<GitHubImportResult>>;

  // GitHub event listeners
  onGitHubInvestigationProgress: (
    callback: (projectId: string, status: GitHubInvestigationStatus) => void
  ) => () => void;
  onGitHubInvestigationComplete: (
    callback: (projectId: string, result: GitHubInvestigationResult) => void
  ) => () => void;
  onGitHubInvestigationError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;

  // Ideation operations
  getIdeation: (projectId: string) => Promise<IPCResult<IdeationSession | null>>;
  generateIdeation: (projectId: string, config: IdeationConfig) => void;
  refreshIdeation: (projectId: string, config: IdeationConfig) => void;
  updateIdeaStatus: (projectId: string, ideaId: string, status: IdeationStatus) => Promise<IPCResult>;
  convertIdeaToTask: (projectId: string, ideaId: string) => Promise<IPCResult<Task>>;
  dismissIdea: (projectId: string, ideaId: string) => Promise<IPCResult>;

  // Ideation event listeners
  onIdeationProgress: (
    callback: (projectId: string, status: IdeationGenerationStatus) => void
  ) => () => void;
  onIdeationLog: (
    callback: (projectId: string, log: string) => void
  ) => () => void;
  onIdeationComplete: (
    callback: (projectId: string, session: IdeationSession) => void
  ) => () => void;
  onIdeationError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;
  onIdeationTypeComplete: (
    callback: (projectId: string, ideationType: string, ideas: Idea[]) => void
  ) => () => void;
  onIdeationTypeFailed: (
    callback: (projectId: string, ideationType: string) => void
  ) => () => void;

  // Auto Claude source update operations
  checkAutoBuildSourceUpdate: () => Promise<IPCResult<AutoBuildSourceUpdateCheck>>;
  downloadAutoBuildSourceUpdate: () => void;
  getAutoBuildSourceVersion: () => Promise<IPCResult<string>>;

  // Auto Claude source update event listeners
  onAutoBuildSourceUpdateProgress: (
    callback: (progress: AutoBuildSourceUpdateProgress) => void
  ) => () => void;

  // Auto Claude source environment operations
  getSourceEnv: () => Promise<IPCResult<SourceEnvConfig>>;
  updateSourceEnv: (config: { claudeOAuthToken?: string }) => Promise<IPCResult>;
  checkSourceToken: () => Promise<IPCResult<SourceEnvCheckResult>>;

  // Changelog operations
  getChangelogDoneTasks: (projectId: string, tasks?: Task[]) => Promise<IPCResult<ChangelogTask[]>>;
  loadTaskSpecs: (projectId: string, taskIds: string[]) => Promise<IPCResult<TaskSpecContent[]>>;
  generateChangelog: (request: ChangelogGenerationRequest) => void; // Async with progress events
  saveChangelog: (request: ChangelogSaveRequest) => Promise<IPCResult<ChangelogSaveResult>>;
  readExistingChangelog: (projectId: string) => Promise<IPCResult<ExistingChangelog>>;

  // Changelog event listeners
  onChangelogGenerationProgress: (
    callback: (projectId: string, progress: ChangelogGenerationProgress) => void
  ) => () => void;
  onChangelogGenerationComplete: (
    callback: (projectId: string, result: ChangelogGenerationResult) => void
  ) => () => void;
  onChangelogGenerationError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;

  // Insights operations
  getInsightsSession: (projectId: string) => Promise<IPCResult<InsightsSession | null>>;
  sendInsightsMessage: (projectId: string, message: string) => void;
  clearInsightsSession: (projectId: string) => Promise<IPCResult>;
  createTaskFromInsights: (
    projectId: string,
    title: string,
    description: string,
    metadata?: TaskMetadata
  ) => Promise<IPCResult<Task>>;

  // Insights event listeners
  onInsightsStreamChunk: (
    callback: (projectId: string, chunk: InsightsStreamChunk) => void
  ) => () => void;
  onInsightsStatus: (
    callback: (projectId: string, status: InsightsChatStatus) => void
  ) => () => void;
  onInsightsError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;

  // Task logs operations
  getTaskLogs: (projectId: string, specId: string) => Promise<IPCResult<TaskLogs | null>>;
  watchTaskLogs: (projectId: string, specId: string) => Promise<IPCResult>;
  unwatchTaskLogs: (specId: string) => Promise<IPCResult>;

  // Task logs event listeners
  onTaskLogsChanged: (
    callback: (specId: string, logs: TaskLogs) => void
  ) => () => void;
  onTaskLogsStream: (
    callback: (specId: string, chunk: TaskLogStreamChunk) => void
  ) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
