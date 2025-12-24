import { useEffect, useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, MessageCircle } from 'lucide-react';
import { Button } from '../../ui/button';
import { Progress } from '../../ui/progress';
import { Checkbox } from '../../ui/checkbox';
import { ScrollArea } from '../../ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../ui/dialog';
import type { InvestigationDialogProps } from '../types';
import { formatDate } from '../utils';
import type { GitLabNote } from '../../../../shared/types';

/**
 * Renders a dialog UI to create a task from a GitLab issue by selecting which issue notes to include.
 *
 * The dialog fetches and lists non-system notes for the selected issue (selecting all by default),
 * allows toggling individual or all notes, and starts an investigation workflow with the chosen notes.
 *
 * @param open - Whether the dialog is open
 * @param onOpenChange - Callback invoked when the dialog open state should change
 * @param selectedIssue - The GitLab issue to create a task from; its notes are fetched when the dialog opens
 * @param investigationStatus - Current investigation workflow state (phase, message, progress, error) used to drive UI states
 * @param onStartInvestigation - Called with an array of selected note IDs to begin creating the task
 * @param onClose - Callback invoked when the dialog is closed after completion
 * @param projectId - GitLab project identifier used to fetch issue notes
 * @returns A React element rendering the InvestigationDialog UI
 */
export function InvestigationDialog({
  open,
  onOpenChange,
  selectedIssue,
  investigationStatus,
  onStartInvestigation,
  onClose,
  projectId
}: InvestigationDialogProps) {
  const [notes, setNotes] = useState<GitLabNote[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [fetchNotesError, setFetchNotesError] = useState<string | null>(null);

  // Fetch notes when dialog opens
  useEffect(() => {
    if (open && selectedIssue && projectId) {
      let isMounted = true;

      setLoadingNotes(true);
      setNotes([]);
      setSelectedNoteIds([]);
      setFetchNotesError(null);

      window.electronAPI.getGitLabIssueNotes(projectId, selectedIssue.iid)
        .then((result: { success: boolean; data?: GitLabNote[] }) => {
          if (!isMounted) return;
          if (result.success && result.data) {
            // Filter out system notes
            const userNotes = result.data.filter(n => !n.system);
            setNotes(userNotes);
            // By default, select all notes
            setSelectedNoteIds(userNotes.map((n: GitLabNote) => n.id));
          }
        })
        .catch((err: unknown) => {
          if (!isMounted) return;
          console.error('Failed to fetch notes:', err);
          setFetchNotesError(
            err instanceof Error ? err.message : 'Failed to load notes'
          );
        })
        .finally(() => {
          if (isMounted) {
            setLoadingNotes(false);
          }
        });

      return () => {
        isMounted = false;
      };
    }
  }, [open, selectedIssue, projectId]);

  const toggleNote = (noteId: number) => {
    setSelectedNoteIds(prev =>
      prev.includes(noteId)
        ? prev.filter(id => id !== noteId)
        : [...prev, noteId]
    );
  };

  const toggleAllNotes = () => {
    if (selectedNoteIds.length === notes.length) {
      setSelectedNoteIds([]);
    } else {
      setSelectedNoteIds(notes.map(n => n.id));
    }
  };

  const handleStartInvestigation = () => {
    onStartInvestigation(selectedNoteIds);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-info" />
            Create Task from Issue
          </DialogTitle>
          <DialogDescription>
            {selectedIssue && (
              <span>
                Issue #{selectedIssue.iid}: {selectedIssue.title}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {investigationStatus.phase === 'idle' ? (
          <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            <p className="text-sm text-muted-foreground">
              Create a task from this GitLab issue. The task will be added to your Kanban board in the Backlog column.
            </p>

            {/* Notes section */}
            {loadingNotes ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : fetchNotesError ? (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4">
                <p className="text-sm text-destructive font-medium">Failed to load notes</p>
                <p className="text-xs text-destructive/80 mt-1">{fetchNotesError}</p>
              </div>
            ) : notes.length > 0 ? (
              <div className="space-y-2 flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Select Notes to Include ({selectedNoteIds.length}/{notes.length})
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleAllNotes}
                    className="text-xs"
                  >
                    {selectedNoteIds.length === notes.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <ScrollArea className="flex-1 min-h-0 border rounded-md">
                  <div className="p-2 space-y-2">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        role="button"
                        tabIndex={0}
                        className="flex gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                        onClick={() => toggleNote(note.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleNote(note.id);
                          }
                        }}
                      >
                        <Checkbox
                          checked={selectedNoteIds.includes(note.id)}
                          onCheckedChange={() => toggleNote(note.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium">{note.author.username}</span>
                            <span>•</span>
                            <span>{formatDate(note.createdAt)}</span>
                          </div>
                          <p className="text-sm text-foreground whitespace-pre-wrap break-words line-clamp-3">
                            {note.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h4 className="text-sm font-medium mb-2">The task will include:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Issue title and description</li>
                  <li>• Link back to the GitLab issue</li>
                  <li>• Labels and metadata from the issue</li>
                  <li>• No notes (this issue has no notes)</li>
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{investigationStatus.message}</span>
                <span className="text-foreground">{investigationStatus.progress}%</span>
              </div>
              <Progress value={investigationStatus.progress} className="h-2" />
            </div>

            {investigationStatus.phase === 'error' && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                {investigationStatus.error}
              </div>
            )}

            {investigationStatus.phase === 'complete' && (
              <div className="rounded-lg bg-success/10 border border-success/30 p-3 flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                Task created! View it in your Kanban board.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {investigationStatus.phase === 'idle' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleStartInvestigation}>
                <Sparkles className="h-4 w-4 mr-2" />
                Create Task
              </Button>
            </>
          )}
          {investigationStatus.phase !== 'idle' && investigationStatus.phase !== 'complete' && (
            <Button variant="outline" disabled>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </Button>
          )}
          {investigationStatus.phase === 'complete' && (
            <Button onClick={onClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}