/**
 * TaskFeedback - Allow users to provide mid-flight feedback and corrections to running tasks
 *
 * Feedback is saved to task_metadata.json and automatically picked up by the agent before the next subtask.
 * The agent checks for unread feedback at natural checkpoints and incorporates corrections with highest priority.
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus, Send, Clock, AlertCircle, CheckCircle2, Loader2, Zap, Trash2, Edit2, X, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { ScrollArea } from '../ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { cn } from '../../lib/utils';
import { stopTask, startTask } from '../../stores/task-store';
import type { Task } from '../../../shared/types';

interface TaskFeedbackProps {
  task: Task;
}

interface FeedbackEntry {
  timestamp: string;
  message: string;
  read: boolean;
}

export function TaskFeedback({ task }: TaskFeedbackProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [metadata, setMetadata] = useState<any>(null);
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackEntry[]>([]);
  const [newFeedback, setNewFeedback] = useState('');
  const [showApplyNowDialog, setShowApplyNowDialog] = useState(false);
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const isTaskRunning = task.status === 'in_progress';
  const isHumanReview = task.status === 'human_review';
  const hasUnreadFeedback = feedbackHistory.some(f => !f.read);
  const canRestartWithFeedback = isHumanReview && hasUnreadFeedback;

  // Load task metadata and feedback history
  useEffect(() => {
    loadMetadata();
  }, [task.id]);

  const loadMetadata = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.getTaskMetadata(task.id);
      if (result.success && result.data) {
        setMetadata(result.data);
        setFeedbackHistory(result.data.feedback || []);
      } else {
        setMetadata({});
        setFeedbackHistory([]);
      }
    } catch (error) {
      console.error('Failed to load task metadata:', error);
      setMetadata({});
      setFeedbackHistory([]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Saves new feedback to be picked up at the next subtask checkpoint.
   * Does not interrupt currently running tasks - agent will check for
   * unread feedback before starting each new subtask.
   */
  const saveFeedbackForNextSubtask = async () => {
    if (!newFeedback.trim()) return;

    setIsSaving(true);
    try {
      const feedbackEntry: FeedbackEntry = {
        timestamp: new Date().toISOString(),
        message: newFeedback.trim(),
        read: false
      };

      const updatedFeedback = [...feedbackHistory, feedbackEntry];

      await window.electronAPI.updateTaskMetadata(task.id, {
        ...metadata,
        feedback: updatedFeedback
      });

      setFeedbackHistory(updatedFeedback);
      setMetadata({ ...metadata, feedback: updatedFeedback });
      setNewFeedback('');
    } catch (error) {
      console.error('Failed to save feedback:', error);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Shows confirmation dialog for immediate feedback application.
   * Only available when task is actively running.
   */
  const promptApplyFeedbackNow = () => {
    if (!newFeedback.trim()) return;
    setShowApplyNowDialog(true);
  };

  /**
   * Saves new feedback and immediately stops/restarts the running task.
   * Use this for urgent corrections that cannot wait for the next subtask.
   *
   * Flow:
   * 1. Save feedback to task_metadata.json
   * 2. Stop the running task
   * 3. Poll until task stops (max 10 seconds)
   * 4. Restart task to pick up feedback immediately
   */
  const saveFeedbackAndRestartTask = async () => {
    setShowApplyNowDialog(false);

    // Save feedback first
    await saveFeedbackForNextSubtask();

    // Stop the task
    stopTask(task.id);

    // Poll for task to stop, then restart
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds max
    const checkInterval = 500; // Check every 500ms

    const pollAndRestart = async () => {
      try {
        // Get fresh task status
        const tasks = await window.electronAPI.getTasks(task.projectId);
        const currentTask = tasks.data?.find((t: any) => t.id === task.id);

        if (!currentTask) {
          console.error('Task not found after stop');
          return;
        }

        // Check if task has stopped
        const isStopped = currentTask.status !== 'in_progress';

        if (isStopped) {
          // Task stopped successfully, restart it
          console.log('Task stopped, restarting with feedback...');
          startTask(task.id);
        } else if (attempts < maxAttempts) {
          // Keep polling
          attempts++;
          setTimeout(pollAndRestart, checkInterval);
        } else {
          console.error('Task failed to stop after 10 seconds, attempting restart anyway');
          startTask(task.id);
        }
      } catch (error) {
        console.error('Failed to check task status:', error);
        // Try to restart anyway
        startTask(task.id);
      }
    };

    // Start polling after initial delay
    setTimeout(pollAndRestart, checkInterval);
  };

  /**
   * Shows confirmation dialog for restarting a task in human_review state.
   * Only available when task is in human_review with unread feedback.
   */
  const promptRestartWithFeedback = () => {
    setShowRestartDialog(true);
  };

  /**
   * Restarts a task that's in human_review status with pending feedback.
   * Changes task status from human_review to in_progress and starts execution.
   */
  const restartTaskWithFeedback = async () => {
    setShowRestartDialog(false);

    try {
      // Change status from human_review to in_progress
      await window.electronAPI.updateTaskStatus(task.id, 'in_progress');

      // Start the task to pick up feedback
      startTask(task.id);
    } catch (error) {
      console.error('Failed to restart task with feedback:', error);
    }
  };

  /**
   * Permanently deletes an unread feedback entry.
   * Only available for feedback that hasn't been read by the agent yet.
   *
   * @param index - Zero-based index of the feedback entry to delete
   */
  const deleteFeedbackEntry = async (index: number) => {
    setIsSaving(true);
    try {
      const updatedFeedback = feedbackHistory.filter((_, i) => i !== index);

      await window.electronAPI.updateTaskMetadata(task.id, {
        ...metadata,
        feedback: updatedFeedback
      });

      setFeedbackHistory(updatedFeedback);
      setMetadata({ ...metadata, feedback: updatedFeedback });
    } catch (error) {
      console.error('Failed to delete feedback:', error);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Enters edit mode for an unread feedback entry.
   *
   * @param index - Zero-based index of the feedback entry to edit
   */
  const startEditingFeedback = (index: number) => {
    setEditingIndex(index);
    setEditText(feedbackHistory[index].message);
  };

  /**
   * Cancels the current edit operation and discards unsaved changes.
   */
  const cancelEditingFeedback = () => {
    setEditingIndex(null);
    setEditText('');
  };

  /**
   * Saves edited feedback with smart auto-escalation logic based on task state:
   *
   * - Running task (in_progress/planning/coding): Just saves - picked up at next subtask checkpoint
   * - Stopped/human_review: Just saves - picked up when user manually restarts
   * - Complete/failed: Saves + auto-escalates to in_progress + starts task
   *
   * Rationale for auto-escalation: If task is complete/failed but user edits feedback,
   * this is a significant event indicating agent needs to revisit and CRUD tasks.
   *
   * @param index - Zero-based index of the feedback entry being edited
   */
  const saveEditedFeedbackWithAutoEscalation = async (index: number) => {
    if (!editText.trim()) return;

    setIsSaving(true);
    try {
      const updatedFeedback = [...feedbackHistory];
      updatedFeedback[index] = {
        ...updatedFeedback[index],
        message: editText.trim(),
        timestamp: new Date().toISOString() // Update timestamp on edit
      };

      await window.electronAPI.updateTaskMetadata(task.id, {
        ...metadata,
        feedback: updatedFeedback
      });

      setFeedbackHistory(updatedFeedback);
      setMetadata({ ...metadata, feedback: updatedFeedback });
      setEditingIndex(null);
      setEditText('');

      // Auto-escalate if task is done
      // Rationale: Task thinks it's done, but user edited feedback = agent needs to revisit
      if (task.status === 'done') {
        console.log(`Task is ${task.status}, auto-escalating to in_progress due to feedback edit`);

        // Change status to in_progress
        await window.electronAPI.updateTaskStatus(task.id, 'in_progress');

        // Start the task to pick up the edited feedback
        startTask(task.id);
      }
    } catch (error) {
      console.error('Failed to update feedback:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Task Feedback</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Provide corrections, additional context, or instructions to guide the agent.
              {isTaskRunning && ' The agent will automatically pick up your feedback before starting the next subtask.'}
            </p>
          </div>

          {/* Running Task Info */}
          {isTaskRunning && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Task is Running
                  </p>
                  <div className="space-y-1">
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      <strong>Submit Feedback:</strong> Saves feedback and waits for next subtask (recommended - no interruption)
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      <strong>Apply Now:</strong> Immediately stops and restarts task with feedback (use for urgent corrections)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Human Review with Unread Feedback */}
          {canRestartWithFeedback && (
            <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">
                    Unread Feedback Available
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300">
                    You have {feedbackHistory.filter(f => !f.read).length} unread feedback {feedbackHistory.filter(f => !f.read).length === 1 ? 'entry' : 'entries'}. Restart the task to incorporate your corrections.
                  </p>
                  <Button
                    onClick={promptRestartWithFeedback}
                    size="sm"
                    className="mt-2 bg-green-600 hover:bg-green-700"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Restart Task with Feedback
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* New Feedback Input */}
          <div className="space-y-3">
            <Label htmlFor="feedback-input" className="text-sm font-medium">
              New Feedback / Instructions
            </Label>
            <Textarea
              id="feedback-input"
              placeholder={`Example:\n\nIMPORTANT CORRECTIONS:\n- Use .NET Core 8 (NOT .NET Framework 4.8)\n- Implement AssemblyResolver for plugin loading\n- Load dependencies from self-contained plugin folder`}
              value={newFeedback}
              onChange={(e) => setNewFeedback(e.target.value)}
              className="min-h-[150px] font-mono text-sm"
              disabled={isSaving}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {newFeedback.length} characters
              </p>
              <div className="flex items-center gap-2">
                <Button
                  onClick={saveFeedbackForNextSubtask}
                  disabled={isSaving || !newFeedback.trim()}
                  size="sm"
                  variant="outline"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Submit Feedback
                    </>
                  )}
                </Button>
                {isTaskRunning && (
                  <Button
                    onClick={promptApplyFeedbackNow}
                    disabled={isSaving || !newFeedback.trim()}
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Apply Now
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Feedback History */}
          {feedbackHistory.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Feedback History</Label>
                {hasUnreadFeedback && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                    Unread feedback
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {feedbackHistory.slice().reverse().map((entry, reversedIndex) => {
                  const actualIndex = feedbackHistory.length - 1 - reversedIndex;
                  const isEditing = editingIndex === actualIndex;

                  return (
                    <div
                      key={`${entry.timestamp}-${actualIndex}`}
                      className={cn(
                        'rounded-lg border p-4 space-y-2',
                        !entry.read && 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/50'
                      )}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(entry.timestamp)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {entry.read ? (
                            <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Read by agent</span>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                                <AlertCircle className="h-3.5 w-3.5" />
                                <span>Pending</span>
                              </div>
                              {!isEditing && (
                                <div className="flex items-center gap-1 ml-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() => startEditingFeedback(actualIndex)}
                                    disabled={isSaving}
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    onClick={() => deleteFeedbackEntry(actualIndex)}
                                    disabled={isSaving}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Message or Edit Textarea */}
                      {isEditing ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="min-h-[100px] font-mono text-sm"
                            disabled={isSaving}
                          />
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEditingFeedback}
                              disabled={isSaving}
                            >
                              <X className="h-3.5 w-3.5 mr-1" />
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => saveEditedFeedbackWithAutoEscalation(actualIndex)}
                              disabled={isSaving || !editText.trim()}
                            >
                              {isSaving ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5 mr-1" />
                              )}
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm whitespace-pre-wrap font-mono bg-background/50 rounded p-3 border">
                          {entry.message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {feedbackHistory.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquarePlus className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No feedback provided yet</p>
              <p className="text-xs mt-1">
                Use the form above to provide instructions or corrections
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Apply Now Confirmation Dialog */}
      <AlertDialog open={showApplyNowDialog} onOpenChange={setShowApplyNowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Feedback Immediately?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This will immediately stop the running task and restart it with your feedback applied.
              </p>
              <div className="rounded border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950 p-3">
                <p className="text-sm font-medium text-orange-900 dark:text-orange-100 mb-2">
                  Your Feedback:
                </p>
                <div className="text-sm font-mono whitespace-pre-wrap text-orange-800 dark:text-orange-200">
                  {newFeedback}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The current subtask will be interrupted. Alternatively, click "Cancel" and use "Submit Feedback" to wait for the next subtask.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={saveFeedbackAndRestartTask}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Zap className="h-4 w-4 mr-2" />
              Apply Now & Restart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restart from Human Review Dialog */}
      <AlertDialog open={showRestartDialog} onOpenChange={setShowRestartDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart Task with Feedback?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This will change the task status from <strong>Human Review</strong> to <strong>In Progress</strong> and restart the agent with your feedback.
              </p>
              <div className="rounded border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950 p-3">
                <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-2">
                  Unread Feedback ({feedbackHistory.filter(f => !f.read).length}):
                </p>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {feedbackHistory.filter(f => !f.read).map((fb, idx) => (
                    <div key={idx} className="text-sm font-mono whitespace-pre-wrap text-green-800 dark:text-green-200 border-l-2 border-green-300 dark:border-green-700 pl-2">
                      {fb.message}
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The agent will incorporate these corrections and continue implementation.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={restartTaskWithFeedback}
              className="bg-green-600 hover:bg-green-700"
            >
              <Zap className="h-4 w-4 mr-2" />
              Restart with Feedback
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
