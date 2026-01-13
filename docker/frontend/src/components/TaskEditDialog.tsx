/**
 * TaskEditDialog - Dialog for editing task details
 *
 * Allows users to modify all task properties including title, description,
 * classification fields, images, and review settings.
 * Follows the same dialog pattern as TaskCreationWizard for consistency.
 *
 * Features:
 * - Pre-populates form with current task values
 * - Form validation (description required)
 * - Editable classification fields (category, priority, complexity, impact)
 * - Editable image attachments (add/remove images)
 * - Editable review settings (requireReviewBeforeCoding)
 * - Saves changes via persistUpdateTask (updates store + spec files)
 * - Prevents save when no changes have been made
 *
 * @example
 * ```tsx
 * <TaskEditDialog
 *   task={selectedTask}
 *   open={isEditDialogOpen}
 *   onOpenChange={setIsEditDialogOpen}
 *   onSaved={() => console.log('Task updated!')}
 * />
 * ```
 */
import { useState, useEffect, useCallback, useRef, type ClipboardEvent, type DragEvent } from 'react';
import { Loader2, Image as ImageIcon, ChevronDown, ChevronUp, X } from 'lucide-react';
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
import { Checkbox } from './ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select';
import {
  ImageUpload,
  generateImageId,
  blobToBase64,
  createThumbnail,
  isValidImageMimeType,
  resolveFilename
} from './ImageUpload';
import { AgentProfileSelector } from './AgentProfileSelector';
import { persistUpdateTask } from '../stores/task-store';
import { cn } from '../lib/utils';
import type { Task, ImageAttachment, TaskCategory, TaskPriority, TaskComplexity, TaskImpact, ModelType, ThinkingLevel } from '../../shared/types';
import {
  TASK_CATEGORY_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_COMPLEXITY_LABELS,
  TASK_IMPACT_LABELS,
  MAX_IMAGES_PER_TASK,
  ALLOWED_IMAGE_TYPES_DISPLAY,
  DEFAULT_AGENT_PROFILES,
  DEFAULT_PHASE_MODELS,
  DEFAULT_PHASE_THINKING
} from '../../shared/constants';
import type { PhaseModelConfig, PhaseThinkingConfig } from '../../shared/types/settings';
import { useSettingsStore } from '../stores/settings-store';

/**
 * Props for the TaskEditDialog component
 */
interface TaskEditDialogProps {
  /** The task to edit */
  task: Task;
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Optional callback when task is successfully saved */
  onSaved?: () => void;
}

