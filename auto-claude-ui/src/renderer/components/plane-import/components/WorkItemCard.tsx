/**
 * Individual work item card component
 */

import { useState } from 'react';
import {
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Badge } from '../../ui/badge';
import { PRIORITY_COLORS, PRIORITY_LABELS } from '../types';
import type { PlaneWorkItem } from '../types';

interface WorkItemCardProps {
  workItem: PlaneWorkItem;
  isSelected: boolean;
  projectIdentifier?: string;
  onToggle: (workItemId: string) => void;
}

export function WorkItemCard({ workItem, isSelected, projectIdentifier, onToggle }: WorkItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Use project_detail if available, fall back to passed projectIdentifier, then sequence_id only
  const prefix = workItem.project_detail?.identifier || projectIdentifier;
  const identifier = prefix
    ? `${prefix}-${workItem.sequence_id}`
    : `#${workItem.sequence_id}`;

  return (
    <div
      className={`
        rounded-lg border border-border p-3 cursor-pointer transition-colors
        ${isSelected ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'}
      `}
      onClick={() => onToggle(workItem.id)}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="mt-0.5">
          {isSelected ? (
            <CheckSquare className="h-5 w-5 text-primary" />
          ) : (
            <Square className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        {/* Work Item Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">
              {identifier}
            </span>
            <Badge
              variant="secondary"
              className={`text-xs ${PRIORITY_COLORS[workItem.priority] || ''}`}
            >
              {PRIORITY_LABELS[workItem.priority] || workItem.priority}
            </Badge>
            {workItem.labels?.slice(0, 2).map(labelId => (
              <Badge
                key={labelId}
                variant="outline"
                className="text-xs"
              >
                {labelId}
              </Badge>
            ))}
            {workItem.labels && workItem.labels.length > 2 && (
              <span className="text-xs text-muted-foreground">
                +{workItem.labels.length - 2} more
              </span>
            )}
          </div>

          <h4 className="text-sm font-medium text-foreground mt-1 line-clamp-2">
            {workItem.name}
          </h4>

          {/* Expandable description */}
          {workItem.description_stripped && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Hide description
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Show description
                </>
              )}
            </button>
          )}

          {isExpanded && workItem.description_stripped && (
            <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded p-2 max-h-32 overflow-auto">
              {workItem.description_stripped}
            </div>
          )}

          {/* Meta info */}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            {workItem.assignees && workItem.assignees.length > 0 && (
              <span>{workItem.assignees.length} assignee{workItem.assignees.length !== 1 ? 's' : ''}</span>
            )}
            {workItem.target_date && (
              <span>Due: {new Date(workItem.target_date).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
