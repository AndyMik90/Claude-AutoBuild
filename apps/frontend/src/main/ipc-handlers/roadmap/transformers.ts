import type {
  Roadmap,
  RoadmapFeature,
  RoadmapPhase,
  RoadmapMilestone
} from '../../../shared/types';

interface RawRoadmapMilestone {
  id: string;
  title: string;
  description: string;
  features?: string[];
  status?: string;
  target_date?: string;
}

interface RawRoadmapPhase {
  id: string;
  name: string;
  description: string;
  order: number;
  status?: string;
  features?: string[];
  milestones?: RawRoadmapMilestone[];
}

interface RawRoadmapFeature {
  id: string;
  title: string;
  description: string;
  rationale?: string;
  priority?: string;
  complexity?: string;
  impact?: string;
  phase_id?: string;
  phaseId?: string;
  dependencies?: string[];
  status?: string;
  acceptance_criteria?: string[];
  acceptanceCriteria?: string[];
  user_stories?: string[];
  userStories?: string[];
  linked_spec_id?: string;
  linkedSpecId?: string;
  competitor_insight_ids?: string[];
  competitorInsightIds?: string[];
}

interface RawRoadmap {
  id?: string;
  project_name?: string;
  projectName?: string;
  version?: string;
  vision?: string;
  target_audience?: {
    primary?: string;
    secondary?: string[];
  };
  targetAudience?: {
    primary?: string;
    secondary?: string[];
  };
  phases?: RawRoadmapPhase[];
  features?: RawRoadmapFeature[];
  status?: string;
  metadata?: {
    created_at?: string;
    updated_at?: string;
  };
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

function transformMilestone(raw: RawRoadmapMilestone): RoadmapMilestone {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    features: raw.features || [],
    status: (raw.status as 'planned' | 'achieved') || 'planned',
    targetDate: raw.target_date ? new Date(raw.target_date) : undefined
  };
}

function transformPhase(raw: RawRoadmapPhase): RoadmapPhase {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    order: raw.order,
    status: (raw.status as RoadmapPhase['status']) || 'planned',
    features: raw.features || [],
    milestones: (raw.milestones || []).map(transformMilestone)
  };
}

/**
 * Maps all known backend status values to canonical Kanban column statuses.
 * Includes valid statuses as identity mappings for consistent lookup.
 * Module-level constant for efficiency (not recreated on each call).
 */
const STATUS_MAP: Record<string, RoadmapFeature['status']> = {
  // Canonical Kanban statuses (identity mappings)
  'under_review': 'under_review',
  'planned': 'planned',
  'in_progress': 'in_progress',
  'done': 'done',
  // Early-stage / ideation statuses → under_review
  'idea': 'under_review',
  'backlog': 'under_review',
  'proposed': 'under_review',
  'pending': 'under_review',
  // Approved / scheduled statuses → planned
  'approved': 'planned',
  'scheduled': 'planned',
  // Active development statuses → in_progress
  'active': 'in_progress',
  'building': 'in_progress',
  // Completed statuses → done
  'complete': 'done',
  'completed': 'done',
  'shipped': 'done'
};

/**
 * Normalizes a feature status string to a valid Kanban column status.
 * Handles case-insensitive matching and maps backend values to canonical statuses.
 *
 * @param status - The raw status string from the backend
 * @returns A valid RoadmapFeature status for Kanban display
 */
function normalizeFeatureStatus(status: string | undefined): RoadmapFeature['status'] {
  if (!status) return 'under_review';

  const normalized = STATUS_MAP[status.toLowerCase()];

  if (!normalized) {
    // Debug log for unmapped statuses to aid future mapping additions
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[Roadmap] normalizeFeatureStatus: unmapped status "${status}", defaulting to "under_review"`);
    }
    return 'under_review';
  }

  return normalized;
}

function transformFeature(raw: RawRoadmapFeature): RoadmapFeature {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    rationale: raw.rationale || '',
    priority: (raw.priority as RoadmapFeature['priority']) || 'should',
    complexity: (raw.complexity as RoadmapFeature['complexity']) || 'medium',
    impact: (raw.impact as RoadmapFeature['impact']) || 'medium',
    phaseId: raw.phase_id || raw.phaseId || '',
    dependencies: raw.dependencies || [],
    status: normalizeFeatureStatus(raw.status),
    acceptanceCriteria: raw.acceptance_criteria || raw.acceptanceCriteria || [],
    userStories: raw.user_stories || raw.userStories || [],
    linkedSpecId: raw.linked_spec_id || raw.linkedSpecId,
    competitorInsightIds: raw.competitor_insight_ids || raw.competitorInsightIds
  };
}


export function transformRoadmapFromSnakeCase(
  raw: RawRoadmap,
  projectId: string,
  projectName?: string
): Roadmap {
  const targetAudience = raw.target_audience || raw.targetAudience;
  const createdAt = raw.metadata?.created_at || raw.created_at || raw.createdAt;
  const updatedAt = raw.metadata?.updated_at || raw.updated_at || raw.updatedAt;

  return {
    id: raw.id || `roadmap-${Date.now()}`,
    projectId,
    projectName: raw.project_name || raw.projectName || projectName || '',
    version: raw.version || '1.0',
    vision: raw.vision || '',
    targetAudience: {
      primary: targetAudience?.primary || '',
      secondary: targetAudience?.secondary || []
    },
    phases: (raw.phases || []).map(transformPhase),
    features: (raw.features || []).map(transformFeature),
    status: (raw.status as Roadmap['status']) || 'draft',
    createdAt: createdAt ? new Date(createdAt) : new Date(),
    updatedAt: updatedAt ? new Date(updatedAt) : new Date()
  };
}
