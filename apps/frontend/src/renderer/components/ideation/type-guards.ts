import type {
  Idea,
  CodeImprovementIdea,
  UIUXImprovementIdea,
  DocumentationGapIdea,
  SecurityHardeningIdea,
  PerformanceOptimizationIdea,
  CodeQualityIdea
} from '../../../shared/types';

export function isCodeImprovementIdea(idea: Idea): idea is CodeImprovementIdea {
  return idea.type === 'code_improvements';
}

export function isUIUXIdea(idea: Idea): idea is UIUXImprovementIdea {
  return idea.type === 'ui_ux_improvements';
}

export function isDocumentationGapIdea(idea: Idea): idea is DocumentationGapIdea {
  return idea.type === 'documentation_gaps';
}

export function isSecurityHardeningIdea(idea: Idea): idea is SecurityHardeningIdea {
  return idea.type === 'security_hardening';
}

export function isPerformanceOptimizationIdea(idea: Idea): idea is PerformanceOptimizationIdea {
  return idea.type === 'performance_optimizations';
}

export function isCodeQualityIdea(idea: Idea): idea is CodeQualityIdea {
  return idea.type === 'code_quality';
}
