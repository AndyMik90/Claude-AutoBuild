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
    status: (raw.status as RoadmapFeature['status']) || 'under_review',
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
