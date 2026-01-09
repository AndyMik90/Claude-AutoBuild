/**
 * AddFeatureDialog - Dialog for adding new features to the roadmap
 *
 * Allows users to create new roadmap features with title, description,
 * priority, phase, complexity, and impact fields.
 * Follows the same dialog pattern as TaskEditDialog for consistency.
 *
 * Features:
 * - Form validation (title and description required)
 * - Selectable classification fields (priority, phase, complexity, impact)
 * - Adds feature to roadmap store and persists to file
 *
 * @example
 * ```tsx
 * <AddFeatureDialog
 *   phases={roadmap.phases}
 *   open={isAddDialogOpen}
 *   onOpenChange={setIsAddDialogOpen}
 *   onFeatureAdded={(featureId) => console.log('Feature added:', featureId)}
 * />
 * ```
 */
import { useState, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select';
import { useRoadmapStore } from '../stores/roadmap-store';
import {
  ROADMAP_PRIORITY_LABELS
} from '../../shared/constants';
import type {
  RoadmapPhase,
  RoadmapFeaturePriority,
  RoadmapFeatureStatus
} from '../../shared/types';

/**
 * Props for the AddFeatureDialog component
 */
interface AddFeatureDialogProps {
  /** Available phases to select from */
  phases: RoadmapPhase[];
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Optional callback when feature is successfully added, receives the new feature ID */
  onFeatureAdded?: (featureId: string) => void;
  /** Optional default phase ID to pre-select */
  defaultPhaseId?: string;
}

// Complexity options
const COMPLEXITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' }
] as const;

// Impact options
const IMPACT_OPTIONS = [
  { value: 'low', label: 'Low Impact' },
  { value: 'medium', label: 'Medium Impact' },
  { value: 'high', label: 'High Impact' }
] as const;

export function AddFeatureDialog({
  phases,
  open,
  onOpenChange,
  onFeatureAdded,
  defaultPhaseId
}: AddFeatureDialogProps) {
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rationale, setRationale] = useState('');
  const [priority, setPriority] = useState<RoadmapFeaturePriority>('should');
  const [phaseId, setPhaseId] = useState<string>('');
  const [complexity, setComplexity] = useState<'low' | 'medium' | 'high'>('medium');
  const [impact, setImpact] = useState<'low' | 'medium' | 'high'>('medium');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store actions
  const addFeature = useRoadmapStore((state) => state.addFeature);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setRationale('');
      setPriority('should');
      setPhaseId(defaultPhaseId || (phases.length > 0 ? phases[0].id : ''));
      setComplexity('medium');
      setImpact('medium');
      setError(null);
    }
  }, [open, defaultPhaseId, phases]);

  const handleSave = async () => {
    // Validate required fields
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    if (!phaseId) {
      setError('Please select a phase');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Add feature to store
      const newFeatureId = addFeature({
        title: title.trim(),
        description: description.trim(),
        rationale: rationale.trim() || `User-created feature for ${title.trim()}`,
        priority,
        complexity,
        impact,
        phaseId,
        dependencies: [],
        status: 'idea' as RoadmapFeatureStatus,
        acceptanceCriteria: [],
        userStories: []
      });

      // Persist to file via IPC
      const roadmap = useRoadmapStore.getState().roadmap;
      if (roadmap) {
        // Get the project ID from the roadmap
        const result = await window.electronAPI.saveRoadmap(roadmap.projectId, roadmap);
        if (!result.success) {
          throw new Error(result.error || 'Failed to save roadmap');
        }
      }

      // Success - close dialog and notify parent
      onOpenChange(false);
      onFeatureAdded?.(newFeatureId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add feature. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      onOpenChange(false);
    }
  };

  // Form validation
  const isValid = title.trim().length > 0 && description.trim().length > 0 && phaseId !== '';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add Feature</DialogTitle>
          <DialogDescription>
            Add a new feature to your roadmap. Provide details about what you want to build
            and how it fits into your product strategy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Title (Required) */}
          <div className="space-y-2">
            <Label htmlFor="add-feature-title" className="text-sm font-medium text-foreground">
              Feature Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="add-feature-title"
              placeholder="e.g., User Authentication, Dark Mode Support"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSaving}
            />
          </div>

          {/* Description (Required) */}
          <div className="space-y-2">
            <Label htmlFor="add-feature-description" className="text-sm font-medium text-foreground">
              Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="add-feature-description"
              placeholder="Describe what this feature does and why it's valuable to users."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={isSaving}
            />
          </div>

          {/* Rationale (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="add-feature-rationale" className="text-sm font-medium text-foreground">
              Rationale <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="add-feature-rationale"
              placeholder="Explain why this feature should be built and how it fits the product vision."
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={2}
              disabled={isSaving}
            />
          </div>

          {/* Classification Fields */}
          <div className="grid grid-cols-2 gap-4">
            {/* Phase */}
            <div className="space-y-2">
              <Label htmlFor="add-feature-phase" className="text-sm font-medium text-foreground">
                Phase <span className="text-destructive">*</span>
              </Label>
              <Select
                value={phaseId}
                onValueChange={setPhaseId}
                disabled={isSaving}
              >
                <SelectTrigger id="add-feature-phase">
                  <SelectValue placeholder="Select phase" />
                </SelectTrigger>
                <SelectContent>
                  {phases.map((phase) => (
                    <SelectItem key={phase.id} value={phase.id}>
                      {phase.order}. {phase.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label htmlFor="add-feature-priority" className="text-sm font-medium text-foreground">
                Priority
              </Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as RoadmapFeaturePriority)}
                disabled={isSaving}
              >
                <SelectTrigger id="add-feature-priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROADMAP_PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Complexity */}
            <div className="space-y-2">
              <Label htmlFor="add-feature-complexity" className="text-sm font-medium text-foreground">
                Complexity
              </Label>
              <Select
                value={complexity}
                onValueChange={(value) => setComplexity(value as 'low' | 'medium' | 'high')}
                disabled={isSaving}
              >
                <SelectTrigger id="add-feature-complexity">
                  <SelectValue placeholder="Select complexity" />
                </SelectTrigger>
                <SelectContent>
                  {COMPLEXITY_OPTIONS.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Impact */}
            <div className="space-y-2">
              <Label htmlFor="add-feature-impact" className="text-sm font-medium text-foreground">
                Impact
              </Label>
              <Select
                value={impact}
                onValueChange={(value) => setImpact(value as 'low' | 'medium' | 'high')}
                disabled={isSaving}
              >
                <SelectTrigger id="add-feature-impact">
                  <SelectValue placeholder="Select impact" />
                </SelectTrigger>
                <SelectContent>
                  {IMPACT_OPTIONS.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              <X className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !isValid}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Feature'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
