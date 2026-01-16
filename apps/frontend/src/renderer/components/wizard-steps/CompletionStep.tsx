import { CheckCircle2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CompletionStepProps {
  projectName: string;
  projectPath: string;
  remoteUrl?: string;
}

/**
 * Final step of the project creation wizard
 * Shows success message with project details
 */
export function CompletionStep({
  projectName,
  projectPath,
  remoteUrl
}: CompletionStepProps) {
  const { t } = useTranslation('dialogs');

  return (
    <div className="flex flex-col items-center justify-center py-8 space-y-6">
      {/* Success Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
      </div>

      {/* Success Message */}
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">{t('wizard.steps.complete.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('wizard.steps.complete.description')}
        </p>
      </div>

      {/* Project Details */}
      <div className="w-full max-w-sm space-y-3">
        {/* Project Name */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Project</p>
          <p className="text-sm font-medium">{projectName}</p>
        </div>

        {/* Project Path */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Location</p>
          <p className="text-sm font-mono truncate">{projectPath}</p>
        </div>

        {/* Remote URL (if configured) */}
        {remoteUrl && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Remote</p>
            <a
              href={remoteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              {remoteUrl}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
