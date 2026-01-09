/**
 * Roadmap-related types
 */

// ============================================
// Competitor Analysis Types
// ============================================

export type CompetitorRelevance = 'high' | 'medium' | 'low';
export type PainPointSeverity = 'high' | 'medium' | 'low';
export type OpportunitySize = 'high' | 'medium' | 'low';

export interface CompetitorPainPoint {
  id: string;
  description: string;
  source: string;
  severity: PainPointSeverity;
  frequency: string;
  opportunity: string;
}

export interface Competitor {
  id: string;
  name: string;
  url: string;
  description: string;
  relevance: CompetitorRelevance;
  painPoints: CompetitorPainPoint[];
  strengths: string[];
  marketPosition: string;
}

export interface CompetitorMarketGap {
  id: string;
  description: string;
  affectedCompetitors: string[];
  opportunitySize: OpportunitySize;
  suggestedFeature: string;
}

export interface CompetitorInsightsSummary {
  topPainPoints: string[];
  differentiatorOpportunities: string[];
  marketTrends: string[];
}

export interface CompetitorResearchMetadata {
  searchQueriesUsed: string[];
  sourcesConsulted: string[];
  limitations: string[];
}

export interface CompetitorAnalysis {
  projectContext: {
    projectName: string;
    projectType: string;
    targetAudience: string;
  };
  competitors: Competitor[];
  marketGaps: CompetitorMarketGap[];
  insightsSummary: CompetitorInsightsSummary;
  researchMetadata: CompetitorResearchMetadata;
  createdAt: Date;
}

// ============================================
// Roadmap Types
// ============================================

export type RoadmapFeaturePriority = 'must' | 'should' | 'could' | 'wont';
export type RoadmapFeatureStatus = 'under_review' | 'planned' | 'in_progress' | 'done';
export type RoadmapPhaseStatus = 'planned' | 'in_progress' | 'completed';
export type RoadmapStatus = 'draft' | 'active' | 'archived';

// Feature source tracking for external integrations (Canny, GitHub Issues, etc.)
export type FeatureSourceProvider = 'internal' | 'canny' | 'github_issue';

export interface FeatureSource {
  provider: FeatureSourceProvider;
  importedAt?: Date;
  lastSyncedAt?: Date;
}

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
  competitorInsightIds?: string[];
  // External integration fields
  source?: FeatureSource;
  externalId?: string;    // ID from external system (e.g., Canny post ID)
  externalUrl?: string;   // Link back to external system
  votes?: number;         // Vote count from external system
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
  competitorAnalysis?: CompetitorAnalysis;
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
// Continuous Research Types
// ============================================

/**
 * Phases of continuous research mode.
 * Cycles through: SOTA LLM → Competitor Analysis → Performance → UI/UX → Feature Discovery
 */
export type ContinuousResearchPhase =
  | 'idle'
  | 'sota_llm'
  | 'competitor_analysis'
  | 'performance_improvements'
  | 'ui_ux_improvements'
  | 'feature_discovery';

/**
 * Events that trigger priority queue rebalancing.
 */
export type RebalanceTrigger =
  | 'new_feature'
  | 'evidence_updated'
  | 'scheduled'
  | 'manual';

/**
 * Priority levels for continuous research features.
 * Mapped from priority_score thresholds (0-100).
 */
export type ContinuousResearchPriorityLevel =
  | 'critical'  // 80-100
  | 'high'      // 60-80
  | 'medium'    // 40-60
  | 'low';      // 0-40

/**
 * Weights for priority scoring factors (all values 0-100).
 * Must sum to 1.0 when used for calculation.
 */
export interface PriorityWeights {
  acceleration: number;        // Development acceleration impact (30%)
  impact: number;              // User/business impact (25%)
  feasibility: number;         // Implementation feasibility (20%)
  strategic_alignment: number; // Alignment with project strategy (15%)
  dependency: number;          // Inverse of dependency complexity (10%)
}

/**
 * A single research finding from continuous research.
 */
export interface ContinuousResearchFinding {
  id: string;
  phase: ContinuousResearchPhase;
  title: string;
  description: string;
  source?: string;
  discoveredAt: string;  // ISO date string
  iteration: number;
  metadata?: Record<string, unknown>;
}

/**
 * A feature discovered during continuous research.
 * Includes priority scoring fields for dynamic prioritization.
 */
export interface ContinuousResearchFeature {
  id: string;
  title: string;
  description: string;
  category: string;
  phaseDiscovered: ContinuousResearchPhase;
  iterationDiscovered: number;

  // Priority scoring (0-100 scale)
  priority_score: number;
  priority_level: ContinuousResearchPriorityLevel;

  // Individual scoring factors (0-100)
  acceleration: number;
  impact: number;
  feasibility: number;
  strategic_alignment: number;
  dependency: number;

  // Evidence and timestamps
  evidence: string[];
  createdAt: string;   // ISO date string
  updatedAt: string;   // ISO date string
  metadata?: Record<string, unknown>;
}

/**
 * State for continuous research mode.
 * Tracks running status, current phase, accumulated features and findings.
 */
export interface ContinuousResearchState {
  // Running state
  isRunning: boolean;
  startedAt?: string;    // ISO date string
  stoppedAt?: string;    // ISO date string
  durationHours: number;

  // Phase tracking
  currentPhase: ContinuousResearchPhase;
  phaseStartedAt?: string;  // ISO date string
  iterationCount: number;
  phaseIteration: number;   // Phase index within current iteration

  // Accumulated data
  features: ContinuousResearchFeature[];
  findings: ContinuousResearchFinding[];

  // Rebalancing tracking
  lastRebalanceAt?: string;  // ISO date string
  rebalanceCount: number;

  // Error tracking
  errors: string[];
  lastError?: string;
}

/**
 * Progress indicator for continuous research UI.
 */
export interface ContinuousResearchProgress {
  phase: ContinuousResearchPhase;
  phaseName: string;          // Human-readable phase name
  iterationCount: number;
  phaseIteration: number;     // Current phase within iteration (0-4)
  totalPhases: number;        // Total phases per iteration (5)
  elapsedHours: number;
  durationHours: number;
  progress: number;           // Overall progress percentage (0-100)
  featureCount: number;
  findingCount: number;
  message?: string;
}

/**
 * Summary statistics for continuous research state.
 */
export interface ContinuousResearchSummary {
  isRunning: boolean;
  currentPhase: ContinuousResearchPhase;
  iterationCount: number;
  elapsedHours: number;
  durationHours: number;
  featureCount: number;
  findingCount: number;
  rebalanceCount: number;
  errorCount: number;
}
