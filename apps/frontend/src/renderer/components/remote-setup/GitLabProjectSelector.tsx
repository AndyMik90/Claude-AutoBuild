import { useState, useEffect } from 'react';
import { Lock, Globe, Loader2, ChevronDown, AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export interface GitLabProject {
  pathWithNamespace: string;
  description?: string | null;
  visibility: string;
}

interface GitLabProjectSelectorProps {
  instanceUrl?: string;
  value: string;
  onChange: (projectPath: string) => void;
  disabled?: boolean;
}

/**
 * GitLab project selector with dropdown search and manual entry fallback
 * Fetches projects via glab API and provides search/filter functionality
 */
export function GitLabProjectSelector({
  instanceUrl,
  value,
  onChange,
  disabled = false
}: GitLabProjectSelectorProps) {
  const { t } = useTranslation('dialogs');
  const [projects, setProjects] = useState<GitLabProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [isManualMode, setIsManualMode] = useState(false);

  // Fetch projects on mount
  useEffect(() => {
    const fetchProjects = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const hostname = instanceUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const result = await window.electronAPI.listGitLabUserProjects(hostname);

        if (result.success && result.data?.projects) {
          setProjects(result.data.projects);
          if (result.data.projects.length === 0) {
            setIsManualMode(true);
          }
        } else {
          // On error or no projects, switch to manual mode
          setIsManualMode(true);
        }
      } catch (err) {
        // On error, switch to manual mode so user can still enter project manually
        setIsManualMode(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, [instanceUrl]);

  const filteredProjects = projects.filter(project =>
    project.pathWithNamespace.toLowerCase().includes(filter.toLowerCase()) ||
    (project.description?.toLowerCase().includes(filter.toLowerCase()))
  );

  const selectedProjectData = projects.find(p => p.pathWithNamespace === value);

  const handleRefresh = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const hostname = instanceUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const result = await window.electronAPI.listGitLabUserProjects(hostname);

      if (result.success && result.data?.projects) {
        setProjects(result.data.projects);
      } else {
        setError(result.error || 'Failed to load projects');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  // Manual input mode
  if (isManualMode) {
    return (
      <div className="space-y-2">
        <Label>{t('remoteSetup.repoConfig.gitlab.projectLabel')}</Label>
        <Input
          placeholder="group/project"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          {t('remoteSetup.repoConfig.gitlab.projectHelp')}
        </p>
        {projects.length > 0 && (
          <button
            type="button"
            onClick={() => setIsManualMode(false)}
            className="text-sm text-primary hover:underline"
            disabled={disabled}
          >
            {t('remoteSetup.repoConfig.gitlab.selectProject')}
          </button>
        )}
      </div>
    );
  }

  // Dropdown mode
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-foreground">
          {t('remoteSetup.repoConfig.gitlab.projectLabel')}
        </Label>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={disabled || isLoading}
            className="h-7 px-2"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsManualMode(true)}
            disabled={disabled}
            className="h-7 text-xs"
          >
            {t('remoteSetup.repoConfig.gitlab.enterManually')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled || isLoading}
          className="w-full flex items-center justify-between px-3 py-2 text-sm border border-input rounded-md bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          {isLoading ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('remoteSetup.repoConfig.gitlab.loadingProjects')}
            </span>
          ) : value ? (
            <span className="flex items-center gap-2">
              {selectedProjectData?.visibility === 'private' ? (
                <Lock className="h-3 w-3 text-muted-foreground" />
              ) : (
                <Globe className="h-3 w-3 text-muted-foreground" />
              )}
              {value}
            </span>
          ) : (
            <span className="text-muted-foreground">{t('remoteSetup.repoConfig.gitlab.selectProject')}</span>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && !isLoading && (
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-hidden">
            <div className="p-2 border-b border-border">
              <Input
                placeholder={t('remoteSetup.repoConfig.gitlab.searchProjects')}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            </div>

            <div className="max-h-48 overflow-y-auto">
              {filteredProjects.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  {filter ? t('remoteSetup.repoConfig.gitlab.noMatchingProjects') : t('remoteSetup.repoConfig.gitlab.noProjectsFound')}
                </div>
              ) : (
                filteredProjects.map((project) => (
                  <button
                    key={project.pathWithNamespace}
                    type="button"
                    onClick={() => {
                      onChange(project.pathWithNamespace);
                      setIsOpen(false);
                      setFilter('');
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-accent flex items-start gap-2 ${
                      project.pathWithNamespace === value ? 'bg-accent' : ''
                    }`}
                  >
                    {project.visibility === 'private' ? (
                      <Lock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    ) : (
                      <Globe className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{project.pathWithNamespace}</p>
                      {project.description && (
                        <p className="text-xs text-muted-foreground truncate">{project.description}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {value && (
        <p className="text-xs text-muted-foreground">
          {t('remoteSetup.repoConfig.gitlab.selected')}: <code className="px-1 bg-muted rounded">{value}</code>
        </p>
      )}
    </div>
  );
}
