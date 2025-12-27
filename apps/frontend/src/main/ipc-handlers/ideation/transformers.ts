/**
 * Data transformation utilities for ideation
 * Converts between snake_case (Python backend) and camelCase (TypeScript frontend)
 */

import type {
  Idea,
  CodeImprovementIdea,
  UIUXImprovementIdea,
  DocumentationGapIdea,
  SecurityHardeningIdea,
  PerformanceOptimizationIdea,
  CodeQualityIdea,
  IdeationStatus,
  IdeationType,
  IdeationSession
} from '../../../shared/types';
import { debugLog } from '../../../shared/utils/debug-logger';
import type { RawIdea } from './types';

const VALID_IDEATION_TYPES: ReadonlySet<IdeationType> = new Set([
  'code_improvements',
  'ui_ux_improvements',
  'documentation_gaps',
  'security_hardening',
  'performance_optimizations',
  'code_quality'
] as const);

function isValidIdeationType(value: unknown): value is IdeationType {
  return typeof value === 'string' && VALID_IDEATION_TYPES.has(value as IdeationType);
}

function validateEnabledTypes(rawTypes: unknown): IdeationType[] {
  if (!Array.isArray(rawTypes)) {
    return [];
  }
  const validTypes: IdeationType[] = [];
  const invalidTypes: unknown[] = [];
  for (const entry of rawTypes) {
    if (isValidIdeationType(entry)) {
      validTypes.push(entry);
    } else {
      invalidTypes.push(entry);
    }
  }
  if (invalidTypes.length > 0) {
    debugLog('[Transformers] Dropped invalid IdeationType values:', invalidTypes);
  }
  return validTypes;
}

/**
 * Transform an idea from snake_case (Python backend) to camelCase (TypeScript frontend)
 */
export function transformIdeaFromSnakeCase(idea: RawIdea): Idea {
  const status = (idea.status || 'draft') as IdeationStatus;
  const createdAt = idea.created_at ? new Date(idea.created_at) : new Date();

  if (idea.type === 'code_improvements') {
    return {
      id: idea.id,
      type: 'code_improvements',
      title: idea.title,
      description: idea.description,
      rationale: idea.rationale,
      status,
      createdAt,
      buildsUpon: idea.builds_upon || idea.buildsUpon || [],
      estimatedEffort: idea.estimated_effort || idea.estimatedEffort || 'small',
      affectedFiles: idea.affected_files || idea.affectedFiles || [],
      existingPatterns: idea.existing_patterns || idea.existingPatterns || [],
      implementationApproach: idea.implementation_approach || idea.implementationApproach || ''
    } as CodeImprovementIdea;
  } else if (idea.type === 'ui_ux_improvements') {
    return {
      id: idea.id,
      type: 'ui_ux_improvements',
      title: idea.title,
      description: idea.description,
      rationale: idea.rationale,
      status,
      createdAt,
      category: idea.category || 'usability',
      affectedComponents: idea.affected_components || idea.affectedComponents || [],
      screenshots: idea.screenshots || [],
      currentState: idea.current_state || idea.currentState || '',
      proposedChange: idea.proposed_change || idea.proposedChange || '',
      userBenefit: idea.user_benefit || idea.userBenefit || ''
    } as UIUXImprovementIdea;
  } else if (idea.type === 'documentation_gaps') {
    return {
      id: idea.id,
      type: 'documentation_gaps',
      title: idea.title,
      description: idea.description,
      rationale: idea.rationale,
      status,
      createdAt,
      category: idea.category || 'readme',
      targetAudience: idea.target_audience || idea.targetAudience || 'developers',
      affectedAreas: idea.affected_areas || idea.affectedAreas || [],
      currentDocumentation: idea.current_documentation || idea.currentDocumentation || '',
      proposedContent: idea.proposed_content || idea.proposedContent || '',
      priority: idea.priority || 'medium',
      estimatedEffort: idea.estimated_effort || idea.estimatedEffort || 'small'
    } as DocumentationGapIdea;
  } else if (idea.type === 'security_hardening') {
    return {
      id: idea.id,
      type: 'security_hardening',
      title: idea.title,
      description: idea.description,
      rationale: idea.rationale,
      status,
      createdAt,
      category: idea.category || 'configuration',
      severity: idea.severity || 'medium',
      affectedFiles: idea.affected_files || idea.affectedFiles || [],
      vulnerability: idea.vulnerability || '',
      currentRisk: idea.current_risk || idea.currentRisk || '',
      remediation: idea.remediation || '',
      references: idea.references || [],
      compliance: idea.compliance || []
    } as SecurityHardeningIdea;
  } else if (idea.type === 'performance_optimizations') {
    return {
      id: idea.id,
      type: 'performance_optimizations',
      title: idea.title,
      description: idea.description,
      rationale: idea.rationale,
      status,
      createdAt,
      category: idea.category || 'runtime',
      impact: idea.impact || 'medium',
      affectedAreas: idea.affected_areas || idea.affectedAreas || [],
      currentMetric: idea.current_metric || idea.currentMetric || '',
      expectedImprovement: idea.expected_improvement || idea.expectedImprovement || '',
      implementation: idea.implementation || '',
      tradeoffs: idea.tradeoffs || '',
      estimatedEffort: idea.estimated_effort || idea.estimatedEffort || 'medium'
    } as PerformanceOptimizationIdea;
  } else if (idea.type === 'code_quality') {
    return {
      id: idea.id,
      type: 'code_quality',
      title: idea.title,
      description: idea.description,
      rationale: idea.rationale,
      status,
      createdAt,
      category: idea.category || 'code_smells',
      severity: idea.severity || 'minor',
      affectedFiles: idea.affected_files || idea.affectedFiles || [],
      currentState: idea.current_state || idea.currentState || '',
      proposedChange: idea.proposed_change || idea.proposedChange || '',
      codeExample: idea.code_example || idea.codeExample || '',
      bestPractice: idea.best_practice || idea.bestPractice || '',
      metrics: idea.metrics || {},
      estimatedEffort: idea.estimated_effort || idea.estimatedEffort || 'medium',
      breakingChange: idea.breaking_change ?? idea.breakingChange ?? false,
      prerequisites: idea.prerequisites || []
    } as CodeQualityIdea;
  }

  // Fallback to base idea (shouldn't happen with proper data)
  return {
    id: idea.id,
    type: 'code_improvements',
    title: idea.title,
    description: idea.description,
    rationale: idea.rationale,
    status,
    createdAt,
    buildsUpon: [],
    estimatedEffort: 'small',
    affectedFiles: [],
    existingPatterns: [],
    implementationApproach: ''
  } as CodeImprovementIdea;
}

