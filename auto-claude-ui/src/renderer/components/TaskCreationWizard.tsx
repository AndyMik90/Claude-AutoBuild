import { useState, useEffect, useCallback, useRef, useMemo, type ClipboardEvent } from 'react';
import {
  DndContext,
  DragOverlay,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { Loader2, ChevronDown, ChevronUp, Image as ImageIcon, X, RotateCcw, File, Folder, FolderTree, FileDown } from 'lucide-react';
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
import { ReferencedFilesSection } from './ReferencedFilesSection';
import { TaskFileExplorerDrawer } from './TaskFileExplorerDrawer';
import { createTask, saveDraft, loadDraft, clearDraft, isDraftEmpty } from '../stores/task-store';
import { useProjectStore } from '../stores/project-store';
import { cn } from '../lib/utils';
import type { TaskCategory, TaskPriority, TaskComplexity, TaskImpact, TaskMetadata, ImageAttachment, TaskDraft, ModelType, ThinkingLevel, ReferencedFile } from '../../shared/types';
import {
  TASK_CATEGORY_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_COMPLEXITY_LABELS,
  TASK_IMPACT_LABELS,
  MAX_IMAGES_PER_TASK,
  MAX_REFERENCED_FILES,
  ALLOWED_IMAGE_TYPES_DISPLAY,
  DEFAULT_AGENT_PROFILES,
  AVAILABLE_MODELS,
  THINKING_LEVELS
} from '../../shared/constants';
import { useSettingsStore } from '../stores/settings-store';

interface TaskCreationWizardProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskCreationWizard({
  projectId,
  open,
  onOpenChange
}: TaskCreationWizardProps) {
  // Get selected agent profile from settings
  const { settings } = useSettingsStore();
  const selectedProfile = DEFAULT_AGENT_PROFILES.find(
    p => p.id === settings.selectedAgentProfile
  ) || DEFAULT_AGENT_PROFILES.find(p => p.id === 'balanced')!;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showFileExplorer, setShowFileExplorer] = useState(false);

  // Get project path from project store
  const projects = useProjectStore((state) => state.projects);
  const projectPath = useMemo(() => {
    const project = projects.find((p) => p.id === projectId);
    return project?.path ?? null;
  }, [projects, projectId]);

  // Metadata fields
  const [category, setCategory] = useState<TaskCategory | ''>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [complexity, setComplexity] = useState<TaskComplexity | ''>('');
  const [impact, setImpact] = useState<TaskImpact | ''>('');

  // Model configuration (initialized from selected agent profile)
  const [model, setModel] = useState<ModelType | ''>(selectedProfile.model);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel | ''>(selectedProfile.thinkingLevel);

  // Image attachments
  const [images, setImages] = useState<ImageAttachment[]>([]);

  // Referenced files from file explorer
  const [referencedFiles, setReferencedFiles] = useState<ReferencedFile[]>([]);

  // Review setting
  const [requireReviewBeforeCoding, setRequireReviewBeforeCoding] = useState(false);

  // Draft state
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const [pasteSuccess, setPasteSuccess] = useState(false);

  // Drag-and-drop state for file references
  const [activeDragData, setActiveDragData] = useState<{
    path: string;
    name: string;
    isDirectory: boolean;
  } | null>(null);

  // Ref for the textarea to handle paste events
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Setup drag sensors with distance constraint to prevent accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    })
  );

  // Setup drop zone for file references
  const { setNodeRef: setDropRef, isOver: isOverDropZone } = useDroppable({
    id: 'file-drop-zone',
    data: { type: 'file-drop-zone' }
  });

  // Determine if drop zone is at capacity
  const isAtMaxFiles = referencedFiles.length >= MAX_REFERENCED_FILES;

  // Load draft when dialog opens, or initialize from selected profile
  useEffect(() => {
    if (open && projectId) {
      const draft = loadDraft(projectId);
      if (draft && !isDraftEmpty(draft)) {
        setTitle(draft.title);
        setDescription(draft.description);
        setCategory(draft.category);
        setPriority(draft.priority);
        setComplexity(draft.complexity);
        setImpact(draft.impact);
        // Load model/thinkingLevel from draft if present, otherwise use profile defaults
        setModel(draft.model || selectedProfile.model);
        setThinkingLevel(draft.thinkingLevel || selectedProfile.thinkingLevel);
        setImages(draft.images);
        setReferencedFiles(draft.referencedFiles ?? []);
        setRequireReviewBeforeCoding(draft.requireReviewBeforeCoding ?? false);
        setIsDraftRestored(true);

        // Expand sections if they have content
        if (draft.category || draft.priority || draft.complexity || draft.impact) {
          setShowAdvanced(true);
        }
        if (draft.images.length > 0) {
          setShowImages(true);
        }
        if (draft.referencedFiles && draft.referencedFiles.length > 0) {
          setShowFiles(true);
        }
      } else {
        // No draft - initialize model/thinkingLevel from selected profile
        setModel(selectedProfile.model);
        setThinkingLevel(selectedProfile.thinkingLevel);
      }
    }
  }, [open, projectId, selectedProfile.model, selectedProfile.thinkingLevel]);

  /**
   * Get current form state as a draft
   */
  const getCurrentDraft = useCallback((): TaskDraft => ({
    projectId,
    title,
    description,
    category,
    priority,
    complexity,
    impact,
    model,
    thinkingLevel,
    images,
    referencedFiles,
    requireReviewBeforeCoding,
    savedAt: new Date()
  }), [projectId, title, description, category, priority, complexity, impact, model, thinkingLevel, images, referencedFiles, requireReviewBeforeCoding]);
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
   * Handle drag start - capture file data for overlay
   */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as {
      type: string;
      path: string;
      name: string;
      isDirectory: boolean;
    } | undefined;

    if (data?.type === 'file') {
      setActiveDragData({
        path: data.path,
        name: data.name,
        isDirectory: data.isDirectory
      });
    }
  }, []);

  /**
   * Handle drag end - add file to referencedFiles when dropped on valid target
   */
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    // Clear drag state
    setActiveDragData(null);

    // If not dropped on a valid target, do nothing
    if (!over) return;

    // Only accept drops on the file-drop-zone
    if (over.id !== 'file-drop-zone') return;

    const data = active.data.current as {
      type?: string;
      path?: string;
      name?: string;
      isDirectory?: boolean;
    } | undefined;

    // Only process file drops
    if (data?.type !== 'file' || !data.path || !data.name) return;

    // Check if we're at the max limit
    if (referencedFiles.length >= MAX_REFERENCED_FILES) {
      setError(`Maximum of ${MAX_REFERENCED_FILES} referenced files allowed`);
      return;
    }

    // Check for duplicates
    if (referencedFiles.some(f => f.path === data.path)) {
      // Silently skip duplicates
      return;
    }

    // Add the file to referenced files
    const newFile: ReferencedFile = {
      id: crypto.randomUUID(),
      path: data.path,
      name: data.name,
      isDirectory: data.isDirectory ?? false,
      addedAt: new Date()
    };

    setReferencedFiles(prev => [...prev, newFile]);

    // Auto-expand the files section when a file is added
    setShowFiles(true);
  }, [referencedFiles]);

  const handleCreate = async () => {
    if (!description.trim()) {
      setError('Please provide a description');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Build metadata from selected values
      const metadata: TaskMetadata = {
        sourceType: 'manual'
      };

      if (category) metadata.category = category;
      if (priority) metadata.priority = priority;
      if (complexity) metadata.complexity = complexity;
      if (impact) metadata.impact = impact;
      if (model) metadata.model = model;
      if (thinkingLevel) metadata.thinkingLevel = thinkingLevel;
      if (images.length > 0) metadata.attachedImages = images;
      if (referencedFiles.length > 0) metadata.referencedFiles = referencedFiles;
      if (requireReviewBeforeCoding) metadata.requireReviewBeforeCoding = true;

      // Title is optional - if empty, it will be auto-generated by the backend
      const task = await createTask(projectId, title.trim(), description.trim(), metadata);
      if (task) {
        // Clear draft on successful creation
        clearDraft(projectId);
        // Reset form and close
        resetForm();
        onOpenChange(false);
      } else {
        setError('Failed to create task. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCategory('');
    setPriority('');
    setComplexity('');
    setImpact('');
    // Reset model/thinkingLevel to selected profile defaults
    setModel(selectedProfile.model);
    setThinkingLevel(selectedProfile.thinkingLevel);
    setImages([]);
    setReferencedFiles([]);
    setRequireReviewBeforeCoding(false);
    setError(null);
    setShowAdvanced(false);
    setShowImages(false);
    setShowFiles(false);
    setShowFileExplorer(false);
    setIsDraftRestored(false);
    setPasteSuccess(false);
  };

  /**
   * Handle dialog close - save draft if content exists
   */
  const handleClose = () => {
    if (isCreating) return;

    const draft = getCurrentDraft();

    // Save draft if there's any content
    if (!isDraftEmpty(draft)) {
      saveDraft(draft);
    } else {
      // Clear any existing draft if form is empty
      clearDraft(projectId);
    }

    resetForm();
    onOpenChange(false);
  };

  /**
   * Discard draft and start fresh
   */
  const handleDiscardDraft = () => {
    clearDraft(projectId);
    resetForm();
    setError(null);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className={cn(
            "max-h-[90vh] p-0 overflow-hidden transition-all duration-300 ease-out",
            showFileExplorer ? "sm:max-w-[900px]" : "sm:max-w-[550px]"
          )}
          hideCloseButton={showFileExplorer}
        >
          <div className="flex h-full min-h-0 overflow-hidden">
            {/* Form content */}
            <div className="flex-1 flex flex-col p-6 min-w-0 min-h-0 overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-foreground">Create New Task</DialogTitle>
            {isDraftRestored && (
              <div className="flex items-center gap-2">
                <span className="text-xs bg-info/10 text-info px-2 py-1 rounded-md">
                  Draft restored
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleDiscardDraft}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Start Fresh
                </Button>
              </div>
            )}
          </div>
          <DialogDescription>
            Describe what you want to build. The AI will analyze your request and
            create a detailed specification.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Description (Primary - Required) */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium text-foreground">
              Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              ref={descriptionRef}
              id="description"
              placeholder="Describe the feature, bug fix, or improvement you want to implement. Be as specific as possible about requirements, constraints, and expected behavior."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onPaste={handlePaste}
              rows={5}
              disabled={isCreating}
              className="resize-y min-h-[120px] max-h-[400px]"
            />
            <p className="text-xs text-muted-foreground">
              Tip: Paste screenshots directly with {navigator.platform.includes('Mac') ? '⌘V' : 'Ctrl+V'} to add reference images.
            </p>
          </div>

          {/* Title (Optional - Auto-generated if empty) */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium text-foreground">
              Task Title <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="title"
              placeholder="Leave empty to auto-generate from description"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              A short, descriptive title will be generated automatically if left empty.
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <Label htmlFor="model" className="text-sm font-medium text-foreground">
              Model
            </Label>
            <Select
              value={model}
              onValueChange={(value) => setModel(value as ModelType)}
              disabled={isCreating}
            >
              <SelectTrigger id="model" className="h-9">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The Claude model to use for this task. Defaults to your selected agent profile.
            </p>
          </div>

          {/* Thinking Level Selection */}
          <div className="space-y-2">
            <Label htmlFor="thinking-level" className="text-sm font-medium text-foreground">
              Thinking Level
            </Label>
            <Select
              value={thinkingLevel}
              onValueChange={(value) => setThinkingLevel(value as ThinkingLevel)}
              disabled={isCreating}
            >
              <SelectTrigger id="thinking-level" className="h-9">
                <SelectValue placeholder="Select thinking level" />
              </SelectTrigger>
              <SelectContent>
                {THINKING_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Extended thinking depth for complex reasoning. Higher levels use more tokens but provide deeper analysis.
            </p>
          </div>

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
            disabled={isCreating}
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
                  <Label htmlFor="category" className="text-xs font-medium text-muted-foreground">
                    Category
                  </Label>
                  <Select
                    value={category}
                    onValueChange={(value) => setCategory(value as TaskCategory)}
                    disabled={isCreating}
                  >
                    <SelectTrigger id="category" className="h-9">
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
                  <Label htmlFor="priority" className="text-xs font-medium text-muted-foreground">
                    Priority
                  </Label>
                  <Select
                    value={priority}
                    onValueChange={(value) => setPriority(value as TaskPriority)}
                    disabled={isCreating}
                  >
                    <SelectTrigger id="priority" className="h-9">
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
                  <Label htmlFor="complexity" className="text-xs font-medium text-muted-foreground">
                    Complexity
                  </Label>
                  <Select
                    value={complexity}
                    onValueChange={(value) => setComplexity(value as TaskComplexity)}
                    disabled={isCreating}
                  >
                    <SelectTrigger id="complexity" className="h-9">
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
                  <Label htmlFor="impact" className="text-xs font-medium text-muted-foreground">
                    Impact
                  </Label>
                  <Select
                    value={impact}
                    onValueChange={(value) => setImpact(value as TaskImpact)}
                    disabled={isCreating}
                  >
                    <SelectTrigger id="impact" className="h-9">
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
            disabled={isCreating}
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
                disabled={isCreating}
              />
            </div>
          )}

          {/* Referenced Files Section - Drop Zone */}
          {showFiles ? (
            <div
              ref={setDropRef}
              className={cn(
                "space-y-3 p-4 rounded-lg border bg-muted/30 relative transition-all",
                isOverDropZone && !isAtMaxFiles && "ring-2 ring-info border-info",
                isOverDropZone && isAtMaxFiles && "ring-2 ring-warning border-warning",
                !isOverDropZone && "border-border"
              )}
            >
              {/* Drop zone overlay indicator */}
              {isOverDropZone && (
                <div className={cn(
                  "absolute inset-0 z-10 flex items-center justify-center pointer-events-none rounded-lg",
                  isAtMaxFiles ? "bg-warning/10" : "bg-info/10"
                )}>
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md",
                    isAtMaxFiles ? "bg-warning/90 text-warning-foreground" : "bg-info/90 text-info-foreground"
                  )}>
                    <FileDown className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {isAtMaxFiles ? `Max ${MAX_REFERENCED_FILES} files reached` : 'Drop to add reference'}
                    </span>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Reference specific files or folders from your project to provide context for the AI.
              </p>
              <ReferencedFilesSection
                files={referencedFiles}
                onRemove={(id) => setReferencedFiles(prev => prev.filter(f => f.id !== id))}
                maxFiles={MAX_REFERENCED_FILES}
                disabled={isCreating}
              />
              {referencedFiles.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No files referenced yet. Drag files from the file explorer to add them.
                </p>
              )}
            </div>
          ) : (
            /* Compact drop zone when section is collapsed - only visible during drag */
            activeDragData && (
              <div
                ref={setDropRef}
                className={cn(
                  "p-3 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 transition-all animate-in fade-in slide-in-from-top-2 duration-200",
                  isOverDropZone && !isAtMaxFiles && "border-info bg-info/10",
                  isOverDropZone && isAtMaxFiles && "border-warning bg-warning/10",
                  !isOverDropZone && "border-muted-foreground/30 bg-muted/20"
                )}
              >
                <FileDown className={cn(
                  "h-4 w-4",
                  isOverDropZone && !isAtMaxFiles && "text-info",
                  isOverDropZone && isAtMaxFiles && "text-warning",
                  !isOverDropZone && "text-muted-foreground"
                )} />
                <span className={cn(
                  "text-sm",
                  isOverDropZone && !isAtMaxFiles && "text-info font-medium",
                  isOverDropZone && isAtMaxFiles && "text-warning font-medium",
                  !isOverDropZone && "text-muted-foreground"
                )}>
                  {isAtMaxFiles ? `Max ${MAX_REFERENCED_FILES} files reached` : 'Drop file here to add reference'}
                </span>
              </div>
            )
          )}

          {/* Review Requirement Toggle */}
          <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/30">
            <Checkbox
              id="require-review"
              checked={requireReviewBeforeCoding}
              onCheckedChange={(checked) => setRequireReviewBeforeCoding(checked === true)}
              disabled={isCreating}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-1">
              <Label
                htmlFor="require-review"
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
          <div className="flex items-center gap-2">
            {/* File Explorer Toggle Button */}
            {projectPath && (
              <Button
                type="button"
                variant={showFileExplorer ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowFileExplorer(!showFileExplorer)}
                disabled={isCreating}
                className="gap-1.5"
              >
                <FolderTree className="h-4 w-4" />
                {showFileExplorer ? 'Hide Files' : 'Browse Files'}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating || !description.trim()}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Task'
              )}
            </Button>
          </div>
        </DialogFooter>
            </div>

            {/* File Explorer Drawer */}
            {projectPath && (
              <TaskFileExplorerDrawer
                isOpen={showFileExplorer}
                onClose={() => setShowFileExplorer(false)}
                projectPath={projectPath}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Drag overlay - shows what's being dragged */}
      <DragOverlay>
        {activeDragData && (
          <div className="flex items-center gap-2 bg-card border border-border rounded-md px-3 py-2 shadow-lg">
            {activeDragData.isDirectory ? (
              <Folder className="h-4 w-4 text-warning" />
            ) : (
              <File className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm">{activeDragData.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
