import { useTranslation } from 'react-i18next';
import { RefreshCw, Search, Filter } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../ui/select';
import type { IssueListHeaderProps } from '../types';

// Forgejo icon component
function ForgejoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M8 22 v-14 a6 6 0 0 1 6-6 h4" />
      <path d="M8 22 v-4 a6 6 0 0 1 6-6 h4" />
    </svg>
  );
}

export function IssueListHeader({
  repoName,
  instanceUrl,
  openIssuesCount,
  isLoading,
  searchQuery,
  filterState,
  onSearchChange,
  onFilterChange,
  onRefresh
}: IssueListHeaderProps) {
  const { t } = useTranslation('forgejo');

  return (
    <div className="shrink-0 p-4 border-b border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <ForgejoIcon className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t('title')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {repoName} ({instanceUrl})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {openIssuesCount} {t('header.open')}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('header.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterState} onValueChange={onFilterChange}>
          <SelectTrigger className="w-32">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">{t('filters.open')}</SelectItem>
            <SelectItem value="closed">{t('filters.closed')}</SelectItem>
            <SelectItem value="all">{t('filters.all')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
