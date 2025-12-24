/**
 * BlueprintView Component
 *
 * Displays the BMAD blueprint with sequential component execution tracking.
 * Shows progress, component status, and allows quick actions like
 * "Work on Next" or "Fix Component X".
 */

import { useState, useEffect } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ChevronRight,
  RefreshCw,
  FileCode,
  Target,
  Loader2,
  Wrench,
  Eye,
  Plus,
  Trash2
} from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from './ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from './ui/dialog';
import { Separator } from './ui/separator';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { cn } from '../lib/utils';
import { useProjectStore } from '../stores/project-store';

// Types matching Python blueprint.py
type ComponentStatus = 'pending' | 'in_progress' | 'verifying' | 'verified' | 'failed' | 'blocked';

interface AcceptanceCriterion {
  description: string;
  verified: boolean;
  verified_at?: string;
  notes?: string;
}

interface BlueprintComponent {
  id: string;
  name: string;
  description: string;
  status: ComponentStatus;
  files: string[];
  acceptance_criteria: AcceptanceCriterion[];
  dependencies: string[];
  started_at?: string;
  completed_at?: string;
  attempts: number;
  notes: string[];
  implementation_notes?: string;
  key_decisions: string[];
}

interface Blueprint {
  name: string;
  version: string;
  description: string;
  created_at: string;
  created_by: string;
  project_path?: string;
  spec_id?: string;
  strictness: string;
  components: BlueprintComponent[];
}

interface BlueprintViewProps {
  blueprintPath?: string;
}

// Status color mapping
const statusColors: Record<ComponentStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-500/20 text-blue-500 border-blue-500/50',
  verifying: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50',
  verified: 'bg-green-500/20 text-green-500 border-green-500/50',
  failed: 'bg-red-500/20 text-red-500 border-red-500/50',
  blocked: 'bg-orange-500/20 text-orange-500 border-orange-500/50'
};

