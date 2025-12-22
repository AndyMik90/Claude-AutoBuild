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
  IdeationStatus
} from '../../../shared/types';
import type { RawIdea } from './types';

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
