import {
  ChevronRight,
  Lightbulb,
  Users,
  CheckCircle2,
  Circle,
  ArrowRight,
  Zap,
  ExternalLink,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import {
  ROADMAP_PRIORITY_COLORS,
  ROADMAP_PRIORITY_LABELS,
  ROADMAP_COMPLEXITY_COLORS,
  ROADMAP_IMPACT_COLORS,
} from '../../../shared/constants';
import type { FeatureDetailPanelProps } from './types';

export function FeatureDetailPanel({
  feature,
  onClose,
  onConvertToSpec,
  onGoToTask,
  competitorInsights = [],
}: FeatureDetailPanelProps) {
  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-card border-l border-border shadow-lg flex flex-col z-50">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={ROADMAP_PRIORITY_COLORS[feature.priority]}>
                {ROADMAP_PRIORITY_LABELS[feature.priority]}
              </Badge>
              <Badge
                variant="outline"
                className={`${ROADMAP_COMPLEXITY_COLORS[feature.complexity]}`}
              >
                {feature.complexity}
              </Badge>
            </div>
            <h2 className="font-semibold">{feature.title}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Description */}
        <div>
          <h3 className="text-sm font-medium mb-2">Description</h3>
          <p className="text-sm text-muted-foreground">{feature.description}</p>
        </div>

        {/* Rationale */}
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Rationale
          </h3>
          <p className="text-sm text-muted-foreground">{feature.rationale}</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3 text-center">
            <div
              className={`text-lg font-semibold ${ROADMAP_COMPLEXITY_COLORS[feature.complexity]}`}
            >
              {feature.complexity}
            </div>
            <div className="text-xs text-muted-foreground">Complexity</div>
          </Card>
          <Card className="p-3 text-center">
            <div className={`text-lg font-semibold ${ROADMAP_IMPACT_COLORS[feature.impact]}`}>
              {feature.impact}
            </div>
            <div className="text-xs text-muted-foreground">Impact</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-lg font-semibold">{feature.dependencies.length}</div>
            <div className="text-xs text-muted-foreground">Dependencies</div>
          </Card>
        </div>

        {/* User Stories */}
        {feature.userStories.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Users className="h-4 w-4" />
              User Stories
            </h3>
            <div className="space-y-2">
              {feature.userStories.map((story, i) => (
                <div key={i} className="text-sm p-2 bg-muted/50 rounded-md italic">
                  "{story}"
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Acceptance Criteria */}
        {feature.acceptanceCriteria.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Acceptance Criteria
            </h3>
            <ul className="space-y-1">
              {feature.acceptanceCriteria.map((criterion, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <Circle className="h-3 w-3 mt-1.5 shrink-0" />
                  <span>{criterion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Dependencies */}
        {feature.dependencies.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              Dependencies
            </h3>
            <div className="flex flex-wrap gap-1">
              {feature.dependencies.map((dep) => (
                <Badge key={dep} variant="outline" className="text-xs">
                  {dep}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Competitor Insights */}
        {competitorInsights.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Addresses Competitor Pain Points
            </h3>
            <div className="space-y-2">
              {competitorInsights.map((insight) => (
                <div
                  key={insight.id}
                  className="p-2 bg-primary/5 border border-primary/20 rounded-md"
                >
                  <p className="text-sm text-foreground">{insight.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {insight.source}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        insight.severity === 'high'
                          ? 'text-red-500 border-red-500/50'
                          : insight.severity === 'medium'
                          ? 'text-yellow-500 border-yellow-500/50'
                          : 'text-green-500 border-green-500/50'
                      }`}
                    >
                      {insight.severity} severity
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {feature.linkedSpecId ? (
        <div className="shrink-0 p-4 border-t border-border">
          <Button className="w-full" onClick={() => onGoToTask(feature.linkedSpecId!)}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Go to Task
          </Button>
        </div>
      ) : (
        feature.status !== 'done' && (
          <div className="shrink-0 p-4 border-t border-border">
            <Button className="w-full" onClick={() => onConvertToSpec(feature)}>
              <Zap className="h-4 w-4 mr-2" />
              Convert to Auto-Build Task
            </Button>
          </div>
        )
      )}
    </div>
  );
}