interface RawIdeationSession {
  id?: string;
  project_id?: string;
  config?: {
    enabled_types?: string[];
    enabledTypes?: string[];
    include_roadmap_context?: boolean;
    includeRoadmapContext?: boolean;
    include_kanban_context?: boolean;
    includeKanbanContext?: boolean;
    max_ideas_per_type?: number;
    maxIdeasPerType?: number;
  };
  ideas?: RawIdea[];
  project_context?: {
    existing_features?: string[];
    tech_stack?: string[];
    target_audience?: string;
    planned_features?: string[];
  };
  projectContext?: {
    existingFeatures?: string[];
    techStack?: string[];
    targetAudience?: string;
    plannedFeatures?: string[];
  };
  generated_at?: string;
  updated_at?: string;
}

export function transformSessionFromSnakeCase(
  rawSession: RawIdeationSession,
  projectId: string
): IdeationSession {
  const rawEnabledTypes = rawSession.config?.enabled_types || rawSession.config?.enabledTypes || [];
  const enabledTypes = validateEnabledTypes(rawEnabledTypes);

  return {
    id: rawSession.id || `ideation-${Date.now()}`,
    projectId,
    config: {
      enabledTypes,
      includeRoadmapContext: rawSession.config?.include_roadmap_context ?? rawSession.config?.includeRoadmapContext ?? true,
      includeKanbanContext: rawSession.config?.include_kanban_context ?? rawSession.config?.includeKanbanContext ?? true,
      maxIdeasPerType: rawSession.config?.max_ideas_per_type || rawSession.config?.maxIdeasPerType || 5
    },
    ideas: (rawSession.ideas || []).map(idea => transformIdeaFromSnakeCase(idea)),
    projectContext: {
      existingFeatures: rawSession.project_context?.existing_features || rawSession.projectContext?.existingFeatures || [],
      techStack: rawSession.project_context?.tech_stack || rawSession.projectContext?.techStack || [],
      targetAudience: rawSession.project_context?.target_audience || rawSession.projectContext?.targetAudience,
      plannedFeatures: rawSession.project_context?.planned_features || rawSession.projectContext?.plannedFeatures || []
    },
    generatedAt: rawSession.generated_at ? new Date(rawSession.generated_at) : new Date(),
    updatedAt: rawSession.updated_at ? new Date(rawSession.updated_at) : new Date()
  };
}
