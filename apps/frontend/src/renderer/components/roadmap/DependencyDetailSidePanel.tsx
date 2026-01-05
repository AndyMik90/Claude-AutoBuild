import React from 'react';
import { X, ExternalLink } from 'lucide-react';
import { RoadmapFeature } from '../../../shared/types/roadmap';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';

interface DependencyDetailSidePanelProps {
  feature: RoadmapFeature | null;
  isOpen: boolean;
  onClose: () => void;
  onGoToFeature?: (featureId: string) => void;
  onConvertToSpec?: (featureId: string) => void;
}

export function DependencyDetailSidePanel({
  feature,
  isOpen,
  onClose,
  onGoToFeature,
  onConvertToSpec
}: DependencyDetailSidePanelProps) {
  if (!feature) return null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`
          fixed top-0 right-0 h-full w-[400px] bg-background border-l z-50
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold line-clamp-2">{feature.title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-6">
          {/* Description */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
            <p className="text-sm leading-relaxed">{feature.description}</p>
          </div>

          {/* Metadata */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground">Priority</span>
                <div className="mt-1">
                  <Badge variant={feature.priority === 'must' ? 'destructive' : 'secondary'}>
                    {feature.priority}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Complexity</span>
                <div className="mt-1">
                  <Badge variant="outline">{feature.complexity}</Badge>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Impact</span>
                <div className="mt-1">
                  <Badge variant="outline">{feature.impact}</Badge>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Status</span>
                <div className="mt-1">
                  <Badge variant="secondary">{feature.status}</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Dependencies Info */}
          {feature.dependencies && feature.dependencies.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Dependencies ({feature.dependencies.length})
              </h3>
              <ul className="space-y-1">
                {feature.dependencies.map(depId => (
                  <li key={depId} className="text-sm flex items-center gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span className="font-mono text-xs">{depId}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reverse Dependencies Info */}
          {feature.reverseDependencies && feature.reverseDependencies.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Required By ({feature.reverseDependencies.length})
              </h3>
              <ul className="space-y-1">
                {feature.reverseDependencies.map(depId => (
                  <li key={depId} className="text-sm flex items-center gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span className="font-mono text-xs">{depId}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ScrollArea>

        {/* Footer Actions */}
        <div className="p-6 border-t space-y-2">
          {feature.linkedSpecId ? (
            <Button
              className="w-full justify-start"
              variant="default"
              onClick={() => onGoToFeature?.(feature.linkedSpecId!)}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Go to Task
            </Button>
          ) : (
            <Button
              className="w-full justify-start"
              variant="default"
              onClick={() => onConvertToSpec?.(feature.id)}
            >
              Convert to Spec
            </Button>
          )}
          <Button
            className="w-full justify-start"
            variant="outline"
            onClick={() => {
              onGoToFeature?.(feature.id);
              onClose();
            }}
          >
            View in Roadmap
          </Button>
        </div>
      </div>
    </>
  );
}
