/**
 * Internal types for ideation handlers
 */

export interface RawIdea extends Record<string, unknown> {
  id: string;
  type: string;
  title: string;
  description: string;
  rationale: string;
  status?: string;
  created_at?: string;

  // Common fields (snake_case from Python)
  builds_upon?: string[];
  buildsUpon?: string[];
  estimated_effort?: string;
  estimatedEffort?: string;
  affected_files?: string[];
  affectedFiles?: string[];

  // UI/UX specific
  category?: string;
  affected_components?: string[];
  affectedComponents?: string[];
  screenshots?: string[];
  current_state?: string;
  currentState?: string;
  proposed_change?: string;
  proposedChange?: string;
  user_benefit?: string;
  userBenefit?: string;

  // Documentation specific
  target_audience?: string;
  targetAudience?: string;
  affected_areas?: string[];
  affectedAreas?: string[];
  current_documentation?: string;
  currentDocumentation?: string;
  proposed_content?: string;
  proposedContent?: string;
  priority?: string;

  // Security specific
  severity?: string;
  vulnerability?: string;
  current_risk?: string;
  currentRisk?: string;
  remediation?: string;
  references?: string[];
  compliance?: string[];

  // Performance specific
  impact?: string;
  current_metric?: string;
  currentMetric?: string;
  expected_improvement?: string;
  expectedImprovement?: string;
  implementation?: string;
  tradeoffs?: string;

  // Code quality specific
  code_example?: string;
  codeExample?: string;
  best_practice?: string;
  bestPractice?: string;
  metrics?: Record<string, unknown>;
  breaking_change?: boolean;
  breakingChange?: boolean;
  prerequisites?: string[];

  // Linked task
  linked_task_id?: string;
}

export interface RawIdeationData {
  id?: string;
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
