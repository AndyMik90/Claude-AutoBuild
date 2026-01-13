import {
  Info,
  Target,
  Bug,
  Wrench,
  FileCode,
  Shield,
  Gauge,
  Palette,
  Lightbulb,
  Users,
  GitBranch,
  ListChecks,
  Clock
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn, formatRelativeTime, sanitizeMarkdownForDisplay } from '../../lib/utils';
import {
  TASK_CATEGORY_LABELS,
  TASK_CATEGORY_COLORS,
  TASK_COMPLEXITY_LABELS,
  TASK_COMPLEXITY_COLORS,
  TASK_IMPACT_LABELS,
  TASK_IMPACT_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS,
  IDEATION_TYPE_LABELS
} from '../../../shared/constants';
import type { Task, TaskCategory } from '../../../shared/types';

// Category icon mapping
const CategoryIcon: Record<TaskCategory, typeof Target> = {
  feature: Target,
  bug_fix: Bug,
  refactoring: Wrench,
  documentation: FileCode,
  security: Shield,
  performance: Gauge,
  ui_ux: Palette,
  infrastructure: Wrench,
  testing: FileCode
};

interface TaskMetadataProps {
  task: Task;
}

export function TaskMetadata({ task }: TaskMetadataProps) {
  return (
    <div className="space-y-5">
      {/* Classification Badges */}
      {task.metadata && (
        <div>
          <div className="section-divider mb-3">
            <Info className="h-3 w-3" />
            Classification
          </div>
          <div className="flex flex-wrap gap-1.5">
            {/* Category */}
            {task.metadata.category && (
              <Badge
                variant="outline"
                className={cn('text-xs', TASK_CATEGORY_COLORS[task.metadata.category])}
              >
                {CategoryIcon[task.metadata.category] && (() => {
                  const Icon = CategoryIcon[task.metadata.category!];
                  return <Icon className="h-3 w-3 mr-1" />;
                })()}
                {TASK_CATEGORY_LABELS[task.metadata.category]}
              </Badge>
            )}
            {/* Priority */}
            {task.metadata.priority && (
              <Badge
                variant="outline"
                className={cn('text-xs', TASK_PRIORITY_COLORS[task.metadata.priority])}
              >
                {TASK_PRIORITY_LABELS[task.metadata.priority]}
              </Badge>
            )}
            {/* Complexity */}
            {task.metadata.complexity && (
              <Badge
                variant="outline"
                className={cn('text-xs', TASK_COMPLEXITY_COLORS[task.metadata.complexity])}
              >
                {TASK_COMPLEXITY_LABELS[task.metadata.complexity]}
              </Badge>
            )}
            {/* Impact */}
            {task.metadata.impact && (
              <Badge
                variant="outline"
                className={cn('text-xs', TASK_IMPACT_COLORS[task.metadata.impact])}
              >
                {TASK_IMPACT_LABELS[task.metadata.impact]}
              </Badge>
            )}
            {/* Security Severity */}
            {task.metadata.securitySeverity && (
              <Badge
                variant="outline"
                className={cn('text-xs', TASK_IMPACT_COLORS[task.metadata.securitySeverity])}
              >
                <Shield className="h-3 w-3 mr-1" />
                {task.metadata.securitySeverity} severity
              </Badge>
            )}
            {/* Source Type */}
            {task.metadata.sourceType && (
              <Badge variant="secondary" className="text-xs">
                {task.metadata.sourceType === 'ideation' && task.metadata.ideationType
                  ? IDEATION_TYPE_LABELS[task.metadata.ideationType] || task.metadata.ideationType
                  : task.metadata.sourceType}
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      {task.description && (
        <div>
          <div className="section-divider mb-3">
            <FileCode className="h-3 w-3" />
            Description
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {sanitizeMarkdownForDisplay(task.description, 500)}
          </p>
        </div>
      )}

      {/* Metadata Details */}
      {task.metadata && (
        <div className="space-y-4">
          {/* Rationale */}
          {task.metadata.rationale && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-warning" />
                Rationale
              </h3>
              <p className="text-sm text-muted-foreground">{task.metadata.rationale}</p>
            </div>
          )}

          {/* Problem Solved */}
          {task.metadata.problemSolved && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-success" />
                Problem Solved
              </h3>
              <p className="text-sm text-muted-foreground">{task.metadata.problemSolved}</p>
            </div>
          )}

          {/* Target Audience */}
          {task.metadata.targetAudience && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-info" />
                Target Audience
              </h3>
              <p className="text-sm text-muted-foreground">{task.metadata.targetAudience}</p>
            </div>
          )}

          {/* Dependencies */}
          {task.metadata.dependencies && task.metadata.dependencies.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5 text-purple-400" />
                Dependencies
              </h3>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
                {task.metadata.dependencies.map((dep, idx) => (
                  <li key={idx}>{dep}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Acceptance Criteria */}
          {task.metadata.acceptanceCriteria && task.metadata.acceptanceCriteria.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5 text-success" />
                Acceptance Criteria
              </h3>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
                {task.metadata.acceptanceCriteria.map((criteria, idx) => (
                  <li key={idx}>{criteria}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Affected Files */}
          {task.metadata.affectedFiles && task.metadata.affectedFiles.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
                Affected Files
              </h3>
              <div className="flex flex-wrap gap-1">
                {task.metadata.affectedFiles.map((file, idx) => (
                  <Tooltip key={idx}>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="text-xs font-mono cursor-help">
                        {file.split('/').pop()}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="font-mono text-xs">
                      {file}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Timestamps */}
      <div>
        <div className="section-divider mb-3">
          <Clock className="h-3 w-3" />
          Timeline
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Created</span>
            <span className="text-foreground tabular-nums">{formatRelativeTime(task.createdAt)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Updated</span>
            <span className="text-foreground tabular-nums">{formatRelativeTime(task.updatedAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
