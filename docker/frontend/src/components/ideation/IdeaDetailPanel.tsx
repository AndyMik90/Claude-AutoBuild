import { ChevronRight, ExternalLink, Lightbulb, Play, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  IDEATION_TYPE_LABELS,
  IDEATION_TYPE_COLORS,
  IDEATION_STATUS_COLORS
} from '../../../shared/constants';
import type { Idea } from '../../../shared/types';
import { TypeIcon } from './TypeIcon';
import {
  isCodeImprovementIdea,
  isUIUXIdea,
  isDocumentationGapIdea,
  isSecurityHardeningIdea,
  isPerformanceOptimizationIdea,
  isCodeQualityIdea
} from './type-guards';
import { CodeImprovementDetails } from './details/CodeImprovementDetails';
import { UIUXDetails } from './details/UIUXDetails';
import { DocumentationGapDetails } from './details/DocumentationGapDetails';
import { SecurityHardeningDetails } from './details/SecurityHardeningDetails';
import { PerformanceOptimizationDetails } from './details/PerformanceOptimizationDetails';
import { CodeQualityDetails } from './details/CodeQualityDetails';

interface IdeaDetailPanelProps {
  idea: Idea;
  onClose: () => void;
  onConvert: (idea: Idea) => void;
  onGoToTask?: (taskId: string) => void;
  onDismiss: (idea: Idea) => void;
}

export function IdeaDetailPanel({ idea, onClose, onConvert, onGoToTask, onDismiss }: IdeaDetailPanelProps) {
  const isDismissed = idea.status === 'dismissed';
  const isConverted = idea.status === 'converted';

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-card border-l border-border shadow-lg flex flex-col z-50">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={IDEATION_TYPE_COLORS[idea.type]}>
                <TypeIcon type={idea.type} />
                <span className="ml-1">{IDEATION_TYPE_LABELS[idea.type]}</span>
              </Badge>
              {idea.status !== 'draft' && (
                <Badge variant="outline" className={IDEATION_STATUS_COLORS[idea.status]}>
                  {idea.status}
                </Badge>
              )}
            </div>
            <h2 className="font-semibold">{idea.title}</h2>
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
          <p className="text-sm text-muted-foreground">{idea.description}</p>
        </div>

        {/* Rationale */}
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Rationale
          </h3>
          <p className="text-sm text-muted-foreground">{idea.rationale}</p>
        </div>

        {/* Type-specific content */}
        {isCodeImprovementIdea(idea) && <CodeImprovementDetails idea={idea} />}
        {isUIUXIdea(idea) && <UIUXDetails idea={idea} />}
        {isDocumentationGapIdea(idea) && <DocumentationGapDetails idea={idea} />}
        {isSecurityHardeningIdea(idea) && <SecurityHardeningDetails idea={idea} />}
        {isPerformanceOptimizationIdea(idea) && <PerformanceOptimizationDetails idea={idea} />}
        {isCodeQualityIdea(idea) && <CodeQualityDetails idea={idea} />}
      </div>

      {/* Actions */}
      {!isDismissed && !isConverted && (
        <div className="shrink-0 p-4 border-t border-border space-y-2">
          <Button className="w-full" onClick={() => onConvert(idea)}>
            <Play className="h-4 w-4 mr-2" />
            Convert to Auto-Build Task
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onDismiss(idea)}
          >
            <X className="h-4 w-4 mr-2" />
            Dismiss Idea
          </Button>
        </div>
      )}
      {isConverted && idea.taskId && onGoToTask && (
        <div className="shrink-0 p-4 border-t border-border">
          <Button className="w-full" onClick={() => onGoToTask(idea.taskId!)}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Go to Task
          </Button>
        </div>
      )}
    </div>
  );
}
