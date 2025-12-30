import { ExternalLink, User, Clock, GitBranch, FileDiff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { cn } from '../../../lib/utils';
import type { PRData } from '../hooks/useGitHubPRs';
import { formatDate } from '../utils/formatDate';

export interface PRHeaderProps {
  pr: PRData;
}

/**
 * Modern Header Component for PR Details
 * Shows PR metadata: state, number, title, author, dates, branches, and file stats
 */
export function PRHeader({ pr }: PRHeaderProps) {
  const { t, i18n } = useTranslation('common');

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Badge
            variant={pr.state.toLowerCase() === 'open' ? 'success' : 'secondary'}
            className={cn(
              "capitalize px-2.5 py-0.5",
              pr.state.toLowerCase() === 'open'
                ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 border-emerald-500/20"
                : ""
            )}
          >
            {t(`prReview.state.${pr.state.toLowerCase()}`)}
          </Badge>
          <span className="text-muted-foreground text-sm font-mono">#{pr.number}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <a href={pr.htmlUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>

      <h1 className="text-xl font-bold mb-4 leading-tight">{pr.title}</h1>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground border-b border-border/40 pb-5">
        <div className="flex items-center gap-2">
          <div className="bg-muted rounded-full p-1">
            <User className="h-3.5 w-3.5" />
          </div>
          <span className="font-medium text-foreground">{pr.author.login}</span>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 opacity-70" />
          <span>{formatDate(pr.createdAt, i18n.language)}</span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 font-mono text-xs border border-border/50">
          <GitBranch className="h-3 w-3" />
          <span className="text-foreground">{pr.headRefName}</span>
          <span className="text-muted-foreground/50 mx-1">→</span>
          <span className="text-foreground">{pr.baseRefName}</span>
        </div>

        <div className="flex items-center gap-4 ml-auto">
          <div className="flex items-center gap-1.5" title={t('prReview.filesChanged', { count: pr.changedFiles })}>
            <FileDiff className="h-4 w-4" />
            <span className="font-medium text-foreground">{pr.changedFiles}</span>
            <span className="text-xs">{t('prReview.files')}</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              +{pr.additions}
            </span>
            <span className="text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">
              -{pr.deletions}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
