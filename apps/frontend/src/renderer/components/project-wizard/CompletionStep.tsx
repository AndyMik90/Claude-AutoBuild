import { useTranslation } from 'react-i18next';
import { CheckCircle2, FolderOpen, GitBranch, FileCode, Github, Server } from 'lucide-react';
import { Button } from '../ui/button';
import type { Project } from '../../../shared/types';

interface CompletionStepProps {
  project: Project | null;
  gitInitialized: boolean;
  autoClaudeInitialized: boolean;
  githubConfigured: boolean;
  gitlabConfigured: boolean;
  onComplete: () => void;
}

interface CompletionItem {
  icon: React.ReactNode;
  title: string;
  description: string;
  completed: boolean;
}

/**
 * Completion step - shows summary and next actions
 */
export function CompletionStep({
  project,
  gitInitialized,
  autoClaudeInitialized,
  githubConfigured,
  gitlabConfigured,
  onComplete
}: CompletionStepProps) {
  const { t } = useTranslation('project-wizard');

  const items: CompletionItem[] = [
    {
      icon: <FolderOpen className="h-5 w-5" />,
      title: 'Project Added',
      description: project?.name || 'Your project',
      completed: !!project
    },
    {
      icon: <GitBranch className="h-5 w-5" />,
      title: 'Git Repository',
      description: gitInitialized ? 'Initialized' : 'Skipped',
      completed: gitInitialized
    },
    {
      icon: <FileCode className="h-5 w-5" />,
      title: 'Auto Claude',
      description: autoClaudeInitialized ? 'Framework installed' : 'Skipped',
      completed: autoClaudeInitialized
    },
    {
      icon: <Github className="h-5 w-5" />,
      title: 'GitHub',
      description: githubConfigured ? 'Connected' : 'Skipped',
      completed: githubConfigured
    },
    {
      icon: <Server className="h-5 w-5" />,
      title: 'GitLab',
      description: gitlabConfigured ? 'Connected' : 'Skipped',
      completed: gitlabConfigured
    }
  ];

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight mb-2">
            {t('complete.title')}
          </h1>
          <p className="text-muted-foreground text-lg">
            {t('complete.description')}
          </p>
        </div>

        {/* Summary */}
        <div className="space-y-3 mb-10">
          {items.map((item) => (
            <div
              key={item.title}
              className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                item.completed
                  ? 'border-success/30 bg-success/5'
                  : 'border-border bg-muted/30'
              }`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                item.completed ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
              }`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-medium ${item.completed ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {item.title}
                </h3>
                <p className={`text-sm ${item.completed ? 'text-success' : 'text-muted-foreground'}`}>
                  {item.description}
                </p>
              </div>
              {item.completed && (
                <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* Message */}
        <div className="text-center mb-8">
          <p className="text-muted-foreground">
            {t('complete.message')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={onComplete}
            className="gap-2 px-8"
          >
            <CheckCircle2 className="h-5 w-5" />
            {t('complete.startBuilding')}
          </Button>
        </div>
      </div>
    </div>
  );
}
