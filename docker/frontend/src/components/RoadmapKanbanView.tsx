import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable';
import { Plus, Inbox } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { SortableFeatureCard } from './SortableFeatureCard';
import { cn } from '../lib/utils';
import {
  useRoadmapStore,
  getFeaturesByPhase
} from '../stores/roadmap-store';
import type { RoadmapFeature, RoadmapPhase, Roadmap } from '../../shared/types';

interface RoadmapKanbanViewProps {
  roadmap: Roadmap;
  onFeatureClick: (feature: RoadmapFeature) => void;
  onConvertToSpec?: (feature: RoadmapFeature) => void;
  onGoToTask?: (specId: string) => void;
  onSave?: () => void;
}

interface DroppablePhaseColumnProps {
  phase: RoadmapPhase;
  features: RoadmapFeature[];
  onFeatureClick: (feature: RoadmapFeature) => void;
  onConvertToSpec?: (feature: RoadmapFeature) => void;
  onGoToTask?: (specId: string) => void;
  isOver: boolean;
}

// Get phase status color for column header
function getPhaseStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'border-t-success';
    case 'in_progress':
      return 'border-t-primary';
    default:
      return 'border-t-muted-foreground/30';
  }
}

function DroppablePhaseColumn({
  phase,
  features,
  onFeatureClick,
  onConvertToSpec,
  onGoToTask,
  isOver
}: DroppablePhaseColumnProps) {
  const { setNodeRef } = useDroppable({
    id: phase.id
  });

  const featureIds = features.map((f) => f.id);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-w-80 w-80 shrink-0 flex-col rounded-xl border border-white/5 bg-linear-to-b from-secondary/30 to-transparent backdrop-blur-sm transition-all duration-200',
        getPhaseStatusColor(phase.status),
        'border-t-2',
        isOver && 'drop-zone-highlight'
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              phase.status === 'completed'
                ? 'bg-success/10 text-success'
                : phase.status === 'in_progress'
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {phase.order}
          </div>
          <h2 className="font-semibold text-sm text-foreground truncate max-w-[180px]">
            {phase.name}
          </h2>
          <span className="column-count-badge">
            {features.length}
          </span>
        </div>
        <Badge
          variant={phase.status === 'completed' ? 'default' : 'outline'}
          className="text-xs"
        >
          {phase.status.replace('_', ' ')}
        </Badge>
      </div>

      {/* Features list */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full px-3 pb-3 pt-2">
          <SortableContext
            items={featureIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3 min-h-[120px]">
              {features.length === 0 ? (
                <div
                  className={cn(
                    'empty-column-dropzone flex flex-col items-center justify-center py-6',
                    isOver && 'active'
                  )}
                >
                  {isOver ? (
                    <>
                      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center mb-2">
                        <Plus className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-primary">Drop here</span>
                    </>
                  ) : (
                    <>
                      <Inbox className="h-6 w-6 text-muted-foreground/50" />
                      <span className="mt-2 text-sm font-medium text-muted-foreground/70">
                        No features
                      </span>
                      <span className="mt-0.5 text-xs text-muted-foreground/50">
                        Drag features here
                      </span>
                    </>
                  )}
                </div>
              ) : (
                features.map((feature) => (
                  <SortableFeatureCard
                    key={feature.id}
                    feature={feature}
                    onClick={() => onFeatureClick(feature)}
                    onConvertToSpec={onConvertToSpec}
                    onGoToTask={onGoToTask}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </ScrollArea>
      </div>
    </div>
  );
}

export function RoadmapKanbanView({
  roadmap,
  onFeatureClick,
  onConvertToSpec,
  onGoToTask,
  onSave
}: RoadmapKanbanViewProps) {
  const [activeFeature, setActiveFeature] = useState<RoadmapFeature | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);

  const reorderFeatures = useRoadmapStore((state) => state.reorderFeatures);
  const updateFeaturePhase = useRoadmapStore((state) => state.updateFeaturePhase);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8 // 8px movement required before drag starts
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // Get features grouped by phase
  const featuresByPhase = useMemo(() => {
    const grouped: Record<string, RoadmapFeature[]> = {};
    roadmap.phases.forEach((phase) => {
      grouped[phase.id] = getFeaturesByPhase(roadmap, phase.id);
    });
    return grouped;
  }, [roadmap]);

  // Get all phase IDs for detecting column drops
  const phaseIds = useMemo(() => roadmap.phases.map((p) => p.id), [roadmap.phases]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const feature = roadmap.features.find((f) => f.id === active.id);
    if (feature) {
      setActiveFeature(feature);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;

    if (!over) {
      setOverColumnId(null);
      return;
    }

    const overId = over.id as string;

    // Check if over a phase column
    if (phaseIds.includes(overId)) {
      setOverColumnId(overId);
      return;
    }

    // Check if over a feature - get its phase
    const overFeature = roadmap.features.find((f) => f.id === overId);
    if (overFeature) {
      setOverColumnId(overFeature.phaseId);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveFeature(null);
    setOverColumnId(null);

    if (!over) return;

    const activeFeatureId = active.id as string;
    const overId = over.id as string;
    const draggedFeature = roadmap.features.find((f) => f.id === activeFeatureId);

    if (!draggedFeature) return;

    // Determine target phase
    let targetPhaseId: string;
    let targetFeatureIndex: number = -1;

    if (phaseIds.includes(overId)) {
      // Dropped directly on a phase column
      targetPhaseId = overId;
    } else {
      // Dropped on a feature - get its phase and position
      const overFeature = roadmap.features.find((f) => f.id === overId);
      if (!overFeature) return;
      targetPhaseId = overFeature.phaseId;
      const targetFeatures = featuresByPhase[targetPhaseId] || [];
      targetFeatureIndex = targetFeatures.findIndex((f) => f.id === overId);
    }

    const sourcePhaseId = draggedFeature.phaseId;

    if (sourcePhaseId !== targetPhaseId) {
      // Moving to a different phase
      updateFeaturePhase(activeFeatureId, targetPhaseId);

      // If dropped on a specific feature, reorder within the new phase
      if (targetFeatureIndex !== -1) {
        const targetFeatures = [...(featuresByPhase[targetPhaseId] || [])];
        // Add the moved feature at the target position
        const updatedIds = targetFeatures.map((f) => f.id);
        if (!updatedIds.includes(activeFeatureId)) {
          updatedIds.splice(targetFeatureIndex, 0, activeFeatureId);
          reorderFeatures(targetPhaseId, updatedIds);
        }
      }

      // Trigger save callback
      onSave?.();
    } else {
      // Reordering within the same phase
      const sourceFeatures = featuresByPhase[sourcePhaseId] || [];
      const oldIndex = sourceFeatures.findIndex((f) => f.id === activeFeatureId);
      const newIndex = targetFeatureIndex !== -1 ? targetFeatureIndex : sourceFeatures.length - 1;

      if (oldIndex !== newIndex) {
        const reorderedIds = arrayMove(
          sourceFeatures.map((f) => f.id),
          oldIndex,
          newIndex
        );
        reorderFeatures(sourcePhaseId, reorderedIds);

        // Trigger save callback
        onSave?.();
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Kanban columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto p-6">
          {roadmap.phases
            .sort((a, b) => a.order - b.order)
            .map((phase) => (
              <DroppablePhaseColumn
                key={phase.id}
                phase={phase}
                features={featuresByPhase[phase.id] || []}
                onFeatureClick={onFeatureClick}
                onConvertToSpec={onConvertToSpec}
                onGoToTask={onGoToTask}
                isOver={overColumnId === phase.id}
              />
            ))}
        </div>

        {/* Drag overlay - enhanced visual feedback */}
        <DragOverlay>
          {activeFeature ? (
            <div className="drag-overlay-card">
              <Card className="p-4 w-80 shadow-2xl">
                <div className="font-medium">{activeFeature.title}</div>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                  {activeFeature.description}
                </p>
              </Card>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