// Status icons
const StatusIcon = ({ status }: { status: ComponentStatus }) => {
  switch (status) {
    case 'pending':
      return <Clock className="h-4 w-4" />;
    case 'in_progress':
      return <Loader2 className="h-4 w-4 animate-spin" />;
    case 'verifying':
      return <Eye className="h-4 w-4" />;
    case 'verified':
      return <CheckCircle2 className="h-4 w-4" />;
    case 'failed':
      return <XCircle className="h-4 w-4" />;
    case 'blocked':
      return <AlertCircle className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
};

// Component card
const ComponentCard = ({
  component,
  index,
  total,
  isNext,
  onClick
}: {
  component: BlueprintComponent;
  index: number;
  total: number;
  isNext: boolean;
  onClick: () => void;
}) => {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        isNext && 'ring-2 ring-primary ring-offset-2',
        component.status === 'verified' && 'opacity-75'
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-mono">
              {String(index + 1).padStart(2, '0')}/{String(total).padStart(2, '0')}
            </span>
            <CardTitle className="text-base">{component.name}</CardTitle>
          </div>
          <Badge
            variant="outline"
            className={cn('flex items-center gap-1', statusColors[component.status])}
          >
            <StatusIcon status={component.status} />
            <span className="capitalize">{component.status.replace('_', ' ')}</span>
          </Badge>
        </div>
        <CardDescription className="line-clamp-2">
          {component.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <FileCode className="h-3 w-3" />
            <span>{component.files.length} files</span>
          </div>
          <div className="flex items-center gap-1">
            <Target className="h-3 w-3" />
            <span>
              {component.acceptance_criteria.filter((c) => c.verified).length}/
              {component.acceptance_criteria.length} criteria
            </span>
          </div>
          {component.attempts > 0 && (
            <div className="flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              <span>{component.attempts} attempts</span>
            </div>
          )}
        </div>
        {isNext && (
          <div className="mt-2 flex items-center gap-1 text-xs text-primary">
            <ChevronRight className="h-3 w-3" />
            <span>Next up</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Component detail dialog
const ComponentDetailDialog = ({
  component,
  open,
  onClose,
  onFix
}: {
  component: BlueprintComponent | null;
  open: boolean;
  onClose: () => void;
  onFix: (id: string) => void;
}) => {
  if (!component) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn('flex items-center gap-1', statusColors[component.status])}
            >
              <StatusIcon status={component.status} />
              <span className="capitalize">{component.status.replace('_', ' ')}</span>
            </Badge>
            {component.name}
          </DialogTitle>
          <DialogDescription>{component.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Files */}
          <div>
            <h4 className="text-sm font-medium mb-2">Files</h4>
            <div className="bg-muted rounded-md p-2 space-y-1">
              {component.files.map((file, i) => (
                <div key={i} className="text-xs font-mono flex items-center gap-2">
                  <FileCode className="h-3 w-3 text-muted-foreground" />
                  {file}
                </div>
              ))}
              {component.files.length === 0 && (
                <div className="text-xs text-muted-foreground">No files specified</div>
              )}
            </div>
          </div>

          {/* Acceptance Criteria */}
          <div>
            <h4 className="text-sm font-medium mb-2">Acceptance Criteria</h4>
            <div className="space-y-2">
              {component.acceptance_criteria.map((criterion, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-start gap-2 text-sm p-2 rounded-md',
                    criterion.verified ? 'bg-green-500/10' : 'bg-muted'
                  )}
                >
                  {criterion.verified ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 mt-0.5" />
                  )}
                  <span>{criterion.description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dependencies */}
          {component.dependencies.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Dependencies</h4>
              <div className="flex flex-wrap gap-2">
                {component.dependencies.map((dep) => (
                  <Badge key={dep} variant="secondary">
                    {dep}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Implementation Notes */}
          {component.implementation_notes && (
            <div>
              <h4 className="text-sm font-medium mb-2">Implementation Notes</h4>
              <div className="text-sm text-muted-foreground bg-muted rounded-md p-3">
                {component.implementation_notes}
              </div>
            </div>
          )}

          {/* Key Decisions */}
          {component.key_decisions.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Key Decisions</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                {component.key_decisions.map((decision, i) => (
                  <li key={i}>{decision}</li>
                ))}
              </ul>
            </div>
          )}

          {/* History */}
          {component.notes.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">History</h4>
              <div className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                {component.notes.map((note, i) => (
                  <div key={i} className="font-mono">
                    {note}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {component.status === 'failed' && (
            <Button variant="destructive" onClick={() => onFix(component.id)}>
              <Wrench className="h-4 w-4 mr-2" />
              Fix Component
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export function BlueprintView({ blueprintPath }: BlueprintViewProps) {
  const selectedProject = useProjectStore((state) => state.getSelectedProject());
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<BlueprintComponent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Create blueprint dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBlueprint, setNewBlueprint] = useState({
    name: '',
    description: '',
    components: [{ name: '', description: '', files: '', acceptance_criteria: '' }]
  });

  // Load blueprint
  useEffect(() => {
    const loadBlueprintData = async () => {
      if (!selectedProject?.path) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Try to load blueprint from project
        const result = await window.electronAPI.loadBlueprint(
          selectedProject.path,
          blueprintPath
        );

        if (result.success && result.blueprint) {
          setBlueprint(result.blueprint);
        } else {
          setBlueprint(null);
        }
      } catch (err) {
        console.error('Failed to load blueprint:', err);
        setError(err instanceof Error ? err.message : 'Failed to load blueprint');
      } finally {
        setLoading(false);
      }
    };

    loadBlueprintData();
  }, [selectedProject?.path, blueprintPath]);

  // Calculate progress
  const progress = blueprint
    ? {
        total: blueprint.components.length,
        completed: blueprint.components.filter((c) => c.status === 'verified').length,
        inProgress: blueprint.components.filter((c) => c.status === 'in_progress').length,
        failed: blueprint.components.filter((c) => c.status === 'failed').length
      }
    : { total: 0, completed: 0, inProgress: 0, failed: 0 };

  const progressPercentage = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

  // Find next pending component
  const nextComponent = blueprint?.components.find(
    (c) => c.status === 'pending' || c.status === 'failed'
  );

  // Handle component click
  const handleComponentClick = (component: BlueprintComponent) => {
    setSelectedComponent(component);
    setDialogOpen(true);
  };

  // Handle fix component
  const handleFixComponent = async (componentId: string) => {
    if (!selectedProject?.path) return;

    try {
      await window.electronAPI.fixComponent(selectedProject.path, componentId);
      setDialogOpen(false);
    } catch (err) {
      console.error('Failed to fix component:', err);
    }
  };

  // Handle start build
  const handleStartBuild = async () => {
    if (!selectedProject?.path) return;

    try {
      await window.electronAPI.startBlueprintBuild(selectedProject.path);
    } catch (err) {
      console.error('Failed to start build:', err);
    }
  };

  // Handle create blueprint
  const handleCreateBlueprint = async () => {
    if (!selectedProject?.path) return;
    if (!newBlueprint.name.trim()) return;

    try {
      setCreating(true);
      const components = newBlueprint.components
        .filter(c => c.name.trim())
        .map(c => ({
          name: c.name.trim(),
          description: c.description.trim(),
          files: c.files.split(',').map(f => f.trim()).filter(Boolean),
          acceptance_criteria: c.acceptance_criteria
            .split('\n')
            .map(ac => ac.trim())
            .filter(Boolean)
            .map(ac => ({ description: ac, verified: false }))
        }));

      const result = await window.electronAPI.createBlueprint(
        selectedProject.path,
        newBlueprint.name.trim(),
        newBlueprint.description.trim(),
        components
      );

      if (result.success && result.blueprint) {
        setBlueprint(result.blueprint);
        setCreateDialogOpen(false);
        setNewBlueprint({
          name: '',
          description: '',
          components: [{ name: '', description: '', files: '', acceptance_criteria: '' }]
        });
      } else {
        setError(result.error || 'Failed to create blueprint');
      }
    } catch (err) {
      console.error('Failed to create blueprint:', err);
      setError(err instanceof Error ? err.message : 'Failed to create blueprint');
    } finally {
      setCreating(false);
    }
  };

  // Add component to form
  const addComponent = () => {
    setNewBlueprint(prev => ({
      ...prev,
      components: [...prev.components, { name: '', description: '', files: '', acceptance_criteria: '' }]
    }));
  };

  // Update component in form
  const updateComponent = (index: number, field: string, value: string) => {
    setNewBlueprint(prev => ({
      ...prev,
      components: prev.components.map((c, i) =>
        i === index ? { ...c, [field]: value } : c
      )
    }));
  };

  // Remove component from form
  const removeComponent = (index: number) => {
    if (newBlueprint.components.length <= 1) return;
    setNewBlueprint(prev => ({
      ...prev,
      components: prev.components.filter((_, i) => i !== index)
    }));
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No blueprint state
  if (!blueprint) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <h3 className="text-lg font-medium">No Blueprint Found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create a blueprint to enable sequential component building with verification gates.
          </p>
        </div>
        <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Blueprint
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none p-4 border-b bg-background">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{blueprint.name}</h2>
            <p className="text-sm text-muted-foreground">
              v{blueprint.version} • Created by {blueprint.created_by}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {blueprint.strictness} mode
            </Badge>
            {nextComponent && (
              <Button onClick={handleStartBuild}>
                <Play className="h-4 w-4 mr-2" />
                Work on Next
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {progress.completed}/{progress.total} components verified
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span>{progress.completed} verified</span>
            </div>
            {progress.inProgress > 0 && (
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span>{progress.inProgress} in progress</span>
              </div>
            )}
            {progress.failed > 0 && (
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <span>{progress.failed} failed</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Component list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {blueprint.components.map((component, index) => (
            <ComponentCard
              key={component.id}
              component={component}
              index={index}
              total={blueprint.components.length}
              isNext={nextComponent?.id === component.id}
              onClick={() => handleComponentClick(component)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Component detail dialog */}
      <ComponentDetailDialog
        component={selectedComponent}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onFix={handleFixComponent}
      />

      {/* Create blueprint dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Blueprint</DialogTitle>
            <DialogDescription>
              Define the components that make up your feature. Each component will be built and verified sequentially.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Blueprint name and description */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="blueprint-name">Blueprint Name</Label>
                <Input
                  id="blueprint-name"
                  placeholder="e.g., Dashboard UI, Authentication System"
                  value={newBlueprint.name}
                  onChange={(e) => setNewBlueprint(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blueprint-description">Description</Label>
                <Textarea
                  id="blueprint-description"
                  placeholder="What does this feature do?"
                  value={newBlueprint.description}
                  onChange={(e) => setNewBlueprint(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>

            <Separator />

            {/* Components */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Components</Label>
                <Button variant="outline" size="sm" onClick={addComponent}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Component
                </Button>
              </div>

              <div className="space-y-4">
                {newBlueprint.components.map((component, index) => (
                  <Card key={index}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">
                          Component {index + 1}
                        </span>
                        {newBlueprint.components.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeComponent(index)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <Label>Component Name</Label>
                        <Input
                          placeholder="e.g., Header Navigation, User Profile Card"
                          value={component.name}
                          onChange={(e) => updateComponent(index, 'name', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          placeholder="What does this component do?"
                          value={component.description}
                          onChange={(e) => updateComponent(index, 'description', e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Files (comma-separated)</Label>
                        <Input
                          placeholder="e.g., src/components/Header.tsx, src/components/Header.css"
                          value={component.files}
                          onChange={(e) => updateComponent(index, 'files', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Acceptance Criteria (one per line)</Label>
                        <Textarea
                          placeholder="Logo displays correctly&#10;Search bar is functional&#10;User menu opens on click"
                          value={component.acceptance_criteria}
                          onChange={(e) => updateComponent(index, 'acceptance_criteria', e.target.value)}
                          rows={3}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateBlueprint}
              disabled={creating || !newBlueprint.name.trim() || !newBlueprint.components.some(c => c.name.trim())}
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Blueprint
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BlueprintView;