export function TaskEditDialog({ task, open, onOpenChange, onSaved }: TaskEditDialogProps) {
  // Get selected agent profile from settings for defaults
  const { settings } = useSettingsStore();
  const selectedProfile = DEFAULT_AGENT_PROFILES.find(
    p => p.id === settings.selectedAgentProfile
  ) || DEFAULT_AGENT_PROFILES.find(p => p.id === 'auto')!;

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [pasteSuccess, setPasteSuccess] = useState(false);

  // Classification fields
  const [category, setCategory] = useState<TaskCategory | ''>(task.metadata?.category || '');
  const [priority, setPriority] = useState<TaskPriority | ''>(task.metadata?.priority || '');
  const [complexity, setComplexity] = useState<TaskComplexity | ''>(task.metadata?.complexity || '');
  const [impact, setImpact] = useState<TaskImpact | ''>(task.metadata?.impact || '');

  // Agent profile / model configuration
  const [profileId, setProfileId] = useState<string>(() => {
    // Check if task uses Auto profile
    if (task.metadata?.isAutoProfile) {
      return 'auto';
    }
    // Determine profile ID from task metadata or default to 'auto'
    const taskModel = task.metadata?.model;
    const taskThinking = task.metadata?.thinkingLevel;
    if (taskModel && taskThinking) {
      // Check if it matches a known profile
      const matchingProfile = DEFAULT_AGENT_PROFILES.find(
        p => p.model === taskModel && p.thinkingLevel === taskThinking && !p.isAutoProfile
      );
      return matchingProfile?.id || 'custom';
    }
    return settings.selectedAgentProfile || 'auto';
  });
  const [model, setModel] = useState<ModelType | ''>(task.metadata?.model || selectedProfile.model);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel | ''>(
    task.metadata?.thinkingLevel || selectedProfile.thinkingLevel
  );
  // Auto profile - per-phase configuration
  const [phaseModels, setPhaseModels] = useState<PhaseModelConfig | undefined>(
    task.metadata?.phaseModels || selectedProfile.phaseModels || DEFAULT_PHASE_MODELS
  );
  const [phaseThinking, setPhaseThinking] = useState<PhaseThinkingConfig | undefined>(
    task.metadata?.phaseThinking || selectedProfile.phaseThinking || DEFAULT_PHASE_THINKING
  );

  // Image attachments
  const [images, setImages] = useState<ImageAttachment[]>(task.metadata?.attachedImages || []);

  // Review setting
  const [requireReviewBeforeCoding, setRequireReviewBeforeCoding] = useState(
    task.metadata?.requireReviewBeforeCoding ?? false
  );

  // Ref for the textarea to handle paste events
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Drag-and-drop state for images over textarea
  const [isDragOverTextarea, setIsDragOverTextarea] = useState(false);

  // Reset form when task changes or dialog opens
  useEffect(() => {
    if (open) {
      setTitle(task.title);
      setDescription(task.description);
      setCategory(task.metadata?.category || '');
      setPriority(task.metadata?.priority || '');
      setComplexity(task.metadata?.complexity || '');
      setImpact(task.metadata?.impact || '');

      // Reset model configuration
      const taskModel = task.metadata?.model;
      const taskThinking = task.metadata?.thinkingLevel;
      const isAutoProfile = task.metadata?.isAutoProfile;

      if (isAutoProfile) {
        setProfileId('auto');
        setModel(taskModel || selectedProfile.model);
        setThinkingLevel(taskThinking || selectedProfile.thinkingLevel);
        setPhaseModels(task.metadata?.phaseModels || DEFAULT_PHASE_MODELS);
        setPhaseThinking(task.metadata?.phaseThinking || DEFAULT_PHASE_THINKING);
      } else if (taskModel && taskThinking) {
        const matchingProfile = DEFAULT_AGENT_PROFILES.find(
          p => p.model === taskModel && p.thinkingLevel === taskThinking && !p.isAutoProfile
        );
        setProfileId(matchingProfile?.id || 'custom');
        setModel(taskModel);
        setThinkingLevel(taskThinking);
        setPhaseModels(DEFAULT_PHASE_MODELS);
        setPhaseThinking(DEFAULT_PHASE_THINKING);
      } else {
        setProfileId(settings.selectedAgentProfile || 'auto');
        setModel(selectedProfile.model);
        setThinkingLevel(selectedProfile.thinkingLevel);
        setPhaseModels(selectedProfile.phaseModels || DEFAULT_PHASE_MODELS);
        setPhaseThinking(selectedProfile.phaseThinking || DEFAULT_PHASE_THINKING);
      }

      setImages(task.metadata?.attachedImages || []);
      setRequireReviewBeforeCoding(task.metadata?.requireReviewBeforeCoding ?? false);
      setError(null);

      // Auto-expand sections if they have content
      if (task.metadata?.category || task.metadata?.priority || task.metadata?.complexity || task.metadata?.impact) {
        setShowAdvanced(true);
      }
      // Auto-expand images section if task has images
      setShowImages((task.metadata?.attachedImages || []).length > 0);
      setPasteSuccess(false);
    }
  }, [open, task, settings.selectedAgentProfile, selectedProfile.model, selectedProfile.thinkingLevel]);

  /**
   * Handle paste event for screenshot support
   */
  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardItems = e.clipboardData?.items;
    if (!clipboardItems) return;

    // Find image items in clipboard
    const imageItems: DataTransferItem[] = [];
    for (let i = 0; i < clipboardItems.length; i++) {
      const item = clipboardItems[i];
      if (item.type.startsWith('image/')) {
        imageItems.push(item);
      }
    }

    // If no images, allow normal paste behavior
    if (imageItems.length === 0) return;

    // Prevent default paste when we have images
    e.preventDefault();

    // Check if we can add more images
    const remainingSlots = MAX_IMAGES_PER_TASK - images.length;
    if (remainingSlots <= 0) {
      setError(`Maximum of ${MAX_IMAGES_PER_TASK} images allowed`);
      return;
    }

    setError(null);

    // Process image items
    const newImages: ImageAttachment[] = [];
    const existingFilenames = images.map(img => img.filename);

    for (const item of imageItems.slice(0, remainingSlots)) {
      const file = item.getAsFile();
      if (!file) continue;

      // Validate image type
      if (!isValidImageMimeType(file.type)) {
        setError(`Invalid image type. Allowed: ${ALLOWED_IMAGE_TYPES_DISPLAY}`);
        continue;
      }

      try {
        const dataUrl = await blobToBase64(file);
        const thumbnail = await createThumbnail(dataUrl);

        // Generate filename for pasted images (screenshot-timestamp.ext)
        const extension = file.type.split('/')[1] || 'png';
        const baseFilename = `screenshot-${Date.now()}.${extension}`;
        const resolvedFilename = resolveFilename(baseFilename, [
          ...existingFilenames,
          ...newImages.map(img => img.filename)
        ]);

        newImages.push({
          id: generateImageId(),
          filename: resolvedFilename,
          mimeType: file.type,
          size: file.size,
          data: dataUrl.split(',')[1], // Store base64 without data URL prefix
          thumbnail
        });
      } catch {
        setError('Failed to process pasted image');
      }
    }

    if (newImages.length > 0) {
      setImages(prev => [...prev, ...newImages]);
      // Auto-expand images section
      setShowImages(true);
      // Show success feedback
      setPasteSuccess(true);
      setTimeout(() => setPasteSuccess(false), 2000);
    }
  }, [images]);

  /**
   * Handle drag over textarea for image drops
   */
  const handleTextareaDragOver = useCallback((e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverTextarea(true);
  }, []);

  /**
   * Handle drag leave from textarea
   */
  const handleTextareaDragLeave = useCallback((e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverTextarea(false);
  }, []);

  /**
   * Handle drop on textarea for image files
   */
  const handleTextareaDrop = useCallback(
    async (e: DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOverTextarea(false);

      if (isSaving) return;

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      // Filter for image files
      const imageFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          imageFiles.push(file);
        }
      }

      if (imageFiles.length === 0) return;

      // Check if we can add more images
      const remainingSlots = MAX_IMAGES_PER_TASK - images.length;
      if (remainingSlots <= 0) {
        setError(`Maximum of ${MAX_IMAGES_PER_TASK} images allowed`);
        return;
      }

      setError(null);

      // Process image files
      const newImages: ImageAttachment[] = [];
      const existingFilenames = images.map(img => img.filename);

      for (const file of imageFiles.slice(0, remainingSlots)) {
        // Validate image type
        if (!isValidImageMimeType(file.type)) {
          setError(`Invalid image type. Allowed: ${ALLOWED_IMAGE_TYPES_DISPLAY}`);
          continue;
        }

        try {
          const dataUrl = await blobToBase64(file);
          const thumbnail = await createThumbnail(dataUrl);

          // Use original filename or generate one
          const baseFilename = file.name || `dropped-image-${Date.now()}.${file.type.split('/')[1] || 'png'}`;
          const resolvedFilename = resolveFilename(baseFilename, [
            ...existingFilenames,
            ...newImages.map(img => img.filename)
          ]);

          newImages.push({
            id: generateImageId(),
            filename: resolvedFilename,
            mimeType: file.type,
            size: file.size,
            data: dataUrl.split(',')[1], // Store base64 without data URL prefix
            thumbnail
          });
        } catch {
          setError('Failed to process dropped image');
        }
      }

      if (newImages.length > 0) {
        setImages(prev => [...prev, ...newImages]);
        // Auto-expand images section
        setShowImages(true);
        // Show success feedback
        setPasteSuccess(true);
        setTimeout(() => setPasteSuccess(false), 2000);
      }
    },
    [images, isSaving]
  );

  const handleSave = async () => {
    // Validate input - only description is required
    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    // Check if anything changed
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const hasChanges =
      trimmedTitle !== task.title ||
      trimmedDescription !== task.description ||
      category !== (task.metadata?.category || '') ||
      priority !== (task.metadata?.priority || '') ||
      complexity !== (task.metadata?.complexity || '') ||
      impact !== (task.metadata?.impact || '') ||
      model !== (task.metadata?.model || '') ||
      thinkingLevel !== (task.metadata?.thinkingLevel || '') ||
      requireReviewBeforeCoding !== (task.metadata?.requireReviewBeforeCoding ?? false) ||
      JSON.stringify(images) !== JSON.stringify(task.metadata?.attachedImages || []);

    if (!hasChanges) {
      // No changes, just close
      onOpenChange(false);
      return;
    }

    setIsSaving(true);
    setError(null);

    // Build metadata updates
    const metadataUpdates: Partial<typeof task.metadata> = {};
    if (category) metadataUpdates.category = category;
    if (priority) metadataUpdates.priority = priority;
    if (complexity) metadataUpdates.complexity = complexity;
    if (impact) metadataUpdates.impact = impact;
    if (model) metadataUpdates.model = model as ModelType;
    if (thinkingLevel) metadataUpdates.thinkingLevel = thinkingLevel as ThinkingLevel;
    // Auto profile - per-phase configuration
    if (profileId === 'auto') {
      metadataUpdates.isAutoProfile = true;
      if (phaseModels) metadataUpdates.phaseModels = phaseModels;
      if (phaseThinking) metadataUpdates.phaseThinking = phaseThinking;
    } else {
      // Clear auto profile fields if switching away from auto
      metadataUpdates.isAutoProfile = false;
    }
    if (images.length > 0) metadataUpdates.attachedImages = images;
    metadataUpdates.requireReviewBeforeCoding = requireReviewBeforeCoding;

    // Title is optional - if empty, it will be auto-generated by the backend
    const success = await persistUpdateTask(task.id, {
      title: trimmedTitle,
      description: trimmedDescription,
      metadata: metadataUpdates
    });

    if (success) {
      onOpenChange(false);
      onSaved?.();
    } else {
      setError('Failed to update task. Please try again.');
    }

    setIsSaving(false);
  };

  const handleClose = () => {
    if (!isSaving) {
      onOpenChange(false);
    }
  };

  // Only description is required - title will be auto-generated if empty
  const isValid = description.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Task</DialogTitle>
          <DialogDescription>
            Update task details including title, description, classification, images, and settings. Changes will be saved to the spec files.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Description (Primary - Required) */}
          <div className="space-y-2">
            <Label htmlFor="edit-description" className="text-sm font-medium text-foreground">
              Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              ref={descriptionRef}
              id="edit-description"
              placeholder="Describe the feature, bug fix, or improvement. Be as specific as possible about requirements, constraints, and expected behavior."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onPaste={handlePaste}
              onDragOver={handleTextareaDragOver}
              onDragLeave={handleTextareaDragLeave}
              onDrop={handleTextareaDrop}
              rows={5}
              disabled={isSaving}
              className={cn(
                isDragOverTextarea && !isSaving && "border-primary bg-primary/5 ring-2 ring-primary/20"
              )}
            />
            <p className="text-xs text-muted-foreground">
              Tip: Paste screenshots directly with {navigator.platform.includes('Mac') ? '⌘V' : 'Ctrl+V'} to add reference images.
            </p>
          </div>

          {/* Title (Optional - Auto-generated if empty) */}
          <div className="space-y-2">
            <Label htmlFor="edit-title" className="text-sm font-medium text-foreground">
              Task Title <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="edit-title"
              placeholder="Leave empty to auto-generate from description"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              A short, descriptive title will be generated automatically if left empty.
            </p>
          </div>

          {/* Agent Profile Selection */}
          <AgentProfileSelector
            profileId={profileId}
            model={model}
            thinkingLevel={thinkingLevel}
            phaseModels={phaseModels}
            phaseThinking={phaseThinking}
            onProfileChange={(newProfileId, newModel, newThinkingLevel) => {
              setProfileId(newProfileId);
              setModel(newModel);
              setThinkingLevel(newThinkingLevel);
            }}
            onModelChange={setModel}
            onThinkingLevelChange={setThinkingLevel}
            onPhaseModelsChange={setPhaseModels}
            onPhaseThinkingChange={setPhaseThinking}
            disabled={isSaving}
          />

          {/* Paste Success Indicator */}
          {pasteSuccess && (
            <div className="flex items-center gap-2 text-sm text-success animate-in fade-in slide-in-from-top-1 duration-200">
              <ImageIcon className="h-4 w-4" />
              Image added successfully!
            </div>
          )}

          {/* Advanced Options Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={cn(
              'flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors',
              'w-full justify-between py-2 px-3 rounded-md hover:bg-muted/50'
            )}
            disabled={isSaving}
          >
            <span>Classification (optional)</span>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
              <div className="grid grid-cols-2 gap-4">
                {/* Category */}
                <div className="space-y-2">
                  <Label htmlFor="edit-category" className="text-xs font-medium text-muted-foreground">
                    Category
                  </Label>
                  <Select
                    value={category}
                    onValueChange={(value) => setCategory(value as TaskCategory)}
                    disabled={isSaving}
                  >
                    <SelectTrigger id="edit-category" className="h-9">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TASK_CATEGORY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Priority */}
                <div className="space-y-2">
                  <Label htmlFor="edit-priority" className="text-xs font-medium text-muted-foreground">
                    Priority
                  </Label>
                  <Select
                    value={priority}
                    onValueChange={(value) => setPriority(value as TaskPriority)}
                    disabled={isSaving}
                  >
                    <SelectTrigger id="edit-priority" className="h-9">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Complexity */}
                <div className="space-y-2">
                  <Label htmlFor="edit-complexity" className="text-xs font-medium text-muted-foreground">
                    Complexity
                  </Label>
                  <Select
                    value={complexity}
                    onValueChange={(value) => setComplexity(value as TaskComplexity)}
                    disabled={isSaving}
                  >
                    <SelectTrigger id="edit-complexity" className="h-9">
                      <SelectValue placeholder="Select complexity" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TASK_COMPLEXITY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Impact */}
                <div className="space-y-2">
                  <Label htmlFor="edit-impact" className="text-xs font-medium text-muted-foreground">
                    Impact
                  </Label>
                  <Select
                    value={impact}
                    onValueChange={(value) => setImpact(value as TaskImpact)}
                    disabled={isSaving}
                  >
                    <SelectTrigger id="edit-impact" className="h-9">
                      <SelectValue placeholder="Select impact" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TASK_IMPACT_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                These labels help organize and prioritize tasks. They&apos;re optional but useful for filtering.
              </p>
            </div>
          )}

          {/* Images Toggle */}
          <button
            type="button"
            onClick={() => setShowImages(!showImages)}
            className={cn(
              'flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors',
              'w-full justify-between py-2 px-3 rounded-md hover:bg-muted/50'
            )}
            disabled={isSaving}
          >
            <span className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Reference Images (optional)
              {images.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {images.length}
                </span>
              )}
            </span>
            {showImages ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {/* Image Upload Section */}
          {showImages && (
            <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/30">
              <p className="text-xs text-muted-foreground">
                Attach screenshots, mockups, or diagrams to provide visual context for the AI.
              </p>
              <ImageUpload
                images={images}
                onImagesChange={setImages}
                disabled={isSaving}
              />
            </div>
          )}

          {/* Review Requirement Toggle */}
          <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/30">
            <Checkbox
              id="edit-require-review"
              checked={requireReviewBeforeCoding}
              onCheckedChange={(checked) => setRequireReviewBeforeCoding(checked === true)}
              disabled={isSaving}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-1">
              <Label
                htmlFor="edit-require-review"
                className="text-sm font-medium text-foreground cursor-pointer"
              >
                Require human review before coding
              </Label>
              <p className="text-xs text-muted-foreground">
                When enabled, you&apos;ll be prompted to review the spec and implementation plan before the coding phase begins. This allows you to approve, request changes, or provide feedback.
              </p>
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
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
