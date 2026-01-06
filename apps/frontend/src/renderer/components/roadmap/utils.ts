import type { Roadmap, RoadmapFeature, CompetitorAnalysis, CompetitorPainPoint } from '../../../shared/types';

/**
 * Get a feature by ID from a roadmap.
 * Shared utility to avoid duplicating `.features.find(f => f.id === ...)` logic.
 */
export function getFeatureById(
	roadmap: Roadmap | undefined | null,
	featureId: string
): RoadmapFeature | undefined {
	return roadmap?.features.find((f) => f.id === featureId);
}

/**
 * Get competitor insights for a specific feature
 */
export function getCompetitorInsightsForFeature(
  feature: RoadmapFeature,
  competitorAnalysis: CompetitorAnalysis | null
): CompetitorPainPoint[] {
  if (!competitorAnalysis || !feature.competitorInsightIds || feature.competitorInsightIds.length === 0) {
    return [];
  }

  const insights: CompetitorPainPoint[] = [];
  for (const competitor of competitorAnalysis.competitors) {
    for (const painPoint of competitor.painPoints) {
      if (feature.competitorInsightIds.includes(painPoint.id)) {
        insights.push(painPoint);
      }
    }
  }
  return insights;
}

/**
 * Check if a feature has competitor insights
 */
export function hasCompetitorInsight(feature: RoadmapFeature): boolean {
  return !!feature.competitorInsightIds && feature.competitorInsightIds.length > 0;
}
