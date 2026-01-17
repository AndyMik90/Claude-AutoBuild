import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';

interface QueueSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  currentMaxParallel?: number;
  onSave: (maxParallel: number) => void;
}

export function QueueSettingsModal({
  open,
  onOpenChange,
  projectId,
  currentMaxParallel = 3,
  onSave
}: QueueSettingsModalProps) {
  const { t } = useTranslation('tasks');
  const [maxParallel, setMaxParallel] = useState(currentMaxParallel);
  const [error, setError] = useState<string | null>(null);

  // Reset to current value when modal opens
  useEffect(() => {
    if (open) {
      setMaxParallel(currentMaxParallel);
      setError(null);
    }
  }, [open, currentMaxParallel]);

  const handleSave = () => {
    // Validate the input
    if (maxParallel < 1) {
      setError('Must be at least 1');
      return;
    }
    if (maxParallel > 10) {
      setError('Cannot exceed 10');
      return;
    }

    onSave(maxParallel);
    onOpenChange(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setMaxParallel(value);
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Queue Settings</DialogTitle>
          <DialogDescription>
            Configure the maximum number of tasks that can run in parallel in the "In Progress" board
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="maxParallel">
              Max Parallel Tasks
            </Label>
            <Input
              id="maxParallel"
              type="number"
              min={1}
              max={10}
              value={maxParallel}
              onChange={handleInputChange}
              className="w-full"
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <p className="text-sm text-muted-foreground">
              When this limit is reached, new tasks will wait in the queue before moving to "In Progress"
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
