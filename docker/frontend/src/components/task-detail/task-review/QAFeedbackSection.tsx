import { AlertCircle, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';

interface QAFeedbackSectionProps {
  feedback: string;
  isSubmitting: boolean;
  onFeedbackChange: (value: string) => void;
  onReject: () => void;
}

/**
 * Displays the QA feedback section where users can request changes
 */
export function QAFeedbackSection({
  feedback,
  isSubmitting,
  onFeedbackChange,
  onReject
}: QAFeedbackSectionProps) {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
      <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-warning" />
        Request Changes
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        Found issues? Describe what needs to be fixed and the AI will continue working on it.
      </p>
      <Textarea
        placeholder="Describe the issues or changes needed..."
        value={feedback}
        onChange={(e) => onFeedbackChange(e.target.value)}
        className="mb-3"
        rows={3}
      />
      <Button
        variant="warning"
        onClick={onReject}
        disabled={isSubmitting || !feedback.trim()}
        className="w-full"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <RotateCcw className="mr-2 h-4 w-4" />
            Request Changes
          </>
        )}
      </Button>
    </div>
  );
}
