import { ExternalLink, Play, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import {
  IDEATION_TYPE_LABELS,
  IDEATION_TYPE_COLORS,
  IDEATION_STATUS_COLORS,
  IDEATION_EFFORT_COLORS,
  IDEATION_IMPACT_COLORS,
  SECURITY_SEVERITY_COLORS,
  UIUX_CATEGORY_LABELS,
  DOCUMENTATION_CATEGORY_LABELS,
  SECURITY_CATEGORY_LABELS,
  CODE_QUALITY_SEVERITY_COLORS
} from '../../../shared/constants';
import type {
  Idea,
  CodeImprovementIdea,
  UIUXImprovementIdea,
  DocumentationGapIdea,
  SecurityHardeningIdea,
  PerformanceOptimizationIdea,
  CodeQualityIdea
} from '../../../shared/types';
import { TypeIcon } from './TypeIcon';
import {
  isCodeImprovementIdea,
  isUIUXIdea,
  isDocumentationGapIdea,
  isSecurityHardeningIdea,
  isPerformanceOptimizationIdea,
  isCodeQualityIdea
} from './type-guards';

interface IdeaCardProps {
  idea: Idea;
  onClick: () => void;
  onConvert: (idea: Idea) => void;
  onGoToTask?: (taskId: string) => void;
  onDismiss: (idea: Idea) => void;
}

export function IdeaCard({ idea, onClick, onConvert, onGoToTask, onDismiss }: IdeaCardProps) {
  const isDismissed = idea.status === 'dismissed';
  const isConverted = idea.status === 'converted';

  return (
    <Card
      className={`p-4 hover:bg-muted/50 cursor-pointer transition-colors ${
        isDismissed ? 'opacity-50' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={IDEATION_TYPE_COLORS[idea.type]}>
              <TypeIcon type={idea.type} />
              <span className="ml-1">{IDEATION_TYPE_LABELS[idea.type]}</span>
            </Badge>
            {idea.status !== 'draft' && (
              <Badge variant="outline" className={IDEATION_STATUS_COLORS[idea.status]}>
                {idea.status}
              </Badge>
            )}
            {isCodeImprovementIdea(idea) && (
              <Badge variant="outline" className={IDEATION_EFFORT_COLORS[(idea as CodeImprovementIdea).estimatedEffort]}>
                {(idea as CodeImprovementIdea).estimatedEffort}
              </Badge>
            )}
            {isUIUXIdea(idea) && (
              <Badge variant="outline">
                {UIUX_CATEGORY_LABELS[(idea as UIUXImprovementIdea).category]}
              </Badge>
            )}
            {isDocumentationGapIdea(idea) && (
              <Badge variant="outline">
                {DOCUMENTATION_CATEGORY_LABELS[(idea as DocumentationGapIdea).category]}
              </Badge>
            )}
            {isSecurityHardeningIdea(idea) && (
              <Badge variant="outline" className={SECURITY_SEVERITY_COLORS[(idea as SecurityHardeningIdea).severity]}>
                {(idea as SecurityHardeningIdea).severity}
              </Badge>
            )}
            {isPerformanceOptimizationIdea(idea) && (
              <Badge variant="outline" className={IDEATION_IMPACT_COLORS[(idea as PerformanceOptimizationIdea).impact]}>
                {(idea as PerformanceOptimizationIdea).impact} impact
              </Badge>
            )}
            {isCodeQualityIdea(idea) && (
              <Badge variant="outline" className={CODE_QUALITY_SEVERITY_COLORS[(idea as CodeQualityIdea).severity]}>
                {(idea as CodeQualityIdea).severity}
              </Badge>
            )}
          </div>
          <h3 className={`font-medium ${isDismissed ? 'line-through' : ''}`}>
            {idea.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2">{idea.description}</p>
        </div>
        {!isDismissed && !isConverted && (
          <div className="flex items-center gap-1 ml-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConvert(idea);
                  }}
                >
                  <Play className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Convert to Task</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(idea);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Dismiss</TooltipContent>
            </Tooltip>
          </div>
        )}
        {isConverted && idea.taskId && onGoToTask && (
          <div className="flex items-center gap-1 ml-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGoToTask(idea.taskId!);
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Go to Task</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </Card>
  );
}
